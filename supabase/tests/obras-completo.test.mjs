// @vitest-environment node
// Módulo Obras completo (20261003000000) num Postgres real com todas as migrations:
// permissões por papel, validações, relatórios imutáveis, progresso, saúde, equipa/picagens,
// cruzamentos, subempreitadas, fotos, eventos e armazenamento.
import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { criarBanco, como } from './pg-harness.mjs'

let db, admin, gestor, medicoes, armazem, leitura, mecanico, motorista, autor, colabA, colabB, colabInativo, produto, seq = 0

async function utilizador(role, email) {
  const { rows } = await db.query(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [email])
  await db.query(`UPDATE public.profiles SET role = $1, nome = $2 WHERE id = $3`, [role, email.split('@')[0], rows[0].id])
  return rows[0].id
}
const u = (uid, fn) => como(db, { papel: 'authenticated', uid }, fn)
const anon = fn => como(db, { papel: 'anon' }, fn)
const q = async (uid, sql, p = []) => (await u(uid, tx => tx.query(sql, p))).rows
const q1 = async (uid, sql, p = []) => (await q(uid, sql, p))[0]
const sup = async (sql, p = []) => (await db.query(sql, p)).rows

// Chamada com argumentos nomeados: rpc(uid, 'fn', { p_x: 1 }) → linhas
async function rpc(uid, nome, args = {}) {
  if (Array.isArray(args.p_fotos)) {
    for (const foto of args.p_fotos) {
      if (typeof foto?.path !== 'string') continue
      await db.query(`INSERT INTO storage.objects (bucket_id, name) SELECT 'obras', $1
        WHERE NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'obras' AND name = $1)`, [foto.path])
    }
  }
  const ks = Object.keys(args)
  const sql = `SELECT * FROM public.${nome}(${ks.map((k, i) => `${k} => $${i + 1}`).join(', ')})`
  return q(uid, sql, ks.map(k => args[k]))
}
const rpc1 = async (uid, nome, args) => { const r = (await rpc(uid, nome, args))[0]; return r ? Object.values(r)[0] : undefined }

const dia = async (n = 0) => (await sup(`SELECT to_char(public._hoje_pt() + $1::int, 'YYYY-MM-DD') AS d`, [n]))[0].d
const foto = (obra, pasta = 'relatorios', legenda = null) => ({ path: `${obra}/${pasta}/${Date.now()}${++seq}-${randomUUID().slice(0, 8)}.jpg`, legenda })

const obraDireta = async (o = {}) => (await sup(
  `INSERT INTO public.obras (nome, estado, data_inicio, data_prevista_fim, orcamento) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
  [o.nome ?? `Obra ${++seq}`, o.estado ?? 'ativa', o.inicio ?? null, o.fim ?? null, o.orcamento ?? null]))[0].id

const visao = async (obra, uid = admin) => q1(uid, `SELECT * FROM public.obra_visao($1)`, [obra])
const visaoT = async (obra) => q1(admin, `SELECT *, ultimo_relatorio::text AS ult FROM public.obra_visao($1)`, [obra])

const eventos = async (obra, uid = admin) => rpc(uid, 'obra_eventos_lista', { p_obra_id: obra, p_limite: 200 })

async function relatorioSubmetido(obra, data, o = {}) {
  const id = await rpc1(o.uid ?? gestor, 'obra_guardar_relatorio', {
    p_obra_id: obra, p_data: data, p_clima: 'SOL', p_equipa_outros: 'Equipa própria', p_trabalhos: 'Cofragem',
    p_houve_ocorrencias: o.ocorrencias ?? false, p_ocorrencias: o.ocorrenciasTexto ?? null, p_fotos: o.fotos ?? [],
  })
  await rpc(o.uid ?? gestor, 'obra_submeter_relatorio', { p_id: id })
  return id
}

const subDireto = async (obra, o = {}) => (await sup(
  `INSERT INTO public.subempreiteiros (obra_id, nome, tipo, valor_global, percentagem_retencao, estado, data_inicio, data_fim_prevista)
   VALUES ($1, $2, 'global', $3, $4, $5, $6, $7) RETURNING id`,
  [obra, o.nome ?? `Sub ${++seq}`, o.valor ?? 1000, o.ret ?? 0, o.estado ?? 'validado', o.inicio ?? null, o.fim ?? null]))[0].id

const autoDireto = async (sub, valor, o = {}) => (await sup(
  `INSERT INTO public.autos_medicao (subempreiteiro_id, numero, valor_periodo, estado, workflow, estado_pagamento, atraso_dias, data_medicao)
   VALUES ($1, $2, $3, $4::estado_auto, $4::text, $5, $6, COALESCE($7::date, CURRENT_DATE)) RETURNING id`,
  [sub, ++seq, valor, o.estado ?? 'validado', o.pago ? 'pago' : 'por_pagar', o.atraso ?? 0, o.data ?? null]))[0].id

const ocorrencia = (uid, sub, o = {}) => rpc1(uid, 'sub_registar_ocorrencia', {
  p_subempreiteiro_id: sub, p_tipo: o.tipo ?? 'PROBLEMA', p_gravidade: o.grav ?? 'media', p_descricao: o.desc ?? 'Fissura na laje',
  p_dias_atraso: o.dias ?? 0, p_fotos: o.fotos ?? [], ...(o.data ? { p_data: o.data } : {}),
})

const rm = (uid, nome, args) => expect(rpc(uid, nome, args))

beforeAll(async () => {
  db = await criarBanco()
  await db.query("UPDATE public.subs_config SET docs_obrigatorios = '{}'")
  admin     = await utilizador('admin', 'admin@t.pt')
  gestor    = await utilizador('gestor', 'gestor@t.pt')
  medicoes  = await utilizador('medicoes', 'eduarda@t.pt')
  armazem   = await utilizador('armazem', 'arm@t.pt')
  leitura   = await utilizador('leitura', 'lei@t.pt')
  mecanico  = await utilizador('mecanico', 'carlos@t.pt')
  motorista = await utilizador('motorista', 'mot@t.pt')
  autor     = await utilizador('leitura', 'autor@t.pt')
  const c = async (nome, ativo = true) => (await sup(
    `INSERT INTO public.colaboradores (nome, numero_mecan, cargo, ativo) VALUES ($1, $2, 'Pedreiro', $3) RETURNING id`, [nome, `M-${randomUUID()}`, ativo]))[0].id
  colabA = await c('Rui'); colabB = await c('Ana'); colabInativo = await c('Saiu', false)
  produto = (await sup(`INSERT INTO public.produtos (codigo, nome, categoria, unidade, stock_atual, custo_unitario)
    VALUES ('P-OBRAS', 'Cimento', 'cimento', 'saco', 1000, 5) RETURNING id`))[0].id
}, 120_000)

// ───────────────────────────────────────────────────────────────────────────
describe('leitura direta de obras', () => {
  it('isola mecânico e motorista e permite autor designado', async () => {
    const id = await obraDireta({ nome: 'Obra com autor' })
    const subId = await subDireto(id)
    const autoId = await autoDireto(subId, 100)
    expect((await q(mecanico, 'SELECT id FROM public.obras WHERE id = $1', [id]))).toHaveLength(0)
    expect((await q(motorista, 'SELECT id FROM public.obras WHERE id = $1', [id]))).toHaveLength(0)
    expect((await q(mecanico, 'SELECT id FROM public.subempreiteiros WHERE id = $1', [subId]))).toHaveLength(0)
    expect((await q(motorista, 'SELECT id FROM public.autos_medicao WHERE id = $1', [autoId]))).toHaveLength(0)
    await rpc(admin, 'obra_definir_autores', { p_obra_id: id, p_user_ids: [autor] })
    expect((await q(autor, 'SELECT id FROM public.obras WHERE id = $1', [id]))).toHaveLength(1)
    expect((await q(autor, 'SELECT id FROM public.subempreiteiros WHERE id = $1', [subId]))).toHaveLength(1)
  })
})

describe('colunas novas só podem ser escritas pelas RPCs', () => {
  it.each([
    ['obras', 'data_inicio', 'nome'],
    ['subempreiteiros', 'contrato_path', 'nome'],
    ['autos_medicao', 'fotos', 'observacoes'],
  ])('protege %s.%s sem bloquear as colunas antigas', async (tabela, nova, antiga) => {
    const r = await q1(gestor, `SELECT
      has_column_privilege('authenticated', $1, $2, 'INSERT') AS inserir_nova,
      has_column_privilege('authenticated', $1, $2, 'UPDATE') AS atualizar_nova,
      has_column_privilege('authenticated', $1, $3, 'INSERT') AS inserir_antiga,
      has_column_privilege('authenticated', $1, $3, 'UPDATE') AS atualizar_antiga`,
    [`public.${tabela}`, nova, antiga])
    expect(r).toEqual({ inserir_nova: false, atualizar_nova: false, inserir_antiga: true, atualizar_antiga: true })
  })
})

describe('obra_guardar: permissões', () => {
  const args = { p_nome: 'Moradia Cascais', p_cliente: 'Sr. Silva', p_morada: 'Rua A, Cascais', p_latitude: 38.69, p_longitude: -9.42,
    p_estado: 'planeada', p_data_inicio: '2026-11-01', p_data_prevista_fim: '2027-05-01', p_orcamento: 250000, p_tipo_obra: 'Moradia', p_descricao: 'T4' }

  it('admin e gestor criam a obra com todos os campos e fica registado na atividade', async () => {
    const id = await rpc1(gestor, 'obra_guardar', { ...args, p_responsavel_id: colabA, p_engenheiro_id: colabB })
    const o = (await sup(`SELECT *, data_inicio::text AS di FROM public.obras WHERE id = $1`, [id]))[0]
    expect(o).toMatchObject({ nome: 'Moradia Cascais', cliente: 'Sr. Silva', estado: 'planeada', morada: 'Rua A, Cascais', tipo_obra: 'Moradia',
      descricao: 'T4', responsavel_id: colabA, engenheiro_id: colabB, di: '2026-11-01' })
    expect(Number(o.latitude)).toBeCloseTo(38.69, 5); expect(Number(o.orcamento)).toBe(250000)
    expect((await eventos(id)).map(e => e.tipo)).toEqual(['OBRA_CRIADA'])
    expect(await rpc1(admin, 'obra_guardar', { p_nome: 'Outra' })).toMatch(/^[0-9a-f-]{36}$/)
  })

  it.each([
    ['medicoes', () => medicoes], ['armazem', () => armazem], ['leitura', () => leitura],
    ['mecanico', () => mecanico], ['motorista', () => motorista], ['autor designado', () => autor],
  ])('%s não cria nem edita obras', async (_n, uid) => {
    await rm(uid(), 'obra_guardar', args).rejects.toThrow(/Sem permissão/)
    const id = await obraDireta()
    await rm(uid(), 'obra_guardar', { ...args, p_id: id }).rejects.toThrow(/Sem permissão/)
  })

  it('anónimo não executa', async () => {
    await expect(anon(tx => tx.query(`SELECT public.obra_guardar(p_nome => 'x')`))).rejects.toThrow(/permission denied/)
  })
})

describe('obra_guardar: validações e estados', () => {
  it.each([
    ['nome em branco', { p_nome: '  ' }, /nome da obra/],
    ['estado inventado', { p_nome: 'X', p_estado: 'pausada' }, /Estado inválido/],
    ['fim antes do início', { p_nome: 'X', p_data_inicio: '2026-05-02', p_data_prevista_fim: '2026-05-01' }, /anterior à data de início/],
    ['só latitude', { p_nome: 'X', p_latitude: 38.7 }, /latitude e a longitude/],
    ['latitude fora de limites', { p_nome: 'X', p_latitude: 91, p_longitude: 0 }, /Latitude inválida/],
    ['longitude fora de limites', { p_nome: 'X', p_latitude: 0, p_longitude: -181 }, /Longitude inválida/],
    ['orçamento negativo', { p_nome: 'X', p_orcamento: -1 }, /Orçamento inválido/],
    ['responsável arquivado', () => ({ p_nome: 'X', p_responsavel_id: colabInativo }), /Responsável inválido/],
    ['engenheiro inexistente', () => ({ p_nome: 'X', p_engenheiro_id: randomUUID() }), /Engenheiro inválido/],
  ])('recusa %s', async (_n, a, erro) => {
    await rm(gestor, 'obra_guardar', typeof a === 'function' ? a() : a).rejects.toThrow(erro)
  })

  it('obra inexistente ao editar', async () => {
    await rm(gestor, 'obra_guardar', { p_id: randomUUID(), p_nome: 'X' }).rejects.toThrow(/Obra não encontrada/)
  })

  it('sem estado fica ativa; planeada e suspensa são aceites', async () => {
    const a = await rpc1(gestor, 'obra_guardar', { p_nome: 'A' })
    expect((await visao(a)).estado).toBe('ativa')
    for (const e of ['planeada', 'suspensa']) {
      const id = await rpc1(gestor, 'obra_guardar', { p_nome: e, p_estado: e })
      expect((await visao(id)).estado).toBe(e)
    }
  })

  it('concluir fixa a data real de fim, mantém-na ao editar e reabrir limpa-a', async () => {
    const id = await rpc1(gestor, 'obra_guardar', { p_nome: 'Fecho' })
    await rpc(gestor, 'obra_guardar', { p_id: id, p_nome: 'Fecho', p_estado: 'concluida' })
    const fim = async () => (await sup(`SELECT data_fim_real::text AS f FROM public.obras WHERE id = $1`, [id]))[0].f
    expect(await fim()).toBe(await dia(0))
    await sup(`UPDATE public.obras SET data_fim_real = '2026-01-15' WHERE id = $1`, [id])
    await rpc(gestor, 'obra_guardar', { p_id: id, p_nome: 'Fecho 2', p_estado: 'concluida' })
    expect(await fim()).toBe('2026-01-15')
    await rpc(gestor, 'obra_guardar', { p_id: id, p_nome: 'Fecho 2', p_estado: 'ativa' })
    expect(await fim()).toBeNull()
  })

  it('editar regista estado e dados na atividade; sem alterações não regista nada', async () => {
    const id = await rpc1(gestor, 'obra_guardar', { p_nome: 'Ev', p_cliente: 'A' })
    await rpc(gestor, 'obra_guardar', { p_id: id, p_nome: 'Ev', p_cliente: 'A' })
    expect((await eventos(id)).map(e => e.tipo)).toEqual(['OBRA_CRIADA'])
    await rpc(gestor, 'obra_guardar', { p_id: id, p_nome: 'Ev', p_cliente: 'B', p_estado: 'suspensa' })
    const e = await eventos(id)
    expect(e.map(x => x.tipo).sort()).toEqual(['OBRA_CRIADA', 'OBRA_EDITADA', 'OBRA_ESTADO'])
    expect(e.find(x => x.tipo === 'OBRA_ESTADO').detalhe).toBe('ativa → suspensa')
  })

  it('a base de dados também recusa estado e coordenadas inválidos; obras antigas continuam válidas', async () => {
    await expect(sup(`INSERT INTO public.obras (nome, estado) VALUES ('x', 'pausada')`)).rejects.toThrow(/ck_obra_estado/)
    const id = await obraDireta({ estado: 'concluida' })
    await expect(sup(`UPDATE public.obras SET latitude = 10 WHERE id = $1`, [id])).rejects.toThrow(/ck_obra_coordenadas/)
    await expect(sup(`UPDATE public.obras SET data_inicio = '2026-02-01', data_prevista_fim = '2026-01-01' WHERE id = $1`, [id])).rejects.toThrow(/ck_obra_datas/)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('equipa', () => {
  let obra
  const alocar = (uid, o = {}) => rpc1(uid, 'obra_alocar_colaborador', { p_obra_id: o.obra ?? obra, p_colaborador_id: o.colab ?? colabA, p_funcao: o.funcao ?? 'Encarregado', ...(o.desde ? { p_desde: o.desde } : {}) })
  const lista = (o = obra) => rpc(admin, 'obra_equipa_lista', { p_obra_id: o })

  beforeAll(async () => { obra = await obraDireta() })

  it('gestor aloca; função e data ficam guardadas; vai para a atividade', async () => {
    const o = await obraDireta()
    const id = await alocar(gestor, { obra: o, desde: '2026-09-01' })
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    const l = await lista(o)
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ alocacao_id: id, colaborador_id: colabA, nome: 'Rui', funcao: 'Encarregado', ativo: true, presente_hoje: false, ultima_picagem: null })
    expect((await eventos(o)).map(e => e.tipo)).toEqual(['EQUIPA_ALOCADA'])
  })

  it.each([['medicoes', () => medicoes], ['armazem', () => armazem], ['leitura', () => leitura], ['mecanico', () => mecanico]])
  ('%s não gere a equipa', async (_n, uid) => {
    await rm(uid(), 'obra_alocar_colaborador', { p_obra_id: obra, p_colaborador_id: colabB }).rejects.toThrow(/Sem permissão/)
  })

  it('duplicado ativo, colaborador arquivado/inexistente e obra concluída são recusados', async () => {
    const o = await obraDireta()
    await alocar(gestor, { obra: o })
    await expect(alocar(gestor, { obra: o })).rejects.toThrow(/já está na equipa/)
    await expect(alocar(gestor, { obra: o, colab: colabInativo })).rejects.toThrow(/colaborador ativo/)
    await expect(alocar(gestor, { obra: o, colab: randomUUID() })).rejects.toThrow(/colaborador ativo/)
    const c = await obraDireta({ estado: 'concluida' })
    await expect(alocar(gestor, { obra: c })).rejects.toThrow(/concluída/)
    await expect(alocar(gestor, { obra: randomUUID() })).rejects.toThrow(/Obra não encontrada/)
  })

  it('remover fecha a alocação, valida datas e permite realocar', async () => {
    const o = await obraDireta()
    const id = await alocar(gestor, { obra: o, desde: await dia(-10) })
    await rm(medicoes, 'obra_remover_colaborador', { p_alocacao_id: id }).rejects.toThrow(/Sem permissão/)
    await rm(gestor, 'obra_remover_colaborador', { p_alocacao_id: id, p_ate: await dia(1) }).rejects.toThrow(/futura/)
    await rm(gestor, 'obra_remover_colaborador', { p_alocacao_id: id, p_ate: await dia(-11) }).rejects.toThrow(/anterior à entrada/)
    await rpc(gestor, 'obra_remover_colaborador', { p_alocacao_id: id, p_ate: await dia(-2) })
    await rm(gestor, 'obra_remover_colaborador', { p_alocacao_id: id }).rejects.toThrow(/já saiu/)
    expect((await lista(o))[0]).toMatchObject({ ativo: false })
    await alocar(gestor, { obra: o })
    const l = await lista(o)
    expect(l).toHaveLength(2)
    expect(l[0].ativo).toBe(true)
    expect((await visao(o)).equipa_n).toBe(1)
    expect((await eventos(o)).map(e => e.tipo)).toContain('EQUIPA_REMOVIDA')
    await rm(gestor, 'obra_remover_colaborador', { p_alocacao_id: randomUUID() }).rejects.toThrow(/Alocação não encontrada/)
  })

  describe('picagens → presente hoje', () => {
    const picar = (o, colab, tipo, seg, extra = {}) => sup(
      `INSERT INTO public.picagens (colaborador_id, obra_id, tipo, timestamp_dispositivo, resultado) VALUES ($1, $2, $3, now() - ($4::int * interval '1 second'), $5)`,
      [colab, o, tipo, seg, extra.resultado ?? 'AUTORIZADA'])
    const estadoDe = async (o, colab) => (await lista(o)).find(x => x.colaborador_id === colab)

    it('entrada hoje = presente e a última picagem aparece', async () => {
      const o = await obraDireta(); await alocar(gestor, { obra: o })
      await picar(o, colabA, 'ENTRADA', 30)
      const r = await estadoDe(o, colabA)
      expect(r.presente_hoje).toBe(true)
      expect(r.ultima_picagem).not.toBeNull()
    })
    it('saída depois da entrada = já não está presente', async () => {
      const o = await obraDireta(); await alocar(gestor, { obra: o })
      await picar(o, colabA, 'ENTRADA', 60); await picar(o, colabA, 'SAIDA', 30)
      expect((await estadoDe(o, colabA)).presente_hoje).toBe(false)
    })
    it('pausa = ausente; fim de pausa = presente', async () => {
      const o = await obraDireta(); await alocar(gestor, { obra: o })
      await picar(o, colabA, 'ENTRADA', 90); await picar(o, colabA, 'PAUSA_INI', 60)
      expect((await estadoDe(o, colabA)).presente_hoje).toBe(false)
      await picar(o, colabA, 'PAUSA_FIM', 30)
      expect((await estadoDe(o, colabA)).presente_hoje).toBe(true)
    })
    it('picagem recusada não conta', async () => {
      const o = await obraDireta(); await alocar(gestor, { obra: o })
      await picar(o, colabA, 'ENTRADA', 30, { resultado: 'RECUSADA' })
      const r = await estadoDe(o, colabA)
      expect(r.presente_hoje).toBe(false); expect(r.ultima_picagem).toBeNull()
    })
    it('picagem de ontem dá a última picagem mas não presença; picagem noutra obra não conta', async () => {
      const o = await obraDireta(); const outra = await obraDireta(); await alocar(gestor, { obra: o })
      await picar(o, colabA, 'ENTRADA', 3 * 24 * 3600)
      await picar(outra, colabA, 'ENTRADA', 10)
      const r = await estadoDe(o, colabA)
      expect(r.presente_hoje).toBe(false); expect(r.ultima_picagem).not.toBeNull()
    })
    it('colaborador removido da equipa nunca aparece como presente', async () => {
      const o = await obraDireta(); const id = await alocar(gestor, { obra: o })
      await picar(o, colabA, 'ENTRADA', 30)
      await rpc(gestor, 'obra_remover_colaborador', { p_alocacao_id: id })
      expect((await estadoDe(o, colabA)).presente_hoje).toBe(false)
    })
    it('quem não pode ver a obra recebe lista vazia; leitura vê (sem aceder às picagens)', async () => {
      const o = await obraDireta(); await alocar(gestor, { obra: o }); await picar(o, colabA, 'ENTRADA', 30)
      expect(await rpc(motorista, 'obra_equipa_lista', { p_obra_id: o })).toEqual([])
      expect(await rpc(mecanico, 'obra_equipa_lista', { p_obra_id: o })).toEqual([])
      expect((await rpc(leitura, 'obra_equipa_lista', { p_obra_id: o }))[0].presente_hoje).toBe(true)
      expect(await q(leitura, `SELECT * FROM public.picagens`)).toEqual([])
    })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('fases e progresso', () => {
  const fase = (uid, o, a = {}) => rpc1(uid, 'obra_guardar_fase', { p_obra_id: o, p_nome: a.nome ?? 'Fundações', p_peso: a.peso ?? 1, p_progresso: a.prog ?? 0, ...a.extra })
  const fonte = async (o) => { const v = await visao(o); return [v.progresso_fonte, v.progresso_pct == null ? null : Number(v.progresso_pct)] }

  it('estado deriva do progresso e a ordem cresce', async () => {
    const o = await obraDireta()
    const a = await fase(medicoes, o, { prog: 0 }), b = await fase(medicoes, o, { nome: 'Estrutura', prog: 40 }), c = await fase(gestor, o, { nome: 'Acabamentos', prog: 100 })
    const r = await q(admin, `SELECT id, estado, ordem FROM public.obra_fases WHERE obra_id = $1 ORDER BY ordem`, [o])
    expect(r.map(x => x.estado)).toEqual(['pendente', 'em_curso', 'concluida'])
    expect(r.map(x => x.ordem)).toEqual([1, 2, 3]); expect(r.map(x => x.id)).toEqual([a, b, c])
  })

  it('atualizar uma fase recalcula o estado e não deixa mudá-la de obra', async () => {
    const o = await obraDireta(), o2 = await obraDireta()
    const id = await fase(medicoes, o, { prog: 10 })
    await rpc(medicoes, 'obra_guardar_fase', { p_id: id, p_nome: 'Fundações', p_peso: 2, p_progresso: 100 })
    expect((await q(admin, `SELECT estado, peso FROM public.obra_fases WHERE id = $1`, [id]))[0]).toMatchObject({ estado: 'concluida', peso: '2' })
    await rm(medicoes, 'obra_guardar_fase', { p_id: id, p_obra_id: o2, p_nome: 'x' }).rejects.toThrow(/mudar uma fase de obra/)
  })

  it.each([
    ['nome vazio', { nome: ' ' }, /nome da fase/],
    ['peso zero', { peso: 0 }, /peso/],
    ['progresso 101', { prog: 101 }, /entre 0 e 100/],
    ['progresso negativo', { prog: -1 }, /entre 0 e 100/],
    ['datas invertidas', { extra: { p_data_inicio: '2026-03-02', p_data_fim_prevista: '2026-03-01' } }, /anterior ao início/],
  ])('recusa fase com %s', async (_n, a, erro) => {
    await expect(fase(gestor, await obraDireta(), a)).rejects.toThrow(erro)
  })

  it.each([['armazem', () => armazem], ['leitura', () => leitura], ['mecanico', () => mecanico], ['autor designado', () => autor]])
  ('%s não altera fases', async (_n, uid) => {
    await expect(fase(uid(), await obraDireta())).rejects.toThrow(/Sem permissão/)
  })

  it('apagar fase: quem mede apaga, outros não, inexistente dá erro', async () => {
    const o = await obraDireta(); const id = await fase(gestor, o)
    await rm(leitura, 'obra_apagar_fase', { p_id: id }).rejects.toThrow(/Sem permissão/)
    await rpc(medicoes, 'obra_apagar_fase', { p_id: id })
    await rm(medicoes, 'obra_apagar_fase', { p_id: id }).rejects.toThrow(/Fase não encontrada/)
  })

  it('sem nenhuma fonte: progresso nulo e fonte "nenhuma"', async () => {
    expect(await fonte(await obraDireta())).toEqual(['nenhuma', null])
  })

  it('fases: média ponderada pelo peso', async () => {
    const o = await obraDireta()
    await fase(gestor, o, { peso: 1, prog: 100 }); await fase(gestor, o, { nome: 'B', peso: 3, prog: 0 })
    expect(await fonte(o)).toEqual(['fases', 25])
  })

  it('aferição (última com %) vale quando não há fases; a mais recente por data ganha; sem % não conta', async () => {
    const o = await obraDireta()
    const afer = (a) => rpc1(medicoes, 'obra_registar_afericao', { p_obra_id: o, p_resumo: 'Visita', ...a })
    await afer({ p_data: await dia(-10), p_progresso_pct: 30 })
    await afer({ p_data: await dia(-2), p_progresso_pct: 55 })
    await afer({ p_data: await dia(-5), p_progresso_pct: 40 })
    await afer({ p_data: await dia(-1) })
    expect(await fonte(o)).toEqual(['afericao', 55])
    expect((await visao(o)).afericoes_n).toBe(4)
  })

  it('fases têm prioridade sobre aferições', async () => {
    const o = await obraDireta()
    await rpc(medicoes, 'obra_registar_afericao', { p_obra_id: o, p_resumo: 'x', p_progresso_pct: 80 })
    await fase(gestor, o, { prog: 10 })
    expect(await fonte(o)).toEqual(['fases', 10])
  })

  it('sem fases nem aferições: execução das subempreitadas validadas (executado / contrato)', async () => {
    const o = await obraDireta()
    const s1 = await subDireto(o, { valor: 1000 }), s2 = await subDireto(o, { valor: 3000 })
    await subDireto(o, { valor: 9000, estado: 'rascunho' })
    await autoDireto(s1, 500); await autoDireto(s2, 500); await autoDireto(s2, 999, { estado: 'rascunho' })
    expect(await fonte(o)).toEqual(['subempreitadas', 25])
  })

  it('a execução das subempreitadas nunca passa de 100 %', async () => {
    const o = await obraDireta(); const s = await subDireto(o, { valor: 100 })
    await autoDireto(s, 500)
    expect(await fonte(o)).toEqual(['subempreitadas', 100])
  })
})

describe('aferições', () => {
  let obra
  beforeAll(async () => { obra = await obraDireta() })
  const afer = (uid, a = {}) => rpc1(uid, 'obra_registar_afericao', { p_obra_id: obra, p_resumo: 'Visita à obra', ...a })

  it('regista tudo: percentagem, problemas, atraso, clima e fotos; vai para a atividade', async () => {
    const f = foto(obra, 'afericoes', 'Laje')
    const id = await afer(medicoes, { p_progresso_pct: 42.5, p_problemas: 'Chuva', p_atrasos_dias: 3, p_atraso_motivo: 'Chuva forte', p_clima: 'CHUVA_FORTE', p_clima_descricao: 'Aguaceiros', p_fotos: [f] })
    const r = (await q(admin, `SELECT * FROM public.obra_afericoes WHERE id = $1`, [id]))[0]
    expect(r).toMatchObject({ resumo: 'Visita à obra', problemas: 'Chuva', atrasos_dias: 3, atraso_motivo: 'Chuva forte', clima: 'CHUVA_FORTE', autor_id: medicoes })
    expect(Number(r.progresso_pct)).toBe(42.5); expect(r.fotos).toEqual([f])
    expect((await eventos(obra))[0]).toMatchObject({ tipo: 'AFERICAO', autor_nome: 'eduarda' })
  })

  it.each([
    ['resumo vazio', { p_resumo: ' ' }, /resumo/],
    ['percentagem 101', { p_progresso_pct: 101 }, /entre 0 e 100/],
    ['atraso negativo', { p_atrasos_dias: -1 }, /atraso inválidos/],
    ['clima inventado', { p_clima: 'NEVE' }, /Clima inválido/],
    ['foto com caminho solto', { p_fotos: [{ path: 'x.jpg' }] }, /Foto inválida/],
    ['foto de outra obra', { p_fotos: [{ path: `${randomUUID()}/afericoes/1-ab.jpg` }] }, /não pertence a esta obra/],
    ['foto com extensão estranha', { p_fotos: [{ path: `${obra}/afericoes/1-ab.exe` }] }, /Foto inválida/],
    ['fotos que não são lista', { p_fotos: { path: 'x' } }, /têm de ser uma lista/],
  ])('recusa %s', async (_n, a, erro) => {
    await expect(afer(gestor, a)).rejects.toThrow(erro)
  })

  it('data futura recusada; hoje aceite', async () => {
    await expect(afer(gestor, { p_data: await dia(1) })).rejects.toThrow(/futura/)
    await afer(gestor, { p_data: await dia(0) })
  })

  it('só admin, gestor e medições registam', async () => {
    await afer(admin); await afer(gestor); await afer(medicoes)
    for (const uid of [armazem, leitura, mecanico, motorista, autor]) await expect(afer(uid)).rejects.toThrow(/Sem permissão/)
  })

  it('obra inexistente', async () => {
    await expect(rpc1(gestor, 'obra_registar_afericao', { p_obra_id: randomUUID(), p_resumo: 'x' })).rejects.toThrow(/Obra não encontrada/)
  })

  it('não há edição direta: a aferição só se corrige com outra', async () => {
    const id = await afer(medicoes)
    await expect(q(medicoes, `UPDATE public.obra_afericoes SET resumo = 'x' WHERE id = $1`, [id])).rejects.toThrow(/permission denied/)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('saúde e prazos da obra', () => {
  const sub = (v, k) => expect(v[k])
  it('obra ativa sem datas nem problemas está ok e sem motivos', async () => {
    const v = await visao(await obraDireta())
    expect(v).toMatchObject({ saude: 'ok', motivos: [], progresso_esperado_pct: null, dias_sem_relatorio: null, ultimo_relatorio: null })
  })

  it('prazo ultrapassado → crítico, com o texto em português', async () => {
    const v = await visao(await obraDireta({ inicio: await dia(-60), fim: await dia(-5) }))
    expect(v.saude).toBe('critico')
    expect(v.motivos).toContain('Prazo ultrapassado há 5 dias')
  })

  it('prazo ultrapassado há 1 dia usa o singular', async () => {
    expect((await visao(await obraDireta({ fim: await dia(-1) }))).motivos).toContain('Prazo ultrapassado há 1 dia')
  })

  it('progresso esperado é linear entre início e fim previstos', async () => {
    const v = await visao(await obraDireta({ inicio: await dia(-10), fim: await dia(10) }))
    expect(Number(v.progresso_esperado_pct)).toBe(50)
  })

  it.each([
    ['ainda não começou → 0', -(-5), 10, 0],
    ['já devia ter acabado → 100', -30, -10, 100],
  ])('progresso esperado: %s', async (_n, ini, fim, esperado) => {
    const v = await visao(await obraDireta({ inicio: await dia(ini), fim: await dia(fim) }))
    expect(Number(v.progresso_esperado_pct)).toBe(esperado)
  })

  it('esperado fica nulo se faltar uma das datas', async () => {
    expect((await visao(await obraDireta({ inicio: await dia(-3) }))).progresso_esperado_pct).toBeNull()
    expect((await visao(await obraDireta({ fim: await dia(30) }))).progresso_esperado_pct).toBeNull()
  })

  async function comAtraso(progresso) {
    const o = await obraDireta({ inicio: await dia(-10), fim: await dia(10) }) // esperado 50 %
    await rpc(medicoes, 'obra_registar_afericao', { p_obra_id: o, p_resumo: 'x', p_progresso_pct: progresso })
    await relatorioSubmetido(o, await dia(0)) // não deixa o aviso de relatórios interferir
    return visao(o)
  }

  it('atraso ≥ 20 pontos face ao esperado → crítico', async () => {
    const v = await comAtraso(30)
    expect(v.saude).toBe('critico'); expect(v.motivos).toEqual(['Atraso de 20 pontos face ao esperado'])
  })
  it('atraso entre 8 e 20 pontos → atenção', async () => {
    const v = await comAtraso(42)
    expect(v.saude).toBe('atencao'); expect(v.motivos).toEqual(['Atraso de 8 pontos face ao esperado'])
  })
  it('atraso abaixo de 8 pontos → ok', async () => {
    const v = await comAtraso(43)
    expect(v).toMatchObject({ saude: 'ok', motivos: [] })
  })
  it('adiantada também está ok', async () => {
    expect((await comAtraso(90)).saude).toBe('ok')
  })

  it('iniciada há 3+ dias sem relatório submetido → atenção; com relatório de hoje → ok', async () => {
    const o = await obraDireta({ inicio: await dia(-5) })
    let v = await visao(o)
    expect(v).toMatchObject({ saude: 'atencao', dias_sem_relatorio: 5 }); expect(v.motivos).toEqual(['Ainda sem relatórios diários submetidos'])
    await relatorioSubmetido(o, await dia(-4))
    v = await visaoT(o)
    expect(v).toMatchObject({ saude: 'atencao', dias_sem_relatorio: 4, ult: await dia(-4) }); expect(v.motivos).toEqual(['Sem relatório diário há 4 dias'])
    await relatorioSubmetido(o, await dia(0))
    expect(await visao(o)).toMatchObject({ saude: 'ok', dias_sem_relatorio: 0, relatorios_n: 2 })
  })

  it('o limite é 3 dias: iniciada há 2 dias ou por iniciar → ok', async () => {
    expect((await visao(await obraDireta({ inicio: await dia(-2) }))).saude).toBe('ok')
    expect((await visao(await obraDireta({ inicio: await dia(-3) }))).saude).toBe('atencao')
    expect((await visao(await obraDireta({ inicio: await dia(10) }))).saude).toBe('ok')
  })

  it('um rascunho de relatório não conta como relatório', async () => {
    const o = await obraDireta({ inicio: await dia(-6) })
    await rpc(gestor, 'obra_guardar_relatorio', { p_obra_id: o, p_data: await dia(0), p_clima: 'SOL' })
    expect((await visao(o)).saude).toBe('atencao')
  })

  it('custo ≥ 90 % do orçamento → atenção (e 89 % → ok)', async () => {
    const o = await obraDireta({ orcamento: 100 })
    await rpc(armazem, 'registar_movimento_armazem', { p_produto_id: produto, p_subtipo: 'OBRA', p_quantidade: 17, p_responsavel: 'Zé', p_obra_id: o })
    let v = await visao(o)
    expect(Number(v.custo_total)).toBe(85); expect(v.saude).toBe('ok')
    await rpc(armazem, 'registar_movimento_armazem', { p_produto_id: produto, p_subtipo: 'OBRA', p_quantidade: 1, p_responsavel: 'Zé', p_obra_id: o })
    v = await visao(o)
    expect(Number(v.custo_total)).toBe(90); expect(v.saude).toBe('atencao'); expect(v.motivos).toEqual(['Custo a 90 % do orçamento'])
    expect(Number(v.materiais_valor)).toBe(90)
  })

  it('ocorrência de gravidade alta aberta → crítico; média/baixa → atenção; resolvida → ok', async () => {
    const o = await obraDireta(); const s = await subDireto(o)
    const media = await ocorrencia(medicoes, s, { grav: 'media' })
    let v = await visao(o)
    expect(v).toMatchObject({ saude: 'atencao', ocorrencias_abertas: 1 }); expect(v.motivos).toEqual(['1 ocorrência por resolver'])
    const alta = await ocorrencia(medicoes, s, { grav: 'alta', tipo: 'SEGURANCA' })
    v = await visao(o)
    expect(v).toMatchObject({ saude: 'critico', ocorrencias_abertas: 2 })
    expect(v.motivos).toEqual(['1 ocorrência grave por resolver', '1 ocorrência por resolver'])
    await rpc(medicoes, 'sub_resolver_ocorrencia', { p_id: alta, p_resolucao: 'Corrigido' })
    await rpc(medicoes, 'sub_resolver_ocorrencia', { p_id: media, p_resolucao: 'Corrigido' })
    expect(await visao(o)).toMatchObject({ saude: 'ok', ocorrencias_abertas: 0 })
  })

  it.each(['planeada', 'suspensa', 'concluida'])('obra %s é sempre ok, mesmo com o prazo vencido', async (estado) => {
    const v = await visao(await obraDireta({ estado, inicio: await dia(-60), fim: await dia(-30) }))
    expect(v).toMatchObject({ saude: 'ok', motivos: [] })
  })

  it('várias razões acumulam-se, as críticas primeiro', async () => {
    const o = await obraDireta({ inicio: await dia(-20), fim: await dia(-2), orcamento: 10 })
    await rpc(armazem, 'registar_movimento_armazem', { p_produto_id: produto, p_subtipo: 'OBRA', p_quantidade: 2, p_responsavel: 'Zé', p_obra_id: o })
    const v = await visao(o)
    expect(v.saude).toBe('critico')
    expect(v.motivos[0]).toBe('Prazo ultrapassado há 2 dias')
    expect(v.motivos).toEqual(expect.arrayContaining(['Ainda sem relatórios diários submetidos', 'Custo a 100 % do orçamento']))
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('autores designados', () => {
  it('só admin/gestor designam; o autor passa a poder relatar só nessa obra', async () => {
    const o = await obraDireta(), outra = await obraDireta()
    const gerar = (uid, ob) => rpc1(uid, 'obra_guardar_relatorio', { p_obra_id: ob, p_data: '2026-01-10' })
    await expect(gerar(autor, o)).rejects.toThrow(/Sem permissão para escrever relatórios/)
    await rm(medicoes, 'obra_definir_autores', { p_obra_id: o, p_user_ids: [autor] }).rejects.toThrow(/Sem permissão/)
    await rpc(gestor, 'obra_definir_autores', { p_obra_id: o, p_user_ids: [autor] })
    expect(await gerar(autor, o)).toMatch(/^[0-9a-f-]{36}$/)
    await expect(gerar(autor, outra)).rejects.toThrow(/Sem permissão para escrever relatórios/)
    expect((await eventos(o)).map(e => e.tipo)).toContain('AUTORES_DEFINIDOS')
  })

  it('definir é substituir: quem sai perde o direito; lista vazia retira todos', async () => {
    const o = await obraDireta(); const outro = await utilizador('armazem', `outro${++seq}@t.pt`)
    await rpc(admin, 'obra_definir_autores', { p_obra_id: o, p_user_ids: [autor, outro] })
    expect((await q(admin, `SELECT user_id FROM public.obra_autores WHERE obra_id = $1`, [o])).length).toBe(2)
    await rpc(admin, 'obra_definir_autores', { p_obra_id: o, p_user_ids: [outro, outro] })
    expect((await q(admin, `SELECT user_id FROM public.obra_autores WHERE obra_id = $1`, [o])).map(r => r.user_id)).toEqual([outro])
    await expect(rpc1(autor, 'obra_guardar_relatorio', { p_obra_id: o })).rejects.toThrow(/Sem permissão/)
    await rpc(admin, 'obra_definir_autores', { p_obra_id: o, p_user_ids: [] })
    expect(await q(admin, `SELECT 1 FROM public.obra_autores WHERE obra_id = $1`, [o])).toEqual([])
  })

  it('mecânicos e motoristas não podem ser autores; utilizador inexistente também não', async () => {
    const o = await obraDireta()
    for (const uid of [mecanico, motorista, randomUUID()])
      await rm(gestor, 'obra_definir_autores', { p_obra_id: o, p_user_ids: [autor, uid] }).rejects.toThrow(/Utilizador inválido/)
    expect(await q(admin, `SELECT 1 FROM public.obra_autores WHERE obra_id = $1`, [o])).toEqual([])
    await rm(gestor, 'obra_definir_autores', { p_obra_id: randomUUID(), p_user_ids: [] }).rejects.toThrow(/Obra não encontrada/)
  })

  it('um autor designado que passa a mecânico perde o direito (o papel manda)', async () => {
    const o = await obraDireta(); const x = await utilizador('leitura', `x${++seq}@t.pt`)
    await rpc(admin, 'obra_definir_autores', { p_obra_id: o, p_user_ids: [x] })
    await rpc(x, 'obra_guardar_relatorio', { p_obra_id: o })
    await sup(`UPDATE public.profiles SET role = 'mecanico' WHERE id = $1`, [x])
    await expect(rpc(x, 'obra_guardar_relatorio', { p_obra_id: o })).rejects.toThrow(/Sem permissão/)
  })

  it('lista de candidatos: só gestão vê, sem mecânicos/motoristas, com a marca de designado', async () => {
    const o = await obraDireta()
    await rpc(admin, 'obra_definir_autores', { p_obra_id: o, p_user_ids: [autor] })
    const l = await rpc(gestor, 'obra_autores_lista', { p_obra_id: o })
    expect(l.find(x => x.user_id === autor)).toMatchObject({ designado: true, role: 'leitura' })
    expect(l.find(x => x.user_id === medicoes).designado).toBe(false)
    expect(l.map(x => x.user_id)).not.toContain(mecanico); expect(l.map(x => x.user_id)).not.toContain(motorista)
    expect(await rpc(medicoes, 'obra_autores_lista', { p_obra_id: o })).toEqual([])
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('relatórios diários', () => {
  let obra, outra, sub, subOutra
  beforeAll(async () => {
    obra = await obraDireta(); outra = await obraDireta()
    sub = await subDireto(obra, { nome: 'Eletricista Lda' }); subOutra = await subDireto(outra)
    await rpc(admin, 'obra_definir_autores', { p_obra_id: obra, p_user_ids: [autor] })
  })
  const completo = (a = {}) => ({ p_obra_id: obra, p_data: '2026-01-12', p_clima: 'NUBLADO', p_temperatura_c: 14, p_clima_descricao: 'Fresco',
    p_equipa_ids: [colabA, colabB], p_equipa_outros: '2 serventes', p_subempreiteiros_ids: [sub], p_trabalhos: 'Betonagem da laje',
    p_houve_ocorrencias: false, p_observacoes: 'Tudo bem', ...a })
  const guardar = (uid, a) => rpc1(uid, 'obra_guardar_relatorio', completo(a))
  const submeter = (uid, id) => rpc(uid, 'obra_submeter_relatorio', { p_id: id })
  const estado = async (id) => (await sup(`SELECT estado FROM public.obra_relatorios_diarios WHERE id = $1`, [id]))[0].estado

  it('admin, gestor, medições e o autor designado criam rascunhos', async () => {
    for (const uid of [admin, gestor, medicoes, autor]) {
      const id = await guardar(uid)
      expect(await estado(id)).toBe('rascunho')
    }
  })

  it.each([['armazem', () => armazem], ['leitura', () => leitura], ['mecanico', () => mecanico], ['motorista', () => motorista]])
  ('%s não designado não escreve relatórios', async (_n, uid) => {
    await expect(guardar(uid())).rejects.toThrow(/Sem permissão para escrever relatórios/)
  })

  it('guarda todos os campos', async () => {
    const f = foto(obra)
    const id = await guardar(medicoes, { p_fotos: [f], p_houve_ocorrencias: true, p_ocorrencias: 'Queda de material' })
    const r = (await q(admin, `SELECT * FROM public.obra_relatorios_diarios WHERE id = $1`, [id]))[0]
    expect(r).toMatchObject({ obra_id: obra, estado: 'rascunho', clima: 'NUBLADO', clima_descricao: 'Fresco', equipa_outros: '2 serventes',
      trabalhos: 'Betonagem da laje', houve_ocorrencias: true, ocorrencias: 'Queda de material', observacoes: 'Tudo bem', autor_id: medicoes })
    expect(Number(r.temperatura_c)).toBe(14)
    expect([...r.equipa_ids].sort()).toEqual([colabA, colabB].sort()); expect(r.subempreiteiros_ids).toEqual([sub]); expect(r.fotos).toEqual([f])
  })

  it('sem ocorrências, o texto das ocorrências é descartado', async () => {
    const id = await guardar(gestor, { p_houve_ocorrencias: false, p_ocorrencias: 'esquecido' })
    expect((await sup(`SELECT ocorrencias FROM public.obra_relatorios_diarios WHERE id = $1`, [id]))[0].ocorrencias).toBeNull()
  })

  it.each([
    ['data futura', () => completo({ p_data: '2999-01-01' }), /futura/],
    ['clima inventado', () => completo({ p_clima: 'NEVE' }), /Clima inválido/],
    ['temperatura absurda', () => completo({ p_temperatura_c: 70 }), /Temperatura inválida/],
    ['colaborador inexistente', () => completo({ p_equipa_ids: [randomUUID()] }), /Equipa inválida/],
    ['subempreiteiro de outra obra', () => completo({ p_subempreiteiros_ids: [subOutra] }), /não pertence a esta obra/],
    ['foto de outra obra', () => completo({ p_fotos: [{ path: `${outra}/relatorios/1-ab.jpg` }] }), /não pertence a esta obra/],
    ['obra em falta', () => completo({ p_obra_id: null }), /Escolha a obra/],
    ['obra inexistente', () => completo({ p_obra_id: randomUUID() }), /Sem permissão|Obra não encontrada/],
  ])('recusa %s', async (_n, a, erro) => {
    await expect(rpc1(gestor, 'obra_guardar_relatorio', a())).rejects.toThrow(erro)
  })

  it('rascunho: só o autor ou gestão o alteram', async () => {
    const id = await guardar(medicoes)
    await rpc(medicoes, 'obra_guardar_relatorio', { ...completo(), p_id: id, p_trabalhos: 'Mudado pelo autor' })
    await rpc(gestor, 'obra_guardar_relatorio', { ...completo(), p_id: id, p_trabalhos: 'Mudado pela gestão' })
    const outroMed = await utilizador('medicoes', `med${++seq}@t.pt`)
    await expect(rpc(outroMed, 'obra_guardar_relatorio', { ...completo(), p_id: id })).rejects.toThrow(/Só o autor/)
    await expect(rpc(autor, 'obra_guardar_relatorio', { ...completo(), p_id: id })).rejects.toThrow(/Só o autor/)
    expect((await sup(`SELECT trabalhos FROM public.obra_relatorios_diarios WHERE id = $1`, [id]))[0].trabalhos).toBe('Mudado pela gestão')
    await expect(rpc(gestor, 'obra_guardar_relatorio', { ...completo(), p_id: id, p_obra_id: outra })).rejects.toThrow(/mudar um relatório de obra/)
    await expect(rpc(gestor, 'obra_guardar_relatorio', { ...completo(), p_id: randomUUID() })).rejects.toThrow(/Relatório não encontrado/)
  })

  describe('submeter', () => {
    it.each([
      ['clima em falta', { p_clima: null }, /clima/],
      ['trabalhos em falta', { p_trabalhos: ' ' }, /trabalhos/],
      ['ninguém presente', { p_equipa_ids: [], p_equipa_outros: null }, /quem esteve presente/],
      ['ocorrências sem texto', () => ({ p_houve_ocorrencias: true, p_ocorrencias: null, p_fotos: [foto(obra)] }), /ocorrências do dia/],
      ['ocorrências sem foto', { p_houve_ocorrencias: true, p_ocorrencias: 'Algo' }, /pelo menos uma foto/],
    ])('recusa %s', async (_n, a, erro) => {
      const id = await guardar(medicoes, typeof a === 'function' ? a() : a)
      await expect(submeter(medicoes, id)).rejects.toThrow(erro)
      expect(await estado(id)).toBe('rascunho')
    })

    it('só a equipa por IDs, ou só "outros", chega', async () => {
      await submeter(medicoes, await guardar(medicoes, { p_equipa_ids: [colabA], p_equipa_outros: null }))
      await submeter(medicoes, await guardar(medicoes, { p_equipa_ids: [], p_equipa_outros: '3 pedreiros' }))
    })

    it('com ocorrências, texto e foto → submetido, com data, autor e atividade', async () => {
      const id = await guardar(autor, { p_houve_ocorrencias: true, p_ocorrencias: 'Fuga de água', p_fotos: [foto(obra)] })
      await submeter(autor, id)
      const r = (await sup(`SELECT estado, submetido_por, submetido_em FROM public.obra_relatorios_diarios WHERE id = $1`, [id]))[0]
      expect(r).toMatchObject({ estado: 'submetido', submetido_por: autor }); expect(r.submetido_em).not.toBeNull()
      const ev = (await eventos(obra)).find(e => e.tipo === 'RELATORIO_SUBMETIDO')
      expect(ev).toMatchObject({ titulo: 'Relatório diário de 12/01/2026 submetido', detalhe: 'Com ocorrências' })
    })

    it('outro utilizador (mesmo medições) não submete o rascunho alheio; gestão sim', async () => {
      const id = await guardar(autor)
      await expect(submeter(medicoes, id)).rejects.toThrow(/Só o autor/)
      await submeter(gestor, id)
    })
  })

  describe('imutabilidade e reabertura', () => {
    let id
    beforeAll(async () => { id = await guardar(medicoes); await submeter(medicoes, id) })

    it('depois de submetido não se altera nem se volta a submeter, nem o admin pelo guardar', async () => {
      for (const uid of [medicoes, gestor, admin])
        await expect(rpc(uid, 'obra_guardar_relatorio', { ...completo(), p_id: id, p_trabalhos: 'Adulterado' })).rejects.toThrow(/já foi submetido e não pode ser alterado/)
      await expect(submeter(medicoes, id)).rejects.toThrow(/já foi submetido/)
      expect((await sup(`SELECT trabalhos FROM public.obra_relatorios_diarios WHERE id = $1`, [id]))[0].trabalhos).toBe('Betonagem da laje')
    })

    it('nenhum papel altera ou apaga o relatório por SQL direto', async () => {
      for (const uid of [admin, gestor, medicoes]) {
        await expect(q(uid, `UPDATE public.obra_relatorios_diarios SET trabalhos = 'x' WHERE id = $1`, [id])).rejects.toThrow(/permission denied/)
        await expect(q(uid, `DELETE FROM public.obra_relatorios_diarios WHERE id = $1`, [id])).rejects.toThrow(/permission denied/)
        await expect(q(uid, `INSERT INTO public.obra_relatorios_diarios (obra_id, data) VALUES ($1, CURRENT_DATE)`, [obra])).rejects.toThrow(/permission denied/)
      }
    })

    it('só o admin reabre, com motivo, e só se estiver submetido', async () => {
      for (const uid of [gestor, medicoes, armazem, leitura, autor])
        await rm(uid, 'obra_reabrir_relatorio', { p_id: id, p_motivo: 'Erro' }).rejects.toThrow(/Só o administrador/)
      await rm(admin, 'obra_reabrir_relatorio', { p_id: id, p_motivo: '  ' }).rejects.toThrow(/motivo/)
      await rm(admin, 'obra_reabrir_relatorio', { p_id: randomUUID(), p_motivo: 'x' }).rejects.toThrow(/não encontrado/)
      expect(await estado(id)).toBe('submetido')
    })

    it('reabrir regista motivo e quem; volta a poder editar e submeter; fica no histórico', async () => {
      const novo = await guardar(medicoes); await submeter(medicoes, novo)
      await rpc(admin, 'obra_reabrir_relatorio', { p_id: novo, p_motivo: 'Faltou a foto da laje' })
      const r = (await sup(`SELECT estado, reaberto_por, reaberto_motivo, reaberto_em, submetido_em FROM public.obra_relatorios_diarios WHERE id = $1`, [novo]))[0]
      expect(r).toMatchObject({ estado: 'rascunho', reaberto_por: admin, reaberto_motivo: 'Faltou a foto da laje', submetido_em: null }); expect(r.reaberto_em).not.toBeNull()
      await expect(rpc(admin, 'obra_reabrir_relatorio', { p_id: novo, p_motivo: 'x' })).rejects.toThrow(/ainda é um rascunho/)
      await rpc(medicoes, 'obra_guardar_relatorio', { ...completo(), p_id: novo, p_trabalhos: 'Corrigido' })
      await submeter(medicoes, novo)
      expect(await estado(novo)).toBe('submetido')
      const tipos = (await eventos(obra)).filter(e => e.detalhe === 'Faltou a foto da laje')
      expect(tipos).toHaveLength(1); expect(tipos[0].tipo).toBe('RELATORIO_REABERTO')
    })
  })

  describe('lista e detalhe', () => {
    let obraL, rSub, rRasc
    beforeAll(async () => {
      obraL = await obraDireta(); const s = await subDireto(obraL, { nome: 'Pinturas SA' })
      rSub = await rpc1(medicoes, 'obra_guardar_relatorio', { p_obra_id: obraL, p_data: '2026-02-10', p_clima: 'SOL', p_equipa_ids: [colabA], p_subempreiteiros_ids: [s],
        p_trabalhos: 'Reboco', p_houve_ocorrencias: true, p_ocorrencias: 'Acidente', p_fotos: [foto(obraL), foto(obraL)] })
      await rpc(medicoes, 'obra_submeter_relatorio', { p_id: rSub })
      rRasc = await rpc1(gestor, 'obra_guardar_relatorio', { p_obra_id: obraL, p_data: '2026-02-12', p_clima: 'CHUVA_FORTE', p_trabalhos: 'Parado' })
      await relatorioSubmetido(obraL, '2026-02-11')
    })
    const lista = (uid, a = {}) => rpc(uid, 'obra_relatorios_lista', { p_obra_id: obraL, ...a })

    it('ordem por data (mais recente primeiro) e campos calculados', async () => {
      const l = await lista(leitura)
      expect(l.map(r => r.id)[0]).toBe(rRasc); expect(l).toHaveLength(3)
      const r = l.find(x => x.id === rSub)
      expect(r).toMatchObject({ obra_id: obraL, estado: 'submetido', clima: 'SOL', houve_ocorrencias: true, trabalhos: 'Reboco', n_fotos: 2, n_equipa: 1, autor_id: medicoes, autor_nome: 'eduarda' })
      expect(r.submetido_em).not.toBeNull(); expect(r.obra_nome).toBeTruthy()
    })
    it('filtros: estado, só ocorrências, intervalo, limite', async () => {
      expect((await lista(admin, { p_estado: 'rascunho' })).map(r => r.id)).toEqual([rRasc])
      expect((await lista(admin, { p_so_ocorrencias: true })).map(r => r.id)).toEqual([rSub])
      expect((await lista(admin, { p_desde: '2026-02-11', p_ate: '2026-02-11' }))).toHaveLength(1)
      expect((await lista(admin, { p_limite: 2 }))).toHaveLength(2)
    })
    it('sem obra, lista todas as obras visíveis', async () => {
      expect((await rpc(admin, 'obra_relatorios_lista', {})).length).toBeGreaterThan(3)
    })
    it('mecânico e motorista não vêem nada, nem por SQL direto', async () => {
      for (const uid of [mecanico, motorista]) {
        expect(await lista(uid)).toEqual([])
        expect(await q(uid, `SELECT * FROM public.obra_relatorios_diarios`)).toEqual([])
        await expect(rpc1(uid, 'obra_relatorio_detalhe', { p_id: rSub })).rejects.toThrow(/não encontrado/)
      }
    })
    it('detalhe traz equipa, subempreiteiros e nomes', async () => {
      const d = await rpc1(leitura, 'obra_relatorio_detalhe', { p_id: rSub })
      expect(d).toMatchObject({ id: rSub, estado: 'submetido', trabalhos: 'Reboco', autor_nome: 'eduarda', submetido_por_nome: 'eduarda', reaberto_por_nome: null })
      expect(d.equipa).toEqual([{ id: colabA, nome: 'Rui' }]); expect(d.subempreiteiros).toHaveLength(1); expect(d.subempreiteiros[0].nome).toBe('Pinturas SA')
      expect(d.obra_nome).toBeTruthy(); expect(d.fotos).toHaveLength(2)
    })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('fotos e galeria', () => {
  let obra, outra
  beforeAll(async () => { obra = await obraDireta(); outra = await obraDireta(); await rpc(admin, 'obra_definir_autores', { p_obra_id: obra, p_user_ids: [autor] }) })
  const add = (uid, o, fotos) => rpc1(uid, 'obra_adicionar_fotos', { p_obra_id: o, p_fotos: fotos })

  it('admin, gestor, medições e autor designado adicionam; devolve quantas', async () => {
    for (const uid of [admin, gestor, medicoes, autor]) expect(await add(uid, obra, [foto(obra, 'galeria', 'Fachada'), foto(obra, 'galeria')])).toBe(2)
    expect((await q(admin, `SELECT * FROM public.obra_fotos WHERE obra_id = $1 AND legenda = 'Fachada'`, [obra]))).toHaveLength(4)
  })
  it.each([['armazem', () => armazem], ['leitura', () => leitura], ['mecanico', () => mecanico], ['motorista', () => motorista]])
  ('%s não adiciona fotos', async (_n, uid) => {
    await expect(add(uid(), obra, [foto(obra, 'galeria')])).rejects.toThrow(/Sem permissão/)
  })
  it('o autor designado só adiciona na sua obra', async () => {
    await expect(add(autor, outra, [foto(outra, 'galeria')])).rejects.toThrow(/Sem permissão/)
  })
  it('recusa lista vazia, foto de outra obra e repete sem duplicar', async () => {
    await expect(add(gestor, obra, [])).rejects.toThrow(/pelo menos uma foto/)
    await expect(add(gestor, obra, [foto(outra, 'galeria')])).rejects.toThrow(/não pertence a esta obra/)
    const f = foto(obra, 'galeria')
    expect(await add(gestor, obra, [f])).toBe(1); expect(await add(gestor, obra, [f])).toBe(0)
    await expect(add(gestor, obra, Array.from({ length: 31 }, () => foto(obra, 'galeria')))).rejects.toThrow(/No máximo 30/)
  })
  it('apagar: o autor, a gestão; outros não', async () => {
    await add(medicoes, obra, [foto(obra, 'galeria')])
    const id = (await q(admin, `SELECT id FROM public.obra_fotos WHERE autor_id = $1 ORDER BY criado_em DESC LIMIT 1`, [medicoes]))[0].id
    const outroMed = await utilizador('medicoes', `m${++seq}@t.pt`)
    await rm(outroMed, 'obra_apagar_foto', { p_id: id }).rejects.toThrow(/Só quem enviou/)
    await rm(leitura, 'obra_apagar_foto', { p_id: id }).rejects.toThrow(/Só quem enviou/)
    await rpc(medicoes, 'obra_apagar_foto', { p_id: id })
    await rm(medicoes, 'obra_apagar_foto', { p_id: id }).rejects.toThrow(/Foto não encontrada/)
    await add(medicoes, obra, [foto(obra, 'galeria')])
    const id2 = (await q(admin, `SELECT id FROM public.obra_fotos WHERE autor_id = $1 ORDER BY criado_em DESC LIMIT 1`, [medicoes]))[0].id
    await rpc(gestor, 'obra_apagar_foto', { p_id: id2 })
  })

  describe('vista obra_fotos_todas', () => {
    it('une as 5 origens; rascunhos de relatório ficam de fora', async () => {
      const o = await obraDireta(); const s = await subDireto(o)
      await add(medicoes, o, [foto(o, 'galeria', 'G')])
      const fr = foto(o, 'relatorios', 'R'); await relatorioSubmetido(o, '2026-03-01', { uid: medicoes, fotos: [fr] })
      await rpc(medicoes, 'obra_guardar_relatorio', { p_obra_id: o, p_data: '2026-03-02', p_fotos: [foto(o, 'relatorios', 'RASCUNHO')] })
      await rpc(medicoes, 'obra_registar_afericao', { p_obra_id: o, p_resumo: 'x', p_fotos: [foto(o, 'afericoes', 'A')] })
      await ocorrencia(medicoes, s, { fotos: [foto(o, 'subempreitadas', 'S')] })
      const auto = await autoDireto(s, 10, { estado: 'rascunho' })
      await rpc(medicoes, 'auto_guardar_evidencias', { p_auto_id: auto, p_fotos: [foto(o, 'autos', 'AU')] })
      const r = await q(leitura, `SELECT origem, legenda, ref_id FROM public.obra_fotos_todas WHERE obra_id = $1 ORDER BY legenda`, [o])
      expect(r.map(x => `${x.origem}:${x.legenda}`)).toEqual(['AUTO:AU', 'AFERICAO:A', 'GALERIA:G', 'RELATORIO:R', 'SUBEMPREITADA:S'].sort((a, b) => a.split(':')[1].localeCompare(b.split(':')[1])))
      expect(r.find(x => x.origem === 'AUTO').ref_id).toBe(auto)
      expect((await visao(o)).fotos_n).toBe(5)
    })
    it('mecânico e motorista não vêem fotos; anónimo não acede', async () => {
      for (const uid of [mecanico, motorista]) expect(await q(uid, `SELECT * FROM public.obra_fotos_todas`)).toEqual([])
      await expect(anon(tx => tx.query(`SELECT * FROM public.obra_fotos_todas`))).rejects.toThrow(/permission denied/)
    })
    it('depois de reaberto, as fotos do relatório deixam de aparecer', async () => {
      const o = await obraDireta()
      const id = await relatorioSubmetido(o, '2026-03-05', { uid: medicoes, fotos: [foto(o, 'relatorios')] })
      expect(await q(admin, `SELECT 1 FROM public.obra_fotos_todas WHERE obra_id = $1`, [o])).toHaveLength(1)
      await rpc(admin, 'obra_reabrir_relatorio', { p_id: id, p_motivo: 'Rever' })
      expect(await q(admin, `SELECT 1 FROM public.obra_fotos_todas WHERE obra_id = $1`, [o])).toHaveLength(0)
    })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('subempreitadas: ficha, contrato, ocorrências, evidências', () => {
  let obra, sub
  beforeAll(async () => { obra = await obraDireta(); sub = await subDireto(obra, { nome: 'Canalizações Lda' }) })
  const contratoPath = (s = sub, ext = 'pdf') => `${s}/contrato-${Date.now()}${++seq}.${ext}`

  describe('ficha', () => {
    it('medições atualiza (também numa contratação validada) e fica na atividade', async () => {
      await rpc(medicoes, 'sub_atualizar_ficha', { p_id: sub, p_nif: '501234567', p_telefone: '912345678', p_email: 'a@b.pt', p_especialidade: 'Águas', p_data_inicio: '2026-01-01', p_data_fim_prevista: '2026-06-01' })
      expect((await sup(`SELECT nif, telefone, email, especialidade, data_inicio::text AS di FROM public.subempreiteiros WHERE id = $1`, [sub]))[0])
        .toEqual({ nif: '501234567', telefone: '912345678', email: 'a@b.pt', especialidade: 'Águas', di: '2026-01-01' })
      expect((await sup(`SELECT estado FROM public.subempreiteiros WHERE id = $1`, [sub]))[0].estado).toBe('validado')
      expect((await eventos(obra)).map(e => e.tipo)).toContain('SUB_FICHA')
    })
    it.each([['armazem', () => armazem], ['leitura', () => leitura], ['mecanico', () => mecanico], ['autor designado', () => autor]])
    ('%s não altera a ficha', async (_n, uid) => {
      await rm(uid(), 'sub_atualizar_ficha', { p_id: sub }).rejects.toThrow(/Sem permissão/)
    })
    it.each([
      ['email inválido', { p_email: 'sem-arroba' }, /Email inválido/],
      ['datas invertidas', { p_data_inicio: '2026-02-01', p_data_fim_prevista: '2026-01-01' }, /anterior à data de início/],
      ['NIF enorme', { p_nif: 'x'.repeat(31) }, /demasiado longo/],
    ])('recusa %s', async (_n, a, erro) => {
      await rm(gestor, 'sub_atualizar_ficha', { p_id: sub, ...a }).rejects.toThrow(erro)
    })
    it('contratação inexistente', async () => {
      await rm(gestor, 'sub_atualizar_ficha', { p_id: randomUUID() }).rejects.toThrow(/não encontrada/)
    })
  })

  describe('contrato anexado', () => {
    it('anexa, substitui e remove — mesmo com a contratação validada', async () => {
      const p1 = contratoPath()
      await rpc(medicoes, 'sub_anexar_contrato', { p_id: sub, p_path: p1, p_nome: 'Contrato.pdf' })
      expect((await sup(`SELECT contrato_path, contrato_nome, contrato_enviado_em FROM public.subempreiteiros WHERE id = $1`, [sub]))[0]).toMatchObject({ contrato_path: p1, contrato_nome: 'Contrato.pdf' })
      expect((await rpc(leitura, 'subs_resumo', { p_obra_id: obra }))[0].tem_contrato).toBe(true)
      const p2 = contratoPath(sub, 'jpg')
      await rpc(gestor, 'sub_anexar_contrato', { p_id: sub, p_path: p2, p_nome: 'Scan.jpg' })
      expect((await sup(`SELECT contrato_path FROM public.subempreiteiros WHERE id = $1`, [sub]))[0].contrato_path).toBe(p2)
      await rpc(admin, 'sub_remover_contrato', { p_id: sub })
      expect((await sup(`SELECT contrato_path, contrato_nome, contrato_enviado_em FROM public.subempreiteiros WHERE id = $1`, [sub]))[0]).toEqual({ contrato_path: null, contrato_nome: null, contrato_enviado_em: null })
      expect((await rpc(leitura, 'subs_resumo', { p_obra_id: obra }))[0].tem_contrato).toBe(false)
      expect((await eventos(obra)).map(e => e.tipo)).toEqual(expect.arrayContaining(['CONTRATO_ANEXADO', 'CONTRATO_REMOVIDO']))
    })
    it.each([
      ['caminho de outra contratação', () => contratoPath(randomUUID())],
      ['extensão não permitida', () => contratoPath(sub, 'exe')],
      ['pasta indevida', () => `${sub}/outro/contrato-1.pdf`],
      ['caminho com ..', () => `${sub}/../x/contrato-1.pdf`],
    ])('recusa %s', async (_n, p) => {
      await rm(gestor, 'sub_anexar_contrato', { p_id: sub, p_path: p(), p_nome: 'x.pdf' }).rejects.toThrow(/inválido/)
    })
    it('nome em falta, permissões e remover sem contrato', async () => {
      await rm(gestor, 'sub_anexar_contrato', { p_id: sub, p_path: contratoPath(), p_nome: ' ' }).rejects.toThrow(/nome do ficheiro/)
      for (const uid of [armazem, leitura, mecanico])
        await rm(uid, 'sub_anexar_contrato', { p_id: sub, p_path: contratoPath(), p_nome: 'x.pdf' }).rejects.toThrow(/Sem permissão/)
      await rm(leitura, 'sub_remover_contrato', { p_id: sub }).rejects.toThrow(/Sem permissão/)
      await rm(gestor, 'sub_remover_contrato', { p_id: sub }).rejects.toThrow(/não tem contrato/)
    })
    it('a base de dados também recusa um caminho de contrato de outra contratação', async () => {
      await expect(sup(`UPDATE public.subempreiteiros SET contrato_path = $2 WHERE id = $1`, [sub, contratoPath(randomUUID())])).rejects.toThrow(/ck_sub_contrato_path/)
    })
  })

  describe('ocorrências', () => {
    it('regista com fotos; medições, gestão e admin; vai para a atividade; resolve uma vez', async () => {
      const f = foto(obra, 'subempreitadas', 'Fissura')
      const id = await ocorrencia(medicoes, sub, { tipo: 'ATRASO', grav: 'alta', dias: 4, fotos: [f], desc: 'Atraso na entrega' })
      const o = (await q(admin, `SELECT * FROM public.sub_ocorrencias WHERE id = $1`, [id]))[0]
      expect(o).toMatchObject({ subempreiteiro_id: sub, obra_id: obra, tipo: 'ATRASO', gravidade: 'alta', dias_atraso: 4, resolvido: false, autor_id: medicoes }); expect(o.fotos).toEqual([f])
      expect((await eventos(obra)).find(e => e.tipo === 'OCORRENCIA_REGISTADA').titulo).toBe('Ocorrência (ATRASO, alta) — Canalizações Lda')
      await rm(leitura, 'sub_resolver_ocorrencia', { p_id: id, p_resolucao: 'x' }).rejects.toThrow(/Sem permissão/)
      await rm(gestor, 'sub_resolver_ocorrencia', { p_id: id, p_resolucao: ' ' }).rejects.toThrow(/Explique/)
      await rpc(gestor, 'sub_resolver_ocorrencia', { p_id: id, p_resolucao: 'Material chegou' })
      const r = (await q(admin, `SELECT resolvido, resolucao, resolvido_por, resolvido_em FROM public.sub_ocorrencias WHERE id = $1`, [id]))[0]
      expect(r).toMatchObject({ resolvido: true, resolucao: 'Material chegou', resolvido_por: gestor }); expect(r.resolvido_em).not.toBeNull()
      await rm(gestor, 'sub_resolver_ocorrencia', { p_id: id, p_resolucao: 'x' }).rejects.toThrow(/já está resolvida/)
      expect((await eventos(obra)).map(e => e.tipo)).toContain('OCORRENCIA_RESOLVIDA')
    })
    it.each([
      ['tipo inventado', { tipo: 'ROUBO' }, /Tipo de ocorrência inválido/],
      ['gravidade inventada', { grav: 'extrema' }, /Gravidade inválida/],
      ['descrição vazia', { desc: ' ' }, /Descreva a ocorrência/],
      ['atraso sem dias', { tipo: 'ATRASO', dias: 0 }, /quantos dias/],
      ['data futura', { data: '2999-01-01' }, /futura/],
      ['dias negativos', { dias: -2 }, /Dias de atraso inválidos/],
    ])('recusa %s', async (_n, a, erro) => {
      await expect(ocorrencia(gestor, sub, a)).rejects.toThrow(erro)
    })
    it('só quem mede regista; contratação e foto de outra obra recusadas', async () => {
      for (const uid of [armazem, leitura, mecanico, motorista, autor]) await expect(ocorrencia(uid, sub)).rejects.toThrow(/Sem permissão/)
      await expect(ocorrencia(gestor, randomUUID())).rejects.toThrow(/não encontrada/)
      await expect(ocorrencia(gestor, sub, { fotos: [{ path: `${randomUUID()}/subempreitadas/1-ab.jpg` }] })).rejects.toThrow(/não pertence a esta obra/)
      await rm(gestor, 'sub_resolver_ocorrencia', { p_id: randomUUID(), p_resolucao: 'x' }).rejects.toThrow(/não encontrada/)
    })
  })

  describe('evidências do auto', () => {
    it('rascunho: medições guarda fotos, anotações, problemas, atraso, clima e progresso físico', async () => {
      const a = await autoDireto(sub, 100, { estado: 'rascunho' }); const f = foto(obra, 'autos', 'Parede')
      await rpc(medicoes, 'auto_guardar_evidencias', { p_auto_id: a, p_fotos: [f], p_anotacoes: 'Nota', p_problemas: 'Humidade', p_atraso_dias: 2, p_clima: 'CHUVA_FRACA', p_clima_descricao: 'Chuvisco', p_progresso_fisico_pct: 37.5 })
      const r = (await q(admin, `SELECT fotos, anotacoes, problemas, atraso_dias, clima, clima_descricao, progresso_fisico_pct FROM public.autos_medicao WHERE id = $1`, [a]))[0]
      expect(r).toMatchObject({ fotos: [f], anotacoes: 'Nota', problemas: 'Humidade', atraso_dias: 2, clima: 'CHUVA_FRACA', clima_descricao: 'Chuvisco' }); expect(Number(r.progresso_fisico_pct)).toBe(37.5)
    })
    it('validado: só o administrador altera as provas', async () => {
      const a = await autoDireto(sub, 100)
      for (const uid of [medicoes, gestor]) await expect(rpc(uid, 'auto_guardar_evidencias', { p_auto_id: a, p_anotacoes: 'x' })).rejects.toThrow(/só o administrador/)
      await rpc(admin, 'auto_guardar_evidencias', { p_auto_id: a, p_anotacoes: 'Corrigido pelo admin' })
      expect((await sup(`SELECT anotacoes FROM public.autos_medicao WHERE id = $1`, [a]))[0].anotacoes).toBe('Corrigido pelo admin')
    })
    it.each([
      ['progresso 101', { p_progresso_fisico_pct: 101 }, /entre 0 e 100/],
      ['atraso negativo', { p_atraso_dias: -1 }, /atraso inválidos/],
      ['clima inventado', { p_clima: 'NEVE' }, /Clima inválido/],
      ['foto de outra obra', { p_fotos: [{ path: `${randomUUID()}/autos/1-ab.jpg` }] }, /não pertence a esta obra/],
    ])('recusa %s', async (_n, a, erro) => {
      const id = await autoDireto(sub, 5, { estado: 'rascunho' })
      await expect(rpc(medicoes, 'auto_guardar_evidencias', { p_auto_id: id, ...a })).rejects.toThrow(erro)
    })
    it('só medições/gestão; auto inexistente', async () => {
      const id = await autoDireto(sub, 5, { estado: 'rascunho' })
      for (const uid of [armazem, leitura, mecanico, autor]) await expect(rpc(uid, 'auto_guardar_evidencias', { p_auto_id: id })).rejects.toThrow(/Sem permissão/)
      await expect(rpc(gestor, 'auto_guardar_evidencias', { p_auto_id: randomUUID() })).rejects.toThrow(/Auto não encontrado/)
    })
  })
})

describe('sub_painel e subs_resumo', () => {
  let obra, sub
  beforeAll(async () => {
    obra = await obraDireta()
    sub = await subDireto(obra, { nome: 'Estruturas Lda', valor: 1000, ret: 10, inicio: await dia(-30), fim: await dia(30) })
    await autoDireto(sub, 400, { pago: true, atraso: 2 })
    await autoDireto(sub, 200, { data: await dia(-3) })
    await autoDireto(sub, 100, { estado: 'rascunho', atraso: 1 })
    const oc = await ocorrencia(medicoes, sub, { tipo: 'ATRASO', grav: 'baixa', dias: 5 }); await ocorrencia(medicoes, sub, { grav: 'media' }); await ocorrencia(medicoes, sub, { grav: 'alta' })
    await rpc(medicoes, 'sub_resolver_ocorrencia', { p_id: oc, p_resolucao: 'ok' })
    await relatorioSubmetido(obra, await dia(-1), { uid: medicoes })
    await rpc(medicoes, 'obra_guardar_relatorio', { p_obra_id: obra, p_data: await dia(-2), p_subempreiteiros_ids: [sub], p_clima: 'SOL' })
    const r = await rpc1(medicoes, 'obra_guardar_relatorio', { p_obra_id: obra, p_data: await dia(-3), p_clima: 'SOL', p_equipa_outros: 'x', p_trabalhos: 'y', p_subempreiteiros_ids: [sub] })
    await rpc(medicoes, 'obra_submeter_relatorio', { p_id: r })
  })

  it('números: contrato, executado, retenção, pago e por pagar', async () => {
    const p = await rpc1(leitura, 'sub_painel', { p_id: sub })
    expect(p).toMatchObject({ valor_contrato: 1000, executado: 600, executado_pct: 60, retencao_acumulada: 60, pago: 360, por_pagar: 180, autos_n: 3, dias_sem_auto: 0 })
    expect(p.pago + p.por_pagar + p.retencao_acumulada).toBe(p.executado)
  })
  it('atrasos, ocorrências abertas por gravidade e presenças em relatórios', async () => {
    const p = await rpc1(admin, 'sub_painel', { p_id: sub })
    expect(p.atraso_dias_total).toBe(2 + 1 + 5)
    expect(p.ocorrencias_abertas).toEqual({ baixa: 0, media: 1, alta: 1 }); expect(p.ocorrencias_total).toBe(3)
    expect(p.presencas_relatorios).toBe(1)
  })
  it('prazo e saúde (ocorrência grave aberta = crítico, com motivos)', async () => {
    const p = await rpc1(admin, 'sub_painel', { p_id: sub })
    expect(p.prazo).toMatchObject({ dias_restantes: 30 }); expect(p.prazo.inicio).toBeTruthy(); expect(p.prazo.fim_previsto).toBeTruthy()
    expect(p.saude).toBe('critico'); expect(p.motivos).toEqual(['1 ocorrência grave por resolver', '1 ocorrência por resolver'])
  })
  it('contrato unitário soma preço × quantidade dos artigos', async () => {
    const o = await obraDireta()
    const s = (await sup(`INSERT INTO public.subempreiteiros (obra_id, nome, tipo, estado) VALUES ($1, 'Unit', 'unitario', 'validado') RETURNING id`, [o]))[0].id
    await sup(`INSERT INTO public.subempreiteiro_artigos (subempreiteiro_id, descricao, unidade, preco_unitario, quantidade_prevista) VALUES ($1, 'Reboco', 'm2', 12.5, 40), ($1, 'Pintura', 'm2', 5, 10)`, [s])
    expect((await rpc1(admin, 'sub_painel', { p_id: s })).valor_contrato).toBe(550)
  })
  it('sem autos: percentagem e dias sem auto nulos', async () => {
    const s = await subDireto(await obraDireta(), { valor: 0 })
    expect(await rpc1(admin, 'sub_painel', { p_id: s })).toMatchObject({ executado: 0, executado_pct: null, ultimo_auto: null, dias_sem_auto: null, autos_n: 0, saude: 'ok', motivos: [] })
  })
  it.each([
    ['atraso aberto ≥ 15 dias → crítico', async (o) => { await ocorrencia(gestor, await subDireto(o), { tipo: 'ATRASO', dias: 15 }); return null }, null],
  ])('%s', async () => {
    const o = await obraDireta(); const s = await subDireto(o)
    await ocorrencia(gestor, s, { tipo: 'ATRASO', grav: 'baixa', dias: 15 })
    expect(await rpc1(admin, 'sub_painel', { p_id: s })).toMatchObject({ saude: 'critico', motivos: expect.arrayContaining(['Atraso acumulado de 15 dias']) })
  })
  it('atraso aberto de poucos dias → atenção; resolvido deixa de pesar na saúde mas fica no total', async () => {
    const s = await subDireto(await obraDireta())
    const id = await ocorrencia(gestor, s, { tipo: 'ATRASO', grav: 'baixa', dias: 3 })
    expect(await rpc1(admin, 'sub_painel', { p_id: s })).toMatchObject({ saude: 'atencao', motivos: expect.arrayContaining(['Atraso de 3 dias']) })
    await rpc(gestor, 'sub_resolver_ocorrencia', { p_id: id, p_resolucao: 'ok' })
    expect(await rpc1(admin, 'sub_painel', { p_id: s })).toMatchObject({ saude: 'ok', atraso_dias_total: 3 })
  })
  it('prazo vencido sem estar concluída → crítico; termina em breve → atenção; 100 % executado → ok', async () => {
    const o = await obraDireta()
    const v = await subDireto(o, { fim: await dia(-4) }), b = await subDireto(o, { fim: await dia(3) }), c = await subDireto(o, { valor: 100, fim: await dia(-4) })
    await autoDireto(c, 100)
    expect(await rpc1(admin, 'sub_painel', { p_id: v })).toMatchObject({ saude: 'critico', motivos: ['Prazo ultrapassado há 4 dias'] })
    expect(await rpc1(admin, 'sub_painel', { p_id: b })).toMatchObject({ saude: 'atencao', motivos: ['O prazo termina em 3 dias'] })
    expect(await rpc1(admin, 'sub_painel', { p_id: c })).toMatchObject({ saude: 'ok' })
  })
  it('validada e sem auto há mais de 45 dias → atenção', async () => {
    const s = await subDireto(await obraDireta(), { valor: 1000 })
    await autoDireto(s, 100, { data: await dia(-60) })
    expect(await rpc1(admin, 'sub_painel', { p_id: s })).toMatchObject({ saude: 'atencao', dias_sem_auto: 60, motivos: ['Sem auto de medição há 60 dias'] })
  })
  it('painel recusado a quem não vê a obra e a contratações inexistentes', async () => {
    for (const uid of [mecanico, motorista]) await expect(rpc1(uid, 'sub_painel', { p_id: sub })).rejects.toThrow(/não encontrada/)
    await expect(rpc1(admin, 'sub_painel', { p_id: randomUUID() })).rejects.toThrow(/não encontrada/)
  })

  it('subs_resumo: valores, ocorrências abertas, contrato e semáforo; filtra por obra', async () => {
    const l = await rpc(gestor, 'subs_resumo', { p_obra_id: obra })
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ sub_id: sub, obra_id: obra, nome: 'Estruturas Lda', tipo: 'global', estado: 'validado', valor_contrato: '1000.00', executado: '600.00', executado_pct: '60.00',
      atraso_dias_total: 8, ocorrencias_abertas: 2, tem_contrato: false, saude: 'critico' })
    expect(l[0].obra_nome).toBeTruthy()
  })
  it('subs_resumo sem obra devolve todas; arquivadas ficam de fora; mecânico/motorista não vêem', async () => {
    const o = await obraDireta(); const s = await subDireto(o)
    expect((await rpc(admin, 'subs_resumo', {})).map(x => x.sub_id)).toContain(s)
    await sup(`UPDATE public.subempreiteiros SET ativo = false WHERE id = $1`, [s])
    expect((await rpc(admin, 'subs_resumo', {})).map(x => x.sub_id)).not.toContain(s)
    for (const uid of [mecanico, motorista]) expect(await rpc(uid, 'subs_resumo', {})).toEqual([])
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('atividade (eventos)', () => {
  it('contratação criada/validada e auto validado entram na atividade, por qualquer caminho', async () => {
    const o = await obraDireta()
    const s = (await sup(`INSERT INTO public.subempreiteiros (obra_id, nome, tipo, valor_global) VALUES ($1, 'Serralharia', 'global', 5000) RETURNING id`, [o]))[0].id
    await rpc(admin, 'validar_subempreiteiro', { p_id: s })
    const a = (await sup(`INSERT INTO public.autos_medicao (subempreiteiro_id, numero, valor_periodo, workflow) VALUES ($1, 1, 1234.5, 'verificado') RETURNING id`, [s]))[0].id
    await rpc(admin, 'validar_auto', { p_id: a })
    const e = await eventos(o)
    expect(e.map(x => x.tipo).sort()).toEqual(['AUTO_VALIDADO', 'SUB_CONTRATADA', 'SUB_VALIDADA'])
    expect(e.find(x => x.tipo === 'AUTO_VALIDADO').titulo).toBe('Auto n.º 1 validado — Serralharia')
    expect(e.find(x => x.tipo === 'AUTO_VALIDADO').autor_nome).toBe('admin')
  })
  it('lista: mais recente primeiro, com limite e nome do autor; só quem vê a obra', async () => {
    const o = await rpc1(gestor, 'obra_guardar', { p_nome: 'Linha do tempo' })
    await rpc(gestor, 'obra_alocar_colaborador', { p_obra_id: o, p_colaborador_id: colabA })
    await rpc(medicoes, 'obra_registar_afericao', { p_obra_id: o, p_resumo: 'x' })
    const e = await rpc(leitura, 'obra_eventos_lista', { p_obra_id: o, p_limite: 2 })
    expect(e.map(x => x.tipo)).toEqual(['AFERICAO', 'EQUIPA_ALOCADA']); expect(e[0].autor_nome).toBe('eduarda')
    for (const uid of [mecanico, motorista]) expect(await rpc(uid, 'obra_eventos_lista', { p_obra_id: o })).toEqual([])
  })
  it('as tabelas de atividade não se escrevem diretamente', async () => {
    const o = await obraDireta()
    await expect(q(admin, `INSERT INTO public.obra_eventos (obra_id, tipo, titulo) VALUES ($1, 'X', 'Falso')`, [o])).rejects.toThrow(/permission denied/)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('cruzamentos: frota, ferramentas e materiais', () => {
  let obra, outra
  beforeAll(async () => { obra = await obraDireta(); outra = await obraDireta() })
  const viatura = async (o = {}) => (await sup(`INSERT INTO public.comb_veiculos (nome, identificacao, tipo, marca, modelo) VALUES ($1, $2, $3, 'Ford', 'Transit') RETURNING id`,
    [o.nome ?? `Carrinha ${++seq}`, `AA-${seq}`, o.tipo ?? 'viatura']))[0].id
  const entregar = (v, o) => rpc(mecanico, 'entregar_viatura', { p_veiculo_id: v, p_colaborador_id: colabA, p_obra_id: o, p_data: undefined, p_km: 1000, p_combustivel: 'CHEIO',
    p_adblue: 'NA', p_oleo: 'NA', p_refrigeracao: 'NA', p_pneus: 'NA', p_limpeza: 'NA', p_inventario: {}, p_danos: [] })

  it('frota: viatura entregue à obra aparece como atual, com condutor; ao devolver passa a histórico', async () => {
    const v = await viatura(), m = await viatura({ nome: 'Retroescavadora', tipo: 'maquina' }), noutra = await viatura()
    await q(mecanico, `SELECT public.entregar_viatura($1, $2, $3, CURRENT_DATE, 1000, 'CHEIO', 'NA', 'NA', 'NA', 'NA', 'NA', '{}', '[]')`, [v, colabA, obra])
    await q(mecanico, `SELECT public.entregar_viatura($1, $2, $3, CURRENT_DATE, 10, 'CHEIO', 'NA', 'NA', 'NA', 'NA', 'NA', '{}', '[]')`, [m, colabB, obra])
    await q(mecanico, `SELECT public.entregar_viatura($1, $2, $3, CURRENT_DATE, 10, 'CHEIO', 'NA', 'NA', 'NA', 'NA', 'NA', '{}', '[]')`, [noutra, colabB, outra])
    let f = await rpc(leitura, 'obra_frota', { p_obra_id: obra })
    expect(f).toHaveLength(2)
    expect(f.find(x => x.veiculo_id === v)).toMatchObject({ nome: expect.stringContaining('Carrinha'), condutor_nome: 'Rui', atual: true, ehmaquina: false, estado_operacional: 'EM_USO', marca: 'Ford', devolvido_em: null })
    expect(Number(f.find(x => x.veiculo_id === v).km_atual)).toBe(1000)
    expect(f.find(x => x.veiculo_id === m)).toMatchObject({ ehmaquina: true, condutor_nome: 'Ana', atual: true })
    expect((await visao(obra)).viaturas_n).toBe(2)
    await q(mecanico, `SELECT public.devolver_viatura($1, CURRENT_DATE, 1200, 'QUARTO', 'OK', 'OK', 'OK', 'OK', 'OK', '{}', '[]')`, [v])
    f = await rpc(leitura, 'obra_frota', { p_obra_id: obra })
    expect(f).toHaveLength(2)
    expect(f.find(x => x.veiculo_id === v)).toMatchObject({ atual: false, estado_operacional: 'LIVRE' }); expect(f.find(x => x.veiculo_id === v).devolvido_em).not.toBeNull()
    expect(f[0].atual).toBe(true)
    expect((await visao(obra)).viaturas_n).toBe(1)
  })
  it('frota: viatura em uso na obra sem registo de entrega (dados antigos) também aparece', async () => {
    const o = await obraDireta(); const v = await viatura()
    await sup(`UPDATE public.comb_veiculos SET estado_operacional = 'EM_USO', obra_atual_id = $2 WHERE id = $1`, [v, o])
    const f = await rpc(admin, 'obra_frota', { p_obra_id: o })
    expect(f).toHaveLength(1); expect(f[0]).toMatchObject({ veiculo_id: v, atual: true, entregue_em: null })
  })

  it('ferramentas: emprestadas agora e histórico, com dias fora', async () => {
    const o = await obraDireta()
    const ferr = async (nome) => (await sup(`INSERT INTO public.ferramentas (codigo, nome, numero_serie) VALUES ($1, $2, $3) RETURNING id`, [`F-${randomUUID().slice(0, 8)}`, nome, `SN-${++seq}`]))[0].id
    const f1 = await ferr('Berbequim'), f2 = await ferr('Rebarbadora'), f3 = await ferr('Serra')
    const emp = (f, ob, extra) => sup(`INSERT INTO public.emprestimos_ferramentas (ferramenta_id, funcionario_nome, responsavel_entrega, obra_id, data_emprestimo, estado, data_devolucao)
      VALUES ($1, 'Rui', 'Zé', $2, now() - ($3::int * interval '1 day'), $4, $5) RETURNING id`, [f, ob, extra.dias, extra.estado, extra.devol ?? null])
    await emp(f1, o, { dias: 5, estado: 'ativo' })
    await emp(f2, o, { dias: 20, estado: 'devolvido', devol: new Date(Date.now() - 12 * 86400000).toISOString() })
    await emp(f3, outra, { dias: 1, estado: 'ativo' })
    const l = await rpc(leitura, 'obra_ferramentas', { p_obra_id: o })
    expect(l).toHaveLength(2)
    expect(l[0]).toMatchObject({ ferramenta_id: f1, nome: 'Berbequim', colaborador_nome: 'Rui', ativo: true, dias_fora: 5, data_devolucao: null })
    expect(l[1]).toMatchObject({ ferramenta_id: f2, ativo: false, dias_fora: 8 }); expect(l[1].data_devolucao).not.toBeNull()
    expect((await visao(o)).ferramentas_n).toBe(1)
  })

  it('materiais: enviado, devolvido, líquido e valor (reutiliza o armazém)', async () => {
    const o = await obraDireta()
    const mov = (tipo, qtd) => rpc(armazem, 'registar_movimento_armazem', { p_produto_id: produto, p_subtipo: tipo, p_quantidade: qtd, p_responsavel: 'Zé', p_obra_id: o })
    await mov('OBRA', 10); await mov('DEVOLUCAO_OBRA', 4)
    const m = await rpc(leitura, 'obra_materiais', { p_obra_id: o })
    expect(m).toHaveLength(1)
    expect(m[0]).toMatchObject({ produto_id: produto, nome: 'Cimento', unidade: 'saco' })
    expect([m[0].enviado, m[0].devolvido, m[0].liquido, m[0].valor].map(Number)).toEqual([10, 4, 6, 30])
    expect(m[0].ultimo_movimento).toBeTruthy()
    expect(Number((await visao(o)).materiais_valor)).toBe(30)
  })

  it('quem não vê a obra recebe listas vazias dos cruzamentos', async () => {
    for (const uid of [mecanico, motorista])
      for (const fn of ['obra_frota', 'obra_ferramentas', 'obra_materiais']) expect(await rpc(uid, fn, { p_obra_id: obra })).toEqual([])
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('painel e visão', () => {
  const COLUNAS = ['obra_id', 'nome', 'cliente', 'localizacao', 'morada', 'latitude', 'longitude', 'estado', 'data_inicio', 'data_prevista_fim', 'data_fim_real',
    'progresso_pct', 'progresso_fonte', 'progresso_esperado_pct', 'saude', 'motivos', 'orcamento', 'custo_total', 'equipa_n', 'viaturas_n', 'ferramentas_n', 'subs_n',
    'materiais_valor', 'ocorrencias_abertas', 'relatorios_n', 'fotos_n', 'afericoes_n', 'ultimo_relatorio', 'dias_sem_relatorio', 'responsavel_id', 'responsavel_nome',
    'engenheiro_id', 'engenheiro_nome', 'tipo_obra', 'descricao', 'observacoes']

  it('a linha tem exatamente as colunas do contrato, na ordem', async () => {
    const o = await obraDireta()
    expect(Object.keys(await visao(o))).toEqual(COLUNAS)
    const p = await q(admin, `SELECT * FROM public.obras_painel() LIMIT 1`)
    expect(Object.keys(p[0])).toEqual(COLUNAS)
  })

  it('visão completa: cliente, responsável, engenheiro, contagens', async () => {
    const id = await rpc1(gestor, 'obra_guardar', { p_nome: 'Completa', p_cliente: 'Cliente X', p_localizacao: 'Lisboa', p_morada: 'Rua B', p_latitude: 38.7, p_longitude: -9.1,
      p_responsavel_id: colabA, p_engenheiro_id: colabB, p_tipo_obra: 'Reabilitação', p_descricao: 'Desc', p_observacoes: 'Obs', p_orcamento: 1000 })
    await rpc(gestor, 'obra_alocar_colaborador', { p_obra_id: id, p_colaborador_id: colabA })
    await rpc(medicoes, 'obra_adicionar_fotos', { p_obra_id: id, p_fotos: [foto(id, 'galeria')] })
    const v = await visao(id)
    expect(v).toMatchObject({ nome: 'Completa', cliente: 'Cliente X', localizacao: 'Lisboa', morada: 'Rua B', responsavel_nome: 'Rui', engenheiro_nome: 'Ana', tipo_obra: 'Reabilitação',
      descricao: 'Desc', observacoes: 'Obs', equipa_n: 1, fotos_n: 1, subs_n: 0, relatorios_n: 0, afericoes_n: 0, viaturas_n: 0, ferramentas_n: 0, estado: 'ativa' })
    expect(Number(v.latitude)).toBeCloseTo(38.7, 5); expect(Number(v.orcamento)).toBe(1000)
  })

  it('painel: todas as obras não arquivadas, ativas primeiro; arquivadas ficam de fora', async () => {
    const arq = await obraDireta({ nome: 'ZZ arquivada' }); await sup(`UPDATE public.obras SET ativo = false WHERE id = $1`, [arq])
    const conc = await obraDireta({ nome: 'AA concluída', estado: 'concluida' })
    const p = await q(gestor, `SELECT obra_id, estado FROM public.obras_painel()`)
    expect(p.map(x => x.obra_id)).not.toContain(arq); expect(p.map(x => x.obra_id)).toContain(conc)
    const ordem = p.map(x => ({ ativa: 0, planeada: 1, suspensa: 2, concluida: 3 })[x.estado])
    expect(ordem).toEqual([...ordem].sort((a, b) => a - b))
  })

  it('os papéis de leitura vêem; mecânico e motorista não vêem nada', async () => {
    for (const uid of [admin, gestor, medicoes, armazem, leitura, autor]) expect((await q(uid, `SELECT 1 FROM public.obras_painel()`)).length).toBeGreaterThan(0)
    for (const uid of [mecanico, motorista]) {
      expect(await q(uid, `SELECT 1 FROM public.obras_painel()`)).toEqual([])
      const o = await obraDireta()
      await expect(q(uid, `SELECT * FROM public.obra_visao($1)`, [o])).rejects.toThrow(/Obra não encontrada/)
    }
  })

  it('obra_visao de obra inexistente', async () => {
    await expect(q(admin, `SELECT * FROM public.obra_visao($1)`, [randomUUID()])).rejects.toThrow(/Obra não encontrada/)
  })

  it('custo_total reutiliza os custos consolidados (inclui autos validados de subempreiteiros)', async () => {
    const o = await obraDireta(); const s = await subDireto(o); await autoDireto(s, 700)
    expect(Number((await visao(o)).custo_total)).toBe(700)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('armazenamento', () => {
  let obra, outra, sub
  beforeAll(async () => {
    obra = await obraDireta(); outra = await obraDireta(); sub = await subDireto(obra)
    await rpc(admin, 'obra_definir_autores', { p_obra_id: obra, p_user_ids: [autor] })
  })
  const enviar = (uid, nome, bucket = 'obras') => u(uid, tx => tx.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ($1, $2)`, [bucket, nome]))
  const nomeFoto = (o, pasta = 'relatorios', ext = 'jpg') => `${o}/${pasta}/${Date.now()}${++seq}-${randomUUID().slice(0, 8)}.${ext}`
  const nomeContrato = (s = sub, ext = 'pdf') => `${s}/contrato-${Date.now()}${++seq}.${ext}`

  it('os buckets existem com os limites do desenho', async () => {
    const b = await sup(`SELECT id, public, file_size_limit FROM storage.buckets WHERE id IN ('obras', 'obras-contratos') ORDER BY id`)
    expect(b).toEqual([{ id: 'obras', public: true, file_size_limit: 10485760 }, { id: 'obras-contratos', public: false, file_size_limit: 20971520 }].map(x => ({ ...x, file_size_limit: expect.anything() })).map((x, i) => ({ ...x, id: ['obras', 'obras-contratos'][i], public: [true, false][i] })))
    expect(Number(b[0].file_size_limit)).toBe(10 * 1024 * 1024); expect(Number(b[1].file_size_limit)).toBe(20 * 1024 * 1024)
  })

  describe('fotos (bucket obras)', () => {
    it.each(['galeria', 'relatorios', 'afericoes', 'subempreitadas', 'autos'])('admin, gestor, medições e autor designado enviam para %s', async (pasta) => {
      for (const uid of [admin, gestor, medicoes, autor]) await enviar(uid, nomeFoto(obra, pasta))
    })
    it.each(['png', 'jpeg', 'webp', 'heic', 'heif'])('extensão %s aceite', async (ext) => { await enviar(gestor, nomeFoto(obra, 'galeria', ext)) })
    it.each([['armazem', () => armazem], ['leitura', () => leitura], ['mecanico', () => mecanico], ['motorista', () => motorista]])
    ('%s não envia', async (_n, uid) => {
      await expect(enviar(uid(), nomeFoto(obra))).rejects.toThrow(/row-level security/)
    })
    it('o autor designado só envia para a sua obra', async () => {
      await expect(enviar(autor, nomeFoto(outra))).rejects.toThrow(/row-level security/)
    })
    it.each([
      ['pasta inventada', () => nomeFoto(obra, 'outra')],
      ['extensão não permitida', () => nomeFoto(obra, 'galeria', 'gif')],
      ['html disfarçado', () => nomeFoto(obra, 'galeria', 'html')],
      ['nome livre', () => 'qualquer-coisa.jpg'],
      ['obra inexistente', () => nomeFoto(randomUUID())],
      ['caminho com ..', () => `${obra}/galeria/../../${randomUUID()}/galeria/1-ab.jpg`],
      ['sem pasta', () => `${obra}/1-ab.jpg`],
      ['extensão em maiúsculas', () => `${obra}/galeria/1-AB.JPG`],
    ])('recusa %s', async (_n, nome) => {
      await expect(enviar(gestor, nome())).rejects.toThrow(/row-level security/)
    })
    it('só o bucket "obras" aceita estes caminhos; anónimo não envia', async () => {
      await expect(enviar(gestor, nomeFoto(obra), 'armazem')).rejects.toThrow(/row-level security/)
      await expect(anon(tx => tx.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('obras', $1)`, [nomeFoto(obra)]))).rejects.toThrow(/row-level security|permission denied/)
    })
  })

  describe('contratos (bucket privado)', () => {
    it('admin, gestor e medições enviam; os outros não', async () => {
      for (const uid of [admin, gestor, medicoes]) await enviar(uid, nomeContrato(), 'obras-contratos')
      await enviar(gestor, nomeContrato(sub, 'jpg'), 'obras-contratos')
      for (const uid of [armazem, leitura, mecanico, motorista, autor]) await expect(enviar(uid, nomeContrato(), 'obras-contratos')).rejects.toThrow(/row-level security/)
    })
    it.each([
      ['contratação inexistente', () => nomeContrato(randomUUID())],
      ['extensão não permitida', () => nomeContrato(sub, 'exe')],
      ['nome livre', () => `${sub}/qualquer.pdf`],
      ['caminho de foto de obra', () => nomeFoto(obra)],
    ])('recusa %s', async (_n, nome) => {
      await expect(enviar(gestor, nome(), 'obras-contratos')).rejects.toThrow(/row-level security/)
    })
    it('leitura por quem lê obras; mecânico, motorista e anónimo não vêem o ficheiro', async () => {
      const n = nomeContrato(); await sup(`INSERT INTO storage.objects (bucket_id, name) VALUES ('obras-contratos', $1)`, [n])
      const ler = (uid) => q(uid, `SELECT name FROM storage.objects WHERE bucket_id = 'obras-contratos' AND name = $1`, [n])
      for (const uid of [admin, gestor, medicoes, armazem, leitura]) expect(await ler(uid)).toHaveLength(1)
      for (const uid of [mecanico, motorista]) expect(await ler(uid)).toEqual([])
      expect((await anon(tx => tx.query(`SELECT name FROM storage.objects WHERE bucket_id = 'obras-contratos'`))).rows).toEqual([])
    })
    it('remover: só quem escreve subempreitadas', async () => {
      const n = nomeContrato(); await sup(`INSERT INTO storage.objects (bucket_id, name) VALUES ('obras-contratos', $1)`, [n])
      const apagar = (uid) => u(uid, tx => tx.query(`DELETE FROM storage.objects WHERE bucket_id = 'obras-contratos' AND name = $1 RETURNING name`, [n]))
      for (const uid of [leitura, armazem, mecanico]) expect((await apagar(uid)).rows).toEqual([])
      expect((await apagar(medicoes)).rows).toHaveLength(1)
    })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('segurança geral', () => {
  const PUBLICAS = ['pode_gerir_obras', 'pode_medir_obras', 'pode_ler_obras', 'pode_relatar_obra', 'pode_ver_obra', 'obra_adicionar_fotos', 'obra_apagar_foto', 'obra_guardar',
    'obra_alocar_colaborador', 'obra_remover_colaborador', 'obra_equipa_lista', 'obra_guardar_fase', 'obra_apagar_fase', 'obra_registar_afericao', 'obra_definir_autores',
    'obra_autores_lista', 'obra_guardar_relatorio', 'obra_submeter_relatorio', 'obra_reabrir_relatorio', 'obra_relatorios_lista', 'obra_relatorio_detalhe', 'sub_atualizar_ficha',
    'sub_anexar_contrato', 'sub_remover_contrato', 'sub_registar_ocorrencia', 'sub_resolver_ocorrencia', 'auto_guardar_evidencias', 'sub_painel', 'subs_resumo', 'obra_eventos_lista',
    'obras_painel', 'obra_visao', 'obra_frota', 'obra_ferramentas', 'obra_materiais', 'foto_obra_valida', 'contrato_obra_valido']
  const INTERNAS = ['_obra_evento', '_obra_fotos_validar', '_subs_metricas', '_obra_resumos', '_trg_evento_sub', '_trg_evento_auto']

  it('anónimo não executa nenhuma função nova', async () => {
    const r = await sup(`SELECT p.proname FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY($1) AND has_function_privilege('anon', p.oid, 'EXECUTE')`, [[...PUBLICAS, ...INTERNAS]])
    expect(r).toEqual([])
  })
  it('utilizadores autenticados só executam as públicas; as internas ficam fechadas', async () => {
    const aberta = await sup(`SELECT DISTINCT p.proname FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY($1) AND has_function_privilege('authenticated', p.oid, 'EXECUTE')`, [INTERNAS])
    expect(aberta).toEqual([])
    const fechada = await sup(`SELECT DISTINCT p.proname FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY($1) AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')`, [PUBLICAS])
    expect(fechada).toEqual([])
  })
  it('todas as SECURITY DEFINER novas têm search_path fixo', async () => {
    const r = await sup(`SELECT p.proname FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef AND p.proname = ANY($1)
      AND NOT coalesce(p.proconfig::text ILIKE '%search_path%', false)`, [[...PUBLICAS, ...INTERNAS]])
    expect(r).toEqual([])
  })
  it.each(['obra_autores', 'obra_eventos', 'obra_equipa', 'obra_fases', 'obra_afericoes', 'obra_relatorios_diarios', 'obra_fotos', 'sub_ocorrencias'])
  ('tabela %s: sem escrita direta e sem acesso anónimo', async (t) => {
    await expect(q(admin, `INSERT INTO public.${t} DEFAULT VALUES`)).rejects.toThrow(/permission denied/)
    await expect(q(admin, `UPDATE public.${t} SET obra_id = obra_id`)).rejects.toThrow(/permission denied/)
    await expect(q(admin, `DELETE FROM public.${t}`)).rejects.toThrow(/permission denied/)
    await expect(anon(tx => tx.query(`SELECT * FROM public.${t}`))).rejects.toThrow(/permission denied/)
  })
  it('RLS ligada em todas as tabelas novas', async () => {
    const r = await sup(`SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1) AND NOT relrowsecurity`,
      [['obra_autores', 'obra_eventos', 'obra_equipa', 'obra_fases', 'obra_afericoes', 'obra_relatorios_diarios', 'obra_fotos', 'sub_ocorrencias']])
    expect(r).toEqual([])
  })
  it('anónimo não executa as RPCs (amostra)', async () => {
    await expect(anon(tx => tx.query(`SELECT * FROM public.obras_painel()`))).rejects.toThrow(/permission denied/)
    await expect(anon(tx => tx.query(`SELECT public.obra_submeter_relatorio($1)`, [randomUUID()]))).rejects.toThrow(/permission denied/)
    await expect(u(admin, tx => tx.query(`SELECT public._obra_evento($1, 'X', 'x')`, [randomUUID()]))).rejects.toThrow(/permission denied/)
  })
  it('cada papel lê as tabelas novas conforme a regra (leitura vê; mecânico/motorista não)', async () => {
    const o = await obraDireta(); await rpc(gestor, 'obra_alocar_colaborador', { p_obra_id: o, p_colaborador_id: colabB })
    for (const uid of [admin, gestor, medicoes, armazem, leitura]) expect((await q(uid, `SELECT * FROM public.obra_equipa WHERE obra_id = $1`, [o])).length).toBe(1)
    for (const uid of [mecanico, motorista]) expect(await q(uid, `SELECT * FROM public.obra_equipa WHERE obra_id = $1`, [o])).toEqual([])
  })
})
