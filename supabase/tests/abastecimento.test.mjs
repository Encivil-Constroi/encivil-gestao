// @vitest-environment node
// Abastecimento v2: pedido com sessão, aprovação só por quem o CEO designa,
// bomba ligada pelo motorista (Shelly via pump_poll), contador antes/depois,
// registo automático, notificação imediata. Postgres real com todas as migrations.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { criarBanco, como } from './pg-harness.mjs'

let db
let admin, ceo, gestor, armazem, motA, motB, semColab, leitura
let colabA, colabB, v1, v2, v3

async function utilizador(role, email, nome = null) {
  const { rows } = await db.query(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [email])
  await db.query(`UPDATE public.profiles SET role = $1, nome = COALESCE($3, nome) WHERE id = $2`, [role, rows[0].id, nome])
  return rows[0].id
}

const u = (uid, fn) => como(db, { papel: 'authenticated', uid }, fn)
const anon = fn => como(db, { papel: 'anon' }, fn)
const servico = fn => como(db, { papel: 'service_role' }, fn)
const q1 = async (uid, sql, params = []) => (await u(uid, tx => tx.query(sql, params))).rows[0]

const hoje = () => new Date().toISOString().slice(0, 10)
const caminho = (veiculo, pedido, n = Date.now()) => `${veiculo}/${hoje()}_${pedido}_${n}.jpg`
const enviarFoto = (uid, nome) => u(uid, tx => tx.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('combustivel-taloes', $1)`, [nome]))

// Pedido completo como o site faz: foto dos km primeiro, depois a RPC
async function pedir(uid, veiculo, o = {}) {
  const id = o.id ?? randomUUID()
  const foto = caminho(veiculo, id, 1)
  if (!o.semFoto) await enviarFoto(uid, foto)
  await q1(uid, `SELECT public.criar_pedido_abastecimento($1, $2, $3, $4, $5, $6, $7) AS id`,
    [id, veiculo, o.fonte ?? 'POLO2', o.combustivel ?? 'gasoleo', o.km ?? 10000, o.fotoKm ?? foto, o.obs ?? null])
  return id
}

const pedido = async id => (await db.query(`SELECT * FROM public.comb_abastecimentos_pendentes WHERE id = $1`, [id])).rows[0]
const autorizar = (uid, id) => q1(uid, `SELECT public.autorizar_abastecimento($1)`, [id])
const recusar = (uid, id, motivo = null) => q1(uid, `SELECT public.rejeitar_abastecimento($1, $2)`, [id, motivo])
const leituraInicial = async (uid, id, veiculo, leitura, origem = 'IA') => {
  const f = caminho(veiculo, id, 2)
  await enviarFoto(uid, f)
  return q1(uid, `SELECT public.registar_contador_inicial($1, $2, $3, $4)`, [id, leitura, f, origem])
}
const ligar = (uid, id) => q1(uid, `SELECT public.ligar_bomba($1)`, [id])
const concluir = async (uid, id, veiculo, o = {}) => {
  const f = caminho(veiculo, id, 3)
  await enviarFoto(uid, f)
  return (await q1(uid, `SELECT public.concluir_pedido_abastecimento($1, $2, $3, $4, $5, $6) AS id`,
    [id, o.final ?? null, o.litros ?? null, o.custo ?? null, f, o.origem ?? 'IA'])).id
}
// O Shelly a consultar (pump-status → pump_poll com o papel de serviço)
const shelly = (relay = false) => servico(tx => tx.query(`SELECT public.pump_poll('polo2', $1, false) AS r`, [relay]))
  .then(r => r.rows[0].r)
const limparBomba = () => db.exec(`
  UPDATE public.pump_sessoes SET fim_em = now(), motivo_fim = 'TEMPO' WHERE fim_em IS NULL;
  UPDATE public.pump_comandos SET consumido_em = now() WHERE consumido_em IS NULL;
  UPDATE public.pump_config SET bloqueada = false, horario_inicio = NULL, horario_fim = NULL;
  UPDATE public.comb_abastecimentos_pendentes SET estado = 'CANCELADO' WHERE estado IN ('AGUARDA_AUTORIZACAO', 'AUTORIZADO');`)

beforeAll(async () => {
  db = await criarBanco()
  admin    = await utilizador('admin',    'admin@teste.pt', 'Admin')
  ceo      = await utilizador('admin',    'antonio@teste.pt', 'António Baptista')
  gestor   = await utilizador('gestor',   'gestor@teste.pt', 'Gestor')
  armazem  = await utilizador('armazem',  'armazem@teste.pt', 'Armazém')
  motA     = await utilizador('motorista', 'ze@teste.pt', 'Perfil Zé')
  motB     = await utilizador('motorista', 'rui@teste.pt', 'Perfil Rui')
  semColab = await utilizador('leitura',  'semcolab@teste.pt', 'Só Perfil')
  leitura  = await utilizador('leitura',  'leitura@teste.pt', 'Leitura')
  colabA = (await db.query(`INSERT INTO public.colaboradores (nome, numero_mecan, cargo, user_id) VALUES ('Zé Gaitas', 'M1', 'Motorista', $1) RETURNING id`, [motA])).rows[0].id
  colabB = (await db.query(`INSERT INTO public.colaboradores (nome, numero_mecan, cargo, user_id) VALUES ('Rui Costa', 'M2', 'Motorista', $1) RETURNING id`, [motB])).rows[0].id
  v1 = (await db.query(`INSERT INTO public.comb_veiculos (nome, identificacao, tipo_combustivel) VALUES ('Ford Transit', '50-AA-50', 'gasoleo') RETURNING id`)).rows[0].id
  v2 = (await db.query(`INSERT INTO public.comb_veiculos (nome, identificacao) VALUES ('Toyota Hilux', '11-BB-11') RETURNING id`)).rows[0].id
  v3 = (await db.query(`INSERT INTO public.comb_veiculos (nome, ativo) VALUES ('Abatida', false) RETURNING id`)).rows[0].id
  await db.query(`INSERT INTO public.veiculo_atribuicoes (veiculo_id, colaborador_id) VALUES ($1, $2)`, [v1, colabA])
  await db.query(`INSERT INTO storage.buckets (id, name, public) VALUES ('combustivel-taloes', 'combustivel-taloes', true) ON CONFLICT DO NOTHING`)
}, 120_000)

describe('quem aprova', () => {
  it('sem ninguém designado, aprovam os admin — gestor e armazém não', async () => {
    expect((await q1(admin, `SELECT public.pode_aprovar_combustivel() AS ok`)).ok).toBe(true)
    expect((await q1(gestor, `SELECT public.pode_aprovar_combustivel() AS ok`)).ok).toBe(false)
    expect((await q1(armazem, `SELECT public.pode_aprovar_combustivel() AS ok`)).ok).toBe(false)
  })

  it('com o CEO designado, só ele aprova (os outros admin deixam de aprovar)', async () => {
    await q1(admin, `SELECT public.definir_aprovador_combustivel($1, true)`, [ceo])
    expect((await q1(ceo, `SELECT public.pode_aprovar_combustivel() AS ok`)).ok).toBe(true)
    expect((await q1(admin, `SELECT public.pode_aprovar_combustivel() AS ok`)).ok).toBe(false)
  })

  it('o CEO designa outra pessoa; armazém e motorista não designam ninguém', async () => {
    await q1(ceo, `SELECT public.definir_aprovador_combustivel($1, true)`, [gestor])
    expect((await q1(gestor, `SELECT public.pode_aprovar_combustivel() AS ok`)).ok).toBe(true)
    await q1(ceo, `SELECT public.definir_aprovador_combustivel($1, false)`, [gestor])
    expect((await q1(gestor, `SELECT public.pode_aprovar_combustivel() AS ok`)).ok).toBe(false)
    for (const uid of [armazem, motA]) {
      await expect(q1(uid, `SELECT public.definir_aprovador_combustivel($1, true)`, [uid])).rejects.toThrow(/Só quem aprova/)
    }
  })

  it('ninguém escreve diretamente na lista', async () => {
    await expect(u(ceo, tx => tx.query(`INSERT INTO public.comb_aprovadores (user_id) VALUES ($1)`, [motA]))).rejects.toThrow(/permission denied/)
  })
})

describe('contexto do pedido (preenchimento automático)', () => {
  it('motorista: nome do colaborador, viatura atribuída, km atual', async () => {
    await db.query(`INSERT INTO public.comb_abastecimentos (veiculo_id, litros, custo_total, contador, responsavel) VALUES ($1, 30, 45, 9500, 'x')`, [v1])
    const c = await q1(motA, `SELECT * FROM public.meu_contexto_abastecimento()`)
    expect(c).toMatchObject({ nome: 'Zé Gaitas', colaborador_id: colabA, veiculo_id: v1, veiculo_nome: 'Ford Transit', tipo_combustivel: 'gasoleo', pode_aprovar: false })
    expect(Number(c.km_atual)).toBe(9500)
  })

  it('sem colaborador ligado: nome do perfil, sem viatura', async () => {
    const c = await q1(semColab, `SELECT * FROM public.meu_contexto_abastecimento()`)
    expect(c).toMatchObject({ nome: 'Só Perfil', colaborador_id: null, veiculo_id: null })
  })

  it('anónimo não chega', async () => {
    await expect(anon(tx => tx.query(`SELECT * FROM public.meu_contexto_abastecimento()`))).rejects.toThrow(/permission denied/)
  })
})

describe('pedido', () => {
  beforeEach(limparBomba)

  it('cria com os dados certos e a foto dos km', async () => {
    const id = await pedir(motA, v1, { km: 10020, obs: ' depósito na reserva ' })
    expect(await pedido(id)).toMatchObject({
      estado: 'AGUARDA_AUTORIZACAO', veiculo_nome: 'Ford Transit', funcionario_nome: 'Zé Gaitas',
      solicitante_id: motA, colaborador_id: colabA, tipo_fonte: 'POLO2', tipo_combustivel: 'gasoleo',
      local: 'Polo 2', observacoes: 'depósito na reserva', km_suspeito: false,
    })
    expect(Number((await pedido(id)).contador)).toBe(10020)
  })

  it('sem foto dos km não há pedido', async () => {
    await expect(pedir(motA, v1, { semFoto: true })).rejects.toThrow(/foto do conta-quilómetros/)
  })

  it('foto de outro pedido ou de outra viatura não serve', async () => {
    const outro = randomUUID()
    const fotoOutro = caminho(v1, outro, 9)
    await enviarFoto(motA, fotoOutro)
    await expect(pedir(motA, v1, { fotoKm: fotoOutro, semFoto: true })).rejects.toThrow(/foto do conta-quilómetros/)
    const id = randomUUID()
    const fotoV2 = caminho(v2, id, 9)
    await enviarFoto(motA, fotoV2)
    await expect(pedir(motA, v1, { id, fotoKm: fotoV2, semFoto: true })).rejects.toThrow(/foto do conta-quilómetros/)
  })

  it('um pedido em curso de cada vez, por motorista e por viatura', async () => {
    await pedir(motA, v1)
    await expect(pedir(motA, v2)).rejects.toThrow(/Já tem um pedido em curso/)
    await expect(pedir(motB, v1)).rejects.toThrow(/viatura já tem um pedido/)
  })

  it('a viatura fica livre assim que o pedido é autorizado', async () => {
    const id = await pedir(motA, v1)
    await autorizar(ceo, id)
    await expect(pedir(motB, v1)).resolves.toBeTruthy()
  })

  it('viatura inativa: a foto já é recusada e, mesmo com foto, o pedido também', async () => {
    await expect(pedir(motA, v3)).rejects.toThrow(/row-level security/)
    const id = randomUUID()
    const foto = caminho(v3, id, 1)
    await db.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('combustivel-taloes', $1)`, [foto])
    await expect(pedir(motA, v3, { id, fotoKm: foto, semFoto: true })).rejects.toThrow(/inativa/)
  })

  it.each([
    ['fonte inventada', () => ({ fonte: 'OUTRA' }), /onde vai abastecer/],
    ['combustível inventado', () => ({ combustivel: 'gpl' }), /gasóleo ou gasolina/],
    ['km negativos', () => ({ km: -1 }), /km atuais/],
  ])('recusa %s', async (_n, o, erro) => {
    const opts = o()
    await expect(pedir(motA, opts.veiculo ?? v1, opts)).rejects.toThrow(erro)
  })

  it('km abaixo do último conhecido fica marcado para quem aprova (não bloqueia)', async () => {
    const id = await pedir(motA, v1, { km: 9000 })
    expect(await pedido(id)).toMatchObject({ km_suspeito: true })
    expect(Number((await pedido(id)).km_anterior)).toBe(9500)
  })

  it('bomba bloqueada: o pedido para a Polo 2 é recusado logo, com o motivo', async () => {
    await db.query(`UPDATE public.pump_config SET bloqueada = true, motivo = 'Depósito em manutenção'`)
    await expect(pedir(motA, v1)).rejects.toThrow(/Depósito em manutenção/)
    await expect(pedir(motA, v1, { fonte: 'POSTO_RUA' })).resolves.toBeTruthy()
  })

  it('salto de mais de 3000 km num depósito fica marcado; até 3000 não', async () => {
    const a = await pedir(motA, v1, { km: 12500 })
    expect((await pedido(a)).km_suspeito).toBe(false)
    await limparBomba()
    const b = await pedir(motA, v1, { km: 12501 })
    expect((await pedido(b)).km_suspeito).toBe(true)
  })

  it('conta sem nome (nem colaborador nem perfil) não pede', async () => {
    const semNome = await utilizador('motorista', 'semnome@teste.pt')
    await db.query(`UPDATE public.profiles SET nome = '  ' WHERE id = $1`, [semNome])
    await expect(pedir(semNome, v2, { fonte: 'POSTO_RUA' })).rejects.toThrow(/não tem nome/)
  })

  it('utilizador sem colaborador também pede (com o nome do perfil)', async () => {
    const id = await pedir(semColab, v2, { fonte: 'POSTO_RUA' })
    expect(await pedido(id)).toMatchObject({ funcionario_nome: 'Só Perfil', colaborador_id: null })
  })

  it('ninguém escreve diretamente na tabela; anónimo não pede', async () => {
    await expect(u(motA, tx => tx.query(`INSERT INTO public.comb_abastecimentos_pendentes (veiculo_id, veiculo_nome, funcionario_nome) VALUES ($1, 'x', 'y')`, [v1]))).rejects.toThrow(/permission denied/)
    await expect(anon(tx => tx.query(`INSERT INTO public.comb_abastecimentos_pendentes (veiculo_id, veiculo_nome, funcionario_nome) VALUES ($1, 'x', 'y')`, [v1]))).rejects.toThrow(/permission denied/)
    await expect(anon(tx => tx.query(`SELECT public.criar_pedido_abastecimento($1, $2, 'POLO2', 'gasoleo', 1, 'x')`, [randomUUID(), v1]))).rejects.toThrow(/permission denied/)
  })
})

describe('fim do pedido anónimo', () => {
  it('anónimo não tem nenhum privilégio nem política na tabela dos pedidos', async () => {
    const { rows: [p] } = await db.query(`SELECT
      has_table_privilege('anon', 'public.comb_abastecimentos_pendentes', 'INSERT') AS ins,
      has_table_privilege('anon', 'public.comb_abastecimentos_pendentes', 'SELECT') AS sel,
      has_table_privilege('anon', 'public.comb_abastecimentos_pendentes', 'UPDATE') AS upd`)
    expect(p).toEqual({ ins: false, sel: false, upd: false })
    const { rows } = await db.query(`SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'comb_abastecimentos_pendentes' AND 'anon' = ANY(roles)`)
    expect(rows).toEqual([])
  })
})

describe('decisão', () => {
  beforeEach(limparBomba)

  it('só o aprovador autoriza; gestor, armazém e o próprio motorista não', async () => {
    const id = await pedir(motA, v1)
    for (const uid of [gestor, armazem, motA, admin]) {
      await expect(autorizar(uid, id)).rejects.toThrow(/Só quem aprova/)
    }
    await autorizar(ceo, id)
    expect(await pedido(id)).toMatchObject({ estado: 'AUTORIZADO', autorizado_por: ceo, decisao_por: ceo, pump_max_seconds: 600 })
  })

  it('autorizar não liga a bomba: o Shelly continua parado até o motorista carregar no botão', async () => {
    const id = await pedir(motA, v1)
    await autorizar(ceo, id)
    expect((await pedido(id)).pump_auth_token).toBeNull()
    expect(await shelly()).toEqual({ status: 'idle' })
  })

  it('recusar com motivo; só o aprovador', async () => {
    const id = await pedir(motA, v1)
    await expect(recusar(gestor, id)).rejects.toThrow(/Só quem aprova/)
    await recusar(ceo, id, ' Já abasteceu ontem ')
    expect(await pedido(id)).toMatchObject({ estado: 'REJEITADO', motivo_recusa: 'Já abasteceu ontem', decisao_por: ceo })
  })

  it('a chamada antiga (só p_id) continua a funcionar', async () => {
    const id = await pedir(motA, v1)
    await q1(ceo, `SELECT public.rejeitar_abastecimento($1)`, [id])
    expect((await pedido(id)).estado).toBe('REJEITADO')
  })

  it('pedido do fluxo anterior em aprovação final: recusa e aprovação continuam possíveis', async () => {
    const a = randomUUID(), b = randomUUID()
    for (const id of [a, b]) {
      await db.query(`INSERT INTO public.comb_abastecimentos_pendentes (id, veiculo_id, veiculo_nome, funcionario_nome, tipo_fonte, estado, litros, custo_total, pump_activated_at)
        VALUES ($1, $2, 'Hilux', 'Antigo', 'POLO2', 'AGUARDA_APROVACAO', 20, 30, now())`, [id, v2])
    }
    await recusar(ceo, a)
    expect((await pedido(a)).estado).toBe('REJEITADO')
    await q1(ceo, `SELECT public.aprovar_abastecimento_pendente($1)`, [b])
    const p = await pedido(b)
    expect(p.estado).toBe('CONCLUIDO')   // já não é apagado: fica o histórico
    const ab = (await db.query(`SELECT * FROM public.comb_abastecimentos WHERE id = $1`, [p.abastecimento_id])).rows[0]
    expect(ab).toMatchObject({ pedido_id: b, responsavel: 'Antigo' })
  })
})

describe('execução na Polo 2 (com o Shelly)', () => {
  beforeEach(async () => {
    await limparBomba()
    await q1(ceo, `SELECT public.definir_preco_combustivel('gasoleo', 1.5)`)
  })

  async function autorizado(uid = motA, veiculo = v1) {
    const id = await pedir(uid, veiculo)
    await autorizar(ceo, id)
    return id
  }

  it('fluxo completo: leitura inicial → ligar → Shelly liga 10 min → leitura final → registo com custo', async () => {
    const id = await autorizado()
    await leituraInicial(motA, id, v1, 1000.5)
    await ligar(motA, id)
    expect(await shelly()).toEqual({ status: 'authorized', seconds: 600 })
    const abast = await concluir(motA, id, v1, { final: 1045.7 })

    const p = await pedido(id)
    expect(p).toMatchObject({ estado: 'CONCLUIDO', abastecimento_id: abast, contador_inicial_origem: 'IA', contador_final_origem: 'IA' })
    expect(Number(p.litros)).toBeCloseTo(45.2, 3)
    const a = (await db.query(`SELECT * FROM public.comb_abastecimentos WHERE id = $1`, [abast])).rows[0]
    expect(a).toMatchObject({ pedido_id: id, tipo_fonte: 'POLO2', tipo_combustivel: 'gasoleo', solicitante_id: motA, colaborador_id: colabA, responsavel: 'Zé Gaitas', local: 'Polo 2' })
    expect(Number(a.litros)).toBeCloseTo(45.2, 3)
    expect(Number(a.custo_total)).toBe(67.8)           // 45,2 L × 1,50 €
    expect(Number(a.contador)).toBe(10000)             // km da viatura
    // ainda estava a bombear: concluir manda desligar e liga a sessão ao registo
    expect(await shelly(true)).toEqual({ status: 'stop' })
    const s = (await db.query(`SELECT * FROM public.pump_sessoes WHERE pedido_id = $1`, [id])).rows[0]
    expect(s.abastecimento_id).toBe(abast)
  })

  it('sem leitura inicial não se liga a bomba', async () => {
    const id = await autorizado()
    await expect(ligar(motA, id)).rejects.toThrow(/leitura inicial/)
  })

  it('a bomba liga uma só vez por pedido', async () => {
    const id = await autorizado()
    await leituraInicial(motA, id, v1, 10)
    await ligar(motA, id)
    await shelly()
    await expect(ligar(motA, id)).rejects.toThrow(/já foi ligada/)
  })

  it('carregar duas vezes antes do Shelly responder não cria outro token', async () => {
    const id = await autorizado()
    await leituraInicial(motA, id, v1, 10)
    await ligar(motA, id)
    const t1 = (await pedido(id)).pump_auth_token
    await ligar(motA, id)
    expect((await pedido(id)).pump_auth_token).toBe(t1)
  })

  it('Shelly sem contacto: o token expira e o motorista pode voltar a ligar', async () => {
    const id = await autorizado()
    await leituraInicial(motA, id, v1, 10)
    await ligar(motA, id)
    await db.query(`UPDATE public.comb_abastecimentos_pendentes SET pump_auth_expires_at = now() - interval '1 second' WHERE id = $1`, [id])
    await ligar(motA, id)
    expect(new Date((await pedido(id)).pump_auth_expires_at).getTime()).toBeGreaterThan(Date.now())
    expect(await shelly()).toMatchObject({ status: 'authorized' })
  })

  it('bomba bloqueada entretanto: ligar é recusado com o motivo', async () => {
    const id = await autorizado()
    await leituraInicial(motA, id, v1, 10)
    await db.query(`UPDATE public.pump_config SET bloqueada = true, motivo = 'Fecho de caixa'`)
    await expect(ligar(motA, id)).rejects.toThrow(/Fecho de caixa/)
  })

  it('outro motorista não mexe no pedido', async () => {
    const id = await autorizado()
    await expect(leituraInicial(motB, id, v1, 10)).rejects.toThrow()
    await leituraInicial(motA, id, v1, 10)
    await expect(ligar(motB, id)).rejects.toThrow(/Pedido não encontrado/)
  })

  it('leitura inicial: outro motorista não regista, mesmo com uma foto que existe', async () => {
    const id = await autorizado()
    const f = caminho(v1, id, 20)
    await enviarFoto(motA, f)
    await expect(q1(motB, `SELECT public.registar_contador_inicial($1, 10, $2, 'IA')`, [id, f])).rejects.toThrow(/Pedido não encontrado/)
    expect((await pedido(id)).contador_inicial).toBeNull()
  })

  it('leitura inicial: sem foto enviada ou com valor impossível é recusada', async () => {
    const id = await autorizado()
    await expect(q1(motA, `SELECT public.registar_contador_inicial($1, 10, $2, 'IA')`, [id, caminho(v1, id, 21)])).rejects.toThrow(/foto do contador/)
    const f = caminho(v1, id, 22)
    await enviarFoto(motA, f)
    await expect(q1(motA, `SELECT public.registar_contador_inicial($1, -1, $2, 'IA')`, [id, f])).rejects.toThrow(/Leitura do contador inválida/)
    await expect(q1(motA, `SELECT public.registar_contador_inicial($1, 100000000, $2, 'IA')`, [id, f])).rejects.toThrow(/Leitura do contador inválida/)
    await expect(q1(motA, `SELECT public.registar_contador_inicial($1, 10, $2, 'OUTRA')`, [id, f])).rejects.toThrow(/Origem da leitura/)
    await q1(motA, `SELECT public.registar_contador_inicial($1, 0, $2, 'MANUAL')`, [id, f])
    expect(Number((await pedido(id)).contador_inicial)).toBe(0)
  })

  it('ainda por autorizar não liga a bomba, mesmo com a leitura inicial preenchida', async () => {
    const id = await pedir(motA, v1)
    await db.query(`UPDATE public.comb_abastecimentos_pendentes SET contador_inicial = 10 WHERE id = $1`, [id])
    await expect(ligar(motA, id)).rejects.toThrow(/não pode ligar a bomba/)
    expect((await pedido(id)).pump_auth_token).toBeNull()
  })

  it('concluir: outro motorista não conclui; sem foto enviada não conclui', async () => {
    const id = await autorizado()
    await leituraInicial(motA, id, v1, 10)
    await ligar(motA, id)
    await shelly()
    const f = caminho(v1, id, 30)
    await enviarFoto(motA, f)
    await expect(q1(motB, `SELECT public.concluir_pedido_abastecimento($1, 50, NULL, NULL, $2, 'IA')`, [id, f])).rejects.toThrow(/Pedido não encontrado/)
    await expect(q1(motA, `SELECT public.concluir_pedido_abastecimento($1, 50, NULL, NULL, $2, 'IA')`, [id, caminho(v1, id, 31)])).rejects.toThrow(/Tire a foto antes de concluir/)
    expect((await pedido(id)).estado).toBe('AUTORIZADO')
  })

  it('leituras impossíveis são recusadas', async () => {
    const id = await autorizado()
    await leituraInicial(motA, id, v1, 500)
    await ligar(motA, id)
    await shelly()
    await expect(concluir(motA, id, v1, { final: 500 })).rejects.toThrow(/maior que a inicial/)
    await expect(concluir(motA, id, v1, { final: 499 })).rejects.toThrow(/maior que a inicial/)
    await expect(concluir(motA, id, v1, { final: 1600 })).rejects.toThrow(/Diferença impossível/)
  })

  it('concluir sem a bomba ter ligado é recusado', async () => {
    const id = await autorizado()
    await leituraInicial(motA, id, v1, 10)
    await expect(concluir(motA, id, v1, { final: 20 })).rejects.toThrow(/não chegou a ligar/)
  })

  it('depois de a bomba ligar, a leitura inicial não muda', async () => {
    const id = await autorizado()
    await leituraInicial(motA, id, v1, 10)
    await ligar(motA, id)
    await shelly()
    await expect(leituraInicial(motA, id, v1, 5)).rejects.toThrow(/já ligou/)
  })

  it('sem preço definido o custo fica a 0 (não inventa)', async () => {
    await db.query(`DELETE FROM public.comb_precos`)
    const id = await autorizado()
    await leituraInicial(motA, id, v1, 0)
    await ligar(motA, id)
    await shelly()
    const abast = await concluir(motA, id, v1, { final: 10 })
    const a = (await db.query(`SELECT custo_total, preco_litro FROM public.comb_abastecimentos WHERE id = $1`, [abast])).rows[0]
    expect(Number(a.custo_total)).toBe(0)
    expect(a.preco_litro).toBeNull()
  })
})

describe('posto de rua e carrinha', () => {
  beforeEach(async () => {
    await limparBomba()
    await q1(ceo, `SELECT public.definir_preco_combustivel('gasoleo', 1.6)`)
  })

  it('posto de rua: litros e valor do talão; preço por litro calculado', async () => {
    const id = await pedir(motA, v1, { fonte: 'POSTO_RUA' })
    await autorizar(ceo, id)
    await expect(concluir(motA, id, v1, { litros: 40 })).rejects.toThrow(/valor do talão/)
    const abast = await concluir(motA, id, v1, { litros: 40, custo: 70, origem: 'MANUAL' })
    const a = (await db.query(`SELECT * FROM public.comb_abastecimentos WHERE id = $1`, [abast])).rows[0]
    expect({ l: Number(a.litros), c: Number(a.custo_total), p: Number(a.preco_litro), local: a.local })
      .toEqual({ l: 40, c: 70, p: 1.75, local: 'Posto' })
  })

  it('litros fora do possível são recusados (0, negativos, mais de 1000)', async () => {
    const id = await pedir(motA, v1, { fonte: 'POSTO_RUA' })
    await autorizar(ceo, id)
    for (const litros of [0, -5, 1000.5]) {
      await expect(concluir(motA, id, v1, { litros, custo: 10 })).rejects.toThrow(/Indique os litros/)
    }
    await expect(concluir(motA, id, v1, { litros: 1000, custo: 1700 })).resolves.toBeTruthy()
  })

  it('carrinha: litros do medidor, custo pelo preço interno', async () => {
    const id = await pedir(motA, v1, { fonte: 'CARRINHA' })
    await autorizar(ceo, id)
    const abast = await concluir(motA, id, v1, { litros: 25 })
    const a = (await db.query(`SELECT custo_total FROM public.comb_abastecimentos WHERE id = $1`, [abast])).rows[0]
    expect(Number(a.custo_total)).toBe(40)
  })

  it('dois abastecimentos iguais no mesmo dia por pedido são legítimos; à mão continuam bloqueados', async () => {
    for (let i = 0; i < 2; i++) {
      const id = await pedir(motA, v2, { fonte: 'CARRINHA' })
      await autorizar(ceo, id)
      await concluir(motA, id, v2, { litros: 33 })
      await limparBomba()
    }
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM public.comb_abastecimentos WHERE veiculo_id = $1 AND litros = 33`, [v2])
    expect(rows[0].n).toBe(2)
    const manual = `INSERT INTO public.comb_abastecimentos (veiculo_id, litros, custo_total, responsavel) VALUES ($1, 77, 100, 'x')`
    await db.query(manual, [v2])
    await expect(db.query(manual, [v2])).rejects.toThrow(/comb_abastecimentos_dedup_idx/)
  })

  it('um pedido gera no máximo um abastecimento', async () => {
    const id = await pedir(motA, v1, { fonte: 'CARRINHA' })
    await autorizar(ceo, id)
    await concluir(motA, id, v1, { litros: 12 })
    await expect(db.query(`INSERT INTO public.comb_abastecimentos (veiculo_id, litros, custo_total, responsavel, pedido_id) VALUES ($1, 13, 1, 'x', $2)`, [v1, id]))
      .rejects.toThrow(/uq_comb_abast_pedido/)
  })

  it('a leitura do contador e a bomba não se aplicam fora da Polo 2', async () => {
    const id = await pedir(motA, v1, { fonte: 'POSTO_RUA' })
    await autorizar(ceo, id)
    await expect(leituraInicial(motA, id, v1, 10)).rejects.toThrow(/só se aplica à bomba Polo 2/)
    await expect(ligar(motA, id)).rejects.toThrow(/não pode ligar a bomba/)
  })
})

describe('cancelar', () => {
  beforeEach(limparBomba)

  it('motorista cancela antes de a bomba ligar', async () => {
    const id = await pedir(motA, v1)
    await q1(motA, `SELECT public.cancelar_pedido_abastecimento($1)`, [id])
    expect(await pedido(id)).toMatchObject({ estado: 'CANCELADO', cancelado_por: motA })
  })

  it('depois de a bomba ligar só o aprovador cancela (e a bomba desliga)', async () => {
    const id = await pedir(motA, v1)
    await autorizar(ceo, id)
    await leituraInicial(motA, id, v1, 10)
    await ligar(motA, id)
    await shelly()
    await expect(q1(motA, `SELECT public.cancelar_pedido_abastecimento($1)`, [id])).rejects.toThrow(/conclua o abastecimento/)
    await q1(ceo, `SELECT public.cancelar_pedido_abastecimento($1)`, [id])
    expect((await pedido(id)).estado).toBe('CANCELADO')
    expect(await shelly(true)).toEqual({ status: 'stop' })
  })

  it('cancelar depois de "Ligar bomba" mas antes do Shelly: o token morre e a bomba não liga', async () => {
    const id = await pedir(motA, v1)
    await autorizar(ceo, id)
    await leituraInicial(motA, id, v1, 10)
    await ligar(motA, id)
    await q1(motA, `SELECT public.cancelar_pedido_abastecimento($1)`, [id])
    expect(await pedido(id)).toMatchObject({ estado: 'CANCELADO', pump_auth_token: null, pump_auth_expires_at: null })
    expect(await shelly()).toEqual({ status: 'idle' })
  })

  it('outro motorista não cancela; pedido concluído não se cancela', async () => {
    const id = await pedir(motA, v1, { fonte: 'POSTO_RUA' })
    await expect(q1(motB, `SELECT public.cancelar_pedido_abastecimento($1)`, [id])).rejects.toThrow(/não encontrado/)
    await autorizar(ceo, id)
    await concluir(motA, id, v1, { litros: 10, custo: 16 })
    await expect(q1(ceo, `SELECT public.cancelar_pedido_abastecimento($1)`, [id])).rejects.toThrow(/já não pode ser cancelado/)
  })
})

describe('bomba: desligar e estado', () => {
  beforeEach(limparBomba)

  async function aBombear() {
    const id = await pedir(motA, v1)
    await autorizar(ceo, id)
    await leituraInicial(motA, id, v1, 10)
    await ligar(motA, id)
    await shelly()
    return id
  }

  it('"Terminei": o próprio sim, outro motorista não, anónimo não', async () => {
    const id = await aBombear()
    await expect(anon(tx => tx.query(`SELECT public.parar_bomba($1)`, [id]))).rejects.toThrow(/permission denied/)
    await expect(q1(motB, `SELECT public.parar_bomba($1)`, [id])).rejects.toThrow(/Sem permissão/)
    await q1(motA, `SELECT public.parar_bomba($1)`, [id])
    expect(await shelly(true)).toEqual({ status: 'stop' })
  })

  it('corte de emergência: armazém e aprovador sim, motorista não', async () => {
    await expect(q1(motA, `SELECT public.parar_bomba(NULL)`)).rejects.toThrow(/Sem permissão/)
    await expect(q1(armazem, `SELECT public.parar_bomba(NULL)`)).resolves.toBeDefined()
    await expect(q1(ceo, `SELECT public.parar_bomba(NULL)`)).resolves.toBeDefined()
  })

  it('estado do pedido: o próprio e o aprovador veem; outro motorista não', async () => {
    const id = await aBombear()
    expect(await q1(motA, `SELECT * FROM public.get_pend_estado_bomba($1)`, [id])).toMatchObject({ estado: 'AUTORIZADO', sessao_ativa: true })
    expect(await q1(ceo, `SELECT * FROM public.get_pend_estado_bomba($1)`, [id])).toMatchObject({ sessao_ativa: true })
    expect(await q1(motB, `SELECT * FROM public.get_pend_estado_bomba($1)`, [id])).toBeUndefined()
    await expect(anon(tx => tx.query(`SELECT * FROM public.get_pend_estado_bomba($1)`, [id]))).rejects.toThrow(/permission denied/)
  })
})

describe('quem vê o quê', () => {
  it('motorista vê só os seus pedidos e abastecimentos; os papéis de antes continuam a ver tudo', async () => {
    await limparBomba()
    const b = await pedir(motB, v2, { fonte: 'POSTO_RUA' })
    const doA = (await u(motA, tx => tx.query(`SELECT solicitante_id FROM public.comb_abastecimentos_pendentes`))).rows
    expect(doA.length).toBeGreaterThan(0)
    expect(doA.every(r => r.solicitante_id === motA)).toBe(true)
    const abA = (await u(motA, tx => tx.query(`SELECT solicitante_id FROM public.comb_abastecimentos`))).rows
    expect(abA.every(r => r.solicitante_id === motA)).toBe(true)
    for (const uid of [gestor, armazem, leitura]) {
      const ids = (await u(uid, tx => tx.query(`SELECT id FROM public.comb_abastecimentos_pendentes`))).rows.map(r => r.id)
      expect(ids).toContain(b)
    }
  })
})

describe('fotos (storage)', () => {
  beforeEach(limparBomba)

  it('anónimo não envia fotos', async () => {
    await expect(anon(tx => tx.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('combustivel-taloes', $1)`,
      [caminho(v1, randomUUID())]))).rejects.toThrow(/row-level security/)
  })

  it('foto dos km para um pedido novo: sim; viatura inativa ou caminho livre: não', async () => {
    await expect(enviarFoto(motA, caminho(v1, randomUUID()))).resolves.toBeDefined()
    await expect(enviarFoto(motA, caminho(v3, randomUUID()))).rejects.toThrow(/row-level security/)
    await expect(enviarFoto(motA, 'qualquer.jpg')).rejects.toThrow(/row-level security/)
    await expect(enviarFoto(motA, caminho(v1, randomUUID()).replace('.jpg', '.html'))).rejects.toThrow(/row-level security/)
  })

  it('fotos do contador: só no pedido AUTORIZADO do próprio motorista', async () => {
    const id = await pedir(motA, v1)
    await expect(enviarFoto(motA, caminho(v1, id, 5))).rejects.toThrow(/row-level security/)   // ainda por autorizar
    await autorizar(ceo, id)
    await expect(enviarFoto(motB, caminho(v1, id, 6))).rejects.toThrow(/row-level security/)   // de outro
    await expect(enviarFoto(motA, caminho(v1, id, 7))).resolves.toBeDefined()
  })
})

describe('preço por litro', () => {
  it('aprovador define; armazém não; valores absurdos recusados', async () => {
    await q1(ceo, `SELECT public.definir_preco_combustivel('gasolina', 1.799)`)
    expect(Number((await db.query(`SELECT preco_litro FROM public.comb_precos WHERE tipo_combustivel = 'gasolina'`)).rows[0].preco_litro)).toBe(1.799)
    await expect(q1(armazem, `SELECT public.definir_preco_combustivel('gasolina', 1)`)).rejects.toThrow(/Sem permissão/)
    await expect(q1(ceo, `SELECT public.definir_preco_combustivel('gasolina', 0)`)).rejects.toThrow(/check constraint/)
    await expect(q1(ceo, `SELECT public.definir_preco_combustivel('gpl', 1)`)).rejects.toThrow(/check constraint/)
  })
})

describe('notificação imediata', () => {
  let chamadas
  beforeAll(async () => {
    // pg_net simulado: regista cada pedido HTTP que o trigger faria
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS net;
      CREATE TABLE IF NOT EXISTS net.log (url text, headers jsonb, body jsonb);
      CREATE OR REPLACE FUNCTION net.http_post(url text, body jsonb, params jsonb DEFAULT '{}', headers jsonb DEFAULT '{}', timeout_milliseconds int DEFAULT 5000)
      RETURNS bigint LANGUAGE sql AS $$ INSERT INTO net.log VALUES (url, headers, body); SELECT 1::bigint $$;
      GRANT USAGE ON SCHEMA net TO authenticated, anon;
      GRANT ALL ON net.log TO authenticated;
      GRANT EXECUTE ON FUNCTION net.http_post(text, jsonb, jsonb, jsonb, int) TO authenticated;`)
    chamadas = async () => (await db.query(`SELECT url, headers, body FROM net.log`)).rows
  })
  beforeEach(async () => { await limparBomba(); await db.query(`DELETE FROM net.log`) })

  it('pedido novo → aprovadores; decisão → motorista; mais nada', async () => {
    const id = await pedir(motA, v1)
    let c = await chamadas()
    expect(c).toHaveLength(1)
    expect(c[0].url).toMatch(/\/functions\/v1\/notificar-abastecimento$/)
    expect(c[0].body).toEqual({ evento: 'NOVO', pedido_id: id })
    const segredo = (await db.query(`SELECT valor FROM privado.segredos WHERE nome = 'abastecimento_push'`)).rows[0].valor
    expect(c[0].headers['x-segredo']).toBe(segredo)

    await autorizar(ceo, id)
    c = await chamadas()
    expect(c).toHaveLength(2)
    expect(c[1].body).toEqual({ evento: 'DECISAO', pedido_id: id })

    await leituraInicial(motA, id, v1, 1)   // atualizações que não mudam o estado não notificam
    expect(await chamadas()).toHaveLength(2)
  })

  it('recusa também avisa o motorista', async () => {
    const id = await pedir(motA, v1)
    await recusar(ceo, id)
    expect((await chamadas()).map(c => c.body.evento)).toEqual(['NOVO', 'DECISAO'])
  })

  it('cancelar e concluir não notificam', async () => {
    const a = await pedir(motA, v1)
    await q1(motA, `SELECT public.cancelar_pedido_abastecimento($1)`, [a])
    const b = await pedir(motA, v1, { fonte: 'POSTO_RUA' })
    await autorizar(ceo, b)
    await concluir(motA, b, v1, { litros: 10, custo: 16 })
    expect((await chamadas()).map(c => c.body.evento)).toEqual(['NOVO', 'NOVO', 'DECISAO'])
  })

  it('se o envio falhar, o pedido entra na mesma', async () => {
    await db.exec(`CREATE OR REPLACE FUNCTION net.http_post(url text, body jsonb, params jsonb DEFAULT '{}', headers jsonb DEFAULT '{}', timeout_milliseconds int DEFAULT 5000)
      RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'rede em baixo'; END $$`)
    const id = await pedir(motA, v1)
    expect((await pedido(id)).estado).toBe('AGUARDA_AUTORIZACAO')
  })

  it('segredo da notificação: só o papel de serviço confirma; a app não lê', async () => {
    const s = (await db.query(`SELECT valor FROM privado.segredos WHERE nome = 'abastecimento_push'`)).rows[0].valor
    expect(s).toMatch(/^[0-9a-f]{64}$/)
    expect((await servico(tx => tx.query(`SELECT public.abastecimento_push_autorizado($1) AS ok`, [s]))).rows[0].ok).toBe(true)
    expect((await servico(tx => tx.query(`SELECT public.abastecimento_push_autorizado('0000') AS ok`))).rows[0].ok).toBe(false)
    await expect(u(ceo, tx => tx.query(`SELECT public.abastecimento_push_autorizado($1)`, [s]))).rejects.toThrow(/permission denied/)
    await expect(u(ceo, tx => tx.query(`SELECT valor FROM privado.segredos`))).rejects.toThrow(/permission denied/)
  })
})
