// @vitest-environment node
// Fase 9 — Frota: permissões do papel mecânico, catálogo configurável,
// alertas por item, manutenções, checklists, atribuição de condutor, fotos,
// migração das colunas antigas de comb_veiculos. Postgres real (PGlite) com
// todas as migrations aplicadas.
import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { criarBanco, como } from './pg-harness.mjs'

const MIGRATION_FROTA = fileURLToPath(new URL('../migrations/20260929030000_fase9_frota.sql', import.meta.url))

let db, admin, gestor, mecanico, armazem, leitura, viatura, outraViatura, colabA, colabB

async function novoUtilizador(role, email, banco = db) {
  const { rows } = await banco.query(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [email])
  await banco.query(`UPDATE public.profiles SET role = $1 WHERE id = $2`, [role, rows[0].id])
  return rows[0].id
}

const anon  = fn => como(db, { papel: 'anon' }, fn)
const comoU = (uid, fn) => como(db, { papel: 'authenticated', uid }, fn)
const servico = fn => como(db, { papel: 'service_role' }, fn)

const item = async chave =>
  (await db.query(`SELECT id FROM public.frota_itens_catalogo WHERE chave = $1`, [chave])).rows[0].id
const dia = async n => (await db.query(`SELECT (CURRENT_DATE + $1::int)::text AS d`, [n])).rows[0].d

const configurar = (uid, veiculo, itemId, o = {}) => comoU(uid, tx => tx.query(
  `SELECT public.configurar_item_veiculo($1, $2, $3, $4, $5, $6, $7) AS id`,
  [veiculo, itemId, o.ativo ?? true, o.intervaloKm ?? null, o.intervaloMeses ?? null, o.proximaKm ?? null, o.proximaData ?? null],
)).then(r => r.rows[0].id)

const manutencao = (uid, veiculo, itemId, o = {}) => comoU(uid, tx => tx.query(
  `SELECT public.registar_manutencao($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) AS id`,
  [veiculo, itemId, o.descricao ?? null, o.data, o.km ?? null, o.custo ?? null, o.oficina ?? null,
   o.observacoes ?? null, o.atualiza ?? true, o.proximaData ?? null],
)).then(r => r.rows[0].id)

const checklist = (uid, veiculo, itens, o = {}) => comoU(uid, tx => tx.query(
  `SELECT public.registar_checklist($1, $2, $3, $4::jsonb, $5, $6) AS id`,
  [veiculo, o.data, o.km ?? null, JSON.stringify(itens), o.observacoes ?? null, o.fotos ?? []],
)).then(r => r.rows[0].id)

const atribuir = (uid, veiculo, colab, desde) => comoU(uid, tx => tx.query(
  `SELECT public.atribuir_condutor($1, $2, $3) AS id`, [veiculo, colab, desde],
)).then(r => r.rows[0].id)

const alertaAtivo = async fviId => (await db.query(
  `SELECT severidade, valor_atual FROM public.alertas WHERE entidade_id = $1 AND estado = 'ATIVO'`, [fviId],
)).rows

const fvi = async (veiculo, chave) => (await db.query(
  `SELECT f.* FROM public.frota_veiculo_itens f JOIN public.frota_itens_catalogo c ON c.id = f.item_id
    WHERE f.veiculo_id = $1 AND c.chave = $2`, [veiculo, chave],
)).rows[0]

// Litros diferentes: há um índice anti-duplicados (viatura + dia + litros + custo)
const abastecer = (veiculo, contador) => db.query(
  `INSERT INTO public.comb_abastecimentos (veiculo_id, litros, custo_total, contador, responsavel)
   VALUES ($1, $3, 20, $2, 'Teste')`, [veiculo, contador, 10 + contador / 1000])

beforeAll(async () => {
  db = await criarBanco()
  admin    = await novoUtilizador('admin',    'admin@teste.pt')
  gestor   = await novoUtilizador('gestor',   'gestor@teste.pt')
  mecanico = await novoUtilizador('mecanico', 'carlos@teste.pt')
  armazem  = await novoUtilizador('armazem',  'armazem@teste.pt')
  leitura  = await novoUtilizador('leitura',  'leitura@teste.pt')
  viatura      = (await db.query(`INSERT INTO public.comb_veiculos (nome) VALUES ('Carrinha 1') RETURNING id`)).rows[0].id
  outraViatura = (await db.query(`INSERT INTO public.comb_veiculos (nome) VALUES ('Carrinha 2') RETURNING id`)).rows[0].id
  colabA = (await db.query(`INSERT INTO public.colaboradores (nome, numero_mecan, cargo) VALUES ('Rui', 'M1', 'Motorista') RETURNING id`)).rows[0].id
  colabB = (await db.query(`INSERT INTO public.colaboradores (nome, numero_mecan, cargo) VALUES ('Ana', 'M2', 'Motorista') RETURNING id`)).rows[0].id
}, 120_000)

describe('papel mecânico', () => {
  it('escreve na frota e em nenhum outro módulo', async () => {
    const r = await comoU(mecanico, tx => tx.query(`SELECT
      public.pode_escrever('frota') AS frota, public.pode_escrever('armazem') AS armazem,
      public.pode_escrever('ferramentas') AS ferramentas, public.pode_escrever('combustivel') AS combustivel,
      public.pode_escrever('obras') AS obras, public.pode_escrever('subempreitadas') AS sub`))
    expect(r.rows[0]).toEqual({ frota: true, armazem: false, ferramentas: false, combustivel: false, obras: false, sub: false })
  })

  it.each([['admin', () => admin], ['gestor', () => gestor]])('%s continua a escrever na frota', async (_n, uid) => {
    const r = await comoU(uid(), tx => tx.query(`SELECT public.pode_escrever('frota') AS ok`))
    expect(r.rows[0].ok).toBe(true)
  })

  it.each([['armazem', () => armazem], ['leitura', () => leitura]])('%s não escreve na frota', async (_n, uid) => {
    const r = await comoU(uid(), tx => tx.query(`SELECT public.pode_escrever('frota') AS ok`))
    expect(r.rows[0].ok).toBe(false)
  })

  it('não consegue criar produtos', async () => {
    await expect(comoU(mecanico, tx => tx.query(
      `INSERT INTO public.produtos (nome, unidade) VALUES ('X', 'un')`))).rejects.toThrow()
  })

  it('os papéis que já existiam mantêm exatamente as mesmas permissões', async () => {
    const r = await comoU(armazem, tx => tx.query(`SELECT public.pode_escrever('armazem') AS a,
      public.pode_escrever('combustivel') AS c, public.pode_escrever('obras') AS o`))
    expect(r.rows[0]).toEqual({ a: true, c: true, o: false })
  })
})

describe('anónimo não chega a nada da frota', () => {
  it.each([
    'frota_itens_catalogo', 'frota_veiculo_itens', 'veiculo_atribuicoes',
    'veiculo_manutencoes', 'veiculo_checklists', 'frota_alerta_destinatarios',
  ])('SELECT %s', async tabela => {
    await expect(anon(tx => tx.query(`SELECT 1 FROM public.${tabela}`))).rejects.toThrow(/permission denied/)
  })

  it.each([
    `SELECT public.avaliar_frota()`,
    `SELECT public.km_atual_veiculo('00000000-0000-0000-0000-000000000000')`,
    `SELECT public.configurar_item_veiculo(NULL, NULL, true, NULL, NULL, NULL, NULL)`,
    `SELECT public.registar_manutencao(NULL, NULL, NULL, CURRENT_DATE, NULL, NULL, NULL, NULL, true)`,
    `SELECT public.registar_checklist(NULL, CURRENT_DATE, NULL, '[]'::jsonb, NULL)`,
    `SELECT public.atribuir_condutor(NULL, NULL)`,
    `SELECT public.foto_frota_valida('x')`,
    `SELECT public._avaliar_frota_item('00000000-0000-0000-0000-000000000000')`,
  ])('%s', async sql => {
    await expect(anon(tx => tx.query(sql))).rejects.toThrow(/permission denied/)
  })

  it('autenticado também não chama a função interna de avaliação', async () => {
    await expect(comoU(admin, tx => tx.query(
      `SELECT public._avaliar_frota_item('00000000-0000-0000-0000-000000000000')`))).rejects.toThrow(/permission denied/)
  })
})

describe('catálogo configurável', () => {
  it('traz a lista inicial do mecânico nas 4 categorias', async () => {
    const r = await db.query(`SELECT categoria, count(*)::int AS n FROM public.frota_itens_catalogo GROUP BY 1 ORDER BY 1`)
    expect(r.rows.map(x => x.categoria)).toEqual(['INSPECAO_RAPIDA', 'LONGO_PRAZO', 'OBRIGACAO_LEGAL', 'REVISAO_PERIODICA'])
    expect(r.rows.every(x => x.n > 0)).toBe(true)
  })

  it('o mecânico cria e edita itens sem migration', async () => {
    await comoU(mecanico, tx => tx.query(
      `INSERT INTO public.frota_itens_catalogo (chave, rotulo, categoria, natureza, intervalo_km_padrao)
       VALUES ('grua_hidraulica', 'Grua hidráulica', 'REVISAO_PERIODICA', 'MANUTENCAO', 5000)`))
    await comoU(mecanico, tx => tx.query(
      `UPDATE public.frota_itens_catalogo SET rotulo = 'Grua hidráulica (óleo)' WHERE chave = 'grua_hidraulica'`))
    const r = await db.query(`SELECT rotulo FROM public.frota_itens_catalogo WHERE chave = 'grua_hidraulica'`)
    expect(r.rows[0].rotulo).toBe('Grua hidráulica (óleo)')
  })

  it.each([['armazem', () => armazem], ['leitura', () => leitura]])('%s não mexe no catálogo', async (_n, uid) => {
    await expect(comoU(uid(), tx => tx.query(
      `INSERT INTO public.frota_itens_catalogo (chave, rotulo, categoria, natureza)
       VALUES ('x_${_n}', 'X', 'INSPECAO_RAPIDA', 'CHECKLIST')`))).rejects.toThrow(/row-level security/)
    const r = await comoU(uid(), tx => tx.query(
      `UPDATE public.frota_itens_catalogo SET rotulo = 'estragado' WHERE chave = 'buzina' RETURNING id`))
    expect(r.rows).toHaveLength(0)
  })

  it('ninguém apaga itens (desativa-se, o histórico fica)', async () => {
    await expect(comoU(admin, tx => tx.query(
      `DELETE FROM public.frota_itens_catalogo WHERE chave = 'buzina'`))).rejects.toThrow(/permission denied/)
  })

  it.each([
    ['item de checklist com prazo', `('a_b', 'X', 'INSPECAO_RAPIDA', 'CHECKLIST', 1000, NULL, 2000, 500)`],
    ['limiar urgente maior que atenção', `('a_c', 'X', 'REVISAO_PERIODICA', 'MANUTENCAO', 1000, NULL, 500, 2000)`],
    ['intervalo negativo', `('a_d', 'X', 'REVISAO_PERIODICA', 'MANUTENCAO', -5, NULL, 2000, 500)`],
    ['categoria inventada', `('a_e', 'X', 'OUTRA', 'MANUTENCAO', NULL, NULL, 2000, 500)`],
    ['chave com espaços', `('a f', 'X', 'REVISAO_PERIODICA', 'MANUTENCAO', NULL, NULL, 2000, 500)`],
  ])('recusa %s', async (_n, valores) => {
    await expect(comoU(mecanico, tx => tx.query(
      `INSERT INTO public.frota_itens_catalogo
         (chave, rotulo, categoria, natureza, intervalo_km_padrao, intervalo_meses_padrao, limiar_atencao_km, limiar_urgente_km)
       VALUES ${valores}`))).rejects.toThrow(/check constraint/)
  })
})

describe('alertas por item', () => {
  it('prazo por data: URGENTE a 5 dias, ATENÇÃO a 20, nenhum a 60', async () => {
    const seguro = await item('seguro')
    const id = await configurar(mecanico, viatura, seguro, { proximaData: await dia(5) })
    expect((await alertaAtivo(id))[0]).toMatchObject({ severidade: 'URGENTE' })
    await configurar(mecanico, viatura, seguro, { proximaData: await dia(20) })
    expect((await alertaAtivo(id))[0]).toMatchObject({ severidade: 'ATENCAO' })
    await configurar(mecanico, viatura, seguro, { proximaData: await dia(60) })
    expect(await alertaAtivo(id)).toHaveLength(0)
  })

  it('prazo por km: o abastecimento com contador reavalia na hora', async () => {
    const oleo = await item('oleo_motor_filtro')
    const id = await configurar(mecanico, viatura, oleo, { proximaKm: 10000 })
    expect(await alertaAtivo(id)).toHaveLength(0)   // ainda sem km conhecido
    await abastecer(viatura, 7000)                    // faltam 3000 → nada
    expect(await alertaAtivo(id)).toHaveLength(0)
    await abastecer(viatura, 8500)                    // faltam 1500 → ATENÇÃO (≤ 2000)
    expect((await alertaAtivo(id))[0]).toMatchObject({ severidade: 'ATENCAO' })
    await abastecer(viatura, 9600)                    // faltam 400 → URGENTE (≤ 500)
    const [a] = await alertaAtivo(id)
    expect(a.severidade).toBe('URGENTE')
    expect(Number(a.valor_atual)).toBe(400)
  })

  it('km e data no mesmo item: vale o pior dos dois', async () => {
    const filtro = await item('filtro_habitaculo')
    const id = await configurar(mecanico, viatura, filtro, { proximaKm: 50000, proximaData: await dia(3) })
    expect((await alertaAtivo(id))[0]).toMatchObject({ severidade: 'URGENTE' })
  })

  it('item desligado na viatura resolve o alerta', async () => {
    const filtro = await item('filtro_habitaculo')
    const id = await configurar(mecanico, viatura, filtro, { ativo: false, proximaData: await dia(3) })
    expect(await alertaAtivo(id)).toHaveLength(0)
  })

  it('item desativado no catálogo deixa de alertar; o alerta antigo fica resolvido, não apagado', async () => {
    const tacografo = await item('tacografo')
    const id = await configurar(mecanico, outraViatura, tacografo, { proximaData: await dia(2) })
    expect(await alertaAtivo(id)).toHaveLength(1)
    await comoU(mecanico, tx => tx.query(`UPDATE public.frota_itens_catalogo SET ativo = false WHERE id = $1`, [tacografo]))
    await comoU(mecanico, tx => tx.query(`SELECT public.avaliar_frota()`))
    expect(await alertaAtivo(id)).toHaveLength(0)
    const r = await db.query(`SELECT count(*)::int AS n FROM public.alertas WHERE entidade_id = $1 AND estado = 'RESOLVIDO'`, [id])
    expect(r.rows[0].n).toBe(1)
    await db.query(`UPDATE public.frota_itens_catalogo SET ativo = true WHERE id = $1`, [tacografo])
  })

  it('avaliar duas vezes não duplica alertas', async () => {
    await comoU(gestor, tx => tx.query(`SELECT public.avaliar_frota()`))
    await comoU(gestor, tx => tx.query(`SELECT public.avaliar_frota()`))
    const r = await db.query(`SELECT entidade_id, count(*)::int AS n FROM public.alertas
      WHERE estado = 'ATIVO' GROUP BY entidade_id HAVING count(*) > 1`)
    expect(r.rows).toHaveLength(0)
  })

  it('leitura não pode avaliar; papel de serviço pode', async () => {
    await expect(comoU(leitura, tx => tx.query(`SELECT public.avaliar_frota()`))).rejects.toThrow(/Sem permissão/)
    await expect(servico(tx => tx.query(`SELECT public.avaliar_frota()`))).resolves.toBeDefined()
  })

  it('a página de Alertas mostra viatura e item', async () => {
    const r = await db.query(`SELECT entidade_nome, entidade_detalhe FROM public.alertas_detalhados
      WHERE regra_tipo = 'FROTA_ITEM' AND estado = 'ATIVO' AND entidade_detalhe = 'Seguro (validade)'`)
    expect(r.rows.length === 0 || r.rows[0].entidade_nome === 'Carrinha 1').toBe(true)
    const oleo = await db.query(`SELECT entidade_nome, entidade_detalhe FROM public.alertas_detalhados
      WHERE regra_tipo = 'FROTA_ITEM' AND estado = 'ATIVO' AND entidade_detalhe = 'Óleo do motor + filtro de óleo'`)
    expect(oleo.rows[0]).toEqual({ entidade_nome: 'Carrinha 1', entidade_detalhe: 'Óleo do motor + filtro de óleo' })
  })

  it('um erro na avaliação da frota nunca impede um abastecimento', async () => {
    const b = await criarBanco()
    const v = (await b.query(`INSERT INTO public.comb_veiculos (nome) VALUES ('X') RETURNING id`)).rows[0].id
    const c = (await b.query(`SELECT id FROM public.frota_itens_catalogo WHERE chave = 'revisao_geral'`)).rows[0].id
    await b.query(`INSERT INTO public.frota_veiculo_itens (veiculo_id, item_id, proxima_km) VALUES ($1, $2, 100)`, [v, c])
    await b.query(`CREATE OR REPLACE FUNCTION public._avaliar_frota_item(p_id uuid) RETURNS text
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'avaria simulada'; END $$`)
    await b.query(`INSERT INTO public.comb_abastecimentos (veiculo_id, litros, custo_total, contador, responsavel)
      VALUES ($1, 10, 20, 90, 'Teste')`, [v])
    const r = await b.query(`SELECT count(*)::int AS n FROM public.comb_abastecimentos WHERE veiculo_id = $1`, [v])
    expect(r.rows[0].n).toBe(1)
  }, 120_000)
})

describe('registar manutenção', () => {
  it('avança o próximo prazo pelo intervalo do catálogo e resolve o alerta', async () => {
    const oleo = await item('oleo_motor_filtro')   // 15 000 km / 12 meses
    const hoje = await dia(0)
    await manutencao(mecanico, viatura, oleo, { data: hoje, km: 9700, custo: 85.5, oficina: 'Polo 2' })
    const f = await fvi(viatura, 'oleo_motor_filtro')
    expect(Number(f.proxima_km)).toBe(24700)
    expect(Number(f.ultima_km)).toBe(9700)
    const esperado = (await db.query(`SELECT (CURRENT_DATE + interval '12 months')::date::text AS d`)).rows[0].d
    expect(f.proxima_data.toISOString().slice(0, 10)).toBe(esperado)
    expect(await alertaAtivo(f.id)).toHaveLength(0)
  })

  it('o intervalo próprio da viatura vence o do catálogo', async () => {
    const pastilhas = await item('travoes_pastilhas_discos')
    await configurar(mecanico, outraViatura, pastilhas, { intervaloKm: 8000 })
    await manutencao(mecanico, outraViatura, pastilhas, { data: await dia(0), km: 20000 })
    expect(Number((await fvi(outraViatura, 'travoes_pastilhas_discos')).proxima_km)).toBe(28000)
  })

  it('item com prazo em km exige os km', async () => {
    await expect(manutencao(mecanico, viatura, await item('filtro_ar'), { data: await dia(0) }))
      .rejects.toThrow(/Indique os km/)
  })

  it('data explícita tem prioridade (seguro renovado até X)', async () => {
    const seguro = await item('seguro')
    const ate = await dia(200)
    await manutencao(mecanico, viatura, seguro, { data: await dia(0), proximaData: ate })
    expect((await fvi(viatura, 'seguro')).proxima_data.toISOString().slice(0, 10)).toBe(ate)
  })

  it('registar uma manutenção antiga depois de uma recente não recua o prazo', async () => {
    const oleo = await item('oleo_motor_filtro')
    await manutencao(mecanico, viatura, oleo, { data: await dia(-300), km: 1000 })
    expect(Number((await fvi(viatura, 'oleo_motor_filtro')).proxima_km)).toBe(24700)
    const r = await db.query(`SELECT count(*)::int AS n FROM public.veiculo_manutencoes WHERE item_id = $1 AND veiculo_id = $2`, [oleo, viatura])
    expect(r.rows[0].n).toBe(2)   // fica no histórico, só não mexe no prazo
  })

  it('sem atualizar o prazo, só fica no histórico', async () => {
    const bateria = await item('bateria')
    await configurar(mecanico, viatura, bateria, { proximaData: await dia(90) })
    await manutencao(mecanico, viatura, bateria, { data: await dia(0), atualiza: false })
    expect((await fvi(viatura, 'bateria')).proxima_data.toISOString().slice(0, 10)).toBe(await dia(90))
  })

  it('trabalho avulso precisa de descrição', async () => {
    await expect(manutencao(mecanico, viatura, null, { data: await dia(0) })).rejects.toThrow(/check constraint/)
    await expect(manutencao(mecanico, viatura, null, { data: await dia(0), descricao: 'Troca de escova' })).resolves.toBeTruthy()
  })

  it('recusa data futura e quem não escreve na frota', async () => {
    await expect(manutencao(mecanico, viatura, null, { data: await dia(1), descricao: 'x' })).rejects.toThrow(/futura/)
    await expect(manutencao(armazem, viatura, null, { data: await dia(0), descricao: 'x' })).rejects.toThrow(/Sem permissão/)
  })

  it('a tabela não aceita escrita direta, só pela RPC', async () => {
    await expect(comoU(mecanico, tx => tx.query(
      `INSERT INTO public.veiculo_manutencoes (veiculo_id, descricao) VALUES ($1, 'x')`, [viatura])))
      .rejects.toThrow(/permission denied/)
  })
})

describe('atribuição de condutor', () => {
  it('passar a viatura fecha a atribuição anterior', async () => {
    await atribuir(mecanico, viatura, colabA, await dia(-10))
    await atribuir(mecanico, viatura, colabB, await dia(0))
    const r = await db.query(`SELECT colaborador_id, ate FROM public.veiculo_atribuicoes WHERE veiculo_id = $1 ORDER BY desde`, [viatura])
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0].colaborador_id).toBe(colabA)
    expect(r.rows[0].ate).not.toBeNull()
    expect(r.rows[1]).toMatchObject({ colaborador_id: colabB, ate: null })
  })

  it('atribuir ao mesmo condutor não cria nada novo', async () => {
    const antes = await db.query(`SELECT count(*)::int AS n FROM public.veiculo_atribuicoes`)
    await atribuir(mecanico, viatura, colabB, await dia(0))
    const depois = await db.query(`SELECT count(*)::int AS n FROM public.veiculo_atribuicoes`)
    expect(depois.rows[0].n).toBe(antes.rows[0].n)
  })

  it('nunca duas atribuições em aberto na mesma viatura', async () => {
    await expect(db.query(`INSERT INTO public.veiculo_atribuicoes (veiculo_id, colaborador_id) VALUES ($1, $2)`, [viatura, colabA]))
      .rejects.toThrow(/duplicate key/)
  })

  it('manutenções e checklists guardam quem tinha a viatura', async () => {
    const id = await manutencao(mecanico, viatura, null, { data: await dia(0), descricao: 'Lâmpada' })
    const r = await db.query(`SELECT condutor_id FROM public.veiculo_manutencoes WHERE id = $1`, [id])
    expect(r.rows[0].condutor_id).toBe(colabB)
  })

  it('devolver a viatura (sem condutor)', async () => {
    expect(await atribuir(mecanico, outraViatura, colabA, await dia(0))).toBeTruthy()
    expect(await atribuir(mecanico, outraViatura, null, await dia(0))).toBeNull()
    const r = await db.query(`SELECT count(*)::int AS n FROM public.veiculo_atribuicoes WHERE veiculo_id = $1 AND ate IS NULL`, [outraViatura])
    expect(r.rows[0].n).toBe(0)
  })

  it('armazém não atribui viaturas', async () => {
    await expect(atribuir(armazem, viatura, colabA, await dia(0))).rejects.toThrow(/Sem permissão/)
  })
})

describe('registar checklist', () => {
  let oleoNivel, luzes, pneus
  beforeAll(async () => {
    oleoNivel = await item('oleo_motor_nivel'); luzes = await item('luzes'); pneus = await item('pneus_visual')
  })

  it('estado geral é o pior item; texto vem do catálogo, não do cliente', async () => {
    const id = await checklist(mecanico, viatura, [
      { item_id: oleoNivel, estado: 'OK', rotulo: 'texto inventado pelo cliente' },
      { item_id: luzes, estado: 'ATENCAO', observacao: 'pisca direito fraco' },
      { item_id: pneus, estado: 'OK' },
    ], { data: await dia(0), km: 9800 })
    const r = await db.query(`SELECT estado_geral, itens, condutor_id FROM public.veiculo_checklists WHERE id = $1`, [id])
    expect(r.rows[0].estado_geral).toBe('ATENCAO')
    expect(r.rows[0].condutor_id).toBe(colabB)
    expect(r.rows[0].itens[0].rotulo).toBe('Nível de óleo do motor')
    expect(r.rows[0].itens[1]).toMatchObject({ estado: 'ATENCAO', observacao: 'pisca direito fraco', categoria: 'INSPECAO_RAPIDA' })
  })

  it('um item MAU torna o checklist MAU', async () => {
    const id = await checklist(mecanico, viatura, [
      { item_id: oleoNivel, estado: 'ATENCAO' }, { item_id: pneus, estado: 'MAU' },
    ], { data: await dia(0) })
    expect((await db.query(`SELECT estado_geral FROM public.veiculo_checklists WHERE id = $1`, [id])).rows[0].estado_geral).toBe('MAU')
  })

  it.each([
    ['vazio', []],
    ['item desconhecido', [{ item_id: randomUUID(), estado: 'OK' }]],
    ['item que não é uuid', [{ item_id: 'abc', estado: 'OK' }]],
    ['estado inválido', [{ item_id: 'x', estado: 'OTIMO' }]],
  ])('recusa checklist %s', async (_n, itens) => {
    const lista = itens.map(i => i.item_id === 'x' ? { ...i, item_id: oleoNivel } : i)
    await expect(checklist(mecanico, viatura, lista, { data: await dia(0) })).rejects.toThrow(/pelo menos um item|desconhecido/)
  })

  it('recusa o mesmo item repetido', async () => {
    await expect(checklist(mecanico, viatura, [{ item_id: luzes, estado: 'OK' }, { item_id: luzes, estado: 'MAU' }],
      { data: await dia(0) })).rejects.toThrow(/repetido/)
  })

  it('fotos só da pasta desta viatura', async () => {
    const boa = `${viatura}/${randomUUID()}.jpg`
    await expect(checklist(mecanico, viatura, [{ item_id: luzes, estado: 'OK' }], { data: await dia(0), fotos: [boa] })).resolves.toBeTruthy()
    for (const ma of [`${outraViatura}/${randomUUID()}.jpg`, `${viatura}/../x.jpg`, `${viatura}/${randomUUID()}.exe`]) {
      await expect(checklist(mecanico, viatura, [{ item_id: luzes, estado: 'OK' }], { data: await dia(0), fotos: [ma] }))
        .rejects.toThrow(/Foto inválida/)
    }
  })

  it('km do checklist conta como leitura atual da viatura', async () => {
    const r = await comoU(mecanico, tx => tx.query(`SELECT public.km_atual_veiculo($1) AS km`, [viatura]))
    expect(Number(r.rows[0].km)).toBe(9800)
  })

  it('armazém e leitura não registam checklists', async () => {
    for (const uid of [armazem, leitura]) {
      await expect(checklist(uid, viatura, [{ item_id: luzes, estado: 'OK' }], { data: await dia(0) })).rejects.toThrow(/Sem permissão/)
    }
  })
})

describe('fotos do checklist (storage)', () => {
  const enviar = (uid, nome, bucket = 'frota-checklists') =>
    comoU(uid, tx => tx.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ($1, $2)`, [bucket, nome]))

  it('mecânico envia para a pasta de uma viatura existente', async () => {
    await expect(enviar(mecanico, `${viatura}/${randomUUID()}.jpg`)).resolves.toBeDefined()
  })

  it.each([
    ['viatura inexistente', () => `${randomUUID()}/${randomUUID()}.jpg`],
    ['nome livre', () => `${viatura}/foto.jpg`],
    ['subpasta', () => `${viatura}/a/${randomUUID()}.jpg`],
    ['extensão', () => `${viatura}/${randomUUID()}.svg`],
  ])('recusa %s', async (_n, nome) => {
    await expect(enviar(mecanico, nome())).rejects.toThrow(/row-level security/)
  })

  it('armazém e anónimo não enviam', async () => {
    await expect(enviar(armazem, `${viatura}/${randomUUID()}.jpg`)).rejects.toThrow(/row-level security/)
    await expect(anon(tx => tx.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('frota-checklists', $1)`,
      [`${viatura}/${randomUUID()}.jpg`]))).rejects.toThrow(/row-level security/)
  })
})

describe('destinatários das notificações', () => {
  it('só o admin escolhe quem recebe', async () => {
    await expect(comoU(admin, tx => tx.query(`INSERT INTO public.frota_alerta_destinatarios (user_id) VALUES ($1)`, [mecanico])))
      .resolves.toBeDefined()
    for (const uid of [gestor, mecanico]) {
      await expect(comoU(uid, tx => tx.query(`INSERT INTO public.frota_alerta_destinatarios (user_id) VALUES ($1)`, [uid])))
        .rejects.toThrow(/row-level security/)
    }
    const r = await comoU(mecanico, tx => tx.query(`DELETE FROM public.frota_alerta_destinatarios RETURNING user_id`))
    expect(r.rows).toHaveLength(0)
  })
})

describe('migração das colunas antigas de comb_veiculos', () => {
  let b, v
  beforeAll(async () => {
    b = await criarBanco({ ate: '20260929020000_fase9_papel_mecanico.sql' })
    v = (await b.query(`INSERT INTO public.comb_veiculos
      (nome, proxima_revisao_km, intervalo_revisao_km, intervalo_revisao_meses, data_fim_seguro, data_proxima_ipo)
      VALUES ('Antiga', 50000, 15000, 12, CURRENT_DATE + 3, CURRENT_DATE + 100) RETURNING id`)).rows[0].id
    await b.query(`SELECT public.avaliar_regras_alerta()`)
    await b.exec(readFileSync(MIGRATION_FROTA, 'utf8'))
  }, 120_000)

  const linha = chave => b.query(`SELECT f.* FROM public.frota_veiculo_itens f
    JOIN public.frota_itens_catalogo c ON c.id = f.item_id WHERE f.veiculo_id = $1 AND c.chave = $2`, [v, chave])
    .then(r => r.rows[0])

  it('revisão, seguro e IPO passam para a frota sem perder valores', async () => {
    const rev = await linha('revisao_geral')
    expect({ km: Number(rev.proxima_km), ikm: Number(rev.intervalo_km), im: rev.intervalo_meses })
      .toEqual({ km: 50000, ikm: 15000, im: 12 })
    expect(await linha('seguro')).toBeTruthy()
    expect(await linha('ipo')).toBeTruthy()
  })

  it('as 4 regras antigas ficam desligadas e os alertas delas resolvidos; o seguro alerta pela regra nova', async () => {
    const regras = await b.query(`SELECT count(*)::int AS n FROM public.regras_alerta
      WHERE tipo IN ('REVISAO_KM','REVISAO_DATA','SEGURO','IPO') AND ativa`)
    expect(regras.rows[0].n).toBe(0)
    const antigos = await b.query(`SELECT count(*)::int AS n FROM public.alertas a JOIN public.regras_alerta r ON r.id = a.regra_id
      WHERE r.tipo IN ('REVISAO_KM','REVISAO_DATA','SEGURO','IPO') AND a.estado = 'ATIVO'`)
    expect(antigos.rows[0].n).toBe(0)
    const seguro = await linha('seguro')
    const novo = await b.query(`SELECT severidade FROM public.alertas WHERE entidade_id = $1 AND estado = 'ATIVO'`, [seguro.id])
    expect(novo.rows[0].severidade).toBe('URGENTE')
  })

  it('aplicar a migration outra vez não duplica nada', async () => {
    const contar = async () => (await b.query(`SELECT
      (SELECT count(*) FROM public.frota_itens_catalogo)::int AS cat,
      (SELECT count(*) FROM public.frota_veiculo_itens)::int  AS fvi,
      (SELECT count(*) FROM public.regras_alerta WHERE tipo = 'FROTA_ITEM')::int AS regra,
      (SELECT count(*) FROM public.alertas WHERE estado = 'ATIVO')::int AS alertas`)).rows[0]
    const antes = await contar()
    await b.exec(readFileSync(MIGRATION_FROTA, 'utf8'))
    expect(await contar()).toEqual(antes)
  })
})

describe('resumo da frota (lista numa só consulta)', () => {
  it('traz km, condutor atual, alertas e último checklist por viatura', async () => {
    const r = await comoU(mecanico, tx => tx.query(`SELECT * FROM public.frota_resumo_viaturas()`))
    const c1 = r.rows.find(x => x.id === viatura)
    expect(c1).toMatchObject({ nome: 'Carrinha 1', condutor_id: colabB, condutor_nome: 'Ana' })
    expect(Number(c1.km_atual)).toBe(9800)
    expect(c1.ultimo_checklist_estado).toMatch(/OK|ATENCAO|MAU/)
    const ativos = await db.query(`SELECT a.severidade FROM public.alertas a
      JOIN public.regras_alerta r ON r.id = a.regra_id AND r.tipo = 'FROTA_ITEM'
      JOIN public.frota_veiculo_itens f ON f.id = a.entidade_id
      WHERE f.veiculo_id = $1 AND a.estado IN ('ATIVO', 'RECONHECIDO')`, [viatura])
    expect(c1.alertas_urgentes).toBe(ativos.rows.filter(a => a.severidade === 'URGENTE').length)
    expect(c1.alertas_atencao).toBe(ativos.rows.filter(a => a.severidade === 'ATENCAO').length)
  })

  it('viaturas arquivadas não aparecem', async () => {
    const v = (await db.query(`INSERT INTO public.comb_veiculos (nome, ativo) VALUES ('Abatida', false) RETURNING id`)).rows[0].id
    const r = await comoU(leitura, tx => tx.query(`SELECT id FROM public.frota_resumo_viaturas()`))
    expect(r.rows.some(x => x.id === v)).toBe(false)
  })

  it('anónimo não chega ao resumo', async () => {
    await expect(anon(tx => tx.query(`SELECT * FROM public.frota_resumo_viaturas()`))).rejects.toThrow(/permission denied/)
  })
})

describe('autorização do envio diário (segredo gerado no banco)', () => {
  const MIGRATION_AGENDA = fileURLToPath(new URL('../migrations/20260929040000_fase9_agendar_push_frota.sql', import.meta.url))
  const segredo = async () => (await db.query(`SELECT segredo FROM privado.frota_push`)).rows[0].segredo
  const autorizado = s => servico(tx => tx.query(`SELECT public.frota_push_autorizado($1) AS ok`, [s])).then(r => r.rows[0].ok)

  it('gera um segredo forte, uma só vez', async () => {
    const s = await segredo()
    expect(s).toMatch(/^[0-9a-f]{64}$/)
    await db.exec(readFileSync(MIGRATION_AGENDA, 'utf8'))
    expect(await segredo()).toBe(s)
    const n = await db.query(`SELECT count(*)::int AS n FROM privado.frota_push`)
    expect(n.rows[0].n).toBe(1)
  })

  it('papel de serviço: só o segredo certo passa', async () => {
    const s = await segredo()
    expect(await autorizado(s)).toBe(true)
    expect(await autorizado(s.slice(0, -1) + (s.endsWith('0') ? '1' : '0'))).toBe(false)
    expect(await autorizado('')).toBe(false)
    expect(await autorizado(null)).toBe(false)
  })

  it('ninguém da app lê o segredo nem chama a verificação', async () => {
    for (const papel of [{ papel: 'anon' }, { papel: 'authenticated', uid: admin }]) {
      await expect(como(db, papel, tx => tx.query(`SELECT segredo FROM privado.frota_push`))).rejects.toThrow(/permission denied/)
      await expect(como(db, papel, tx => tx.query(`SELECT public.frota_push_autorizado('x')`))).rejects.toThrow(/permission denied/)
    }
  })
})
