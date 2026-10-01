// @vitest-environment node
// Frota completa (20261002000000): estado, entrega/devolução, oficina, registo de
// viaturas, edição de manutenção, linha do tempo, histórico e fotos.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { criarBanco, como } from './pg-harness.mjs'

let db, admin, gestor, mecanico, armazem, leitura, motorista, v, colabA, colabB, obra, obraConcluida

async function utilizador(role, email) {
  const { rows } = await db.query(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [email])
  await db.query(`UPDATE public.profiles SET role = $1, nome = $2 WHERE id = $3`, [role, email.split('@')[0], rows[0].id])
  return rows[0].id
}
const u = (uid, fn) => como(db, { papel: 'authenticated', uid }, fn)
const anon = fn => como(db, { papel: 'anon' }, fn)
const q1 = async (uid, sql, p = []) => (await u(uid, tx => tx.query(sql, p))).rows[0]
const estado = async id => (await db.query(`SELECT estado_operacional AS e, obra_atual_id AS o FROM public.comb_veiculos WHERE id = $1`, [id])).rows[0]

const INV = JSON.stringify({ colete: true, triangulo: true, documentos: true, macaco: false })
const DANOS = JSON.stringify([{ vista: 'frente', x: 0.4, y: 0.3, nota: 'risco' }])

const entregar = (uid, id, o = {}) => q1(uid,
  `SELECT public.entregar_viatura($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14) AS id`,
  [id, o.colab ?? colabA, o.obra ?? null, o.data ?? new Date().toISOString().slice(0, 10), o.km ?? 1000, o.comb ?? 'METADE',
   o.adblue ?? 'OK', o.oleo ?? 'OK', o.refri ?? 'OK', o.pneus ?? 'OK', o.limpeza ?? 'OK', o.inv ?? INV, o.danos ?? '[]', o.obs ?? null]).then(r => r.id)

const devolver = (uid, id, o = {}) => q1(uid,
  `SELECT public.devolver_viatura($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13) AS id`,
  [id, o.data ?? new Date().toISOString().slice(0, 10), o.km ?? 1200, o.comb ?? 'QUARTO', 'OK', 'OK', 'OK', 'GASTOS', 'LIMPAR',
   o.inv ?? INV, o.danos ?? DANOS, o.obs ?? null, o.oficina ?? false]).then(r => r.id)

const guardar = (uid, o = {}) => q1(uid,
  `SELECT public.frota_guardar_viatura($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) AS id`,
  [o.id ?? null, o.marca ?? 'Ford', o.modelo ?? 'Transit', o.tipo ?? 'viatura', o.mat ?? `AA-${Math.floor(Math.random() * 1e6)}`,
   o.unidade ?? 'km', o.comb ?? 'gasoleo', o.km ?? 5000, o.dataRev ?? null, o.kmRev ?? null, o.seguro ?? null, o.seguroFoto ?? null,
   o.ipo ?? null, o.ipoFoto ?? null, o.obs ?? null]).then(r => r.id)

beforeAll(async () => {
  db = await criarBanco()
  admin     = await utilizador('admin', 'admin@t.pt')
  gestor    = await utilizador('gestor', 'gestor@t.pt')
  mecanico  = await utilizador('mecanico', 'carlos@t.pt')
  armazem   = await utilizador('armazem', 'arm@t.pt')
  leitura   = await utilizador('leitura', 'lei@t.pt')
  motorista = await utilizador('motorista', 'mot@t.pt')
  colabA = (await db.query(`INSERT INTO public.colaboradores (nome, numero_mecan, cargo) VALUES ('Rui', 'M1', 'Motorista') RETURNING id`)).rows[0].id
  colabB = (await db.query(`INSERT INTO public.colaboradores (nome, numero_mecan, cargo) VALUES ('Ana', 'M2', 'Motorista') RETURNING id`)).rows[0].id
  obra = (await db.query(`INSERT INTO public.obras (nome) VALUES ('Moradia') RETURNING id`)).rows[0].id
  obraConcluida = (await db.query(`INSERT INTO public.obras (nome, estado) VALUES ('Antiga', 'concluida') RETURNING id`)).rows[0].id
  await db.query(`INSERT INTO storage.buckets (id, name, public) VALUES ('frota-docs', 'frota-docs', true) ON CONFLICT DO NOTHING`)
}, 120_000)

beforeEach(async () => {
  v = (await db.query(`INSERT INTO public.comb_veiculos (nome, identificacao) VALUES ('Carrinha', $1) RETURNING id`, [`M-${randomUUID().slice(0, 6)}`])).rows[0].id
})

describe('entrega', () => {
  it('viatura livre → em uso, com condutor, obra e registo completo', async () => {
    const id = await entregar(mecanico, v, { obra, km: 1500, danos: DANOS, obs: 'ok' })
    expect(await estado(v)).toEqual({ e: 'EM_USO', o: obra })
    const e = (await db.query(`SELECT * FROM public.veiculo_entregas WHERE id = $1`, [id])).rows[0]
    expect(e).toMatchObject({ tipo: 'ENTREGA', colaborador_id: colabA, obra_id: obra, combustivel: 'METADE', adblue: 'OK', observacoes: 'ok', criado_por: mecanico })
    expect(Number(e.km)).toBe(1500)
    expect(e.danos).toHaveLength(1)
    expect(e.inventario).toMatchObject({ colete: true, macaco: false })
    const at = (await db.query(`SELECT colaborador_id FROM public.veiculo_atribuicoes WHERE veiculo_id = $1 AND ate IS NULL`, [v])).rows
    expect(at).toEqual([{ colaborador_id: colabA }])
  })

  it('a obra é opcional', async () => {
    await entregar(admin, v)
    expect((await estado(v)).o).toBeNull()
  })

  it('em uso não volta a ser entregue e diz quem a tem', async () => {
    await entregar(admin, v)
    await expect(entregar(admin, v, { colab: colabB })).rejects.toThrow(/já está em uso por Rui/)
  })

  it('na oficina não se entrega', async () => {
    await q1(mecanico, `SELECT public.definir_estado_viatura($1, 'OFICINA')`, [v])
    await expect(entregar(admin, v)).rejects.toThrow(/está na oficina/)
  })

  it.each([
    ['obra concluída', () => ({ obra: obraConcluida }), /não está em execução/],
    ['colaborador inexistente', () => ({ colab: randomUUID() }), /colaborador/],
    ['data futura', () => ({ data: '2999-01-01' }), /futura/],
    ['km negativos', () => ({ km: -1 }), /atuais/],
    ['combustível inventado', () => ({ comb: 'TANQUE' }), /ck_entrega_combustivel/],
    ['pneus inventado', () => ({ pneus: 'MAU' }), /ck_entrega_pneus/],
  ])('recusa %s', async (_n, o, erro) => {
    await expect(entregar(admin, v, o())).rejects.toThrow(erro)
    expect((await estado(v)).e).toBe('LIVRE')
  })

  it('colaborador arquivado não conduz', async () => {
    const arq = (await db.query(`INSERT INTO public.colaboradores (nome, numero_mecan, cargo, ativo) VALUES ('Saiu', ${"'M-' || gen_random_uuid()::text"}, 'Motorista', false) RETURNING id`)).rows[0].id
    await expect(entregar(admin, v, { colab: arq })).rejects.toThrow(/colaborador/)
    expect((await estado(v)).e).toBe('LIVRE')
  })

  it('a base de dados também impede duas devoluções da mesma entrega', async () => {
    const e = await entregar(admin, v); await devolver(admin, v)
    await expect(db.query(`INSERT INTO public.veiculo_entregas (veiculo_id, tipo, colaborador_id, km, combustivel, entrega_ref)
      VALUES ($1, 'DEVOLUCAO', $2, 1, 'CHEIO', $3)`, [v, colabA, e])).rejects.toThrow(/ux_entrega_uma_devolucao/)
  })

  it('os km não podem recuar face ao último registado', async () => {
    await db.query(`UPDATE public.comb_veiculos SET km_registo = 8000 WHERE id = $1`, [v])
    await expect(entregar(admin, v, { km: 7000 })).rejects.toThrow(/inferiores ao último registado \(8000\)/)
    await entregar(admin, v, { km: 8000 })
  })

  it('máquinas: pede horas', async () => {
    await db.query(`UPDATE public.comb_veiculos SET unidade_contador = 'horas' WHERE id = $1`, [v])
    await expect(entregar(admin, v, { km: -5 })).rejects.toThrow(/horas atuais/)
  })

  it('só frota escreve: gestor e mecânico sim; armazém, leitura, motorista e anónimo não', async () => {
    await entregar(gestor, v, { km: 1000 }); await devolver(gestor, v, { km: 1100 })
    await entregar(mecanico, v, { km: 1200 }); await devolver(mecanico, v, { km: 1300 })
    for (const uid of [armazem, leitura, motorista]) await expect(entregar(uid, v)).rejects.toThrow(/Sem permissão/)
    await expect(anon(tx => tx.query(`SELECT public.entregar_viatura($1, $2, NULL, CURRENT_DATE, 1, 'CHEIO', 'NA', 'NA', 'NA', 'NA', 'NA', '{}', '[]')`, [v, colabA])))
      .rejects.toThrow(/permission denied/)
  })

  it('duas entregas em simultâneo da mesma viatura: só uma passa', async () => {
    const r = await Promise.allSettled([entregar(admin, v, { colab: colabA }), entregar(admin, v, { colab: colabB })])
    expect(r.filter(x => x.status === 'fulfilled')).toHaveLength(1)
    expect((await db.query(`SELECT count(*)::int AS n FROM public.veiculo_atribuicoes WHERE veiculo_id = $1 AND ate IS NULL`, [v])).rows[0].n).toBe(1)
  })
})

describe('devolução', () => {
  it('em uso → livre; fecha a atribuição; liga à entrega; limpa a obra', async () => {
    const e = await entregar(admin, v, { obra, km: 1000 })
    const d = await devolver(admin, v, { km: 1300 })
    expect(await estado(v)).toEqual({ e: 'LIVRE', o: null })
    const r = (await db.query(`SELECT * FROM public.veiculo_entregas WHERE id = $1`, [d])).rows[0]
    expect(r).toMatchObject({ tipo: 'DEVOLUCAO', entrega_ref: e, colaborador_id: colabA, obra_id: obra, combustivel: 'QUARTO', para_oficina: false })
    expect(r.danos).toHaveLength(1)
    expect((await db.query(`SELECT count(*)::int AS n FROM public.veiculo_atribuicoes WHERE veiculo_id = $1 AND ate IS NULL`, [v])).rows[0].n).toBe(0)
  })

  it('pode seguir direto para a oficina', async () => {
    await entregar(admin, v)
    await devolver(admin, v, { oficina: true })
    expect((await estado(v)).e).toBe('OFICINA')
  })

  it('livre ou na oficina não se devolve; km abaixo da entrega recusados', async () => {
    await expect(devolver(admin, v)).rejects.toThrow(/não está entregue/)
    await entregar(admin, v, { km: 1000 })
    await expect(devolver(admin, v, { km: 900 })).rejects.toThrow(/inferiores/)
    await expect(devolver(admin, v, { data: '2999-01-01' })).rejects.toThrow(/futura/)
  })

  it('não devolve antes da data da entrega', async () => {
    await entregar(admin, v, { data: new Date().toISOString().slice(0, 10) })
    await db.query(`UPDATE public.veiculo_atribuicoes SET desde = CURRENT_DATE WHERE veiculo_id = $1 AND ate IS NULL`, [v])
    await expect(devolver(admin, v, { data: '2000-01-01' })).rejects.toThrow(/anterior à entrega/)
  })

  it('só uma devolução por entrega', async () => {
    await entregar(admin, v); await devolver(admin, v)
    await expect(devolver(admin, v)).rejects.toThrow(/não está entregue/)
  })

  it('entrega antiga sem registo digital: a devolução cria o registo da entrega', async () => {
    await db.query(`INSERT INTO public.veiculo_atribuicoes (veiculo_id, colaborador_id, desde) VALUES ($1, $2, CURRENT_DATE - 5)`, [v, colabB])
    expect((await estado(v)).e).toBe('EM_USO')
    await devolver(admin, v, { km: 500 })
    const r = (await db.query(`SELECT tipo, observacoes FROM public.veiculo_entregas WHERE veiculo_id = $1 ORDER BY criado_em, tipo DESC`, [v])).rows
    expect(r.map(x => x.tipo)).toEqual(['ENTREGA', 'DEVOLUCAO'])
    expect(r[0].observacoes).toMatch(/anterior ao registo/)
  })
})

describe('estado e oficina', () => {
  it('livre ↔ oficina; em uso não vai para a oficina; não se pode forçar "em uso"', async () => {
    await q1(admin, `SELECT public.definir_estado_viatura($1, 'OFICINA')`, [v])
    expect((await estado(v)).e).toBe('OFICINA')
    await q1(admin, `SELECT public.definir_estado_viatura($1, 'LIVRE')`, [v])
    await expect(q1(admin, `SELECT public.definir_estado_viatura($1, 'EM_USO')`, [v])).rejects.toThrow(/Estado inválido/)
    await entregar(admin, v)
    await expect(q1(admin, `SELECT public.definir_estado_viatura($1, 'OFICINA')`, [v])).rejects.toThrow(/em uso/)
  })

  it('só frota altera', async () => {
    for (const uid of [armazem, leitura]) await expect(q1(uid, `SELECT public.definir_estado_viatura($1, 'OFICINA')`, [v])).rejects.toThrow(/Sem permissão/)
  })

  it('atribuição pela via antiga sincroniza o estado (e a devolução também)', async () => {
    await q1(admin, `SELECT public.atribuir_condutor($1, $2, CURRENT_DATE)`, [v, colabA])
    expect((await estado(v)).e).toBe('EM_USO')
    await q1(admin, `SELECT public.atribuir_condutor($1, NULL, CURRENT_DATE)`, [v])
    expect((await estado(v)).e).toBe('LIVRE')
  })

  it('a oficina não é mexida pela atribuição', async () => {
    await q1(admin, `SELECT public.definir_estado_viatura($1, 'OFICINA')`, [v])
    await q1(admin, `SELECT public.atribuir_condutor($1, $2, CURRENT_DATE)`, [v, colabA])
    expect((await estado(v)).e).toBe('OFICINA')
  })
})

describe('registar e atualizar viatura', () => {
  it('regista com marca/modelo, estado à chegada, revisão, seguro e IPO', async () => {
    const id = await guardar(mecanico, { km: 12000, dataRev: '2026-01-10', kmRev: 10000, seguro: '2027-03-01', ipo: '2027-05-01', obs: 'chegou usada' })
    const r = (await db.query(`SELECT * FROM public.comb_veiculos WHERE id = $1`, [id])).rows[0]
    expect(r).toMatchObject({ nome: 'Ford Transit', marca: 'Ford', modelo: 'Transit', estado_operacional: 'LIVRE', observacoes: 'chegou usada' })
    expect(Number(r.km_registo)).toBe(12000)
    expect(Number(r.km_ultima_revisao)).toBe(10000)
    expect(String(r.data_fim_seguro)).toMatch(/2027/)
  })

  it('matrícula repetida recusada (ignora maiúsculas); atualizar a própria é permitido', async () => {
    const id = await guardar(admin, { mat: '50-AA-50' })
    await expect(guardar(admin, { mat: ' 50-aa-50 ' })).rejects.toThrow(/Já existe uma viatura/)
    await guardar(admin, { id, mat: '50-AA-50', obs: 'atualizada' })
    expect((await db.query(`SELECT observacoes FROM public.comb_veiculos WHERE id = $1`, [id])).rows[0].observacoes).toBe('atualizada')
  })

  it('atualizar não mexe no estado nem no km de registo', async () => {
    const id = await guardar(admin, { km: 100 })
    await entregar(admin, id, { km: 200 })
    await guardar(admin, { id, km: 999999, mat: 'ZZ-1' })
    expect(await estado(id)).toMatchObject({ e: 'EM_USO' })
    expect(Number((await db.query(`SELECT km_registo FROM public.comb_veiculos WHERE id = $1`, [id])).rows[0].km_registo)).toBe(100)
  })

  it.each([
    ['sem marca nem modelo', { marca: ' ', modelo: '' }, /marca e o modelo/],
    ['unidade inventada', { unidade: 'milhas' }, /km ou horas/],
    ['km negativos', { km: -1 }, /atuais/],
    ['revisão futura', { dataRev: '2999-01-01' }, /futura/],
    ['revisão acima da leitura atual', { km: 100, kmRev: 500 }, /superior à atual/],
  ])('recusa %s', async (_n, o, erro) => { await expect(guardar(admin, o)).rejects.toThrow(erro) })

  it('máquina em horas', async () => {
    const id = await guardar(admin, { tipo: 'maquina', unidade: 'horas', km: 350 })
    expect((await db.query(`SELECT unidade_contador FROM public.comb_veiculos WHERE id = $1`, [id])).rows[0].unidade_contador).toBe('horas')
  })

  it('admin, gestor, armazém e mecânico registam; leitura, motorista e anónimo não', async () => {
    for (const uid of [admin, gestor, armazem, mecanico]) await guardar(uid)
    for (const uid of [leitura, motorista]) await expect(guardar(uid)).rejects.toThrow(/Sem permissão/)
    await expect(anon(tx => tx.query(`SELECT public.frota_guardar_viatura(NULL, 'a', 'b', 'viatura', 'x', 'km', 'gasoleo', 1, NULL, NULL, NULL, NULL, NULL, NULL)`)))
      .rejects.toThrow(/permission denied/)
  })

  it('arquivar: não com a viatura em uso; restaurar', async () => {
    await entregar(admin, v)
    await expect(q1(admin, `SELECT public.frota_arquivar_viatura($1, true)`, [v])).rejects.toThrow(/em uso/)
    await devolver(admin, v)
    await q1(admin, `SELECT public.frota_arquivar_viatura($1, true)`, [v])
    expect((await db.query(`SELECT ativo FROM public.comb_veiculos WHERE id = $1`, [v])).rows[0].ativo).toBe(false)
    await q1(admin, `SELECT public.frota_arquivar_viatura($1, false)`, [v])
    expect((await db.query(`SELECT ativo FROM public.comb_veiculos WHERE id = $1`, [v])).rows[0].ativo).toBe(true)
  })
})

describe('manutenção: última revisão e edição', () => {
  const item = async chave => (await db.query(`SELECT id FROM public.frota_itens_catalogo WHERE chave = $1`, [chave])).rows[0].id
  const manut = (uid, id, itemId, o = {}) => q1(uid, `SELECT public.registar_manutencao($1, $2, $3, $4, $5, $6, $7, $8, true, NULL) AS id`,
    [id, itemId, o.desc ?? null, o.data ?? '2026-02-01', o.km ?? 20000, o.custo ?? 100, o.oficina ?? 'Oficina X', o.obs ?? null]).then(r => r.id)
  const editar = (uid, id, itemId, o = {}) => q1(uid, `SELECT public.editar_manutencao($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, itemId, o.desc ?? null, o.data ?? '2026-02-01', o.km ?? 20000, o.custo ?? 100, o.oficina ?? 'Oficina X', o.obs ?? null])

  it('uma revisão periódica atualiza a última revisão da viatura; um trabalho avulso não', async () => {
    await manut(mecanico, v, await item('revisao_geral'), { data: '2026-03-01', km: 30000 })
    let r = (await db.query(`SELECT data_ultima_revisao::text AS d, km_ultima_revisao AS k FROM public.comb_veiculos WHERE id = $1`, [v])).rows[0]
    expect(r).toEqual({ d: '2026-03-01', k: '30000' })
    await manut(mecanico, v, null, { desc: 'Lâmpada', data: '2026-04-01', km: 31000 })
    r = (await db.query(`SELECT data_ultima_revisao::text AS d FROM public.comb_veiculos WHERE id = $1`, [v])).rows[0]
    expect(r.d).toBe('2026-03-01')
  })

  it('editar corrige os dados, regista antes/depois e quem editou, e recalcula o prazo do item', async () => {
    const it = await item('revisao_geral')
    const m = await manut(mecanico, v, it, { data: '2026-02-01', km: 20000 })
    await editar(mecanico, m, it, { data: '2026-02-01', km: 25000, custo: 150, obs: 'km corrigido' })
    const r = (await db.query(`SELECT km_na_altura, custo, observacoes, editado_por FROM public.veiculo_manutencoes WHERE id = $1`, [m])).rows[0]
    expect({ km: Number(r.km_na_altura), c: Number(r.custo), o: r.observacoes, p: r.editado_por }).toEqual({ km: 25000, c: 150, o: 'km corrigido', p: mecanico })
    const e = (await db.query(`SELECT antes, depois FROM public.veiculo_manutencao_edicoes WHERE manutencao_id = $1`, [m])).rows
    expect(e).toHaveLength(1)
    expect(Number(e[0].antes.km_na_altura)).toBe(20000); expect(Number(e[0].depois.km_na_altura)).toBe(25000)
    const f = (await db.query(`SELECT ultima_km, proxima_km FROM public.frota_veiculo_itens WHERE veiculo_id = $1 AND item_id = $2`, [v, it])).rows[0]
    expect(Number(f.ultima_km)).toBe(25000)
    expect(Number(f.proxima_km)).toBe(40000)   // + intervalo padrão de 15 000
  })

  it('validações: data futura, sem tipo nem descrição, valores negativos, inexistente', async () => {
    const it = await item('revisao_geral')
    const m = await manut(mecanico, v, it)
    await expect(editar(mecanico, m, it, { data: '2999-01-01' })).rejects.toThrow(/futura/)
    await expect(editar(mecanico, m, null, { desc: '  ' })).rejects.toThrow(/tipo de manutenção/)
    await expect(editar(mecanico, m, it, { km: -1 })).rejects.toThrow(/inválido/)
    await expect(editar(mecanico, m, it, { custo: -1 })).rejects.toThrow(/inválido/)
    await expect(editar(mecanico, randomUUID(), it)).rejects.toThrow(/não encontrada/)
  })

  it('só frota edita; ficheiro de edições não é escrevível diretamente', async () => {
    const it = await item('revisao_geral')
    const m = await manut(mecanico, v, it)
    for (const uid of [armazem, leitura, motorista]) await expect(editar(uid, m, it)).rejects.toThrow(/Sem permissão/)
    await expect(u(mecanico, tx => tx.query(`INSERT INTO public.veiculo_manutencao_edicoes (manutencao_id, antes, depois) VALUES ($1, '{}', '{}')`, [m]))).rejects.toThrow(/permission denied/)
    await expect(u(mecanico, tx => tx.query(`UPDATE public.veiculo_manutencoes SET custo = 1 WHERE id = $1`, [m]))).rejects.toThrow(/permission denied|0 rows|row-level/)
  })
})

describe('linha do tempo, histórico e entregas', () => {
  it('a linha do tempo junta registo, entrega, devolução, manutenção e abastecimento, com quem fez', async () => {
    const id = await guardar(gestor, { km: 100 })
    await entregar(mecanico, id, { km: 150, danos: DANOS })
    await devolver(mecanico, id, { km: 200 })
    const it = (await db.query(`SELECT id FROM public.frota_itens_catalogo WHERE chave = 'revisao_geral'`)).rows[0].id
    await q1(mecanico, `SELECT public.registar_manutencao($1, $2, NULL, CURRENT_DATE, 210, 90, 'Oficina', NULL, true, NULL)`, [id, it])
    await db.query(`INSERT INTO public.comb_abastecimentos (veiculo_id, litros, custo_total, contador, responsavel) VALUES ($1, 40, 60, 220, 'Rui')`, [id])
    const t = (await u(admin, tx => tx.query(`SELECT * FROM public.frota_linha_tempo($1)`, [id]))).rows
    expect(t.map(x => x.tipo).sort()).toEqual(['ABASTECIMENTO', 'DEVOLUCAO', 'ENTREGA', 'MANUTENCAO', 'REGISTO'])
    expect(t.find(x => x.tipo === 'ENTREGA')).toMatchObject({ titulo: 'Entregue a Rui', utilizador: 'carlos' })
    expect(t.find(x => x.tipo === 'DEVOLUCAO').detalhe).toMatch(/1 dano/)
  })

  it('histórico de manutenções: filtros por viatura e período, com registado por e editado por', async () => {
    const it = (await db.query(`SELECT id FROM public.frota_itens_catalogo WHERE chave = 'revisao_geral'`)).rows[0].id
    const outra = (await db.query(`INSERT INTO public.comb_veiculos (nome) VALUES ('Outra') RETURNING id`)).rows[0].id
    const a = (await q1(mecanico, `SELECT public.registar_manutencao($1, $2, NULL, '2026-02-01', 100, 50, 'X', NULL, true, NULL) AS id`, [v, it])).id
    await q1(gestor, `SELECT public.registar_manutencao($1, NULL, 'Pneu', '2026-05-01', 200, 20, 'Y', NULL, true, NULL)`, [outra])
    await q1(gestor, `SELECT public.editar_manutencao($1, $2, NULL, '2026-02-01', 120, 55, 'X', 'corrigido')`, [a, it])
    const todas = (await u(leitura, tx => tx.query(`SELECT * FROM public.frota_historico_manutencoes()`))).rows
    expect(todas.length).toBeGreaterThanOrEqual(2)
    const so = (await u(leitura, tx => tx.query(`SELECT * FROM public.frota_historico_manutencoes($1, '2026-01-01', '2026-03-31')`, [v]))).rows
    expect(so).toHaveLength(1)
    expect(so[0]).toMatchObject({ registado_por: 'carlos', editado_por: 'gestor', item_rotulo: 'Revisão geral (oficina)', veiculo_id: v })
    expect((await u(leitura, tx => tx.query(`SELECT * FROM public.frota_historico_manutencoes($1, '2026-04-01', NULL)`, [v]))).rows).toHaveLength(0)
  })

  it('lista de entregas com nomes; motorista não vê nada', async () => {
    await entregar(admin, v, { obra })
    const l = (await u(leitura, tx => tx.query(`SELECT * FROM public.frota_listar_entregas($1)`, [v]))).rows
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ colaborador_nome: 'Rui', obra_nome: 'Moradia', tipo: 'ENTREGA' })
    expect((await u(motorista, tx => tx.query(`SELECT * FROM public.frota_listar_entregas($1)`, [v]))).rows).toHaveLength(0)
    expect((await u(motorista, tx => tx.query(`SELECT * FROM public.frota_linha_tempo($1)`, [v]))).rows).toHaveLength(0)
    expect((await u(motorista, tx => tx.query(`SELECT * FROM public.veiculo_entregas`))).rows).toHaveLength(0)
  })

  it('lista da frota: estado, condutor, obra, seguro e IPO', async () => {
    const id = await guardar(admin, { mat: 'LISTA-1', seguro: '2027-01-01', ipo: '2027-02-01' })
    await entregar(admin, id, { obra, km: 6000 })
    const r = (await u(leitura, tx => tx.query(`SELECT * FROM public.frota_resumo_viaturas() WHERE id = $1`, [id]))).rows[0]
    expect(r).toMatchObject({ estado_operacional: 'EM_USO', condutor_nome: 'Rui', obra_nome: 'Moradia', marca: 'Ford', identificacao: 'LISTA-1' })
    expect(String(r.data_fim_seguro)).toMatch(/2027/)
  })

  it('anónimo não vê a lista nem a linha do tempo', async () => {
    await expect(anon(tx => tx.query(`SELECT * FROM public.frota_resumo_viaturas()`))).rejects.toThrow(/permission denied/)
    await expect(anon(tx => tx.query(`SELECT * FROM public.frota_linha_tempo($1)`, [v]))).rejects.toThrow(/permission denied/)
  })
})

describe('fotos do seguro e da IPO', () => {
  const enviar = (uid, nome, bucket = 'frota-docs') => u(uid, tx => tx.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ($1, $2)`, [bucket, nome]))
  it('quem regista envia (a viatura pode ainda não existir); caminhos livres e outros papéis não', async () => {
    await enviar(mecanico, `viaturas/${randomUUID()}/seguro_1727.jpg`)
    await enviar(armazem, `viaturas/${randomUUID()}/ipo_1727.webp`)
    for (const n of ['x.jpg', `viaturas/${randomUUID()}/outro_1.jpg`, `viaturas/${randomUUID()}/seguro_1.html`, `viaturas/../${randomUUID()}/seguro_1.jpg`])
      await expect(enviar(mecanico, n)).rejects.toThrow(/row-level security/)
    for (const uid of [leitura, motorista]) await expect(enviar(uid, `viaturas/${randomUUID()}/seguro_1.jpg`)).rejects.toThrow(/row-level security/)
    await expect(anon(tx => tx.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('frota-docs', $1)`, [`viaturas/${randomUUID()}/seguro_1.jpg`])))
      .rejects.toThrow(/row-level security|permission denied/)
  })
})
