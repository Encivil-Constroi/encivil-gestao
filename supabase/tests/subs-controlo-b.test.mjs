// @vitest-environment node
// Controlo de subempreitadas — Migration B (20261004010000) num Postgres real com todas as migrations:
// fluxo do auto (submeter → verificar → aprovar → fatura → pagar), cada pré-condição, alçada, segregação,
// documentos e exceções do admin, glosas, imutabilidade, retenção, métricas sobre o certificado,
// painel do CEO, fluxo de caixa, custos e grants/RLS por papel.
import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { criarBanco, como } from './pg-harness.mjs'

const MIG_B = fileURLToPath(new URL('../migrations/20261004010000_subs_medicao_workflow_glosas_painel.sql', import.meta.url))

let db, admin, gestor, gestor2, medicoes, medicoes2, armazem, leitura, mecanico, motorista, autor, OBRA, HOJE, seq = 0

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
  if (['auto_registar_evidencia', 'sub_doc_registar', 'auto_registar_fatura'].includes(nome) && args.p_path) {
    const bucket = nome === 'auto_registar_evidencia' ? 'obras' : 'obras-contratos'
    await db.query(`INSERT INTO storage.objects (bucket_id, name) SELECT $1, $2
      WHERE NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = $1 AND name = $2)`, [bucket, args.p_path])
  }
  const ks = Object.keys(args)
  const sql = `SELECT * FROM public.${nome}(${ks.map((k, i) => `${k} => $${i + 1}`).join(', ')})`
  return q(uid, sql, ks.map(k => args[k]))
}
const rpc1 = async (uid, nome, args) => { const r = (await rpc(uid, nome, args))[0]; return r ? Object.values(r)[0] : undefined }
const rm = (uid, nome, args) => expect(rpc(uid, nome, args))

const ts = () => `${Date.now() % 1e9}${++seq}`
const dia = async (n = 0) => (await sup(`SELECT to_char(public._hoje_pt() + $1::int, 'YYYY-MM-DD') AS d`, [n]))[0].d
const eventos = async (obra) => sup(`SELECT tipo, titulo, detalhe FROM public.obra_eventos WHERE obra_id = $1 ORDER BY criado_em, titulo`, [obra])
const auditoria = async (acao, alvo) => sup(`SELECT * FROM public.audit_log WHERE action = $1 AND target_id = $2 ORDER BY created_at`, [acao, alvo])
const auto = async (id) => (await sup(`SELECT *, data_vencimento::text AS venc FROM public.autos_medicao WHERE id = $1`, [id]))[0]
const cfg = (c) => rpc(admin, 'subs_config_guardar', { p_cfg: c })

const LAT = 38.7, LON = -9.14
const obraDireta = async (nome) => (await sup(
  `INSERT INTO public.obras (nome, estado, latitude, longitude) VALUES ($1, 'ativa', $2, $3) RETURNING id`, [nome ?? `Obra ${++seq}`, LAT, LON]))[0].id

const DOCS = ['CERT_SS', 'CERT_AT', 'SEGURO_AT', 'ALVARA']
async function docsEmDia(sub, o = {}) {
  for (const tipo of o.tipos ?? DOCS) {
    await rpc(gestor, 'sub_doc_registar', { p_sub_id: sub, p_tipo: tipo, p_referencia: 'R', p_emitido_em: o.emitido ?? null,
      p_validade: o.validade?.[tipo] ?? await dia(365), p_path: `${sub}/doc-${ts()}.pdf`, p_nome: 'doc.pdf' })
  }
}

// Contrato validado (inserido diretamente) com artigos e, por omissão, documentos em dia
async function contrato(obra, o = {}) {
  const sub = (await sup(
    `INSERT INTO public.subempreiteiros (obra_id, nome, tipo, valor_global, percentagem_retencao, estado) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [obra, o.nome ?? `Sub ${++seq}`, o.global ? 'global' : 'unitario', o.global ?? null, o.ret ?? 10, o.estado ?? 'validado']))[0].id
  const arts = []
  for (const a of o.global ? [] : (o.artigos ?? [{ preco: 10, qtd: 100 }])) {
    arts.push((await sup(`INSERT INTO public.subempreiteiro_artigos (subempreiteiro_id, descricao, unidade, preco_unitario, quantidade_prevista, orcamento_item_id)
      VALUES ($1, $2, 'm3', $3, $4, $5) RETURNING id`, [sub, a.desc ?? 'Betão', a.preco, a.qtd, a.item ?? null]))[0].id)
  }
  if (o.docs !== false) await docsEmDia(sub)
  return { obra, sub, arts }
}

const novoAuto = async (uid, sub, o = {}) => (await rpc(uid, 'criar_auto_rpc', {
  p_sub_id: sub, p_data: o.data ?? HOJE, p_percentagem: o.pct ?? null, p_valor: o.valor ?? 0, p_notas: null }))[0].id
const linha = async (uid, autoId, o) => (await q(uid,
  `INSERT INTO public.auto_linhas (auto_id, artigo_id, descricao, unidade, preco_unitario, quantidade, qtd_pedida, is_extra, justificacao)
   VALUES ($1, $2, $3, 'm3', $4, $5, $6, $7, $8) RETURNING id`,
  [autoId, o.art ?? null, o.desc ?? 'Betão', o.preco ?? 10, o.qtd, o.pedida ?? null, o.extra ?? false, o.just ?? null]))[0].id

// Auto unitário em rascunho com uma linha do 1.º artigo (preço do contrato)
async function autoUnit(c, qtd, o = {}) {
  const uid = o.uid ?? medicoes, preco = o.preco ?? 10
  const a = await novoAuto(uid, c.sub, { valor: Math.round(qtd * preco * 100) / 100 })
  await linha(uid, a, { art: c.arts[0], qtd, preco })
  return a
}
const hash = () => randomBytes(32).toString('hex')
const minutos = (m) => new Date(Date.now() + m * 60_000).toISOString()
const foto = (uid, autoId, obra, o = {}) => rpc1(uid, 'auto_registar_evidencia', {
  p_auto_id: autoId, p_path: `${obra}/autos/${ts()}-${randomUUID().slice(0, 8)}.jpg`, p_legenda: null,
  p_lat: 'lat' in o ? o.lat : LAT + 0.0001, p_lon: 'lon' in o ? o.lon : LON, p_precisao_m: 5, p_tirada_em: minutos(-1), p_hash: hash(), p_linha_id: null })
const fotos = async (autoId, obra, n = 2) => { for (let i = 0; i < n; i++) await foto(medicoes, autoId, obra) }

const submeter = (a, uid = medicoes) => rpc(uid, 'auto_submeter', { p_auto_id: a })
const itensConformes = async (a) => (await sup(`SELECT ordem FROM public.auto_verificacoes WHERE auto_id = $1 ORDER BY ordem`, [a]))
  .map(r => ({ ordem: r.ordem, resultado: 'conforme', observacao: null }))
async function checklist(a) {
  await rpc(medicoes, 'auto_iniciar_verificacao', { p_auto_id: a })
  await rpc(medicoes, 'auto_registar_verificacao', { p_auto_id: a, p_itens: JSON.stringify(await itensConformes(a)) })
}
async function verificar(a, obra, o = {}) {
  await checklist(a)
  if (o.fotos !== false) await fotos(a, obra)
  await rpc(o.uid ?? medicoes, 'auto_verificar', { p_auto_id: a })
}
async function ateVerificado(c, qtd, o = {}) {
  const a = await autoUnit(c, qtd, o)
  await submeter(a)
  if (o.glosa) await rpc(medicoes, 'auto_glosar', { p_auto_id: a, p_motivo: 'QUALIDADE', p_descricao: 'Acabamento', p_valor: o.glosa })
  await verificar(a, c.obra)
  return a
}
async function aprovado(c, qtd, o = {}) {
  const a = await ateVerificado(c, qtd, o)
  await rpc(o.aprovador ?? gestor, 'auto_aprovar', { p_auto_id: a })
  return a
}
const fatPath = (sub) => `${sub}/fatura-${ts()}.pdf`
const fatura = async (a, sub, valor, uid = gestor) => rpc(uid, 'auto_registar_fatura', {
  p_auto_id: a, p_numero: `FT ${++seq}`, p_data: HOJE, p_valor: valor, p_path: fatPath(sub), p_nome: 'fatura.pdf' })
const ocorrencia = (sub, tipo, grav) => rpc1(medicoes, 'sub_registar_ocorrencia', {
  p_subempreiteiro_id: sub, p_tipo: tipo, p_gravidade: grav, p_descricao: 'Ocorrência de teste', p_dias_atraso: tipo === 'ATRASO' ? 2 : 0 })
// Prepara dados de teste: muda colunas de um auto já submetido (com o sinal das RPCs, como superutilizador)
const forcar = (id, set) => db.transaction(async tx => {
  await tx.query(`SELECT set_config('app.auto_rpc', 'on', true)`)
  await tx.query(`UPDATE public.autos_medicao SET ${set} WHERE id = $1`, [id])
})
const painel = (sub, uid = leitura) => rpc1(uid, 'sub_painel', { p_id: sub })

beforeAll(async () => {
  db = await criarBanco()
  admin     = await utilizador('admin', 'admin@t.pt')
  gestor    = await utilizador('gestor', 'gestor@t.pt')
  gestor2   = await utilizador('gestor', 'gestor2@t.pt')
  medicoes  = await utilizador('medicoes', 'eduarda@t.pt')
  medicoes2 = await utilizador('medicoes', 'joana@t.pt')
  armazem   = await utilizador('armazem', 'arm@t.pt')
  leitura   = await utilizador('leitura', 'lei@t.pt')
  mecanico  = await utilizador('mecanico', 'carlos@t.pt')
  motorista = await utilizador('motorista', 'mot@t.pt')
  autor     = await utilizador('armazem', 'autor@t.pt')
  HOJE = await dia(0)
  OBRA = await obraDireta('Obra principal')
  await rpc(admin, 'obra_definir_autores', { p_obra_id: OBRA, p_user_ids: [autor] })
}, 120_000)

const SEM_MEDIR = [['armazem', () => armazem], ['leitura', () => leitura], ['mecanico', () => mecanico], ['motorista', () => motorista], ['autor designado', () => autor]]

// ───────────────────────────────────────────────────────────────────────────
describe('esquema, backfill e invariante', () => {
  it('backfill: autos validados passam a workflow validado com vencimento; reaplicar é idempotente', async () => {
    const d2 = await criarBanco({ ate: '20261004000000_subs_orcamento_docs_evidencias.sql' })
    const o = (await d2.query(`INSERT INTO public.obras (nome) VALUES ('Antiga') RETURNING id`)).rows[0].id
    const s = (await d2.query(`INSERT INTO public.subempreiteiros (obra_id, nome, tipo, valor_global, estado) VALUES ($1, 'S', 'global', 1000, 'validado') RETURNING id`, [o])).rows[0].id
    const ins = async (n, estado, med, val) => (await d2.query(`INSERT INTO public.autos_medicao (subempreiteiro_id, numero, valor_periodo, estado, data_medicao, validado_em)
      VALUES ($1, $2, 100, $3, $4, $5) RETURNING id`, [s, n, estado, med, val])).rows[0].id
    const a1 = await ins(1, 'validado', '2026-01-10', '2026-01-15T10:00:00Z'), a2 = await ins(2, 'rascunho', '2026-01-20', null), a3 = await ins(3, 'validado', '2026-02-01', null)
    const sql = readFileSync(MIG_B, 'utf8')
    await d2.exec(sql); await d2.exec(sql)
    const r = (await d2.query(`SELECT id, workflow, data_vencimento::text AS v FROM public.autos_medicao ORDER BY numero`)).rows
    expect(r).toEqual([{ id: a1, workflow: 'validado', v: '2026-02-14' }, { id: a2, workflow: 'rascunho', v: null }, { id: a3, workflow: 'validado', v: '2026-03-03' }])
    await d2.close()
  }, 60_000)

  it('a base de dados recusa estado incoerente (validado ⇔ workflow validado), glosa acima do valor e workflow inventado', async () => {
    const c = await contrato(OBRA, { docs: false })
    await expect(sup(`INSERT INTO public.autos_medicao (subempreiteiro_id, numero, valor_periodo, estado) VALUES ($1, 9001, 10, 'validado')`, [c.sub])).rejects.toThrow(/ck_auto_workflow_estado/)
    await expect(sup(`INSERT INTO public.autos_medicao (subempreiteiro_id, numero, valor_periodo, workflow) VALUES ($1, 9002, 10, 'validado')`, [c.sub])).rejects.toThrow(/ck_auto_workflow_estado/)
    await expect(sup(`INSERT INTO public.autos_medicao (subempreiteiro_id, numero, valor_periodo, valor_glosado) VALUES ($1, 9003, 10, 10.01)`, [c.sub])).rejects.toThrow(/ck_auto_glosado/)
    await expect(sup(`INSERT INTO public.autos_medicao (subempreiteiro_id, numero, valor_periodo, workflow) VALUES ($1, 9004, 10, 'aprovado')`, [c.sub])).rejects.toThrow(/ck_auto_workflow/)
    const path = fatPath(randomUUID())
    await sup(`INSERT INTO storage.objects (bucket_id, name) VALUES ('obras-contratos', $1)`, [path])
    await expect(sup(`INSERT INTO public.autos_medicao (subempreiteiro_id, numero, valor_periodo, fatura_path) VALUES ($1, 9005, 10, $2)`, [c.sub, path])).rejects.toThrow(/ck_auto_fatura/)
  })

  it('quem criou o auto (created_by) é legível pela UI', async () => {
    const c = await contrato(OBRA, { docs: false }); const a = await autoUnit(c, 1)
    for (const uid of [admin, gestor, medicoes, leitura]) expect((await q(uid, `SELECT created_by FROM public.autos_medicao WHERE id = $1`, [a]))[0].created_by).toBe(medicoes)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('auto_submeter', () => {
  it('medições submete: workflow, autor, hora e evento', async () => {
    const c = await contrato(OBRA, { docs: false }); const a = await autoUnit(c, 50)
    await submeter(a)
    const r = await auto(a)
    expect(r).toMatchObject({ workflow: 'submetido', estado: 'rascunho', submetido_por: medicoes }); expect(r.submetido_em).toBeTruthy()
    expect((await eventos(OBRA)).find(e => e.tipo === 'AUTO_SUBMETIDO' && e.titulo.includes(`— Sub`))).toBeTruthy()
  })
  it.each(SEM_MEDIR)('%s não submete', async (_n, uid) => {
    const c = await contrato(OBRA, { docs: false }); const a = await autoUnit(c, 5)
    await rm(uid(), 'auto_submeter', { p_auto_id: a }).rejects.toThrow(/Sem permissão/)
  })
  it('gestor e admin também submetem; auto inexistente', async () => {
    const c = await contrato(OBRA, { docs: false })
    await submeter(await autoUnit(c, 1), gestor); await submeter(await autoUnit(c, 1), admin)
    await rm(medicoes, 'auto_submeter', { p_auto_id: randomUUID() }).rejects.toThrow(/Auto não encontrado/)
  })
  it('contrato ainda em rascunho', async () => {
    const c = await contrato(OBRA, { docs: false, estado: 'rascunho' }); const a = await autoUnit(c, 5)
    await expect(submeter(a)).rejects.toThrow(/não está validada/)
  })
  it('já submetido', async () => {
    const c = await contrato(OBRA, { docs: false }); const a = await autoUnit(c, 5); await submeter(a)
    await expect(submeter(a)).rejects.toThrow(/já foi submetido/)
  })
  it('data da medição futura', async () => {
    const c = await contrato(OBRA, { docs: false })
    const a = await novoAuto(medicoes, c.sub, { valor: 10, data: await dia(1) }); await linha(medicoes, a, { art: c.arts[0], qtd: 1 })
    await expect(submeter(a)).rejects.toThrow(/data da medição não pode ser futura/)
  })
  it('sem linhas', async () => {
    const c = await contrato(OBRA, { docs: false }); const a = await novoAuto(medicoes, c.sub, { valor: 0 })
    await expect(submeter(a)).rejects.toThrow(/não tem linhas/)
  })
  it('preço diferente do contrato', async () => {
    const c = await contrato(OBRA, { docs: false }); const a = await autoUnit(c, 5, { preco: 11 })
    await expect(submeter(a)).rejects.toThrow(/O preço de "Betão" não corresponde ao do contrato \(10 €\)/)
  })
  it('quantidade verificada acima da pedida pelo subempreiteiro; igual passa', async () => {
    const c = await contrato(OBRA, { docs: false })
    const a = await novoAuto(medicoes, c.sub, { valor: 100 }); await linha(medicoes, a, { art: c.arts[0], qtd: 10, pedida: 8 })
    await expect(submeter(a)).rejects.toThrow(/quantidade verificada de "Betão" \(10\) excede a pedida pelo subempreiteiro \(8\)/)
    const b = await novoAuto(medicoes, c.sub, { valor: 80 }); await linha(medicoes, b, { art: c.arts[0], qtd: 8, pedida: 8 })
    await submeter(b)
  })
  it('acumulado: submetidos/verificados/validados contam, rascunhos não; o limite exato passa', async () => {
    const c = await contrato(OBRA, { docs: false })
    await submeter(await autoUnit(c, 60))
    await autoUnit(c, 50)
    await submeter(await autoUnit(c, 40))
    await expect(submeter(await autoUnit(c, 0.001))).rejects.toThrow(/quantidade acumulada de "Betão" \(100.001\) excede a prevista no contrato \(100\)/)
  })
  it('acumulado conta autos já validados', async () => {
    const c = await contrato(OBRA)
    await aprovado(c, 90)
    await expect(submeter(await autoUnit(c, 11))).rejects.toThrow(/acumulada de "Betão" \(101\)/)
  })
  it('duas linhas do mesmo artigo no mesmo auto somam', async () => {
    const c = await contrato(OBRA, { docs: false })
    const a = await novoAuto(medicoes, c.sub, { valor: 1100 }); await linha(medicoes, a, { art: c.arts[0], qtd: 60 }); await linha(medicoes, a, { art: c.arts[0], qtd: 50 })
    await expect(submeter(a)).rejects.toThrow(/acumulada de "Betão" \(110\)/)
  })
  it('trabalhos a mais exigem justificação; com justificação passam (e não contam no acumulado do artigo)', async () => {
    const c = await contrato(OBRA, { docs: false })
    const a = await novoAuto(medicoes, c.sub, { valor: 50 }); await linha(medicoes, a, { desc: 'Demolição extra', extra: true, qtd: 1, preco: 50 })
    await expect(submeter(a)).rejects.toThrow(/Trabalhos a mais exigem justificação \(Demolição extra\)/)
    const b = await novoAuto(medicoes, c.sub, { valor: 1050 })
    await linha(medicoes, b, { art: c.arts[0], desc: 'Extra no artigo', extra: true, just: 'Pedido do dono de obra', qtd: 5, preco: 10 })
    await linha(medicoes, b, { art: c.arts[0], qtd: 100 })
    await submeter(b)
  })
  it('linha sem artigo que não é trabalho a mais', async () => {
    const c = await contrato(OBRA, { docs: false })
    const a = await novoAuto(medicoes, c.sub, { valor: 10 }); await linha(medicoes, a, { desc: 'Solta', qtd: 1 })
    await expect(submeter(a)).rejects.toThrow(/A linha "Solta" tem de estar ligada a um artigo do contrato/)
  })
  it('artigo de outro contrato', async () => {
    const c = await contrato(OBRA, { docs: false }); const outro = await contrato(OBRA, { docs: false })
    const a = await novoAuto(medicoes, c.sub, { valor: 10 }); await linha(medicoes, a, { art: outro.arts[0], qtd: 1 })
    await expect(submeter(a)).rejects.toThrow(/não pertence a este contrato/)
  })
  it('valor do período tem de ser a soma das linhas (tolerância de 0,01 €)', async () => {
    const c = await contrato(OBRA, { docs: false })
    const a = await novoAuto(medicoes, c.sub, { valor: 500.02 }); await linha(medicoes, a, { art: c.arts[0], qtd: 50 })
    await expect(submeter(a)).rejects.toThrow(/O valor do período \(500.02 €\) não corresponde à soma das linhas \(500.00 €\)/)
    const b = await novoAuto(medicoes, c.sub, { valor: 500.01 }); await linha(medicoes, b, { art: c.arts[0], qtd: 50 })
    await submeter(b)
  })
  describe('contrato global', () => {
    it('percentagem × valor global; acumulado até 100 % exato', async () => {
      const c = await contrato(OBRA, { docs: false, global: 10000 })
      await submeter(await novoAuto(medicoes, c.sub, { pct: 70, valor: 7000 }))
      await submeter(await novoAuto(medicoes, c.sub, { pct: 30, valor: 3000 }))
      await expect(submeter(await novoAuto(medicoes, c.sub, { pct: 0.5, valor: 50 }))).rejects.toThrow(/acumulado \(100.5 %\) ultrapassa 100 % do contrato/)
    })
    it.each([
      ['percentagem 0', { pct: 0, valor: 0 }, /percentagem do período tem de ser superior a 0/],
      ['percentagem nula', { pct: null, valor: 10 }, /percentagem do período tem de ser superior a 0/],
      ['valor errado', { pct: 10, valor: 1000.02 }, /não corresponde à percentagem do valor global \(1,000.00 €\)/],
    ])('recusa %s', async (_n, o, erro) => {
      const c = await contrato(OBRA, { docs: false, global: 10000 })
      await expect(submeter(await novoAuto(medicoes, c.sub, o))).rejects.toThrow(erro)
    })
    it('sem linhas (mede-se só pela percentagem)', async () => {
      const c = await contrato(OBRA, { docs: false, global: 10000 })
      const a = await novoAuto(medicoes, c.sub, { pct: 10, valor: 1000 }); await linha(medicoes, a, { desc: 'x', qtd: 1, extra: true, just: 'justificado' })
      await expect(submeter(a)).rejects.toThrow(/mede-se só pela percentagem/)
    })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('imutabilidade depois da submissão', () => {
  let c, a, l
  beforeAll(async () => {
    c = await contrato(OBRA, { docs: false })
    a = await novoAuto(medicoes, c.sub, { valor: 100 }); l = await linha(medicoes, a, { art: c.arts[0], qtd: 10 })
    await submeter(a)
  })
  it.each([['medições', () => medicoes], ['gestor', () => gestor], ['admin', () => admin]])('%s não altera nem apaga o auto diretamente', async (_n, uid) => {
    await expect(q(uid(), `UPDATE public.autos_medicao SET observacoes = 'x' WHERE id = $1`, [a])).rejects.toThrow(/já foi submetido/)
    await expect(q(uid(), `UPDATE public.autos_medicao SET valor_periodo = 1 WHERE id = $1`, [a])).rejects.toThrow(/já foi submetido/)
    await expect(q(uid(), `DELETE FROM public.autos_medicao WHERE id = $1`, [a])).rejects.toThrow(/já foi submetido/)
  })
  it('linhas: nem inserir, nem alterar, nem apagar', async () => {
    await expect(linha(medicoes, a, { art: c.arts[0], qtd: 1 })).rejects.toThrow(/já foi submetido/)
    await expect(q(medicoes, `UPDATE public.auto_linhas SET quantidade = 99 WHERE id = $1`, [l])).rejects.toThrow(/já foi submetido/)
    await expect(q(admin, `DELETE FROM public.auto_linhas WHERE id = $1`, [l])).rejects.toThrow(/já foi submetido/)
  })
  it('ligar o sinal das RPCs pela API não contorna a regra', async () => {
    await expect(u(medicoes, async tx => {
      await tx.query(`SELECT set_config('app.auto_rpc', 'on', true)`)
      return tx.query(`UPDATE public.autos_medicao SET observacoes = 'x' WHERE id = $1`, [a])
    })).rejects.toThrow(/já foi submetido/)
  })
  it('nem o superutilizador sem passar pelas RPCs', async () => {
    await expect(sup(`UPDATE public.autos_medicao SET observacoes = 'x' WHERE id = $1`, [a])).rejects.toThrow(/já foi submetido/)
    await expect(sup(`DELETE FROM public.auto_linhas WHERE id = $1`, [l])).rejects.toThrow(/já foi submetido/)
  })
  it('colunas do fluxo nunca se escrevem diretamente (nem em rascunho)', async () => {
    const b = await autoUnit(c, 1)
    for (const col of ['workflow', 'valor_glosado', 'fatura_numero', 'data_vencimento', 'submetido_por', 'excecao_motivo']) {
      await expect(q(medicoes, `UPDATE public.autos_medicao SET ${col} = ${col} WHERE id = $1`, [b])).rejects.toThrow(/permission denied/)
    }
    await expect(q(medicoes, `INSERT INTO public.autos_medicao (subempreiteiro_id, numero, workflow) VALUES ($1, 777, 'submetido')`, [c.sub])).rejects.toThrow(/permission denied/)
  })
  it('em rascunho a edição direta continua (RLS antiga) e apagar leva as linhas', async () => {
    const b = await autoUnit(c, 2)
    await q(medicoes, `UPDATE public.autos_medicao SET observacoes = 'nota' WHERE id = $1`, [b])
    await q(medicoes, `UPDATE public.auto_linhas SET qtd_pedida = 3, justificacao = 'x' WHERE auto_id = $1`, [b])
    await q(medicoes, `DELETE FROM public.autos_medicao WHERE id = $1`, [b])
    expect(await sup(`SELECT 1 FROM public.auto_linhas WHERE auto_id = $1`, [b])).toEqual([])
  })
  it('validado: a RLS esconde-o da escrita e o trigger recusa ao superutilizador', async () => {
    const c2 = await contrato(OBRA); const v = await aprovado(c2, 1)
    expect((await u(admin, tx => tx.query(`UPDATE public.autos_medicao SET observacoes = 'x' WHERE id = $1`, [v]))).affectedRows ?? 0).toBe(0)
    await expect(sup(`UPDATE public.autos_medicao SET estado_pagamento = 'pago' WHERE id = $1`, [v])).rejects.toThrow(/já foi submetido/)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('evidências seguem o workflow (Migration A)', () => {
  it('submetido: regista mas não apaga; verificado: não regista; devolvido: apaga', async () => {
    const c = await contrato(OBRA, { docs: false }); const a = await autoUnit(c, 1); await submeter(a)
    const e = await foto(medicoes, a, OBRA)
    expect(e.valida).toBe(true)
    await rm(medicoes, 'auto_apagar_evidencia', { p_id: e.id }).rejects.toThrow(/enquanto o auto está em rascunho/)
    await foto(medicoes, a, OBRA); await checklist(a); await rpc(medicoes, 'auto_verificar', { p_auto_id: a })
    await expect(foto(medicoes, a, OBRA)).rejects.toThrow(/já não aceita evidências/)
    await rpc(medicoes, 'auto_devolver', { p_auto_id: a, p_motivo: 'Refazer fotos' })
    await rpc(medicoes, 'auto_apagar_evidencia', { p_id: e.id })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('verificação', () => {
  let c
  beforeAll(async () => { c = await contrato(OBRA, { docs: false }) })
  const submetido = async () => { const a = await autoUnit(c, 0.5); await submeter(a); return a }

  it('iniciar cria a lista padrão (5 itens, por ordem) e é idempotente', async () => {
    const a = await submetido()
    await rpc(medicoes, 'auto_iniciar_verificacao', { p_auto_id: a }); await rpc(gestor, 'auto_iniciar_verificacao', { p_auto_id: a })
    const r = await q(leitura, `SELECT ordem, item, resultado FROM public.auto_verificacoes WHERE auto_id = $1 ORDER BY ordem`, [a])
    expect(r.map(x => x.ordem)).toEqual([1, 2, 3, 4, 5]); expect(r[0]).toEqual({ ordem: 1, item: 'Execução conforme projeto e caderno de encargos', resultado: 'pendente' })
  })
  it('a lista vem da configuração do admin', async () => {
    await cfg({ checklist_padrao: ['Cofragem', 'Betonagem'] })
    try {
      const a = await submetido(); await rpc(medicoes, 'auto_iniciar_verificacao', { p_auto_id: a })
      expect((await sup(`SELECT item FROM public.auto_verificacoes WHERE auto_id = $1 ORDER BY ordem`, [a])).map(x => x.item)).toEqual(['Cofragem', 'Betonagem'])
    } finally {
      await cfg({ checklist_padrao: ['Execução conforme projeto e caderno de encargos', 'Quantidades confirmadas em obra', 'Qualidade do acabamento / ensaios, quando aplicável',
        'Segurança: EPI e proteções coletivas', 'Limpeza e arrumação da frente de trabalho'] })
    }
  })
  it('iniciar: só em submetido; papéis sem medição recusados', async () => {
    const r = await autoUnit(c, 0.5)
    await rm(medicoes, 'auto_iniciar_verificacao', { p_auto_id: r }).rejects.toThrow(/Só se verifica um auto submetido/)
    await rm(leitura, 'auto_iniciar_verificacao', { p_auto_id: await submetido() }).rejects.toThrow(/Sem permissão/)
    await rm(medicoes, 'auto_iniciar_verificacao', { p_auto_id: randomUUID() }).rejects.toThrow(/Auto não encontrado/)
  })
  it('registar: guarda resultado, observação e quem verificou', async () => {
    const a = await submetido(); await rpc(medicoes, 'auto_iniciar_verificacao', { p_auto_id: a })
    await rpc(medicoes2, 'auto_registar_verificacao', { p_auto_id: a, p_itens: JSON.stringify([{ ordem: 2, resultado: 'nao_conforme', observacao: ' Faltam 3 m3 ' }, { ordem: 5, resultado: 'na' }]) })
    const r = await sup(`SELECT ordem, resultado, observacao, verificado_por FROM public.auto_verificacoes WHERE auto_id = $1 AND ordem IN (2, 5) ORDER BY ordem`, [a])
    expect(r).toEqual([{ ordem: 2, resultado: 'nao_conforme', observacao: 'Faltam 3 m3', verificado_por: medicoes2 }, { ordem: 5, resultado: 'na', observacao: null, verificado_por: medicoes2 }])
  })
  it.each([
    ['não conforme sem observação', [{ ordem: 2, resultado: 'nao_conforme', observacao: '  ' }], /Explique na observação o item n.º 2/],
    ['item inexistente', [{ ordem: 99, resultado: 'conforme' }], /item de verificação n.º 99 não existe/],
    ['resultado inválido', [{ ordem: 1, resultado: 'talvez' }], /Resultado de verificação inválido/],
    ['lista vazia', [], /Indique os itens da verificação/],
    ['item sem ordem', [{ resultado: 'conforme' }], /Item de verificação inválido/],
  ])('registar recusa %s', async (_n, itens, erro) => {
    const a = await submetido(); await rpc(medicoes, 'auto_iniciar_verificacao', { p_auto_id: a })
    await rm(medicoes, 'auto_registar_verificacao', { p_auto_id: a, p_itens: JSON.stringify(itens) }).rejects.toThrow(erro)
  })
  it('registar antes de iniciar, fora de submetido e sem permissão', async () => {
    const a = await submetido()
    await rm(medicoes, 'auto_registar_verificacao', { p_auto_id: a, p_itens: '[]' }).rejects.toThrow(/Inicie a verificação primeiro/)
    await rm(medicoes, 'auto_registar_verificacao', { p_auto_id: await autoUnit(c, 0.1), p_itens: '[]' }).rejects.toThrow(/não está em verificação/)
    await rm(leitura, 'auto_registar_verificacao', { p_auto_id: a, p_itens: '[]' }).rejects.toThrow(/Sem permissão/)
  })
  it('verificar: sem lista, com itens pendentes, fora de submetido', async () => {
    const a = await submetido()
    await rm(medicoes, 'auto_verificar', { p_auto_id: a }).rejects.toThrow(/Inicie e preencha a lista/)
    await rpc(medicoes, 'auto_iniciar_verificacao', { p_auto_id: a })
    await rm(medicoes, 'auto_verificar', { p_auto_id: a }).rejects.toThrow(/itens da lista de verificação por preencher/)
    await rm(medicoes, 'auto_verificar', { p_auto_id: await autoUnit(c, 0.1) }).rejects.toThrow(/Só se verifica um auto submetido/)
    await rm(armazem, 'auto_verificar', { p_auto_id: a }).rejects.toThrow(/Sem permissão/)
  })
  it('verificar exige fotografias VÁLIDAS (sem GPS não conta)', async () => {
    const a = await submetido(); await checklist(a)
    await foto(medicoes, a, OBRA); const inv = await foto(medicoes, a, OBRA, { lat: null, lon: null }); expect(inv.valida).toBe(false)
    await rm(medicoes, 'auto_verificar', { p_auto_id: a }).rejects.toThrow(/pelo menos 2 fotografias válidas tiradas na obra \(há 1\)/)
    await foto(medicoes, a, OBRA)
    await rpc(medicoes, 'auto_verificar', { p_auto_id: a })
    const r = await auto(a)
    expect(r).toMatchObject({ workflow: 'verificado', verificado_por: medicoes, excecao_motivo: null })
    expect((await eventos(OBRA)).some(e => e.tipo === 'AUTO_VERIFICADO' && e.titulo.startsWith(`Auto n.º ${r.numero} verificado`))).toBe(true)
  })
  it('exceção às fotografias: só o admin e com motivo ≥ 10 caracteres (fica registada)', async () => {
    const a = await submetido(); await checklist(a)
    await rm(gestor, 'auto_verificar', { p_auto_id: a, p_excecao_motivo: 'Sem rede na obra hoje' }).rejects.toThrow(/Só o administrador pode verificar sem as fotografias/)
    await rm(admin, 'auto_verificar', { p_auto_id: a, p_excecao_motivo: 'curto' }).rejects.toThrow(/pelo menos 10 caracteres/)
    await rpc(admin, 'auto_verificar', { p_auto_id: a, p_excecao_motivo: 'Fotografias entregues em papel' })
    expect((await auto(a)).excecao_motivo).toBe('Verificação sem fotografias suficientes: Fotografias entregues em papel')
    const au = (await auditoria('auto_verificar_excecao', a))[0]
    expect(au.actor_id).toBe(admin); expect(au.details).toMatchObject({ fotos_validas: 0, minimo: 2 })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('auto_devolver', () => {
  let c
  beforeAll(async () => { c = await contrato(OBRA, { docs: false }) })
  it('de submetido volta a rascunho, apaga a verificação, regista evento e audit', async () => {
    const a = await autoUnit(c, 1); await submeter(a); await rpc(medicoes, 'auto_iniciar_verificacao', { p_auto_id: a })
    await rpc(medicoes, 'auto_devolver', { p_auto_id: a, p_motivo: 'Medição errada' })
    expect(await auto(a)).toMatchObject({ workflow: 'rascunho', submetido_por: null, submetido_em: null })
    expect(await sup(`SELECT 1 FROM public.auto_verificacoes WHERE auto_id = $1`, [a])).toEqual([])
    expect((await eventos(OBRA)).find(e => e.tipo === 'AUTO_DEVOLVIDO' && e.detalhe === 'Medição errada')).toBeTruthy()
    expect((await auditoria('auto_devolver', a))[0].details).toEqual({ de: 'submetido', motivo: 'Medição errada' })
    await q(medicoes, `UPDATE public.auto_linhas SET quantidade = 2 WHERE auto_id = $1`, [a])
    await q(medicoes, `UPDATE public.autos_medicao SET valor_periodo = 20 WHERE id = $1`, [a])
    await submeter(a)
  })
  it('de verificado também; limpa quem verificou', async () => {
    const a = await autoUnit(c, 1); await submeter(a); await verificar(a, OBRA)
    await rpc(gestor, 'auto_devolver', { p_auto_id: a, p_motivo: 'Rever fotos' })
    expect(await auto(a)).toMatchObject({ workflow: 'rascunho', verificado_por: null, verificado_em: null })
  })
  it('recusa rascunho, validado, motivo curto, sem permissão', async () => {
    const r = await autoUnit(c, 1)
    await rm(medicoes, 'auto_devolver', { p_auto_id: r, p_motivo: 'Motivo válido' }).rejects.toThrow(/Só se devolve um auto submetido ou verificado/)
    const c2 = await contrato(OBRA); const v = await aprovado(c2, 1)
    await rm(admin, 'auto_devolver', { p_auto_id: v, p_motivo: 'Motivo válido' }).rejects.toThrow(/Só se devolve/)
    const s = await autoUnit(c, 1); await submeter(s)
    await rm(medicoes, 'auto_devolver', { p_auto_id: s, p_motivo: ' abc ' }).rejects.toThrow(/mínimo 5 caracteres/)
    await rm(leitura, 'auto_devolver', { p_auto_id: s, p_motivo: 'Motivo válido' }).rejects.toThrow(/Sem permissão/)
  })
  it('devolver liberta a quantidade acumulada para nova medição', async () => {
    const c3 = await contrato(OBRA, { docs: false })
    const a = await autoUnit(c3, 100); await submeter(a)
    const b = await autoUnit(c3, 1)
    await expect(submeter(b)).rejects.toThrow(/acumulada/)
    await rpc(medicoes, 'auto_devolver', { p_auto_id: a, p_motivo: 'Quantidade a rever' })
    await submeter(b)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('glosas', () => {
  let c
  beforeAll(async () => { c = await contrato(OBRA) })
  const submetido = async (qtd = 50) => { const a = await autoUnit(c, qtd); await submeter(a); return a }

  it('aplicar: devolve o id, atualiza valor_glosado, regista evento e audit', async () => {
    const a = await submetido()
    const g = await rpc1(medicoes, 'auto_glosar', { p_auto_id: a, p_motivo: 'QUALIDADE', p_descricao: ' Reboco fissurado ', p_valor: 120.499 })
    expect(Number((await auto(a)).valor_glosado)).toBe(120.5)
    expect((await sup(`SELECT descricao, valor::float8 AS v, estado, criado_por FROM public.auto_glosas WHERE id = $1`, [g]))[0]).toEqual({ descricao: 'Reboco fissurado', v: 120.5, estado: 'aplicada', criado_por: medicoes })
    expect((await auditoria('auto_glosar', a))[0].details).toMatchObject({ glosa_id: g, motivo: 'QUALIDADE', valor: 120.5 })
    expect((await eventos(OBRA)).find(e => e.tipo === 'AUTO_GLOSADO' && e.detalhe.startsWith('QUALIDADE: 120.50 €'))).toBeTruthy()
  })
  it('também em rascunho e em verificado; o total não passa o valor do período (o limite exato passa)', async () => {
    const r = await autoUnit(c, 10)
    await rpc(medicoes, 'auto_glosar', { p_auto_id: r, p_motivo: 'OUTRO', p_descricao: 'x', p_valor: 100 })
    await rm(medicoes, 'auto_glosar', { p_auto_id: r, p_motivo: 'OUTRO', p_descricao: 'x', p_valor: 0.01 }).rejects.toThrow(/As glosas \(100.01 €\) não podem ultrapassar o valor do período \(100.00 €\)/)
    const v = await ateVerificado(c, 5)
    await rpc(gestor, 'auto_glosar', { p_auto_id: v, p_motivo: 'ATRASO', p_descricao: 'Atraso de 3 dias', p_valor: 10 })
    expect(Number((await auto(v)).valor_glosado)).toBe(10)
  })
  it('com linha e ocorrência do próprio subempreiteiro', async () => {
    const a = await autoUnit(c, 5); const l = (await sup(`SELECT id FROM public.auto_linhas WHERE auto_id = $1`, [a]))[0].id
    const oc = await ocorrencia(c.sub, 'QUALIDADE', 'baixa')
    const g = await rpc1(medicoes, 'auto_glosar', { p_auto_id: a, p_motivo: 'QUALIDADE', p_descricao: 'x', p_valor: 1, p_linha_id: l, p_ocorrencia_id: oc })
    expect((await sup(`SELECT linha_id, ocorrencia_id FROM public.auto_glosas WHERE id = $1`, [g]))[0]).toEqual({ linha_id: l, ocorrencia_id: oc })
  })
  it.each([
    ['valor 0', { p_valor: 0 }, /superior a 0/],
    ['valor negativo', { p_valor: -5 }, /superior a 0/],
    ['valor que arredonda a 0', { p_valor: 0.004 }, /superior a 0/],
    ['motivo inventado', { p_motivo: 'CHUVA' }, /Motivo de glosa inválido/],
    ['descrição vazia', { p_descricao: '  ' }, /Descreva a glosa/],
    ['linha de outro auto', { p_linha_id: 'outra' }, /não pertence a este auto/],
    ['ocorrência de outro subempreiteiro', { p_ocorrencia_id: 'outra' }, /não é deste subempreiteiro/],
  ])('recusa %s', async (_n, o, erro) => {
    const a = await submetido(5)
    const extra = { ...o }
    if (o.p_linha_id === 'outra') extra.p_linha_id = (await sup(`SELECT id FROM public.auto_linhas WHERE auto_id <> $1 LIMIT 1`, [a]))[0].id
    if (o.p_ocorrencia_id === 'outra') extra.p_ocorrencia_id = await ocorrencia((await contrato(OBRA, { docs: false })).sub, 'NOTA', 'baixa')
    await rm(medicoes, 'auto_glosar', { p_auto_id: a, p_motivo: 'QUALIDADE', p_descricao: 'x', p_valor: 1, ...extra }).rejects.toThrow(erro)
  })
  it.each(SEM_MEDIR)('%s não aplica glosas', async (_n, uid) => {
    await rm(uid(), 'auto_glosar', { p_auto_id: await submetido(1), p_motivo: 'OUTRO', p_descricao: 'x', p_valor: 1 }).rejects.toThrow(/Sem permissão/)
  })
  it('depois de aprovado não se glosa nem se levanta', async () => {
    const a = await ateVerificado(c, 3)
    const g = await rpc1(medicoes, 'auto_glosar', { p_auto_id: a, p_motivo: 'OUTRO', p_descricao: 'x', p_valor: 1 })
    await rpc(gestor, 'auto_aprovar', { p_auto_id: a })
    await rm(admin, 'auto_glosar', { p_auto_id: a, p_motivo: 'OUTRO', p_descricao: 'x', p_valor: 1 }).rejects.toThrow(/já está aprovado/)
    await rm(admin, 'auto_levantar_glosa', { p_glosa_id: g, p_motivo: 'Corrigido' }).rejects.toThrow(/já está aprovado/)
  })
  it('levantar: só gestão, motivo ≥ 5, recalcula, não repete', async () => {
    const c2 = await contrato(OBRA); const a = await autoUnit(c2, 10); await submeter(a)
    const g1 = await rpc1(medicoes, 'auto_glosar', { p_auto_id: a, p_motivo: 'OUTRO', p_descricao: 'x', p_valor: 30 })
    await rpc(medicoes, 'auto_glosar', { p_auto_id: a, p_motivo: 'OUTRO', p_descricao: 'y', p_valor: 20 })
    await rm(medicoes, 'auto_levantar_glosa', { p_glosa_id: g1, p_motivo: 'Corrigido' }).rejects.toThrow(/Sem permissão/)
    await rm(gestor, 'auto_levantar_glosa', { p_glosa_id: g1, p_motivo: 'ok' }).rejects.toThrow(/mínimo 5 caracteres/)
    await rpc(gestor, 'auto_levantar_glosa', { p_glosa_id: g1, p_motivo: 'Defeito corrigido' })
    expect(Number((await auto(a)).valor_glosado)).toBe(20)
    expect((await sup(`SELECT estado, levantada_por, motivo_levantamento FROM public.auto_glosas WHERE id = $1`, [g1]))[0]).toEqual({ estado: 'levantada', levantada_por: gestor, motivo_levantamento: 'Defeito corrigido' })
    await rm(gestor, 'auto_levantar_glosa', { p_glosa_id: g1, p_motivo: 'Outra vez' }).rejects.toThrow(/já foi levantada/)
    await rm(gestor, 'auto_levantar_glosa', { p_glosa_id: randomUUID(), p_motivo: 'Outra vez' }).rejects.toThrow(/Glosa não encontrada/)
    expect((await auditoria('auto_levantar_glosa', a))).toHaveLength(1)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('auto_aprovar', () => {
  it('gestor aprova: validado, vencimento = hoje + prazo, evento com o certificado e audit', async () => {
    const c = await contrato(OBRA); const a = await ateVerificado(c, 50, { glosa: 60 })
    await rpc(gestor, 'auto_aprovar', { p_auto_id: a })
    const r = await auto(a)
    expect(r).toMatchObject({ estado: 'validado', workflow: 'validado', validado_por: gestor, venc: await dia(30) })
    const nome = (await sup(`SELECT nome FROM public.subempreiteiros WHERE id = $1`, [c.sub]))[0].nome
    expect((await eventos(OBRA)).find(e => e.tipo === 'AUTO_VALIDADO' && e.titulo === `Auto n.º ${r.numero} validado — ${nome}`).detalhe).toBe('440.00 € certificados')
    expect((await auditoria('auto_aprovar', a))[0].details).toMatchObject({ certificado: 440, valor_glosado: 60, trabalhos_a_mais: false, excecao_docs: null })
  })
  it.each([['medições', () => medicoes], ...SEM_MEDIR])('%s não aprova', async (_n, uid) => {
    const c = await contrato(OBRA); const a = await ateVerificado(c, 1)
    await rm(uid(), 'auto_aprovar', { p_auto_id: a }).rejects.toThrow(/Sem permissão/)
  })
  it('só um auto verificado; não aprova duas vezes; inexistente', async () => {
    const c = await contrato(OBRA)
    const r = await autoUnit(c, 1); await rm(gestor, 'auto_aprovar', { p_auto_id: r }).rejects.toThrow(/tem de estar verificado/)
    await submeter(r); await rm(admin, 'auto_aprovar', { p_auto_id: r }).rejects.toThrow(/tem de estar verificado/)
    const v = await aprovado(c, 1)
    await rm(gestor, 'auto_aprovar', { p_auto_id: v }).rejects.toThrow(/já está aprovado/)
    await rm(gestor, 'auto_aprovar', { p_auto_id: randomUUID() }).rejects.toThrow(/Auto não encontrado/)
  })
  it('certificado 0 (tudo glosado) não se aprova', async () => {
    const c = await contrato(OBRA); const a = await ateVerificado(c, 1, { glosa: 10 })
    await rm(admin, 'auto_aprovar', { p_auto_id: a }).rejects.toThrow(/certificado do auto tem de ser superior a 0/)
  })
  describe('alçada', () => {
    let c
    beforeAll(async () => { c = await contrato(OBRA, { artigos: [{ preco: 10, qtd: 10000 }] }) })
    it('acima da alçada (10 000 €) só o admin', async () => {
      const a = await ateVerificado(c, 1000.1)
      await rm(gestor, 'auto_aprovar', { p_auto_id: a }).rejects.toThrow(/Acima de 10,000.00 € só o administrador pode aprovar \(certificado: 10,001.00 €\)/)
      await rpc(admin, 'auto_aprovar', { p_auto_id: a })
    })
    it('no limite exato o gestor aprova', async () => {
      await rpc(gestor, 'auto_aprovar', { p_auto_id: await ateVerificado(c, 1000) })
    })
    it('conta o certificado (bruto acima, glosado abaixo) — e segue a configuração', async () => {
      await rpc(gestor, 'auto_aprovar', { p_auto_id: await ateVerificado(c, 1050, { glosa: 600 }) })
      await cfg({ alcada_gestor_ate: 100 })
      try {
        await rm(gestor, 'auto_aprovar', { p_auto_id: await ateVerificado(c, 10.01) }).rejects.toThrow(/Acima de 100.00 €/)
      } finally { await cfg({ alcada_gestor_ate: 10000 }) }
    })
    it('com trabalhos a mais só o admin (mesmo de valor baixo)', async () => {
      const a = await novoAuto(medicoes, c.sub, { valor: 15 })
      await linha(medicoes, a, { art: c.arts[0], qtd: 1 }); await linha(medicoes, a, { desc: 'Extra', extra: true, just: 'Pedido em obra', qtd: 1, preco: 5 })
      await submeter(a); await verificar(a, OBRA)
      await rm(gestor, 'auto_aprovar', { p_auto_id: a }).rejects.toThrow(/trabalhos a mais: só o administrador/)
      await rpc(admin, 'auto_aprovar', { p_auto_id: a })
      expect((await auditoria('auto_aprovar', a))[0].details.trabalhos_a_mais).toBe(true)
    })
  })
  it('segregação: quem criou não aprova; outro gestor aprova; o admin está isento', async () => {
    const c = await contrato(OBRA)
    const a = await autoUnit(c, 1, { uid: gestor }); await submeter(a); await verificar(a, OBRA)
    await rm(gestor, 'auto_aprovar', { p_auto_id: a }).rejects.toThrow(/Quem criou o auto não o pode aprovar/)
    await rpc(gestor2, 'auto_aprovar', { p_auto_id: a })
    const b = await autoUnit(c, 1, { uid: admin }); await submeter(b, admin); await verificar(b, OBRA)
    await rpc(admin, 'auto_aprovar', { p_auto_id: b })
    expect((await auto(b)).validado_por).toBe(admin)
  })
  describe('documentos obrigatórios', () => {
    it('em falta: recusa e lista os tipos; exceção só do admin com motivo ≥ 10 (audit e motivo no auto)', async () => {
      const c = await contrato(OBRA, { docs: false }); const a = await ateVerificado(c, 1)
      await rm(gestor, 'auto_aprovar', { p_auto_id: a }).rejects.toThrow(/Documentos obrigatórios em falta ou expirados: CERT_SS, CERT_AT, SEGURO_AT, ALVARA/)
      await rm(gestor, 'auto_aprovar', { p_auto_id: a, p_excecao_docs_motivo: 'Certidões pedidas às Finanças' }).rejects.toThrow(/Só o administrador pode aprovar com documentos em falta/)
      await rm(admin, 'auto_aprovar', { p_auto_id: a, p_excecao_docs_motivo: 'curto' }).rejects.toThrow(/pelo menos 10 caracteres/)
      await rpc(admin, 'auto_aprovar', { p_auto_id: a, p_excecao_docs_motivo: 'Certidões pedidas às Finanças' })
      expect((await auto(a)).excecao_motivo).toBe('Aprovação com documentos em falta (CERT_SS, CERT_AT, SEGURO_AT, ALVARA): Certidões pedidas às Finanças')
      expect((await auditoria('auto_aprovar', a))[0].details).toMatchObject({ excecao_docs: 'Certidões pedidas às Finanças', docs_em_falta: DOCS })
    })
    it('documento expirado conta como em falta; documento a expirar não bloqueia', async () => {
      const c = await contrato(OBRA, { docs: false })
      await docsEmDia(c.sub, { emitido: await dia(-100), validade: { CERT_SS: await dia(-1), CERT_AT: await dia(5) } })
      const a = await ateVerificado(c, 1)
      await rm(gestor, 'auto_aprovar', { p_auto_id: a }).rejects.toThrow(/em falta ou expirados: CERT_SS$/)
      await docsEmDia(c.sub, { tipos: ['CERT_SS'], emitido: HOJE })
      await rpc(gestor, 'auto_aprovar', { p_auto_id: a })
    })
    it('com bloquear_pagamento_sem_docs desligado, aprova sem documentos', async () => {
      const c = await contrato(OBRA, { docs: false }); const a = await ateVerificado(c, 1)
      await cfg({ bloquear_pagamento_sem_docs: false })
      try { await rpc(gestor, 'auto_aprovar', { p_auto_id: a }) } finally { await cfg({ bloquear_pagamento_sem_docs: true }) }
      expect((await auto(a)).workflow).toBe('validado')
    })
  })
  it('validar_auto (legado) delega em auto_aprovar e devolve a linha', async () => {
    const c = await contrato(OBRA)
    const s = await autoUnit(c, 1); await submeter(s)
    await rm(admin, 'validar_auto', { p_id: s }).rejects.toThrow(/tem de estar verificado/)
    await verificar(s, OBRA)
    await rm(leitura, 'validar_auto', { p_id: s }).rejects.toThrow(/Sem permissão/)
    const r = (await rpc(gestor, 'validar_auto', { p_id: s }))[0]
    expect(r).toMatchObject({ id: s, estado: 'validado', workflow: 'validado', validado_por: gestor })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('fatura do subempreiteiro (só guardada)', () => {
  let c
  beforeAll(async () => { c = await contrato(OBRA) })
  it('o gestor guarda: número, data, valor e ficheiro; evento e audit', async () => {
    const a = await aprovado(c, 10); const p = fatPath(c.sub)
    await rpc(gestor, 'auto_registar_fatura', { p_auto_id: a, p_numero: ' FT 2026/15 ', p_data: HOJE, p_valor: 100, p_path: p, p_nome: 'ft15.pdf' })
    const r = await auto(a)
    expect(r).toMatchObject({ fatura_numero: 'FT 2026/15', fatura_path: p, fatura_nome: 'ft15.pdf' }); expect(Number(r.fatura_valor)).toBe(100); expect(r.fatura_registada_em).toBeTruthy()
    expect((await eventos(OBRA)).find(e => e.tipo === 'AUTO_FATURA' && e.titulo.includes('com fatura guardada')).detalhe).toMatch(/^Fatura FT 2026\/15 de \d\d\/\d\d\/\d{4}: 100.00 €$/)
    expect((await auditoria('auto_registar_fatura', a))[0].details).toMatchObject({ numero: 'FT 2026/15', valor: 100, anterior: null })
  })
  it.each([['medições', () => medicoes], ['leitura', () => leitura], ['armazem', () => armazem]])('%s não guarda faturas', async (_n, uid) => {
    await rm(uid(), 'auto_registar_fatura', { p_auto_id: await aprovado(c, 1), p_numero: 'F1', p_data: HOJE, p_valor: 10, p_path: fatPath(c.sub), p_nome: 'f.pdf' }).rejects.toThrow(/Sem permissão/)
  })
  it('só depois de aprovado', async () => {
    const a = await ateVerificado(c, 1)
    await rm(gestor, 'auto_registar_fatura', { p_auto_id: a, p_numero: 'F1', p_data: HOJE, p_valor: 10, p_path: fatPath(c.sub), p_nome: 'f.pdf' }).rejects.toThrow(/depois de o auto ser aprovado/)
  })
  it.each([
    ['número vazio', { p_numero: ' ' }, /Indique o número da fatura/],
    ['número longo', { p_numero: 'x'.repeat(51) }, /demasiado longo/],
    ['sem data', { p_data: null }, /Indique a data da fatura/],
    ['data futura', { p_data: 'futura' }, /não pode ser futura/],
    ['valor 0', { p_valor: 0 }, /superior a 0/],
    ['ficheiro de outro subempreiteiro', { p_path: 'outro' }, /Ficheiro da fatura inválido/],
    ['ficheiro com prefixo de documento', { p_path: 'doc' }, /Ficheiro da fatura inválido/],
    ['ficheiro exe', { p_path: 'exe' }, /Ficheiro da fatura inválido/],
    ['sem nome do ficheiro', { p_nome: '' }, /Indique o nome do ficheiro/],
  ])('recusa %s', async (_n, o, erro) => {
    const a = await aprovado(c, 1)
    const args = { p_auto_id: a, p_numero: 'F1', p_data: HOJE, p_valor: 10, p_path: fatPath(c.sub), p_nome: 'f.pdf', ...o }
    if (o.p_data === 'futura') args.p_data = await dia(1)
    if (o.p_path === 'outro') args.p_path = fatPath(randomUUID())
    if (o.p_path === 'doc') args.p_path = `${c.sub}/doc-${ts()}.pdf`
    if (o.p_path === 'exe') args.p_path = `${c.sub}/fatura-${ts()}.exe`
    await rm(gestor, 'auto_registar_fatura', args).rejects.toThrow(erro)
  })
  it('substitui antes do pagamento (histórico no evento); o mesmo ficheiro não serve dois autos', async () => {
    const a = await aprovado(c, 10); const b = await aprovado(c, 1)
    const p1 = fatPath(c.sub)
    await rpc(gestor, 'auto_registar_fatura', { p_auto_id: a, p_numero: 'F-A', p_data: HOJE, p_valor: 100, p_path: p1, p_nome: 'a.pdf' })
    await rm(gestor, 'auto_registar_fatura', { p_auto_id: b, p_numero: 'F-B', p_data: HOJE, p_valor: 10, p_path: p1, p_nome: 'b.pdf' }).rejects.toThrow(/já foi registado noutro auto/)
    await rpc(admin, 'auto_registar_fatura', { p_auto_id: a, p_numero: 'F-A2', p_data: HOJE, p_valor: 95, p_path: fatPath(c.sub), p_nome: 'a2.pdf' })
    const e = (await eventos(OBRA)).filter(x => x.tipo === 'AUTO_FATURA' && x.titulo.includes('com fatura substituída')).at(-1)
    expect(e.detalhe).toMatch(/Fatura F-A2 de .*: 95.00 € \(substitui a fatura F-A: 100.00 €\) — diverge do certificado \(100.00 €\)/)
    expect((await auditoria('auto_registar_fatura', a)).at(-1).details.anterior).toMatchObject({ numero: 'F-A', valor: 100 })
  })
  it('depois de pago não se substitui', async () => {
    const a = await aprovado(c, 1); await fatura(a, c.sub, 10); await rpc(gestor, 'marcar_auto_pago', { p_auto_id: a })
    await rm(admin, 'auto_registar_fatura', { p_auto_id: a, p_numero: 'F9', p_data: HOJE, p_valor: 10, p_path: fatPath(c.sub), p_nome: 'f.pdf' }).rejects.toThrow(/já foi pago/)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('marcar_auto_pago', () => {
  it('gestor paga com fatura e documentos: pago, referência, evento com o valor a pagar e audit', async () => {
    const c = await contrato(OBRA); const a = await aprovado(c, 50); await fatura(a, c.sub, 480)
    await rpc(gestor, 'marcar_auto_pago', { p_auto_id: a, p_referencia: ' TRF-1 ' })
    expect(await auto(a)).toMatchObject({ estado_pagamento: 'pago', referencia_pagamento: 'TRF-1' })
    expect((await eventos(OBRA)).filter(e => e.tipo === 'AUTO_PAGO').at(-1).detalhe).toBe('450.00 € — ref. TRF-1')
    expect((await auditoria('marcar_auto_pago', a))[0].details).toMatchObject({ certificado: 500, a_pagar: 450, fatura_diverge: true })
  })
  it.each([['medições', () => medicoes], ['leitura', () => leitura], ['mecanico', () => mecanico]])('%s não paga', async (_n, uid) => {
    const c = await contrato(OBRA); const a = await aprovado(c, 1); await fatura(a, c.sub, 10)
    await rm(uid(), 'marcar_auto_pago', { p_auto_id: a }).rejects.toThrow(/Sem permissão/)
  })
  it('só autos aprovados; não paga duas vezes; inexistente', async () => {
    const c = await contrato(OBRA)
    await rm(gestor, 'marcar_auto_pago', { p_auto_id: await ateVerificado(c, 1) }).rejects.toThrow(/Só se paga um auto aprovado/)
    const a = await aprovado(c, 1); await fatura(a, c.sub, 10); await rpc(gestor, 'marcar_auto_pago', { p_auto_id: a })
    await rm(admin, 'marcar_auto_pago', { p_auto_id: a }).rejects.toThrow(/já foi pago/)
    await rm(admin, 'marcar_auto_pago', { p_auto_id: randomUUID() }).rejects.toThrow(/Auto não encontrado/)
  })
  it('sem fatura guardada não paga — salvo se a configuração não a exigir', async () => {
    const c = await contrato(OBRA); const a = await aprovado(c, 1)
    await rm(admin, 'marcar_auto_pago', { p_auto_id: a }).rejects.toThrow(/Falta guardar a fatura do subempreiteiro/)
    await cfg({ exigir_fatura_para_pagar: false })
    try { await rpc(gestor, 'marcar_auto_pago', { p_auto_id: a }) } finally { await cfg({ exigir_fatura_para_pagar: true }) }
  })
  it('a fatura com valor diferente do certificado não bloqueia (só aviso)', async () => {
    const c = await contrato(OBRA); const a = await aprovado(c, 10); await fatura(a, c.sub, 1)
    expect((await painel(c.sub)).avisos).toContain(`Auto n.º ${(await auto(a)).numero}: o valor da fatura (1.00 €) diverge do certificado (100.00 €)`)
    await rpc(gestor, 'marcar_auto_pago', { p_auto_id: a })
    expect((await painel(c.sub)).avisos.filter(x => x.includes('fatura'))).toEqual([])
  })
  it.each([['QUALIDADE', 'alta', true], ['SEGURANCA', 'alta', true], ['ATRASO', 'alta', false], ['PROBLEMA', 'alta', false], ['QUALIDADE', 'media', false]])
  ('ocorrência %s/%s por resolver bloqueia: %s', async (tipo, grav, bloqueia) => {
    const c = await contrato(OBRA); const a = await aprovado(c, 1); await fatura(a, c.sub, 10)
    const oc = await ocorrencia(c.sub, tipo, grav)
    expect((await painel(c.sub)).ocorrencias_bloqueantes).toBe(bloqueia ? 1 : 0)
    if (bloqueia) {
      await rm(admin, 'marcar_auto_pago', { p_auto_id: a, p_excecao_motivo: 'Exceção inválida aqui' }).rejects.toThrow(/ocorrências graves de qualidade ou segurança por resolver/)
      await rpc(medicoes, 'sub_resolver_ocorrencia', { p_id: oc, p_resolucao: 'Corrigido' })
    }
    await rpc(gestor, 'marcar_auto_pago', { p_auto_id: a })
  })
  it('documentos expirados depois da aprovação bloqueiam; exceção só do admin', async () => {
    const c = await contrato(OBRA); const a = await aprovado(c, 1); await fatura(a, c.sub, 10)
    await docsEmDia(c.sub, { tipos: ['ALVARA'], emitido: await dia(-10), validade: { ALVARA: await dia(-1) } })
    await rm(gestor, 'marcar_auto_pago', { p_auto_id: a }).rejects.toThrow(/Documentos obrigatórios em falta ou expirados: ALVARA/)
    await rm(gestor, 'marcar_auto_pago', { p_auto_id: a, p_excecao_motivo: 'Alvará em renovação no IMPIC' }).rejects.toThrow(/Só o administrador pode pagar com documentos em falta/)
    await rm(admin, 'marcar_auto_pago', { p_auto_id: a, p_excecao_motivo: 'curto' }).rejects.toThrow(/10 caracteres/)
    await rpc(admin, 'marcar_auto_pago', { p_auto_id: a, p_excecao_motivo: 'Alvará em renovação no IMPIC' })
    expect((await auto(a)).excecao_motivo).toBe('Pagamento com documentos em falta (ALVARA): Alvará em renovação no IMPIC')
    expect((await auditoria('marcar_auto_pago', a))[0].details).toMatchObject({ excecao_docs: 'Alvará em renovação no IMPIC', docs_em_falta: ['ALVARA'] })
  })
  it('só existe a assinatura nova (p_auto_id, p_referencia, p_excecao_motivo); em atraso continua a funcionar', async () => {
    expect((await sup(`SELECT p.oid::regprocedure::text AS f FROM pg_proc p WHERE p.proname = 'marcar_auto_pago'`)).map(r => r.f)).toEqual(['marcar_auto_pago(uuid,text,text)'])
    const c = await contrato(OBRA); const a = await aprovado(c, 1); await fatura(a, c.sub, 10)
    await rpc(gestor, 'marcar_auto_em_atraso', { p_auto_id: a })
    expect((await auto(a)).estado_pagamento).toBe('em_atraso')
    await rm(medicoes, 'marcar_auto_em_atraso', { p_auto_id: a }).rejects.toThrow(/Sem permissão/)
    await rpc(gestor, 'marcar_auto_pago', { p_auto_id: a })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('sub_libertar_retencao', () => {
  let c
  beforeAll(async () => {
    c = await contrato(OBRA, { ret: 10 })
    await aprovado(c, 50, { glosa: 50 })     // certificado 450 → retenção 45
    await aprovado(c, 33.333)                // 333.33 → retenção 33.33
  })
  it('liberta até ao retido (78,33 €): o limite exato passa, um cêntimo a mais não', async () => {
    const id = await rpc1(gestor, 'sub_libertar_retencao', { p_sub_id: c.sub, p_valor: 50, p_motivo: 'acordo_parcial', p_obs: ' Metade ' })
    expect((await sup(`SELECT obra_id, valor::float8 AS v, motivo, observacoes, registado_por, data_liberacao::text AS d FROM public.liberacoes_retencao WHERE id = $1`, [id]))[0])
      .toEqual({ obra_id: OBRA, v: 50, motivo: 'acordo_parcial', observacoes: 'Metade', registado_por: gestor, d: HOJE })
    await rm(gestor, 'sub_libertar_retencao', { p_sub_id: c.sub, p_valor: 28.34, p_motivo: 'outro' }).rejects.toThrow(/Só pode libertar até 28.33 € \(retido 78.33 €, já libertado 50.00 €\)/)
    await rpc(admin, 'sub_libertar_retencao', { p_sub_id: c.sub, p_valor: 28.33, p_motivo: 'conclusao_obra' })
    await rm(admin, 'sub_libertar_retencao', { p_sub_id: c.sub, p_valor: 0.01, p_motivo: 'outro' }).rejects.toThrow(/Só pode libertar até 0.00 €/)
    expect((await painel(c.sub)).retencao_libertada).toBe(78.33)
    expect((await auditoria('sub_libertar_retencao', c.sub)).map(a => a.details.valor)).toEqual([50, 28.33])
  })
  it('sem autos validados não há nada a libertar', async () => {
    const c2 = await contrato(OBRA, { docs: false })
    await rm(gestor, 'sub_libertar_retencao', { p_sub_id: c2.sub, p_valor: 1, p_motivo: 'outro' }).rejects.toThrow(/Só pode libertar até 0.00 €/)
  })
  it('ocorrência grave de qualidade/segurança por resolver bloqueia', async () => {
    const c3 = await contrato(OBRA); await aprovado(c3, 10)
    const oc = await ocorrencia(c3.sub, 'SEGURANCA', 'alta')
    await rm(admin, 'sub_libertar_retencao', { p_sub_id: c3.sub, p_valor: 1, p_motivo: 'outro' }).rejects.toThrow(/a retenção não pode ser libertada/)
    await rpc(medicoes, 'sub_resolver_ocorrencia', { p_id: oc, p_resolucao: 'Resolvido' })
    await rpc(admin, 'sub_libertar_retencao', { p_sub_id: c3.sub, p_valor: 1, p_motivo: 'outro' })
  })
  it.each([
    ['valor 0', { p_valor: 0 }, /superior a 0/],
    ['motivo inventado', { p_motivo: 'bonus' }, /Motivo de libertação inválido/],
    ['contratação inexistente', { p_sub_id: 'x' }, /Contratação não encontrada/],
    ['observações longas', { p_obs: 'x'.repeat(1001) }, /demasiado longas/],
  ])('recusa %s', async (_n, o, erro) => {
    const args = { p_sub_id: c.sub, p_valor: 1, p_motivo: 'outro', p_obs: null, ...o }
    if (o.p_sub_id === 'x') args.p_sub_id = randomUUID()
    await rm(gestor, 'sub_libertar_retencao', args).rejects.toThrow(erro)
  })
  it.each([['medições', () => medicoes], ['leitura', () => leitura], ['armazem', () => armazem], ['motorista', () => motorista]])('%s não liberta', async (_n, uid) => {
    await rm(uid(), 'sub_libertar_retencao', { p_sub_id: c.sub, p_valor: 1, p_motivo: 'outro' }).rejects.toThrow(/Sem permissão/)
  })
  it('a tabela perdeu a escrita direta (nem o admin); o admin pode apagar para corrigir; a leitura segue a obra', async () => {
    await expect(q(admin, `INSERT INTO public.liberacoes_retencao (subempreiteiro_id, valor) VALUES ($1, 1)`, [c.sub])).rejects.toThrow(/permission denied/)
    await expect(q(gestor, `UPDATE public.liberacoes_retencao SET valor = 1000 WHERE subempreiteiro_id = $1`, [c.sub])).rejects.toThrow(/permission denied/)
    const ids = (await sup(`SELECT id FROM public.liberacoes_retencao WHERE subempreiteiro_id = $1 ORDER BY created_at`, [c.sub])).map(r => r.id)
    for (const uid of [admin, gestor, medicoes, armazem, leitura, autor]) expect(await q(uid, `SELECT id FROM public.liberacoes_retencao WHERE subempreiteiro_id = $1`, [c.sub])).toHaveLength(2)
    for (const uid of [mecanico, motorista]) expect(await q(uid, `SELECT id FROM public.liberacoes_retencao WHERE subempreiteiro_id = $1`, [c.sub])).toEqual([])
    expect((await q(gestor, `DELETE FROM public.liberacoes_retencao WHERE id = $1 RETURNING id`, [ids[1]]))).toEqual([])
    expect((await q(admin, `DELETE FROM public.liberacoes_retencao WHERE id = $1 RETURNING id`, [ids[1]]))).toHaveLength(1)
    await expect(anon(tx => tx.query(`SELECT * FROM public.liberacoes_retencao`))).rejects.toThrow(/permission denied/)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('métricas sobre o certificado (sub_painel, subs_resumo, custos)', () => {
  it('invariante pago + por_pagar + retenção = executado, com glosas e retenção de 7,5 %', async () => {
    const o = await obraDireta()
    const c = await contrato(o, { ret: 7.5 })
    const a1 = await aprovado(c, 33.333, { glosa: 33.33 })   // 333.33 − 33.33 = 300 → retenção 22.50 → pago 277.50
    await fatura(a1, c.sub, 300); await rpc(gestor, 'marcar_auto_pago', { p_auto_id: a1 })
    await aprovado(c, 12.345)                                // 123.45 → retenção 9.26 (arredondada por auto) → por pagar 114.19
    const s = await autoUnit(c, 10); await submeter(s)       // em aprovação: 100
    const v = await ateVerificado(c, 5, { glosa: 10 })        // em aprovação: 40
    void v
    const p = await painel(c.sub)
    expect(p).toMatchObject({ executado: 423.45, executado_bruto: 456.78, glosado: 33.33, taxa_glosa_pct: 7.3, retencao_acumulada: 31.76,
      pago: 277.5, por_pagar: 114.19, em_aprovacao_n: 2, em_aprovacao_valor: 140, valor_contrato: 1000, executado_pct: 42.35 })
    expect(Math.round((p.pago + p.por_pagar + p.retencao_acumulada) * 100) / 100).toBe(p.executado)
    const r = (await rpc(leitura, 'subs_resumo', { p_obra_id: o }))[0]
    expect(r.executado).toBe('423.45'); expect(r.executado_pct).toBe('42.35')
  })
  it('custos da obra descontam as glosas (custos_consolidados_por_obra e obra_visao)', async () => {
    const o = await obraDireta(); const c = await contrato(o)
    await aprovado(c, 50, { glosa: 120.5 }); await aprovado(c, 10)
    const custos = (await q(leitura, `SELECT public.custos_consolidados_por_obra($1) AS r`, [o]))[0].r
    expect(custos).toMatchObject({ subempreiteiros: 479.5, total: 479.5 })
    expect(Number((await q(admin, `SELECT custo_total FROM public.obra_visao($1)`, [o]))[0].custo_total)).toBe(479.5)
    const antes = (await q(leitura, `SELECT public.custos_consolidados_por_obra($1, '2000-01-01', '2000-12-31') AS r`, [o]))[0].r
    expect(antes).toMatchObject({ subempreiteiros: 0, total: 0 })
  })
  it('progresso físico do último auto validado e desvio físico-financeiro > 10 pp → atenção', async () => {
    const c = await contrato(await obraDireta())
    const a = await autoUnit(c, 50)
    await rpc(medicoes, 'auto_guardar_evidencias', { p_auto_id: a, p_progresso_fisico_pct: 35 })
    await submeter(a); await verificar(a, c.obra); await rpc(gestor, 'auto_aprovar', { p_auto_id: a })
    const p = await painel(c.sub)
    expect(p).toMatchObject({ executado_pct: 50, progresso_fisico_pct: 35, desvio_fisico_financeiro_pp: 15, saude: 'atencao', docs_estado: 'ok', bloqueios: [] })
    expect(p.motivos).toEqual(['Execução financeira 15 pp acima do progresso físico'])
  })
  it('desvio até 10 pp não pesa; sem progresso indicado o desvio é nulo', async () => {
    const c = await contrato(await obraDireta())
    const a = await autoUnit(c, 20); await rpc(medicoes, 'auto_guardar_evidencias', { p_auto_id: a, p_progresso_fisico_pct: 10 })
    await submeter(a); await verificar(a, c.obra); await rpc(gestor, 'auto_aprovar', { p_auto_id: a })
    expect(await painel(c.sub)).toMatchObject({ desvio_fisico_financeiro_pp: 10, saude: 'ok', motivos: [] })
    const c2 = await contrato(await obraDireta()); await aprovado(c2, 20)
    expect(await painel(c2.sub)).toMatchObject({ progresso_fisico_pct: null, desvio_fisico_financeiro_pp: null })
  })
  it('documentos em falta: crítico (contrato validado), bloqueio e docs_em_falta; em rascunho não pesa na saúde', async () => {
    const c = await contrato(await obraDireta(), { docs: false })
    const p = await painel(c.sub)
    expect(p).toMatchObject({ docs_estado: 'critico', docs_em_falta: DOCS, saude: 'critico',
      motivos: ['Documentos obrigatórios em falta ou expirados: CERT_SS, CERT_AT, SEGURO_AT, ALVARA'],
      bloqueios: ['Documentos obrigatórios em falta ou expirados: CERT_SS, CERT_AT, SEGURO_AT, ALVARA'] })
    const r = await contrato(await obraDireta(), { docs: false, estado: 'rascunho' })
    expect(await painel(r.sub)).toMatchObject({ docs_estado: 'critico', saude: 'ok', motivos: [] })
    await cfg({ bloquear_pagamento_sem_docs: false })
    try { expect((await painel(c.sub)).bloqueios).toEqual([]) } finally { await cfg({ bloquear_pagamento_sem_docs: true }) }
  })
  it('documento a expirar: atenção', async () => {
    const c = await contrato(await obraDireta(), { docs: false })
    await docsEmDia(c.sub, { validade: { SEGURO_AT: await dia(10) } })
    expect(await painel(c.sub)).toMatchObject({ docs_estado: 'a_expirar', saude: 'atencao', motivos: ['Documentos a expirar: SEGURO_AT'], docs_em_falta: [] })
  })
  it('artigos sem EAP, ocorrências bloqueantes e bloqueios', async () => {
    const o = await obraDireta()
    const item = await rpc1(gestor, 'obra_orcamento_guardar_item', { p_obra_id: o, p_codigo: '01.01', p_descricao: 'Betão', p_unidade: 'm3', p_quantidade: 100, p_preco_unitario: 8 })
    const c = await contrato(o, { artigos: [{ preco: 10, qtd: 50, item }, { preco: 5, qtd: 10 }, { preco: 5, qtd: 10, desc: 'Outro' }] })
    let p = await painel(c.sub)
    expect(p).toMatchObject({ artigos_sem_eap: 2, avisos: ['2 artigos sem ligação ao orçamento (EAP)'], ocorrencias_bloqueantes: 0, bloqueios: [] })
    await ocorrencia(c.sub, 'QUALIDADE', 'alta'); await ocorrencia(c.sub, 'ATRASO', 'alta')
    p = await painel(c.sub)
    expect(p).toMatchObject({ ocorrencias_bloqueantes: 1, ocorrencias_abertas: { baixa: 0, media: 0, alta: 2 }, bloqueios: ['Existem ocorrências graves de qualidade ou segurança por resolver'] })
  })
  it('avisos: falta guardar a fatura de autos aprovados por pagar', async () => {
    const c = await contrato(await obraDireta()); const a = await aprovado(c, 1)
    expect((await painel(c.sub)).avisos).toContain(`Auto n.º ${(await auto(a)).numero}: falta guardar a fatura do subempreiteiro`)
  })
  it('painel recusado a quem não vê a obra', async () => {
    const c = await contrato(OBRA, { docs: false })
    for (const uid of [mecanico, motorista]) await expect(painel(c.sub, uid)).rejects.toThrow(/Contratação não encontrada/)
    expect(await painel(c.sub, autor)).toHaveProperty('docs_estado', 'critico')
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('painel do CEO e fluxo de caixa (valores exatos)', () => {
  let P, A, B, a1, a2, a3, b1, k
  beforeAll(async () => {
    P = await obraDireta('Obra do painel')
    const item = await rpc1(gestor, 'obra_orcamento_guardar_item', { p_obra_id: P, p_codigo: '02.01', p_descricao: 'Estrutura', p_unidade: 'm3', p_quantidade: 100, p_preco_unitario: 18 })
    A = await contrato(P, { nome: 'A Estruturas', ret: 10, artigos: [{ preco: 20, qtd: 100, item }] })
    B = await contrato(P, { nome: 'B Serralharia', ret: 5, global: 10000, docs: false })
    a1 = await aprovado(A, 30, { preco: 20, glosa: 50 })                        // 600 − 50 = 550; retenção 55; pago 495
    await fatura(a1, A.sub, 550); await rpc(gestor, 'marcar_auto_pago', { p_auto_id: a1 })
    a2 = await autoUnit(A, 20, { preco: 20 })                                    // 400; retenção 40; por pagar 360
    await rpc(medicoes, 'auto_guardar_evidencias', { p_auto_id: a2, p_progresso_fisico_pct: 40 })
    await submeter(a2); await verificar(a2, P); await rpc(gestor, 'auto_aprovar', { p_auto_id: a2 })
    a3 = await autoUnit(A, 10, { preco: 20 }); await submeter(a3)                // em aprovação: 200 (líquido 180)
    await rpc(gestor, 'sub_libertar_retencao', { p_sub_id: A.sub, p_valor: 20, p_motivo: 'acordo_parcial' })
    b1 = await novoAuto(medicoes, B.sub, { pct: 30, valor: 3000 })               // 3000; retenção 150; por pagar 2850
    await submeter(b1); await verificar(b1, P)
    await rpc(admin, 'auto_aprovar', { p_auto_id: b1, p_excecao_docs_motivo: 'Documentos pedidos ao subempreiteiro' })
    await ocorrencia(B.sub, 'SEGURANCA', 'alta')
    const s0 = (await sup(`SELECT date_trunc('week', public._hoje_pt()::timestamp)::date::text AS s`))[0].s
    k = Math.floor((Date.parse(await dia(30)) - Date.parse(s0)) / (7 * 86400_000))
  })

  it('totais, por subempreiteiro e passivo documental', async () => {
    const r = await rpc1(leitura, 'subs_painel_ceo', { p_obra_id: P })
    expect(r.totais).toEqual({ contratado: 12000, orcado_subempreitadas: 1800, certificado: 3950, pago: 495, por_pagar: 3210, retencao_acumulada: 245,
      retencao_libertada: 20, em_aprovacao_valor: 200, em_aprovacao_n: 1, glosado: 50, taxa_glosa_pct: 1.25 })
    expect(r.totais.pago + r.totais.por_pagar + r.totais.retencao_acumulada).toBe(r.totais.certificado)
    expect(r.por_sub).toEqual([
      { sub_id: A.sub, nome: 'A Estruturas', obra_id: P, obra_nome: 'Obra do painel', contratado: 2000, orcado_ligado: 1800, certificado: 950, executado_pct: 47.5,
        progresso_fisico_pct: 40, desvio_pp: 7.5, glosado: 50, taxa_glosa_pct: 5, ocorrencias_altas: 0, ocorrencias_bloqueantes: 0, docs_estado: 'ok', docs_em_falta: [], por_pagar: 360, saude: 'ok' },
      { sub_id: B.sub, nome: 'B Serralharia', obra_id: P, obra_nome: 'Obra do painel', contratado: 10000, orcado_ligado: 0, certificado: 3000, executado_pct: 30,
        progresso_fisico_pct: null, desvio_pp: null, glosado: 0, taxa_glosa_pct: 0, ocorrencias_altas: 1, ocorrencias_bloqueantes: 1, docs_estado: 'critico', docs_em_falta: DOCS, por_pagar: 2850, saude: 'critico' },
    ])
    expect(r.passivo_documental).toEqual({ subs_com_pendencia: 1, valor_por_pagar_em_risco: 2850 })
  })
  it('alertas ordenados por gravidade', async () => {
    const r = await rpc1(gestor, 'subs_painel_ceo', { p_obra_id: P })
    expect(r.alertas).toEqual([
      { tipo: 'DOCS_EM_FALTA', sub_id: B.sub, obra_id: P, gravidade: 'alta', texto: 'Documentos obrigatórios em falta ou expirados (CERT_SS, CERT_AT, SEGURO_AT, ALVARA) — B Serralharia (Obra do painel)' },
      { tipo: 'OCORRENCIA_GRAVE', sub_id: B.sub, obra_id: P, gravidade: 'alta', texto: '1 ocorrência grave por resolver — B Serralharia (Obra do painel)' },
      { tipo: 'FATURA_EM_FALTA', sub_id: B.sub, obra_id: P, gravidade: 'baixa', texto: 'Auto n.º 1 de B Serralharia: falta guardar a fatura do subempreiteiro' },
      { tipo: 'FATURA_EM_FALTA', sub_id: A.sub, obra_id: P, gravidade: 'baixa', texto: 'Auto n.º 2 de A Estruturas: falta guardar a fatura do subempreiteiro' },
    ])
  })
  it('fluxo de caixa: aprovado e em aprovação na semana do vencimento (hoje + prazo)', async () => {
    const f = await q(leitura, `SELECT semana_inicio::text AS s, aprovado::float8 AS a, em_aprovacao::float8 AS e, n_autos AS n FROM public.subs_fluxo_caixa($1)`, [P])
    expect(f).toHaveLength(12)
    expect(f[0].s).toBe((await sup(`SELECT date_trunc('week', public._hoje_pt()::timestamp)::date::text AS s`))[0].s)
    expect(f.map(x => [x.a, x.e, x.n])).toEqual(f.map((_x, i) => i === k ? [3210, 180, 3] : [0, 0, 0]))
    for (let i = 1; i < 12; i++) expect(Date.parse(f[i].s) - Date.parse(f[i - 1].s)).toBe(7 * 86400_000)
  })
  it('fatura divergente vira alerta médio; vencido entra na 1.ª semana e gera alerta alto; horizonte curto deixa de fora', async () => {
    await fatura(a2, A.sub, 390)
    await forcar(a2, `data_vencimento = public._hoje_pt() - 10`)
    const r = await rpc1(admin, 'subs_painel_ceo', { p_obra_id: P })
    expect(r.alertas.map(x => [x.tipo, x.gravidade])).toEqual([['DOCS_EM_FALTA', 'alta'], ['OCORRENCIA_GRAVE', 'alta'], ['PAGAMENTO_VENCIDO', 'alta'], ['FATURA_DIVERGE', 'media'], ['FATURA_EM_FALTA', 'baixa']])
    expect(r.alertas[2].texto).toMatch(/^Auto n.º 2 de A Estruturas venceu em \d\d\/\d\d\/\d{4} e não está pago$/)
    expect(r.alertas[3].texto).toBe('Auto n.º 2 de A Estruturas: o valor da fatura (390.00 €) diverge do certificado (400.00 €)')
    const f = await q(gestor, `SELECT aprovado::float8 AS a, em_aprovacao::float8 AS e, n_autos AS n FROM public.subs_fluxo_caixa($1, 12)`, [P])
    expect(f[0]).toEqual({ a: 360, e: 0, n: 1 }); expect(f[k]).toEqual({ a: 2850, e: 180, n: 2 })
    const curto = await q(gestor, `SELECT aprovado::float8 AS a, em_aprovacao::float8 AS e FROM public.subs_fluxo_caixa($1, 1)`, [P])
    expect(curto).toEqual([{ a: 360, e: 0 }])
  })
  it('pagos saem do fluxo; o total sem filtro inclui esta obra', async () => {
    const tudo = await rpc1(admin, 'subs_painel_ceo', {})
    expect(tudo.por_sub.map(x => x.sub_id)).toEqual(expect.arrayContaining([A.sub, B.sub]))
    expect(tudo.totais.certificado).toBeGreaterThanOrEqual(3950)
    const tot = await q(admin, `SELECT sum(aprovado)::float8 AS a FROM public.subs_fluxo_caixa(NULL, 52)`)
    expect(tot[0].a).toBeGreaterThanOrEqual(3210)
  })
  it('obras arquivadas e contratos em rascunho ficam de fora', async () => {
    const o = await obraDireta(); const c = await contrato(o); await aprovado(c, 10)
    await contrato(o, { estado: 'rascunho' })
    expect((await rpc1(admin, 'subs_painel_ceo', { p_obra_id: o })).por_sub).toHaveLength(1)
    await sup(`UPDATE public.obras SET ativo = false WHERE id = $1`, [o])
    const r = await rpc1(admin, 'subs_painel_ceo', { p_obra_id: o })
    expect(r).toEqual({ totais: { contratado: 0, orcado_subempreitadas: 0, certificado: 0, pago: 0, por_pagar: 0, retencao_acumulada: 0, retencao_libertada: 0,
      em_aprovacao_valor: 0, em_aprovacao_n: 0, glosado: 0, taxa_glosa_pct: 0 }, por_sub: [], passivo_documental: { subs_com_pendencia: 0, valor_por_pagar_em_risco: 0 }, alertas: [] })
    expect((await q(admin, `SELECT sum(aprovado)::float8 AS a FROM public.subs_fluxo_caixa($1)`, [o]))[0].a).toBe(0)
  })
  it('permissões e validações', async () => {
    for (const uid of [admin, gestor, medicoes, armazem, leitura, autor]) {
      await rpc1(uid, 'subs_painel_ceo', { p_obra_id: P }); await rpc(uid, 'subs_fluxo_caixa', { p_obra_id: P })
    }
    for (const uid of [mecanico, motorista]) {
      await rm(uid, 'subs_painel_ceo', {}).rejects.toThrow(/Sem permissão para ver o painel/)
      await rm(uid, 'subs_fluxo_caixa', {}).rejects.toThrow(/Sem permissão para ver o fluxo de caixa/)
    }
    await rm(admin, 'subs_painel_ceo', { p_obra_id: randomUUID() }).rejects.toThrow(/Obra não encontrada/)
    await rm(admin, 'subs_fluxo_caixa', { p_obra_id: randomUUID() }).rejects.toThrow(/Obra não encontrada/)
    for (const n of [0, 53, null]) await rm(admin, 'subs_fluxo_caixa', { p_obra_id: P, p_semanas: n }).rejects.toThrow(/entre 1 e 52/)
    await expect(anon(tx => tx.query(`SELECT public.subs_painel_ceo()`))).rejects.toThrow(/permission denied/)
    await expect(anon(tx => tx.query(`SELECT * FROM public.subs_fluxo_caixa()`))).rejects.toThrow(/permission denied/)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('segurança geral', () => {
  const PUBLICAS = ['auto_submeter', 'auto_iniciar_verificacao', 'auto_registar_verificacao', 'auto_verificar', 'auto_glosar', 'auto_levantar_glosa',
    'auto_devolver', 'auto_aprovar', 'validar_auto', 'auto_registar_fatura', 'marcar_auto_pago', 'marcar_auto_em_atraso', 'sub_libertar_retencao',
    'auto_guardar_evidencias', 'sub_painel', 'subs_resumo', 'subs_painel_ceo', 'subs_fluxo_caixa', 'custos_consolidados_por_obra']
  const INTERNAS = ['_subs_metricas', '_trg_auto_imutavel', '_trg_auto_linha_imutavel', '_eur', '_auto_evento', '_sub_oc_bloqueantes',
    '_auto_recalcular_glosado', '_trg_evento_auto']
  const TABELAS = ['auto_verificacoes', 'auto_glosas']
  const funcs = (sql, nomes) => sup(`SELECT DISTINCT p.proname FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY($1) AND ${sql}`, [nomes])

  it('todas as funções existem', async () => {
    expect((await funcs('true', [...PUBLICAS, ...INTERNAS])).length).toBe(PUBLICAS.length + INTERNAS.length)
  })
  it('anónimo não executa nenhuma (nem criar_auto_rpc)', async () => {
    expect(await funcs(`has_function_privilege('anon', p.oid, 'EXECUTE')`, [...PUBLICAS, ...INTERNAS, 'criar_auto_rpc'])).toEqual([])
  })
  it('autenticados executam as públicas; as internas ficam fechadas', async () => {
    expect(await funcs(`has_function_privilege('authenticated', p.oid, 'EXECUTE')`, INTERNAS)).toEqual([])
    expect(await funcs(`NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')`, PUBLICAS)).toEqual([])
    await expect(q(admin, `SELECT public._sub_oc_bloqueantes($1)`, [randomUUID()])).rejects.toThrow(/permission denied/)
    await expect(q(admin, `SELECT * FROM public._subs_metricas(NULL, NULL)`)).rejects.toThrow(/permission denied/)
  })
  it('as públicas são SECURITY DEFINER com search_path fixo; os triggers de imutabilidade são INVOKER', async () => {
    expect(await funcs(`NOT p.prosecdef`, PUBLICAS)).toEqual([])
    expect(await funcs(`NOT coalesce(p.proconfig::text ILIKE '%search_path%', false)`, [...PUBLICAS, ...INTERNAS])).toEqual([])
    expect((await funcs(`p.prosecdef`, ['_trg_auto_imutavel', '_trg_auto_linha_imutavel']))).toEqual([])
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
  it('RLS ligada; políticas sem auth.jwt()', async () => {
    expect(await sup(`SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1) AND NOT relrowsecurity`, [[...TABELAS, 'liberacoes_retencao']])).toEqual([])
    const r = await sup(`SELECT policyname, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY($1)`, [[...TABELAS, 'liberacoes_retencao']])
    expect(r.map(p => p.policyname).sort()).toEqual(['auto_glosas_select', 'auto_verificacoes_select', 'liberacoes_retencao_delete', 'liberacoes_retencao_select'])
    for (const p of r) expect(`${p.qual} ${p.with_check}`).not.toMatch(/jwt/)
  })
  it('cada papel lê glosas e verificações conforme a obra (mecânico/motorista não)', async () => {
    const c = await contrato(OBRA, { docs: false }); const a = await autoUnit(c, 1); await submeter(a)
    await rpc(medicoes, 'auto_iniciar_verificacao', { p_auto_id: a })
    await rpc(medicoes, 'auto_glosar', { p_auto_id: a, p_motivo: 'OUTRO', p_descricao: 'x', p_valor: 1 })
    for (const uid of [admin, gestor, medicoes, armazem, leitura, autor]) {
      expect(await q(uid, `SELECT id FROM public.auto_glosas WHERE auto_id = $1`, [a])).toHaveLength(1)
      expect(await q(uid, `SELECT id FROM public.auto_verificacoes WHERE auto_id = $1`, [a])).toHaveLength(5)
    }
    for (const uid of [mecanico, motorista]) {
      expect(await q(uid, `SELECT id FROM public.auto_glosas WHERE auto_id = $1`, [a])).toEqual([])
      expect(await q(uid, `SELECT id FROM public.auto_verificacoes WHERE auto_id = $1`, [a])).toEqual([])
      expect(await q(uid, `SELECT id FROM public.autos_medicao WHERE id = $1`, [a])).toEqual([])
    }
  })
  it('anónimo não executa as RPCs do fluxo (amostra) nem lê autos', async () => {
    for (const sql of [`SELECT public.auto_submeter($1)`, `SELECT public.auto_aprovar($1)`, `SELECT public.marcar_auto_pago($1)`, `SELECT public.sub_libertar_retencao($1, 1, 'outro')`]) {
      await expect(anon(tx => tx.query(sql, [randomUUID()]))).rejects.toThrow(/permission denied/)
    }
    await expect(anon(tx => tx.query(`SELECT * FROM public.autos_medicao`))).rejects.toThrow(/permission denied/)
  })
})
