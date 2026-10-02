// @vitest-environment node
// Controlo de subempreitadas — Migration A (20261004000000) num Postgres real com todas as migrations:
// configuração, orçamento de controlo (EAP), excesso na validação do contrato, documentos legais,
// evidências fotográficas dos autos (hora, hash, GPS, precisão, geofence), armazenamento e grants.
import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID, randomBytes } from 'node:crypto'
import { criarBanco, como } from './pg-harness.mjs'

let db, admin, gestor, medicoes, medicoes2, armazem, leitura, mecanico, motorista, autor, seq = 0

async function utilizador(role, email) {
  const { rows } = await db.query(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [email])
  await db.query(`UPDATE public.profiles SET role = $1, nome = $2 WHERE id = $3`, [role, email.split('@')[0], rows[0].id])
  return rows[0].id
}
const u = (uid, fn) => como(db, { papel: 'authenticated', uid }, fn)
const anon = fn => como(db, { papel: 'anon' }, fn)
const q = async (uid, sql, p = []) => (await u(uid, tx => tx.query(sql, p))).rows
const sup = async (sql, p = []) => (await db.query(sql, p)).rows

async function rpc(uid, nome, args = {}) {
  const ks = Object.keys(args)
  const sql = `SELECT * FROM public.${nome}(${ks.map((k, i) => `${k} => $${i + 1}`).join(', ')})`
  return q(uid, sql, ks.map(k => args[k]))
}
const rpc1 = async (uid, nome, args) => { const r = (await rpc(uid, nome, args))[0]; return r ? Object.values(r)[0] : undefined }
const rm = (uid, nome, args) => expect(rpc(uid, nome, args))

const dia = async (n = 0) => (await sup(`SELECT to_char(public._hoje_pt() + $1::int, 'YYYY-MM-DD') AS d`, [n]))[0].d
const eventos = async (obra) => (await sup(`SELECT tipo, titulo, detalhe FROM public.obra_eventos WHERE obra_id = $1 ORDER BY criado_em`, [obra]))
const auditoria = async (acao, alvo) => sup(`SELECT * FROM public.audit_log WHERE action = $1 AND ($2::uuid IS NULL OR target_id = $2) ORDER BY created_at`, [acao, alvo ?? null])

const LAT = 38.7, LON = -9.14
const M_POR_GRAU = 6371000 * Math.PI / 180
const norte = (m) => Math.round((LAT + m / M_POR_GRAU) * 1e6) / 1e6
function haversine(lat1, lon1, lat2, lon2) {
  const r = g => g * Math.PI / 180
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a)))
}

const obraDireta = async (o = {}) => (await sup(
  `INSERT INTO public.obras (nome, estado, latitude, longitude, geofence_raio_m) VALUES ($1, 'ativa', $2, $3, $4) RETURNING id`,
  [o.nome ?? `Obra ${++seq}`, o.semCoord ? null : LAT, o.semCoord ? null : LON, o.raio ?? null]))[0].id

const subDireto = async (obra, o = {}) => (await sup(
  `INSERT INTO public.subempreiteiros (obra_id, nome, tipo, valor_global, estado) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
  [obra, o.nome ?? `Sub ${++seq}`, o.tipo ?? 'unitario', o.valor ?? null, o.estado ?? 'rascunho']))[0].id

const artigo = async (sub, qtd, o = {}) => (await sup(
  `INSERT INTO public.subempreiteiro_artigos (subempreiteiro_id, descricao, unidade, preco_unitario, quantidade_prevista, orcamento_item_id)
   VALUES ($1, $2, 'm3', $3, $4, $5) RETURNING id`, [sub, o.desc ?? 'Betão', o.preco ?? 10, qtd, o.item ?? null]))[0].id

const item = (uid, obra, o = {}) => rpc1(uid, 'obra_orcamento_guardar_item', {
  p_obra_id: obra, p_id: o.id ?? null, p_codigo: o.codigo ?? `0${++seq % 9 + 1}.${seq}`, p_descricao: o.desc ?? 'Betão C25/30',
  p_unidade: o.un ?? 'm3', p_quantidade: 'qtd' in o ? o.qtd : 100, p_preco_unitario: o.preco ?? 10, p_tolerancia_pct: o.tol ?? 0,
})

const autoDireto = async (sub, o = {}) => (await sup(
  `INSERT INTO public.autos_medicao (subempreiteiro_id, numero, valor_periodo, estado) VALUES ($1, $2, $3, $4) RETURNING id`,
  [sub, ++seq, o.valor ?? 0, o.estado ?? 'rascunho']))[0].id
const linha = async (auto, art, qtd, preco = 10) => (await sup(
  `INSERT INTO public.auto_linhas (auto_id, artigo_id, descricao, unidade, preco_unitario, quantidade) VALUES ($1, $2, 'L', 'm3', $3, $4) RETURNING id`,
  [auto, art, preco, qtd]))[0].id

const hash = () => randomBytes(32).toString('hex')
const caminhoFoto = (obra, ext = 'jpg') => `${obra}/autos/${Date.now()}${++seq}-${randomUUID().slice(0, 8)}.${ext}`
const minutos = (m) => new Date(Date.now() + m * 60_000).toISOString()

let OBRA_EV
const evidencia = (uid, auto, o = {}) => rpc1(uid, 'auto_registar_evidencia', {
  p_auto_id: auto, p_path: o.path ?? caminhoFoto(o.obra ?? OBRA_EV), p_legenda: o.legenda ?? null,
  p_lat: 'lat' in o ? o.lat : norte(o.m ?? 20), p_lon: 'lon' in o ? o.lon : LON,
  p_precisao_m: 'prec' in o ? o.prec : 10, p_tirada_em: 'tirada' in o ? o.tirada : minutos(-1),
  p_hash: o.hash ?? hash(), p_linha_id: o.linha ?? null,
})

const docPath = (sub, ext = 'pdf', pref = 'doc') => `${sub}/${pref}-${Date.now()}${++seq}.${ext}`
const doc = (uid, sub, o = {}) => rpc1(uid, 'sub_doc_registar', {
  p_sub_id: sub, p_tipo: o.tipo ?? 'CERT_SS', p_referencia: 'ref' in o ? o.ref : 'REF-1', p_emitido_em: o.emitido ?? null,
  p_validade: o.validade ?? null, p_path: o.path ?? docPath(sub), p_nome: 'nome' in o ? o.nome : 'certidao.pdf',
})
const docsEstado = async (sub, uid = leitura) => rpc(uid, 'sub_docs_estado', { p_sub_id: sub })
const bloqueio = async (sub) => (await sup(`SELECT public._sub_docs_bloqueio($1) AS b`, [sub]))[0].b

beforeAll(async () => {
  db = await criarBanco()
  admin     = await utilizador('admin', 'admin@t.pt')
  gestor    = await utilizador('gestor', 'gestor@t.pt')
  medicoes  = await utilizador('medicoes', 'eduarda@t.pt')
  medicoes2 = await utilizador('medicoes', 'joana@t.pt')
  armazem   = await utilizador('armazem', 'arm@t.pt')
  leitura   = await utilizador('leitura', 'lei@t.pt')
  mecanico  = await utilizador('mecanico', 'carlos@t.pt')
  motorista = await utilizador('motorista', 'mot@t.pt')
  autor     = await utilizador('armazem', 'autor@t.pt')
  OBRA_EV = await obraDireta({ nome: 'Obra das evidências' })
}, 120_000)

const NAO_LEEM = [['mecanico', () => mecanico], ['motorista', () => motorista]]
const SO_LEEM = [['armazem', () => armazem], ['leitura', () => leitura], ['mecanico', () => mecanico], ['motorista', () => motorista], ['autor designado', () => autor]]

// ───────────────────────────────────────────────────────────────────────────
describe('subs_config', () => {
  it.each([['admin', () => admin], ['gestor', () => gestor], ['medicoes', () => medicoes], ['armazem', () => armazem], ['leitura', () => leitura]])
  ('%s lê a configuração por omissão do desenho', async (_n, uid) => {
    const c = (await rpc(uid(), 'subs_config_ler'))[0]
    expect(c).toMatchObject({ id: true, prazo_pagamento_dias: 30, docs_obrigatorios: ['CERT_SS', 'CERT_AT', 'SEGURO_AT', 'ALVARA'],
      bloquear_pagamento_sem_docs: true, exigir_fatura_para_pagar: true, aviso_validade_dias: 30, raio_padrao_m: 300,
      precisao_max_m: 50, foto_idade_max_min: 120, min_fotos_verificacao: 2 })
    expect(Number(c.retencao_padrao_pct)).toBe(5); expect(Number(c.alcada_gestor_ate)).toBe(10000)
    expect(c.checklist_padrao).toHaveLength(5)
    expect(c.checklist_padrao[0]).toBe('Execução conforme projeto e caderno de encargos')
  })

  it.each(NAO_LEEM)('%s não lê a configuração (RPC nem tabela)', async (_n, uid) => {
    await rm(uid(), 'subs_config_ler').rejects.toThrow(/Sem permissão/)
    expect(await q(uid(), `SELECT * FROM public.subs_config`)).toEqual([])
  })

  it.each([['gestor', () => gestor], ['medicoes', () => medicoes], ['leitura', () => leitura], ['mecanico', () => mecanico]])
  ('%s não altera a configuração', async (_n, uid) => {
    await rm(uid(), 'subs_config_guardar', { p_cfg: { raio_padrao_m: 500 } }).rejects.toThrow(/Só o administrador/)
  })

  it('o admin altera só os campos enviados, fica registado (audit_log) e pode repor', async () => {
    await rpc(admin, 'subs_config_guardar', { p_cfg: { raio_padrao_m: 450, docs_obrigatorios: ['CERT_SS'], checklist_padrao: ['  Item único  '], alcada_gestor_ate: 25000.5 } })
    const c = (await rpc(gestor, 'subs_config_ler'))[0]
    expect(c).toMatchObject({ raio_padrao_m: 450, docs_obrigatorios: ['CERT_SS'], checklist_padrao: ['Item único'], prazo_pagamento_dias: 30, atualizado_por: admin })
    expect(Number(c.alcada_gestor_ate)).toBe(25000.5)
    const a = (await auditoria('subs_config_guardar')).at(-1)
    expect(a.actor_id).toBe(admin); expect(a.details.antes.raio_padrao_m).toBe(300); expect(a.details.depois.raio_padrao_m).toBe(450)
    await rpc(admin, 'subs_config_guardar', { p_cfg: { raio_padrao_m: 300, alcada_gestor_ate: 10000, docs_obrigatorios: ['CERT_SS', 'CERT_AT', 'SEGURO_AT', 'ALVARA'],
      checklist_padrao: ['Execução conforme projeto e caderno de encargos', 'Quantidades confirmadas em obra', 'Qualidade do acabamento / ensaios, quando aplicável',
        'Segurança: EPI e proteções coletivas', 'Limpeza e arrumação da frente de trabalho'] } })
    expect((await rpc(admin, 'subs_config_ler'))[0].raio_padrao_m).toBe(300)
  })

  it.each([
    ['campo desconhecido', { raio: 1 }, /Campo de configuração desconhecido: raio/],
    ['não é objeto', [1, 2], /Configuração inválida/],
    ['retenção acima de 20', { retencao_padrao_pct: 21 }, /retenção padrão/],
    ['prazo negativo', { prazo_pagamento_dias: -1 }, /prazo de pagamento/],
    ['alçada negativa', { alcada_gestor_ate: -5 }, /alçada do gestor/],
    ['tipo de documento inventado', { docs_obrigatorios: ['CND'] }, /Tipo de documento obrigatório inválido/],
    ['documentos repetidos', { docs_obrigatorios: ['CERT_SS', 'CERT_SS'] }, /repetidos/],
    ['documentos que não são lista', { docs_obrigatorios: 'CERT_SS' }, /têm de ser uma lista/],
    ['aviso acima de 365', { aviso_validade_dias: 400 }, /aviso de validade/],
    ['raio de 5 m', { raio_padrao_m: 5 }, /raio padrão/],
    ['precisão de 2 km', { precisao_max_m: 2000 }, /precisão máxima/],
    ['idade de 2 min', { foto_idade_max_min: 2 }, /idade máxima/],
    ['mínimo de fotos 21', { min_fotos_verificacao: 21 }, /mínimo de fotografias/],
    ['lista de verificação vazia', { checklist_padrao: [] }, /entre 1 e 30 itens/],
    ['item da lista em branco', { checklist_padrao: ['ok', ' '] }, /Cada item/],
    ['item da lista que não é texto', { checklist_padrao: [1] }, /Cada item/],
    ['regra de pagamento nula', { exigir_fatura_para_pagar: null }, /sim ou não/],
    ['número escrito em texto', { raio_padrao_m: 'trezentos' }, /Valor inválido/],
  ])('recusa %s', async (_n, cfg, erro) => {
    await rm(admin, 'subs_config_guardar', { p_cfg: cfg }).rejects.toThrow(erro)
  })

  it('a base de dados também recusa valores fora dos limites e uma segunda linha', async () => {
    await expect(sup(`UPDATE public.subs_config SET raio_padrao_m = 1`)).rejects.toThrow(/ck_subs_cfg_raio/)
    await expect(sup(`INSERT INTO public.subs_config (id) VALUES (false)`)).rejects.toThrow(/check/i)
    await expect(sup(`INSERT INTO public.subs_config (id) VALUES (true)`)).rejects.toThrow(/duplicate|única|unique/i)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('orçamento de controlo (EAP)', () => {
  let obra
  beforeAll(async () => {
    obra = await obraDireta()
    await rpc(admin, 'obra_definir_autores', { p_obra_id: obra, p_user_ids: [autor] })
  })

  it('o gestor cria, o admin edita; fica na atividade', async () => {
    const id = await item(gestor, obra, { codigo: '01.01', desc: 'Escavação', un: 'm3', qtd: 120.5, preco: 8.25, tol: 5 })
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    const r = (await sup(`SELECT * FROM public.obra_orcamento_itens WHERE id = $1`, [id]))[0]
    expect(r).toMatchObject({ obra_id: obra, codigo: '01.01', descricao: 'Escavação', unidade: 'm3', ativo: true })
    expect([Number(r.quantidade), Number(r.preco_unitario), Number(r.tolerancia_pct)]).toEqual([120.5, 8.25, 5])
    expect(await item(admin, obra, { id, codigo: '01.02', desc: 'Escavação em vala', qtd: 130 })).toBe(id)
    expect((await sup(`SELECT codigo, quantidade FROM public.obra_orcamento_itens WHERE id = $1`, [id]))[0]).toEqual({ codigo: '01.02', quantidade: '130.000' })
    const ev = (await eventos(obra)).filter(e => e.tipo === 'ORCAMENTO_ITEM')
    expect(ev.map(e => e.titulo)).toEqual(['Item de orçamento criado: 01.01', 'Item de orçamento atualizado: 01.02'])
  })

  it.each([['medicoes', () => medicoes], ...SO_LEEM])('%s não cria, edita nem apaga itens', async (_n, uid) => {
    await expect(item(uid(), obra)).rejects.toThrow(/Sem permissão/)
    const id = await item(gestor, obra)
    await expect(item(uid(), obra, { id })).rejects.toThrow(/Sem permissão/)
    await rm(uid(), 'obra_orcamento_apagar_item', { p_id: id }).rejects.toThrow(/Sem permissão/)
  })

  it.each([
    ['código vazio', { codigo: ' ' }, /Indique o código/],
    ['código com pontos seguidos', { codigo: '02..1' }, /Código EAP inválido/],
    ['código com espaços', { codigo: '02 1' }, /Código EAP inválido/],
    ['descrição vazia', { desc: '' }, /Indique a descrição/],
    ['descrição enorme', { desc: 'x'.repeat(301) }, /demasiado longa/],
    ['unidade vazia', { un: '  ' }, /unidade/],
    ['quantidade negativa', { qtd: -1 }, /Quantidade inválida/],
    ['quantidade em falta', { qtd: null }, /Quantidade inválida/],
    ['preço negativo', { preco: -0.01 }, /Preço unitário inválido/],
    ['tolerância de 21 %', { tol: 21 }, /tolerância/],
    ['tolerância negativa', { tol: -1 }, /tolerância/],
  ])('recusa %s', async (_n, o, erro) => {
    await expect(item(gestor, obra, { codigo: o.codigo ?? '09.99', ...o })).rejects.toThrow(erro)
  })

  it('código repetido na obra é recusado, mas pode repetir-se noutra obra', async () => {
    await item(gestor, obra, { codigo: '05.01' })
    await expect(item(gestor, obra, { codigo: '05.01' })).rejects.toThrow(/Já existe um item com o código 05.01/)
    expect(await item(gestor, await obraDireta(), { codigo: '05.01' })).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('obra inexistente e item de outra obra', async () => {
    await expect(item(gestor, randomUUID())).rejects.toThrow(/Obra não encontrada/)
    const outro = await item(gestor, await obraDireta())
    await expect(item(gestor, obra, { id: outro })).rejects.toThrow(/Item de orçamento não encontrado/)
  })

  it('apagar: recusado com artigos ligados; sem artigos apaga e fica no audit_log', async () => {
    const ligado = await item(gestor, obra)
    const sub = await subDireto(obra); await artigo(sub, 1, { item: ligado })
    await rm(gestor, 'obra_orcamento_apagar_item', { p_id: ligado }).rejects.toThrow(/artigos de contratos ligados/)
    const livre = await item(gestor, obra, { codigo: '07.07' })
    await rpc(gestor, 'obra_orcamento_apagar_item', { p_id: livre })
    expect(await sup(`SELECT 1 FROM public.obra_orcamento_itens WHERE id = $1`, [livre])).toEqual([])
    expect((await auditoria('obra_orcamento_apagar_item', livre))[0].details.codigo).toBe('07.07')
    expect((await eventos(obra)).map(e => e.titulo)).toContain('Item de orçamento apagado: 07.07')
    await rm(gestor, 'obra_orcamento_apagar_item', { p_id: livre }).rejects.toThrow(/não encontrado/)
  })

  describe('resumo', () => {
    let o, iA, iB, iC, iD
    beforeAll(async () => {
      o = await obraDireta()
      await rpc(admin, 'obra_definir_autores', { p_obra_id: o, p_user_ids: [autor] })
      iA = await item(gestor, o, { codigo: '01.01', desc: 'Betão', qtd: 100, preco: 10 })
      iB = await item(gestor, o, { codigo: '01.02', desc: 'Cofragem', qtd: 50, preco: 4 })
      iC = await item(gestor, o, { codigo: '02.01', desc: 'Reboco', qtd: 0, preco: 3 })
      iD = await item(gestor, o, { codigo: '02.02', desc: 'Pintura', qtd: 10, preco: 2, tol: 10 })
      const subV = await subDireto(o)
      const artA = await artigo(subV, 60, { item: iA, preco: 12 })
      const artB = await artigo(subV, 45, { item: iB, preco: 5 })
      await artigo(subV, 10.5, { item: iD, preco: 2 })
      await rpc(admin, 'validar_subempreiteiro', { p_id: subV })
      const subR = await subDireto(o); await artigo(subR, 30, { item: iA })
      const autoV = await autoDireto(subV, { estado: 'validado' }); await linha(autoV, artA, 20, 12); await linha(autoV, artB, 5, 5)
      const autoR = await autoDireto(subV); await linha(autoR, artA, 7, 12)
      // reduzir o orçado depois de contratado é permitido e passa a "excedido"
      await item(gestor, o, { id: iD, codigo: '02.02', desc: 'Pintura', qtd: 9, preco: 2, tol: 10 })
    })

    it('valores exatos por item: orçado × contratado (validados) × medido (autos validados), saldo, % e estado', async () => {
      const r = await rpc(leitura, 'obra_orcamento_resumo', { p_obra_id: o })
      expect(r.map(x => x.codigo)).toEqual(['01.01', '01.02', '02.01', '02.02'])
      const n = x => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v]))
      expect(n(r[0])).toMatchObject({ item_id: iA, descricao: 'Betão', unidade: 'm3', orcado_qtd: 100, orcado_valor: 1000, contratado_qtd: 60, contratado_valor: 720,
        medido_qtd: 20, medido_valor: 240, saldo_qtd: 40, saldo_valor: 280, perc_contratado: 60, perc_medido: 20, n_artigos: 2, estado: 'ok' })
      expect(n(r[1])).toMatchObject({ orcado_valor: 200, contratado_qtd: 45, contratado_valor: 225, medido_qtd: 5, medido_valor: 25, saldo_valor: -25, perc_contratado: 90, estado: 'atencao' })
      expect(n(r[2])).toMatchObject({ orcado_qtd: 0, contratado_qtd: 0, perc_contratado: null, perc_medido: null, n_artigos: 0, estado: 'ok' })
      expect(n(r[3])).toMatchObject({ orcado_qtd: 9, contratado_qtd: 10.5, estado: 'excedido' })
    })

    it('o autor designado vê; mecânico e motorista não (RPC nem tabela)', async () => {
      expect(await rpc(autor, 'obra_orcamento_resumo', { p_obra_id: o })).toHaveLength(4)
      expect(await q(autor, `SELECT id FROM public.obra_orcamento_itens WHERE obra_id = $1`, [o])).toHaveLength(4)
      for (const uid of [mecanico, motorista]) {
        await rm(uid, 'obra_orcamento_resumo', { p_obra_id: o }).rejects.toThrow(/Obra não encontrada/)
        expect(await q(uid, `SELECT id FROM public.obra_orcamento_itens WHERE obra_id = $1`, [o])).toEqual([])
      }
      await rm(leitura, 'obra_orcamento_resumo', { p_obra_id: randomUUID() }).rejects.toThrow(/Obra não encontrada/)
    })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('artigos ligados à EAP', () => {
  let obra, outra, iObra, iOutra, sub
  beforeAll(async () => {
    obra = await obraDireta(); outra = await obraDireta()
    iObra = await item(gestor, obra); iOutra = await item(gestor, outra)
    sub = await subDireto(obra)
  })
  const inserir = (uid, it) => q(uid, `INSERT INTO public.subempreiteiro_artigos (subempreiteiro_id, descricao, unidade, preco_unitario, quantidade_prevista, orcamento_item_id)
    VALUES ($1, 'Betão', 'm3', 10, 5, $2) RETURNING id`, [sub, it])

  it('medições liga um artigo (escrita direta em rascunho) a um item da mesma obra', async () => {
    const [{ id }] = await inserir(medicoes, iObra)
    expect((await sup(`SELECT orcamento_item_id FROM public.subempreiteiro_artigos WHERE id = $1`, [id]))[0].orcamento_item_id).toBe(iObra)
  })
  it('recusa um item de outra obra, ao criar e ao mudar', async () => {
    await expect(inserir(medicoes, iOutra)).rejects.toThrow(/pertencer à obra da contratação/)
    const [{ id }] = await inserir(medicoes, null)
    await expect(q(medicoes, `UPDATE public.subempreiteiro_artigos SET orcamento_item_id = $2 WHERE id = $1`, [id, iOutra])).rejects.toThrow(/pertencer à obra da contratação/)
    await q(medicoes, `UPDATE public.subempreiteiro_artigos SET orcamento_item_id = $2 WHERE id = $1`, [id, iObra])
    await expect(inserir(medicoes, randomUUID())).rejects.toThrow(/pertencer à obra da contratação/)
  })
  it('não deixa mudar a obra de uma contratação com artigos ligados', async () => {
    await expect(q(medicoes, `UPDATE public.subempreiteiros SET obra_id = $2 WHERE id = $1`, [sub, outra])).rejects.toThrow(/Não é possível mudar a obra/)
    const s2 = await subDireto(obra); await artigo(s2, 1)
    await q(medicoes, `UPDATE public.subempreiteiros SET obra_id = $2 WHERE id = $1`, [s2, outra])
  })
  it('leitura e armazém não ligam artigos (RLS)', async () => {
    for (const uid of [leitura, armazem]) await expect(inserir(uid, iObra)).rejects.toThrow(/row-level security/)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('validar_subempreiteiro: bloqueio de excesso de orçamento', () => {
  let obra
  beforeAll(async () => { obra = await obraDireta() })
  const validar = (uid, id) => rpc(uid, 'validar_subempreiteiro', { p_id: id })

  it('dentro do orçado valida e regista no audit_log', async () => {
    const it1 = await item(gestor, obra, { codigo: '10.01', qtd: 100 })
    const s = await subDireto(obra); await artigo(s, 100, { item: it1 })
    const r = (await validar(admin, s))[0]
    expect(r).toMatchObject({ id: s, estado: 'validado', validado_por: admin })
    expect(await auditoria('validar_subempreiteiro', s)).toHaveLength(1)
  })

  it('acima do orçado recusa com a mensagem do desenho e não valida', async () => {
    const it1 = await item(gestor, obra, { codigo: '10.02', qtd: 100 })
    const s = await subDireto(obra); await artigo(s, 120, { item: it1 })
    await expect(validar(admin, s)).rejects.toThrow('Excede o orçamento de controlo em 10.02: contratado 120, orçado 100')
    expect((await sup(`SELECT estado FROM public.subempreiteiros WHERE id = $1`, [s]))[0].estado).toBe('rascunho')
  })

  it.each([[110, true], [110.001, false]])('tolerância de 10 %%: contratar %s de 100 → aceite=%s', async (qtd, ok) => {
    const it1 = await item(gestor, obra, { codigo: `11.${++seq}`, qtd: 100, tol: 10 })
    const s = await subDireto(obra); await artigo(s, qtd, { item: it1 })
    if (ok) expect((await validar(admin, s))[0].estado).toBe('validado')
    else await expect(validar(admin, s)).rejects.toThrow(/Excede o orçamento de controlo em 11\.\d+: contratado 110.001, orçado 100/)
  })

  it('soma contratos validados (mesmo arquivados) + este; rascunhos de outros não contam', async () => {
    const it1 = await item(gestor, obra, { codigo: '12.01', qtd: 100 })
    const a = await subDireto(obra); await artigo(a, 70, { item: it1 }); await validar(admin, a)
    await sup(`UPDATE public.subempreiteiros SET ativo = false WHERE id = $1`, [a])
    const rasc = await subDireto(obra); await artigo(rasc, 500, { item: it1 })
    const b = await subDireto(obra); await artigo(b, 20, { item: it1 }); await artigo(b, 15, { item: it1 })
    await expect(validar(admin, b)).rejects.toThrow('Excede o orçamento de controlo em 12.01: contratado 105, orçado 100')
    const c = await subDireto(obra); await artigo(c, 30, { item: it1 })
    expect((await validar(admin, c))[0].estado).toBe('validado')
  })

  it('verifica cada item ligado e indica o primeiro excedido por código', async () => {
    const ok = await item(gestor, obra, { codigo: '13.01', qtd: 10 }); const mau = await item(gestor, obra, { codigo: '13.02', qtd: 10 })
    const s = await subDireto(obra); await artigo(s, 5, { item: ok }); await artigo(s, 11, { item: mau })
    await expect(validar(admin, s)).rejects.toThrow('Excede o orçamento de controlo em 13.02: contratado 11, orçado 10')
  })

  it('artigos sem ligação à EAP continuam a ser aceites (dados antigos)', async () => {
    const s = await subDireto(obra); await artigo(s, 99999)
    expect((await validar(admin, s))[0].estado).toBe('validado')
  })

  it('mantém as regras antigas: só admin, valor global, artigos, já validada, inexistente', async () => {
    const s = await subDireto(obra); await artigo(s, 1)
    for (const uid of [gestor, medicoes, leitura]) await expect(validar(uid, s)).rejects.toThrow(/Apenas administradores/)
    await expect(validar(admin, await subDireto(obra, { tipo: 'global', valor: null }))).rejects.toThrow(/Defina o valor acordado/)
    await expect(validar(admin, await subDireto(obra))).rejects.toThrow(/Adicione pelo menos um artigo/)
    await validar(admin, s)
    await expect(validar(admin, s)).rejects.toThrow(/já está validada/)
    await expect(validar(admin, randomUUID())).rejects.toThrow(/Contratação não encontrada/)
    await expect(anon(tx => tx.query(`SELECT public.validar_subempreiteiro($1)`, [s]))).rejects.toThrow(/permission denied/)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('documentos do subempreiteiro', () => {
  let obra, sub
  beforeAll(async () => {
    obra = await obraDireta(); sub = await subDireto(obra, { nome: 'Pladur Lda' })
    await rpc(admin, 'obra_definir_autores', { p_obra_id: obra, p_user_ids: [autor] })
  })

  it.each([['admin', () => admin], ['gestor', () => gestor], ['medicoes', () => medicoes]])('%s regista um documento; fica na atividade', async (_n, uid) => {
    const s = await subDireto(obra, { nome: 'Doc Lda' })
    const v = await dia(400)
    const id = await doc(uid(), s, { tipo: 'CERT_AT', ref: ' AT-123 ', emitido: await dia(-1), validade: v })
    const d = (await sup(`SELECT *, validade::text AS v FROM public.sub_documentos WHERE id = $1`, [id]))[0]
    expect(d).toMatchObject({ subempreiteiro_id: s, tipo: 'CERT_AT', referencia: 'AT-123', nome: 'certidao.pdf', criado_por: uid(), v })
    const e = (await eventos(obra)).filter(x => x.tipo === 'SUB_DOC').at(-1)
    expect(e.titulo).toBe('Documento CERT_AT registado — Doc Lda'); expect(e.detalhe).toMatch(/^Válido até \d{2}\/\d{2}\/\d{4}$/)
  })

  it.each(SO_LEEM)('%s não regista documentos', async (_n, uid) => {
    await expect(doc(uid(), sub)).rejects.toThrow(/Sem permissão/)
  })

  it.each([
    ['tipo inventado', { tipo: 'CND' }, /Tipo de documento inválido/],
    ['caminho de outra contratação', () => ({ path: docPath(randomUUID()) }), /Ficheiro do documento inválido/],
    ['caminho de contrato', () => ({ path: docPath(sub, 'pdf', 'contrato') }), /Ficheiro do documento inválido/],
    ['caminho de fatura', () => ({ path: docPath(sub, 'pdf', 'fatura') }), /Ficheiro do documento inválido/],
    ['extensão não permitida', () => ({ path: docPath(sub, 'exe') }), /Ficheiro do documento inválido/],
    ['caminho com ..', () => ({ path: `${sub}/../doc-1.pdf` }), /Ficheiro do documento inválido/],
    ['nome do ficheiro vazio', { nome: ' ' }, /nome do ficheiro/],
    ['referência enorme', { ref: 'x'.repeat(101) }, /referência é demasiado longa/],
    ['OUTRO sem referência', { tipo: 'OUTRO', ref: null }, /Descreva o documento/],
    ['emissão futura', async () => ({ emitido: await dia(1) }), /emissão não pode ser futura/],
    ['validade antes da emissão', async () => ({ emitido: await dia(-5), validade: await dia(-6) }), /validade não pode ser anterior/],
  ])('recusa %s', async (_n, o, erro) => {
    const a = typeof o === 'function' ? await o() : o
    await expect(doc(gestor, sub, a)).rejects.toThrow(erro)
  })

  it('o mesmo ficheiro não se regista duas vezes; contratação inexistente', async () => {
    const p = docPath(sub)
    await doc(gestor, sub, { path: p })
    await expect(doc(gestor, sub, { path: p })).rejects.toThrow(/já foi registado/)
    await expect(doc(gestor, randomUUID())).rejects.toThrow(/Contratação não encontrada/)
  })

  it('sem documentos: os 4 obrigatórios do desenho em falta (e bloqueiam)', async () => {
    const s = await subDireto(obra)
    const e = await docsEstado(s)
    expect(e.map(x => [x.tipo, x.obrigatorio, x.estado, x.doc_id])).toEqual([
      ['CERT_SS', true, 'em_falta', null], ['CERT_AT', true, 'em_falta', null], ['SEGURO_AT', true, 'em_falta', null], ['ALVARA', true, 'em_falta', null]])
    expect(await bloqueio(s)).toEqual(['CERT_SS', 'CERT_AT', 'SEGURO_AT', 'ALVARA'])
  })

  it('cada estado: ok, a expirar (≤ 30 dias, o próprio dia inclusive), expirado, sem validade = ok; não obrigatório aparece no fim', async () => {
    const s = await subDireto(obra)
    const ss = await doc(gestor, s, { tipo: 'CERT_SS', validade: await dia(31) })
    await doc(gestor, s, { tipo: 'CERT_AT', validade: await dia(0) })
    await doc(gestor, s, { tipo: 'SEGURO_AT', validade: await dia(-1) })
    await doc(gestor, s, { tipo: 'ALVARA' })
    await doc(gestor, s, { tipo: 'SEGURO_RC', validade: await dia(30), ref: 'RC-9' })
    const e = await docsEstado(s)
    expect(e.map(x => [x.tipo, x.obrigatorio, x.estado, x.dias_restantes])).toEqual([
      ['CERT_SS', true, 'ok', 31], ['CERT_AT', true, 'a_expirar', 0], ['SEGURO_AT', true, 'expirado', -1], ['ALVARA', true, 'ok', null], ['SEGURO_RC', false, 'a_expirar', 30]])
    expect(e[0].doc_id).toBe(ss); expect(e[4].referencia).toBe('RC-9')
    expect(await bloqueio(s)).toEqual(['SEGURO_AT'])
  })

  it('conta o mais recente por tipo: maior data de emissão, desempate pela data de registo', async () => {
    const s = await subDireto(obra)
    await doc(gestor, s, { tipo: 'CERT_SS', emitido: await dia(-10), validade: await dia(-1) })
    await doc(gestor, s, { tipo: 'CERT_SS', emitido: await dia(-40), validade: await dia(100) })
    expect((await docsEstado(s))[0].estado).toBe('expirado')
    await doc(gestor, s, { tipo: 'CERT_SS', emitido: await dia(-10), validade: await dia(200) })
    const e = (await docsEstado(s))[0]
    expect([e.estado, e.dias_restantes]).toEqual(['ok', 200])
    await doc(gestor, s, { tipo: 'CERT_AT', validade: await dia(5) })
    await doc(gestor, s, { tipo: 'CERT_AT', emitido: await dia(-400), validade: await dia(-300) })
    expect((await docsEstado(s))[1].estado).toBe('expirado')
  })

  it('obrigatórios e aviso vêm da configuração', async () => {
    const s = await subDireto(obra)
    await doc(gestor, s, { tipo: 'CERT_SS', validade: await dia(20) })
    await rpc(admin, 'subs_config_guardar', { p_cfg: { docs_obrigatorios: ['CERT_SS', 'SEGURO_RC'], aviso_validade_dias: 10 } })
    try {
      const e = await docsEstado(s)
      expect(e.map(x => [x.tipo, x.estado])).toEqual([['CERT_SS', 'ok'], ['SEGURO_RC', 'em_falta']])
      expect(await bloqueio(s)).toEqual(['SEGURO_RC'])
    } finally {
      await rpc(admin, 'subs_config_guardar', { p_cfg: { docs_obrigatorios: ['CERT_SS', 'CERT_AT', 'SEGURO_AT', 'ALVARA'], aviso_validade_dias: 30 } })
    }
  })

  it('remover: só gestão; regista no audit_log e na atividade; o estado volta a "em falta"', async () => {
    const s = await subDireto(obra)
    const id = await doc(medicoes, s, { tipo: 'ALVARA' })
    for (const uid of [medicoes, leitura, armazem]) await rm(uid, 'sub_doc_remover', { p_id: id }).rejects.toThrow(/Sem permissão/)
    await rpc(gestor, 'sub_doc_remover', { p_id: id })
    expect(await sup(`SELECT 1 FROM public.sub_documentos WHERE id = $1`, [id])).toEqual([])
    expect((await auditoria('sub_doc_remover', id))[0].details.tipo).toBe('ALVARA')
    expect((await eventos(obra)).map(e => e.titulo)).toContain(`Documento ALVARA removido — ${(await sup(`SELECT nome FROM public.subempreiteiros WHERE id = $1`, [s]))[0].nome}`)
    expect((await docsEstado(s)).find(x => x.tipo === 'ALVARA').estado).toBe('em_falta')
    await rm(admin, 'sub_doc_remover', { p_id: id }).rejects.toThrow(/Documento não encontrado/)
  })

  it('quem lê obras e o autor designado vêem; mecânico e motorista não (RPC nem tabela)', async () => {
    const s = await subDireto(obra); await doc(gestor, s)
    for (const uid of [admin, gestor, medicoes, armazem, leitura, autor]) {
      expect(await docsEstado(s, uid)).toHaveLength(4)
      expect(await q(uid, `SELECT id FROM public.sub_documentos WHERE subempreiteiro_id = $1`, [s])).toHaveLength(1)
    }
    for (const uid of [mecanico, motorista]) {
      await expect(docsEstado(s, uid)).rejects.toThrow(/Contratação não encontrada/)
      expect(await q(uid, `SELECT id FROM public.sub_documentos WHERE subempreiteiro_id = $1`, [s])).toEqual([])
    }
  })

  it('a base de dados recusa caminho de outra contratação e datas invertidas', async () => {
    await expect(sup(`INSERT INTO public.sub_documentos (subempreiteiro_id, tipo, path) VALUES ($1, 'CERT_SS', $2)`, [sub, docPath(randomUUID())])).rejects.toThrow(/ck_sub_doc_path/)
    await expect(sup(`INSERT INTO public.sub_documentos (subempreiteiro_id, tipo, path, emitido_em, validade) VALUES ($1, 'CERT_SS', $2, '2026-02-01', '2026-01-01')`, [sub, docPath(sub)])).rejects.toThrow(/ck_sub_doc_datas/)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('evidências dos autos', () => {
  let sub, auto
  beforeAll(async () => {
    sub = await subDireto(OBRA_EV, { estado: 'validado' }); auto = await autoDireto(sub)
    await rpc(admin, 'obra_definir_autores', { p_obra_id: OBRA_EV, p_user_ids: [autor] })
  })

  it('dentro da obra: válida, com distância, hora do servidor e autor', async () => {
    const h = hash(); const p = caminhoFoto(OBRA_EV)
    const r = await evidencia(medicoes, auto, { m: 100, prec: 12.5, hash: h, path: p, legenda: ' Parede norte ' })
    const esperado = haversine(norte(100), LON, LAT, LON)
    expect(r).toMatchObject({ valida: true, dentro_obra: true, precisao_ok: true, motivo: null })
    expect(r.distancia_m).toBeCloseTo(esperado, 0)
    const e = (await sup(`SELECT * FROM public.auto_evidencias WHERE id = $1`, [r.id]))[0]
    expect(e).toMatchObject({ auto_id: auto, path: p, legenda: 'Parede norte', hash_sha256: h, valida: true, motivo_invalida: null, autor_id: medicoes, dentro_obra: true })
    expect(Math.abs(new Date(e.enviada_em).getTime() - Date.now())).toBeLessThan(60_000)
  })

  it('o hash é guardado em minúsculas e uma fotografia repetida é recusada (mesmo noutro auto)', async () => {
    const h = hash()
    await evidencia(gestor, auto, { hash: h.toUpperCase() })
    expect((await sup(`SELECT 1 FROM public.auto_evidencias WHERE hash_sha256 = $1`, [h]))).toHaveLength(1)
    await expect(evidencia(medicoes, auto, { hash: h })).rejects.toThrow('Esta fotografia já foi usada noutro registo')
    const outroAuto = await autoDireto(sub)
    await expect(evidencia(admin, outroAuto, { hash: ` ${h} ` })).rejects.toThrow('Esta fotografia já foi usada noutro registo')
  })

  it.each([['abc'], ['g'.repeat(64)], [null]])('hash inválido (%s) recusado', async (h) => {
    await expect(evidencia(medicoes, auto, { hash: h ?? '' })).rejects.toThrow(/SHA-256/)
  })

  it.each([
    ['1 min no futuro (tolerado)', 1, true], ['5 min no futuro', 5, /no futuro/],
    ['119 min de idade', -119, true], ['121 min de idade', -121, /há mais de 120 minutos/],
  ])('hora da fotografia: %s', async (_n, m, res) => {
    const p = evidencia(medicoes, auto, { tirada: minutos(m) })
    if (res === true) expect((await p).valida).toBe(true)
    else await expect(p).rejects.toThrow(res)
  })

  it('a idade máxima da fotografia vem da configuração; sem hora é recusada', async () => {
    await rpc(admin, 'subs_config_guardar', { p_cfg: { foto_idade_max_min: 10 } })
    try {
      await expect(evidencia(medicoes, auto, { tirada: minutos(-30) })).rejects.toThrow(/há mais de 10 minutos/)
      expect((await evidencia(medicoes, auto, { tirada: minutos(-9) })).valida).toBe(true)
    } finally {
      await rpc(admin, 'subs_config_guardar', { p_cfg: { foto_idade_max_min: 120 } })
    }
    await expect(evidencia(medicoes, auto, { tirada: null })).rejects.toThrow(/Indique a hora/)
  })

  it.each([
    ['sem GPS', { lat: null, lon: null }, { valida: false, motivo: 'sem_gps', dentro_obra: null, distancia_m: null }],
    ['sem GPS e sem precisão', { lat: null, lon: null, prec: null }, { valida: false, motivo: 'sem_gps', precisao_ok: null }],
    ['precisão de 51 m', { prec: 51 }, { valida: false, motivo: 'precisao_insuficiente', precisao_ok: false, dentro_obra: true }],
    ['precisão de 50 m (limite)', { prec: 50 }, { valida: true, motivo: null, precisao_ok: true }],
    ['precisão em falta com GPS', { prec: null }, { valida: false, motivo: 'precisao_insuficiente', precisao_ok: null }],
    ['a 290 m (dentro do raio padrão de 300 m)', { m: 290 }, { valida: true, dentro_obra: true }],
    ['a 310 m (fora do raio)', { m: 310 }, { valida: false, motivo: 'fora_do_raio', dentro_obra: false, precisao_ok: true }],
    ['fora do raio e com má precisão → precisão primeiro', { m: 2000, prec: 80 }, { valida: false, motivo: 'precisao_insuficiente', dentro_obra: false }],
  ])('marca (não recusa): %s', async (_n, o, esperado) => {
    expect(await evidencia(medicoes, auto, o)).toMatchObject(esperado)
  })

  it('o raio da obra (geofence_raio_m) prevalece sobre o padrão; o padrão vem da configuração', async () => {
    const o = await obraDireta({ raio: 500 }); const a = await autoDireto(await subDireto(o, { estado: 'validado' }))
    expect(await evidencia(medicoes, a, { obra: o, m: 450 })).toMatchObject({ valida: true, dentro_obra: true })
    expect(await evidencia(medicoes, a, { obra: o, m: 520 })).toMatchObject({ valida: false, motivo: 'fora_do_raio' })
    await rpc(admin, 'subs_config_guardar', { p_cfg: { raio_padrao_m: 1000 } })
    try {
      expect(await evidencia(medicoes, auto, { m: 900 })).toMatchObject({ valida: true })
    } finally {
      await rpc(admin, 'subs_config_guardar', { p_cfg: { raio_padrao_m: 300 } })
    }
  })

  it('no limite exato do raio conta como dentro da obra', async () => {
    const { lat, d } = (await sup(`SELECT lat, public._distancia_m(lat, $2, $1, $2) AS d FROM (
      SELECT round(($1 + g * 0.000001)::numeric, 6) AS lat FROM generate_series(890, 910) g) x
      WHERE public._distancia_m(lat, $2, $1, $2) = trunc(public._distancia_m(lat, $2, $1, $2)) LIMIT 1`, [LAT, LON]))[0]
    const o = await obraDireta({ raio: Number(d) }); const a = await autoDireto(await subDireto(o, { estado: 'validado' }))
    expect(await evidencia(medicoes, a, { obra: o, lat: Number(lat) })).toMatchObject({ valida: true, dentro_obra: true, distancia_m: Number(d) })
  })

  it('obra sem coordenadas: marcada como obra_sem_coordenadas (sem GPS tem prioridade)', async () => {
    const o = await obraDireta({ semCoord: true }); const a = await autoDireto(await subDireto(o, { estado: 'validado' }))
    expect(await evidencia(medicoes, a, { obra: o })).toMatchObject({ valida: false, motivo: 'obra_sem_coordenadas', dentro_obra: null, distancia_m: null })
    expect(await evidencia(medicoes, a, { obra: o, lat: null, lon: null })).toMatchObject({ motivo: 'sem_gps' })
    expect((await sup(`SELECT motivo_invalida FROM public.auto_evidencias e JOIN public.autos_medicao a ON a.id = e.auto_id WHERE a.id = $1 ORDER BY enviada_em`, [a])).map(r => r.motivo_invalida))
      .toEqual(['obra_sem_coordenadas', 'sem_gps'])
  })

  it.each([
    ['de outra obra', () => caminhoFoto(randomUUID())],
    ['noutra pasta', () => `${OBRA_EV}/galeria/1-ab.jpg`],
    ['extensão gif', () => caminhoFoto(OBRA_EV, 'gif')],
    ['em maiúsculas', () => `${OBRA_EV}/autos/1-AB.JPG`],
    ['com ..', () => `${OBRA_EV}/autos/../autos/1-ab.jpg`],
    ['nome livre', () => 'foto.jpg'],
  ])('recusa caminho %s', async (_n, p) => {
    await expect(evidencia(medicoes, auto, { path: p() })).rejects.toThrow(/não pertence aos autos desta obra/)
  })

  it('recusa o mesmo ficheiro duas vezes, coordenadas incompletas ou impossíveis, precisão negativa e legenda longa', async () => {
    const p = caminhoFoto(OBRA_EV); await evidencia(medicoes, auto, { path: p })
    await expect(evidencia(medicoes, auto, { path: p })).rejects.toThrow(/já foi registado/)
    await expect(evidencia(medicoes, auto, { lat: 38.7, lon: null })).rejects.toThrow(/latitude e a longitude/)
    await expect(evidencia(medicoes, auto, { lat: 91, lon: 0 })).rejects.toThrow(/Coordenadas GPS inválidas/)
    await expect(evidencia(medicoes, auto, { prec: -1 })).rejects.toThrow(/Precisão do GPS inválida/)
    await expect(evidencia(medicoes, auto, { legenda: 'x'.repeat(301) })).rejects.toThrow(/legenda/)
  })

  it('pode ligar-se a uma linha do próprio auto, nunca de outro', async () => {
    const art = await artigo(sub, 10)
    const l = await linha(auto, art, 1)
    const r = await evidencia(medicoes, auto, { linha: l })
    expect((await sup(`SELECT linha_id FROM public.auto_evidencias WHERE id = $1`, [r.id]))[0].linha_id).toBe(l)
    const outra = await linha(await autoDireto(sub), art, 1)
    await expect(evidencia(medicoes, auto, { linha: outra })).rejects.toThrow(/não pertence a este auto/)
  })

  it.each(SO_LEEM)('%s não regista evidências', async (_n, uid) => {
    await expect(evidencia(uid(), auto)).rejects.toThrow(/Sem permissão/)
  })

  it('auto validado não aceita evidências; auto inexistente', async () => {
    const a = await autoDireto(sub, { estado: 'validado', valor: 10 })
    await expect(evidencia(admin, a)).rejects.toThrow(/já não aceita evidências/)
    await expect(evidencia(admin, randomUUID())).rejects.toThrow(/Auto não encontrado/)
  })

  it('imutável: ninguém altera, apaga ou insere diretamente (nem o admin)', async () => {
    const r = await evidencia(medicoes, auto)
    await expect(q(admin, `UPDATE public.auto_evidencias SET valida = true WHERE id = $1`, [r.id])).rejects.toThrow(/permission denied/)
    await expect(q(admin, `DELETE FROM public.auto_evidencias WHERE id = $1`, [r.id])).rejects.toThrow(/permission denied/)
    await expect(q(medicoes, `INSERT INTO public.auto_evidencias (auto_id, path, tirada_em, hash_sha256, valida) VALUES ($1, $2, now(), $3, true)`, [auto, caminhoFoto(OBRA_EV), hash()])).rejects.toThrow(/permission denied/)
  })

  it('a base de dados recusa estado incoerente (válida com motivo)', async () => {
    await expect(sup(`INSERT INTO public.auto_evidencias (auto_id, path, tirada_em, hash_sha256, valida, motivo_invalida) VALUES ($1, $2, now(), $3, true, 'sem_gps')`,
      [auto, caminhoFoto(OBRA_EV), hash()])).rejects.toThrow(/ck_auto_evid_valida/)
  })

  describe('apagar', () => {
    it('quem enviou apaga a sua; outro de medições não; o gestor apaga qualquer uma', async () => {
      const a = await autoDireto(sub)
      const r1 = await evidencia(medicoes, a); const r2 = await evidencia(medicoes, a)
      await rm(medicoes2, 'auto_apagar_evidencia', { p_id: r1.id }).rejects.toThrow(/Só quem enviou/)
      await rpc(medicoes, 'auto_apagar_evidencia', { p_id: r1.id })
      await rpc(gestor, 'auto_apagar_evidencia', { p_id: r2.id })
      expect(await sup(`SELECT 1 FROM public.auto_evidencias WHERE auto_id = $1`, [a])).toEqual([])
      await rm(gestor, 'auto_apagar_evidencia', { p_id: r1.id }).rejects.toThrow(/Evidência não encontrada/)
    })
    it('depois de validado não se apaga; leitura não apaga', async () => {
      const a = await autoDireto(sub); const r = await evidencia(medicoes, a)
      await rm(leitura, 'auto_apagar_evidencia', { p_id: r.id }).rejects.toThrow(/Sem permissão/)
      await sup(`UPDATE public.autos_medicao SET estado = 'validado', valor_periodo = 1 WHERE id = $1`, [a])
      await rm(admin, 'auto_apagar_evidencia', { p_id: r.id }).rejects.toThrow(/só podem ser apagadas enquanto o auto está em rascunho/)
    })
    it('apagar o auto em rascunho leva as evidências (cascata)', async () => {
      const a = await autoDireto(sub); await evidencia(medicoes, a)
      await q(medicoes, `DELETE FROM public.autos_medicao WHERE id = $1`, [a])
      expect(await sup(`SELECT 1 FROM public.auto_evidencias WHERE auto_id = $1`, [a])).toEqual([])
    })
  })

  it('com a coluna workflow (Migration B): regista em rascunho/submetido, não em verificado; apaga só em rascunho', async () => {
    await db.transaction(async tx => {
      const tenta = async (sql, p) => {
        await tx.exec('SAVEPOINT s')
        try { const r = await tx.query(sql, p); await tx.exec('RELEASE SAVEPOINT s'); return r.rows[0] } catch (e) { await tx.exec('ROLLBACK TO SAVEPOINT s'); return { erro: e.message } }
      }
      const comoMedicoes = async () => {
        await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true)`, [medicoes])
        await tx.exec('SET LOCAL ROLE authenticated')
      }
      const reg = (a) => tenta(`SELECT public.auto_registar_evidencia($1, $2, NULL, $3, $4, 5, $5, $6) AS r`, [a, caminhoFoto(OBRA_EV), norte(10), LON, minutos(-1), hash()])
      await tx.exec(`ALTER TABLE public.autos_medicao ADD COLUMN workflow text NOT NULL DEFAULT 'rascunho'`)
      const a = (await tx.query(`INSERT INTO public.autos_medicao (subempreiteiro_id, numero, valor_periodo) VALUES ($1, 999999, 0) RETURNING id`, [sub])).rows[0].id

      await comoMedicoes()
      const r1 = await reg(a); expect(r1.r.valida).toBe(true)
      await tx.exec('RESET ROLE'); await tx.query(`UPDATE public.autos_medicao SET workflow = 'submetido' WHERE id = $1`, [a]); await comoMedicoes()
      const r2 = await reg(a); expect(r2.r.valida).toBe(true)
      expect((await tenta(`SELECT public.auto_apagar_evidencia($1)`, [r1.r.id])).erro).toMatch(/enquanto o auto está em rascunho/)
      await tx.exec('RESET ROLE'); await tx.query(`UPDATE public.autos_medicao SET workflow = 'verificado' WHERE id = $1`, [a]); await comoMedicoes()
      expect((await reg(a)).erro).toMatch(/já não aceita evidências/)
      await tx.exec('RESET ROLE'); await tx.query(`UPDATE public.autos_medicao SET workflow = 'rascunho' WHERE id = $1`, [a]); await comoMedicoes()
      expect((await tenta(`SELECT public.auto_apagar_evidencia($1) AS ok`, [r1.r.id])).erro).toBeUndefined()
      await tx.rollback()
    })
    expect((await sup(`SELECT 1 FROM information_schema.columns WHERE table_name = 'autos_medicao' AND column_name = 'workflow'`))).toEqual([])
  })

  it('lista: por ordem de envio; quem lê obras e o autor designado vêem; mecânico/motorista não', async () => {
    const a = await autoDireto(sub)
    const r1 = await evidencia(medicoes, a); const r2 = await evidencia(gestor, a, { lat: null, lon: null })
    for (const uid of [admin, gestor, medicoes, armazem, leitura, autor]) {
      expect((await rpc(uid, 'auto_evidencias_lista', { p_auto_id: a })).map(e => e.id)).toEqual([r1.id, r2.id])
      expect(await q(uid, `SELECT id FROM public.auto_evidencias WHERE auto_id = $1`, [a])).toHaveLength(2)
    }
    for (const uid of [mecanico, motorista]) {
      await rm(uid, 'auto_evidencias_lista', { p_auto_id: a }).rejects.toThrow(/Auto não encontrado/)
      expect(await q(uid, `SELECT id FROM public.auto_evidencias WHERE auto_id = $1`, [a])).toEqual([])
    }
  })

  it('_distancia_m é a haversine (R = 6 371 000 m) arredondada a 0,1 m', async () => {
    for (const [a, b, c, d] of [[38.7, -9.14, 38.71, -9.13], [41.15, -8.61, 38.72, -9.14], [0, 0, 0, 0], [38.7, -9.14, -38.7, 170.86]]) {
      const r = Number((await sup(`SELECT public._distancia_m($1, $2, $3, $4) AS d`, [a, b, c, d]))[0].d)
      expect(r).toBeCloseTo(Math.round(haversine(a, b, c, d) * 10) / 10, 1)
    }
    expect((await sup(`SELECT public._distancia_m(NULL, 1, 2, 3) AS d`))[0].d).toBeNull()
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('armazenamento: bucket privado obras-contratos', () => {
  let obra, sub
  beforeAll(async () => {
    obra = await obraDireta(); sub = await subDireto(obra)
    await rpc(admin, 'obra_definir_autores', { p_obra_id: obra, p_user_ids: [autor] })
  })
  const enviar = (uid, nome) => u(uid, tx => tx.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('obras-contratos', $1)`, [nome]))
  const apagar = (uid, nome) => u(uid, tx => tx.query(`DELETE FROM storage.objects WHERE bucket_id = 'obras-contratos' AND name = $1 RETURNING name`, [nome]))
  const existente = async (nome) => { await sup(`INSERT INTO storage.objects (bucket_id, name) VALUES ('obras-contratos', $1)`, [nome]); return nome }

  it.each(['pdf', 'jpg', 'png', 'heic'])('documentos (doc-*.%s): admin, gestor e medições enviam', async (ext) => {
    for (const uid of [admin, gestor, medicoes]) await enviar(uid, docPath(sub, ext))
  })
  it.each(SO_LEEM)('%s não envia documentos nem faturas', async (_n, uid) => {
    await expect(enviar(uid(), docPath(sub))).rejects.toThrow(/row-level security/)
    await expect(enviar(uid(), docPath(sub, 'pdf', 'fatura'))).rejects.toThrow(/row-level security/)
  })
  it('faturas do subempreiteiro (fatura-*): só admin e gestor guardam', async () => {
    for (const uid of [admin, gestor]) await enviar(uid, docPath(sub, 'pdf', 'fatura'))
    await enviar(gestor, docPath(sub, 'jpg', 'fatura'))
    await expect(enviar(medicoes, docPath(sub, 'pdf', 'fatura'))).rejects.toThrow(/row-level security/)
  })
  it('os contratos continuam a funcionar', async () => {
    await enviar(medicoes, docPath(sub, 'pdf', 'contrato'))
  })
  it.each([
    ['prefixo inventado', () => docPath(sub, 'pdf', 'nota')],
    ['fatura de contratação inexistente', () => docPath(randomUUID(), 'pdf', 'fatura')],
    ['documento de contratação inexistente', () => docPath(randomUUID())],
    ['fatura com extensão exe', () => docPath(sub, 'exe', 'fatura')],
    ['documento sem número', () => `${sub}/doc-.pdf`],
    ['subpasta', () => `${sub}/x/doc-1.pdf`],
  ])('recusa %s', async (_n, nome) => {
    await expect(enviar(admin, nome())).rejects.toThrow(/row-level security/)
  })
  it('apagar: fatura só admin; documento só gestão; contrato quem escreve subempreitadas', async () => {
    const f = await existente(docPath(sub, 'pdf', 'fatura'))
    for (const uid of [gestor, medicoes]) expect((await apagar(uid, f)).rows).toEqual([])
    expect((await apagar(admin, f)).rows).toHaveLength(1)
    const d = await existente(docPath(sub))
    expect((await apagar(medicoes, d)).rows).toEqual([])
    expect((await apagar(gestor, d)).rows).toHaveLength(1)
    const c = await existente(docPath(sub, 'pdf', 'contrato'))
    expect((await apagar(leitura, c)).rows).toEqual([])
    expect((await apagar(medicoes, c)).rows).toHaveLength(1)
  })
  it('leitura: quem lê obras vê faturas e documentos; mecânico, motorista e anónimo não', async () => {
    const f = await existente(docPath(sub, 'pdf', 'fatura'))
    const ler = uid => q(uid, `SELECT name FROM storage.objects WHERE bucket_id = 'obras-contratos' AND name = $1`, [f])
    for (const uid of [admin, gestor, medicoes, armazem, leitura]) expect(await ler(uid)).toHaveLength(1)
    for (const uid of [mecanico, motorista]) expect(await ler(uid)).toEqual([])
    expect((await anon(tx => tx.query(`SELECT name FROM storage.objects WHERE bucket_id = 'obras-contratos'`))).rows).toEqual([])
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('segurança geral', () => {
  const PUBLICAS = ['subs_config_ler', 'subs_config_guardar', 'obra_orcamento_guardar_item', 'obra_orcamento_apagar_item', 'obra_orcamento_resumo',
    'validar_subempreiteiro', 'sub_doc_registar', 'sub_doc_remover', 'sub_docs_estado', 'auto_registar_evidencia', 'auto_apagar_evidencia',
    'auto_evidencias_lista', 'contrato_obra_valido']
  const INTERNAS = ['_subs_cfg', '_trg_artigo_orcamento_obra', '_trg_sub_obra_orcamento', '_sub_docs_estado', '_sub_docs_bloqueio', '_distancia_m', '_auto_workflow']
  const TABELAS = ['subs_config', 'obra_orcamento_itens', 'sub_documentos', 'auto_evidencias']
  const funcs = (sql, nomes) => sup(`SELECT DISTINCT p.proname FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY($1) AND ${sql}`, [nomes])

  it('todas as funções existem', async () => {
    expect((await funcs('true', [...PUBLICAS, ...INTERNAS])).length).toBe(PUBLICAS.length + INTERNAS.length)
  })
  it('anónimo não executa nenhuma função nova', async () => {
    expect(await funcs(`has_function_privilege('anon', p.oid, 'EXECUTE')`, [...PUBLICAS, ...INTERNAS])).toEqual([])
  })
  it('autenticados executam as públicas; as internas ficam fechadas', async () => {
    expect(await funcs(`has_function_privilege('authenticated', p.oid, 'EXECUTE')`, INTERNAS)).toEqual([])
    expect(await funcs(`NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')`, PUBLICAS)).toEqual([])
    await expect(q(admin, `SELECT public._sub_docs_bloqueio($1)`, [randomUUID()])).rejects.toThrow(/permission denied/)
    await expect(q(admin, `SELECT public._distancia_m(1, 1, 1, 1)`)).rejects.toThrow(/permission denied/)
  })
  it('todas as SECURITY DEFINER novas têm search_path fixo', async () => {
    expect(await funcs(`p.prosecdef AND NOT coalesce(p.proconfig::text ILIKE '%search_path%', false)`, [...PUBLICAS, ...INTERNAS])).toEqual([])
    expect(await funcs(`NOT p.prosecdef`, PUBLICAS)).toEqual([])
  })
  it.each(TABELAS)('tabela %s: só SELECT para autenticados, nada para anónimo', async (t) => {
    await expect(q(admin, `INSERT INTO public.${t} DEFAULT VALUES`)).rejects.toThrow(/permission denied/)
    await expect(q(admin, `UPDATE public.${t} SET id = id`)).rejects.toThrow(/permission denied/)
    await expect(q(admin, `DELETE FROM public.${t}`)).rejects.toThrow(/permission denied/)
    await expect(anon(tx => tx.query(`SELECT * FROM public.${t}`))).rejects.toThrow(/permission denied/)
    const r = (await sup(`SELECT has_table_privilege('authenticated', $1, 'SELECT') AS s, has_table_privilege('authenticated', $1, 'INSERT') AS i,
      has_table_privilege('anon', $1, 'SELECT') AS a`, [`public.${t}`]))[0]
    expect(r).toEqual({ s: true, i: false, a: false })
  })
  it('RLS ligada em todas as tabelas novas', async () => {
    expect(await sup(`SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1) AND NOT relrowsecurity`, [TABELAS])).toEqual([])
  })
  it('as políticas novas usam as funções de permissão, nunca auth.jwt()', async () => {
    const r = await sup(`SELECT policyname, qual, with_check FROM pg_policies WHERE (schemaname = 'public' AND tablename = ANY($1))
      OR (schemaname = 'storage' AND policyname IN ('obras_contratos_insert', 'obras_contratos_delete'))`, [TABELAS])
    expect(r).toHaveLength(6)
    for (const p of r) expect(`${p.qual} ${p.with_check}`).not.toMatch(/jwt/)
  })
  it('anónimo não executa as RPCs (amostra)', async () => {
    await expect(anon(tx => tx.query(`SELECT * FROM public.subs_config_ler()`))).rejects.toThrow(/permission denied/)
    await expect(anon(tx => tx.query(`SELECT * FROM public.obra_orcamento_resumo($1)`, [randomUUID()]))).rejects.toThrow(/permission denied/)
    await expect(anon(tx => tx.query(`SELECT public.sub_doc_registar($1, 'CERT_SS')`, [randomUUID()]))).rejects.toThrow(/permission denied/)
  })
})
