// @vitest-environment node
// Segurança das RPCs e do storage num Postgres real com TODAS as migrations aplicadas.
import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { criarBanco, como } from './pg-harness.mjs'
import { destinoFotoAbastecimento } from '../../src/features/combustivel/lib/fotoAbastecimento.ts'

let db, gestor, leitor, colabUser, colabId, viatura

async function novoUtilizador(role, email) {
  const { rows } = await db.query(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [email])
  await db.query(`UPDATE public.profiles SET role = $1 WHERE id = $2`, [role, rows[0].id])
  return rows[0].id
}

const anon       = fn => como(db, { papel: 'anon' }, fn)
const comoGestor = fn => como(db, { papel: 'authenticated', uid: gestor }, fn)
const comoLeitor = fn => como(db, { papel: 'authenticated', uid: leitor }, fn)
const comoColab  = fn => como(db, { papel: 'authenticated', uid: colabUser }, fn)
const servico    = fn => como(db, { papel: 'service_role' }, fn)

const Z = '00000000-0000-0000-0000-000000000000'

const CHAMADAS = {
  custos:        `SELECT public.custos_consolidados_por_obra('${Z}')`,
  lancar:        `SELECT public.lancar_fatura('${Z}', 'x')`,
  classificar:   `SELECT public.classificar_e_aprender('${Z}', '[]'::jsonb)`,
  picagem:       (colab) => `SELECT public.registar_picagem_geofence('${colab}', '${Z}', 'ENTRADA', 38.7, -9.1, 5)`,
  upsertAlerta:  `SELECT public._upsert_alerta('${Z}', '${Z}', 'ATENCAO', 0, 0)`,
  resumoDia:     `SELECT public.calcular_resumo_dia('1900-01-01')`,
  avaliar:       `SELECT public.avaliar_regras_alerta()`,
}

beforeAll(async () => {
  db = await criarBanco()
  gestor    = await novoUtilizador('gestor', 'gestor@teste.pt')
  leitor    = await novoUtilizador('leitura', 'leitor@teste.pt')
  colabUser = await novoUtilizador('leitura', 'colab@teste.pt')
  colabId = (await db.query(
    `INSERT INTO public.colaboradores (nome, numero_mecan, cargo, user_id) VALUES ('Rui', 'M1', 'Encarregado', $1) RETURNING id`,
    [colabUser])).rows[0].id
  viatura = (await db.query(`INSERT INTO public.comb_veiculos (nome) VALUES ('Carrinha 1') RETURNING id`)).rows[0].id
}, 60_000)

describe('anon não executa funções privilegiadas', () => {
  it.each([
    ['custos_consolidados_por_obra', CHAMADAS.custos],
    ['lancar_fatura',                CHAMADAS.lancar],
    ['classificar_e_aprender',       CHAMADAS.classificar],
    ['registar_picagem_geofence',    CHAMADAS.picagem(Z)],
    ['_upsert_alerta',               CHAMADAS.upsertAlerta],
    ['calcular_resumo_dia',          CHAMADAS.resumoDia],
    ['avaliar_regras_alerta',        CHAMADAS.avaliar],
    ['_lancar_fatura_impl',          `SELECT public._lancar_fatura_impl('${Z}', 'x')`],
    ['criar_guia_transporte',        `SELECT public.criar_guia_transporte('${Z}', '${Z}', 'a', 'b', '2026-01-01', '[]'::jsonb)`],
  ])('%s', async (_n, sql) => {
    await expect(anon(tx => tx.query(sql))).rejects.toThrow(/permission denied/)
  })

  it('inventário: só as funções previstas ficam executáveis por anon', async () => {
    const { rows } = await db.query(`
      SELECT p.proname FROM pg_proc p
       WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
         AND has_function_privilege('anon', p.oid, 'EXECUTE')
       ORDER BY 1`)
    // Políticas RLS avaliadas como anon e triggers. Desde o abastecimento v2
    // (20260930010000) já não há página sem sessão: saíram as 6 funções dela.
    // registar_login_falhado (20261008020000): o login falhado acontece sem sessão;
    // tem tetos próprios (por email e global) e ignora o excesso em silêncio.
    expect(rows.map(r => r.proname)).toEqual([
      'audit_delete', 'auth_role', 'handle_new_user', 'pode_escrever', 'registar_login_falhado',
    ])
  })

  it('todas as SECURITY DEFINER têm search_path fixo', async () => {
    const { rows } = await db.query(`
      SELECT p.proname FROM pg_proc p
       WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
         AND NOT coalesce(p.proconfig::text ILIKE '%search_path%', false)`)
    expect(rows).toEqual([])
  })
})

describe('quem tinha acesso continua a ter (comportamento preservado)', () => {
  it('custos: qualquer autenticado consulta (a rota é aberta a todos)', async () => {
    const { rows } = await comoLeitor(tx => tx.query(`${CHAMADAS.custos} AS r`))
    expect(rows[0].r).toMatchObject({ total: 0 })
  })

  it('faturas: gestor passa a guarda e chega à função original', async () => {
    await expect(comoGestor(tx => tx.query(CHAMADAS.lancar))).rejects.toThrow(/não está no estado CLASSIFICADA/)
    await expect(comoGestor(tx => tx.query(CHAMADAS.classificar))).rejects.toThrow(/não encontrada/)
  })

  it('faturas: perfil leitura é recusado', async () => {
    await expect(comoLeitor(tx => tx.query(CHAMADAS.lancar))).rejects.toThrow('Sem permissão para lançar faturas')
    await expect(comoLeitor(tx => tx.query(CHAMADAS.classificar))).rejects.toThrow('Sem permissão para classificar faturas')
  })

  it('picagens: o próprio colaborador e o gestor passam a guarda', async () => {
    // A função original usa PostGIS (ausente no banco de teste): falhar lá dentro prova que a guarda deixou passar
    await expect(comoColab(tx => tx.query(CHAMADAS.picagem(colabId)))).rejects.toThrow(/st_makepoint/i)
    await expect(comoGestor(tx => tx.query(CHAMADAS.picagem(colabId)))).rejects.toThrow(/st_makepoint/i)
  })

  it('picagens: ninguém pica por outro colaborador', async () => {
    await expect(comoLeitor(tx => tx.query(CHAMADAS.picagem(colabId))))
      .rejects.toThrow('Sem permissão para registar picagens deste colaborador')
  })

  it('alertas: gestor e service_role avaliam; função interna fechada a authenticated', async () => {
    const r1 = await comoGestor(tx => tx.query(`${CHAMADAS.avaliar} AS n`))
    expect(typeof r1.rows[0].n).toBe('number')
    const r2 = await servico(tx => tx.query(`${CHAMADAS.avaliar} AS n`))
    expect(typeof r2.rows[0].n).toBe('number')
    await expect(comoGestor(tx => tx.query(CHAMADAS.upsertAlerta))).rejects.toThrow(/permission denied/)
  })

  it('resumo diário: só o agendador (dono) corre', async () => {
    await expect(comoGestor(tx => tx.query(CHAMADAS.resumoDia))).rejects.toThrow(/permission denied/)
    await db.query(CHAMADAS.resumoDia)
  })
})

describe('fotos dos abastecimentos (storage)', () => {
  // Desde o abastecimento v2 as fotos só se enviam com sessão, para o próprio pedido
  let motorista, outro
  async function pedido(estado = 'AUTORIZADO', dono = motorista) {
    const id = randomUUID()
    await db.query(
      `INSERT INTO public.comb_abastecimentos_pendentes (id, veiculo_id, veiculo_nome, funcionario_nome, data, tipo_fonte, estado, solicitante_id)
       VALUES ($1, $2, 'Carrinha 1', 'Rui', CURRENT_DATE, 'POLO2', $3, $4)`, [id, viatura, estado, dono])
    return id
  }
  const enviar = (nome, bucket = 'combustivel-taloes', uid = motorista) =>
    como(db, { papel: 'authenticated', uid }, tx => tx.query('INSERT INTO storage.objects (bucket_id, name) VALUES ($1, $2)', [bucket, nome]))
  const enviarAnon = (nome) =>
    anon(tx => tx.query("INSERT INTO storage.objects (bucket_id, name) VALUES ('combustivel-taloes', $1)", [nome]))
  const nome = (p, n = 1, ext = 'jpg', v = viatura) => v + '/2026-09-29_' + p + '_' + n + '.' + ext

  beforeAll(async () => {
    motorista = await novoUtilizador('motorista', 'motorista@teste.pt')
    outro     = await novoUtilizador('motorista', 'outro@teste.pt')
    await db.query("INSERT INTO storage.buckets (id, name, public) VALUES ('combustivel-taloes', 'combustivel-taloes', true) ON CONFLICT DO NOTHING")
    await db.query("INSERT INTO storage.buckets (id, name, public) VALUES ('outro', 'outro', true) ON CONFLICT DO NOTHING")
  })

  it('aceita o caminho do próprio pedido autorizado', async () => {
    await enviar(nome(await pedido(), 1727600000000))
  })

  it('anónimo já não envia fotos, nem para um pedido autorizado', async () => {
    await expect(enviarAnon(nome(await pedido()))).rejects.toThrow(/row-level security/)
  })

  it.each([
    ['pedido ainda não autorizado', async () => nome(await pedido('AGUARDA_AUTORIZACAO'))],
    ['pedido de outro motorista',   async () => nome(await pedido('AUTORIZADO', outro))],
    ['pasta de outra viatura',      async () => nome(await pedido(), 1, 'jpg', randomUUID())],
    ['extensão não permitida',      async () => nome(await pedido(), 1, 'html')],
    ['caminho com ..',              async () => viatura + '/../2026-09-29_' + (await pedido()) + '_1.jpg'],
    ['nome livre',                  async () => 'qualquer-coisa.jpg'],
  ])('recusa: %s', async (_n, gerar) => {
    await expect(enviar(await gerar())).rejects.toThrow(/row-level security/)
  })

  it('recusa outros buckets', async () => {
    await expect(enviar(nome(await pedido()), 'outro')).rejects.toThrow(/row-level security/)
  })

  it.each([
    ['image/jpeg'], ['image/png'], ['image/webp'], ['image/heic'], ['image/heif'],
    [''],           // telemóvel que não indica o tipo
    ['image/gif'],  // tipo desconhecido
  ])('o caminho gerado pelo site (MIME %j) passa na política', async (mime) => {
    const p = await pedido()
    const { caminho, contentType } = destinoFotoAbastecimento(viatura, p, mime)
    await enviar(caminho)
    expect(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']).toContain(contentType)
  })

  it('repetir a foto gera outro nome (upload sem upsert não colide)', async () => {
    const p = await pedido()
    const a = destinoFotoAbastecimento(viatura, p, 'image/jpeg', new Date(1_000))
    const b = destinoFotoAbastecimento(viatura, p, 'image/jpeg', new Date(2_000))
    expect(a.caminho).not.toBe(b.caminho)
    await enviar(a.caminho)
    await enviar(b.caminho)
  })

  it('anon não consegue listar as fotos', async () => {
    await enviar(nome(await pedido(), 2))
    const { rows } = await anon(tx => tx.query("SELECT name FROM storage.objects WHERE bucket_id = 'combustivel-taloes'"))
    expect(rows).toEqual([])
  })
})

describe('send-push', () => {
  it('coluna de controlo push_notificado_em existe', async () => {
    const { rows } = await db.query(`
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'comb_abastecimentos_pendentes' AND column_name = 'push_notificado_em'`)
    expect(rows).toHaveLength(1)
  })
})
