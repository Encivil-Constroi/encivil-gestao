// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { randomUUID, randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { criarBanco, como } from './pg-harness.mjs'

const migration = new URL('../migrations/20261007110000_obras_producao.sql', import.meta.url)
let db, obra, sub, gestor, admin, outro, leitura, motorista, mecanico, legado, legadoFotoVerificado, legadoFotoAprovado, legadoRelatorio, seq = 0
const sql = async (s, p = []) => (await db.query(s, p)).rows
const q = async (uid, s, p = []) => (await como(db, { papel: 'authenticated', uid }, tx => tx.query(s, p))).rows
const fotoPath = () => `${obra}/autos/${++seq}-ab.jpg`
const docPath = () => `${sub}/doc-${++seq}.pdf`
const fatPath = () => `${sub}/fatura-${++seq}.pdf`
const upload = (bucket, path) => sql('INSERT INTO storage.objects (bucket_id, name, metadata) VALUES ($1, $2, $3)', [bucket, path, { size: 100 }])
const auto = async (uid = gestor, autor = uid) => (await q(uid,
  `INSERT INTO public.autos_medicao (subempreiteiro_id, numero, valor_periodo, created_by) VALUES ($1, $2, 10, $3) RETURNING *`, [sub, ++seq, autor]))[0]
const evidence = (a, path) => q(gestor, `SELECT public.auto_registar_evidencia($1, $2, NULL, 38.7, -9.14, 5, now(), $3) AS r`, [a, path, randomBytes(32).toString('hex')])
const document = path => q(gestor, `SELECT public.sub_doc_registar(p_sub_id => $1, p_tipo => 'CERT_SS', p_path => $2, p_nome => 'doc.pdf')`, [sub, path])
const force = (a, set, p = []) => db.transaction(async tx => {
  await tx.query("SELECT set_config('app.auto_rpc', 'on', true)")
  return tx.query(`UPDATE public.autos_medicao SET ${set} WHERE id = $1`, [a, ...p])
})
const invoice = async path => {
  const a = await auto()
  await force(a.id, "workflow = 'validado', estado = 'validado'")
  return q(gestor, `SELECT public.auto_registar_fatura($1, 'FT 1', CURRENT_DATE, 10, $2, 'f.pdf')`, [a.id, path])
}
const bindFoto = async (tipo, path) => {
  const fotos = [{ path, legenda: 'Prova' }]
  if (tipo === 'afericao') return q(gestor, `SELECT public.obra_registar_afericao(p_obra_id => $1, p_resumo => 'Aferição', p_fotos => $2::jsonb)`, [obra, fotos])
  if (tipo === 'relatorio') return q(gestor, `SELECT public.obra_guardar_relatorio(p_obra_id => $1, p_data => CURRENT_DATE - $3::int,
    p_clima => 'SOL', p_equipa_outros => 'Equipa', p_trabalhos => 'Trabalho', p_houve_ocorrencias => true,
    p_ocorrencias => 'Ocorrência', p_fotos => $2::jsonb)`, [obra, fotos, ++seq])
  if (tipo === 'ocorrencia') return q(gestor, `SELECT public.sub_registar_ocorrencia(p_subempreiteiro_id => $1, p_tipo => 'PROBLEMA', p_gravidade => 'baixa', p_descricao => 'Ocorrência', p_fotos => $2::jsonb)`, [sub, fotos])
  if (tipo === 'auto') return q(gestor, `SELECT public.auto_guardar_evidencias(p_auto_id => $1, p_fotos => $2::jsonb)`, [(await auto()).id, fotos])
  return q(gestor, `SELECT public.obra_adicionar_fotos($1, $2::jsonb)`, [obra, fotos])
}

beforeAll(async () => {
  db = await criarBanco({ ate: '20261007100000_contabilidade_rh.sql' })
  const user = async role => {
    const id = (await sql('INSERT INTO auth.users (email) VALUES ($1) RETURNING id', [`${randomUUID()}@test.pt`]))[0].id
    await sql('UPDATE public.profiles SET role = $1 WHERE id = $2', [role, id])
    return id
  }
  admin = await user('admin'); gestor = await user('gestor'); outro = await user('gestor')
  leitura = await user('leitura'); motorista = await user('motorista'); mecanico = await user('mecanico')
  obra = (await sql("INSERT INTO public.obras (nome, estado, latitude, longitude) VALUES ('Isolada', 'ativa', 38.7, -9.14) RETURNING id"))[0].id
  sub = (await sql("INSERT INTO public.subempreiteiros (obra_id, nome, tipo, estado) VALUES ($1, 'Sub', 'unitario', 'validado') RETURNING id", [obra]))[0].id
  const subLegado = (await sql("INSERT INTO public.subempreiteiros (obra_id, nome, tipo, estado) VALUES ($1, 'Legado', 'unitario', 'validado') RETURNING id", [obra]))[0].id
  legado = (await sql(`INSERT INTO public.autos_medicao (subempreiteiro_id, numero, valor_periodo, created_by, fatura_path)
    VALUES ($1, 9999, 10, $2, $3) RETURNING id`, [subLegado, outro, `${subLegado}/fatura-9999.pdf`]))[0].id
  await sql(`INSERT INTO public.auto_evidencias (auto_id, path, tirada_em, hash_sha256, valida) VALUES ($1, $2, now(), $3, true)`, [legado, fotoPath(), randomBytes(32).toString('hex')])
  await sql(`INSERT INTO public.sub_documentos (subempreiteiro_id, tipo, path) VALUES ($1, 'ALVARA', $2)`, [subLegado, `${subLegado}/doc-9999.pdf`])
  for (const wf of ['verificado', 'validado']) {
    const s = (await sql("INSERT INTO public.subempreiteiros (obra_id, nome, tipo, estado) VALUES ($1, 'Legado foto', 'unitario', 'validado') RETURNING id", [obra]))[0].id
    for (const [i, tipo] of ['CERT_SS', 'CERT_AT', 'SEGURO_AT', 'ALVARA'].entries()) {
      const path = `${s}/doc-${i + 1}.pdf`
      await upload('obras-contratos', path)
      await sql('INSERT INTO public.sub_documentos (subempreiteiro_id, tipo, path) VALUES ($1, $2, $3)', [s, tipo, path])
    }
    const fatura = `${s}/fatura-1.pdf`; await upload('obras-contratos', fatura)
    const id = (await sql(`INSERT INTO public.autos_medicao
      (subempreiteiro_id, numero, valor_periodo, workflow, estado, fatura_path, fatura_numero, fatura_data, fatura_valor)
      VALUES ($1, 1, 10, $2, $3::estado_auto, $4, 'FT Legada', CURRENT_DATE, 10) RETURNING id`,
      [s, wf, wf === 'validado' ? 'validado' : 'rascunho', fatura]))[0].id
    await sql(`INSERT INTO public.auto_evidencias (auto_id, path, tirada_em, hash_sha256, valida) VALUES ($1, $2, now(), $3, true)`, [id, fotoPath(), randomBytes(32).toString('hex')])
    if (wf === 'verificado') legadoFotoVerificado = id
    else legadoFotoAprovado = id
  }
  legadoRelatorio = (await sql(`INSERT INTO public.obra_relatorios_diarios
    (obra_id, data, estado, clima, equipa_outros, trabalhos, houve_ocorrencias, ocorrencias, fotos, autor_id)
    VALUES ($1, CURRENT_DATE - 2000, 'submetido', 'SOL', 'Equipa', 'Trabalho', true, 'Ocorrência', $2::jsonb, $3) RETURNING id`,
    [obra, [{ path: `${obra}/relatorios/9999-ab.jpg`, legenda: 'Legada' }], gestor]))[0].id
  if (existsSync(migration)) await db.exec(readFileSync(migration, 'utf8'))
}, 120000)
afterAll(async () => { await db?.close() })

describe('Obras: integridade de autoria e arquivos', () => {
  it.each(['forjada', 'nula'])('INSERT autenticado substitui autoria %s pela sessão', async caso => {
    expect((await auto(gestor, caso === 'forjada' ? outro : null)).created_by).toBe(gestor)
  })
  it('RPC de criação também usa autoria da sessão', async () => {
    const r = (await q(gestor, `SELECT * FROM public.criar_auto_rpc($1, CURRENT_DATE, NULL, 10, NULL)`, [sub]))[0]
    const id = r.id ?? Object.values(r)[0].id
    expect((await sql('SELECT created_by FROM public.autos_medicao WHERE id = $1', [id]))[0].created_by).toBe(gestor)
  })
  it('autor não pode mudar em UPDATE direto', async () => {
    const a = await auto()
    await expect(q(gestor, 'UPDATE public.autos_medicao SET created_by = $2 WHERE id = $1', [a.id, outro])).rejects.toThrow(/permission denied/)
    await expect(sql('UPDATE public.autos_medicao SET created_by = $2 WHERE id = $1', [a.id, outro])).rejects.toThrow(/autoria/)
  })
  it('gestor não aprova o próprio auto depois de tentar forjar autoria', async () => {
    const a = await auto(gestor, outro)
    await force(a.id, "workflow = 'verificado'")
    await expect(q(gestor, 'SELECT public.auto_aprovar($1)', [a.id])).rejects.toThrow(/Quem criou/)
  })
  it('importação privilegiada conserva autoria histórica e leitura legada', async () => {
    expect((await sql('SELECT created_by FROM public.autos_medicao WHERE id = $1', [legado]))[0].created_by).toBe(outro)
    await q(gestor, "UPDATE public.autos_medicao SET observacoes = 'legado' WHERE id = $1", [legado])
    expect(await q(leitura, 'SELECT id FROM public.auto_evidencias WHERE auto_id = $1', [legado])).toHaveLength(1)
    expect(await q(leitura, 'SELECT id FROM public.sub_documentos WHERE subempreiteiro_id = (SELECT subempreiteiro_id FROM public.autos_medicao WHERE id = $1)', [legado])).toHaveLength(1)
  })
  it.each(['motorista', 'mecanico'])('custos negados para %s sem acesso à obra', async role => {
    await expect(q(role === 'motorista' ? motorista : mecanico, 'SELECT public.custos_consolidados_por_obra($1)', [obra])).rejects.toThrow(/Sem permissão/)
  })
  it('custos permitidos para leitura; designação histórica não amplia motorista', async () => {
    expect(await q(leitura, 'SELECT public.custos_consolidados_por_obra($1)', [obra])).toHaveLength(1)
    // Uma designação histórica pode preceder a mudança de papel do utilizador.
    await sql("UPDATE public.profiles SET role = 'armazem' WHERE id = $1", [motorista])
    await q(admin, 'SELECT public.obra_definir_autores($1, $2)', [obra, [motorista]])
    await sql("UPDATE public.profiles SET role = 'motorista' WHERE id = $1", [motorista])
    await expect(q(motorista, 'SELECT public.custos_consolidados_por_obra($1)', [obra])).rejects.toThrow(/Sem permissão/)
    await expect(q(motorista, 'SELECT public.custos_consolidados_por_obra($1)', [randomUUID()])).rejects.toThrow(/Sem permissão/)
    await q(admin, 'SELECT public.obra_definir_autores($1, $2)', [obra, []])
  })
  it.each(['evidência', 'documento', 'fatura'])('%s exige objeto existente no bucket correto', async tipo => {
    const path = tipo === 'evidência' ? fotoPath() : tipo === 'documento' ? docPath() : fatPath()
    const bind = () => tipo === 'evidência' ? auto().then(a => evidence(a.id, path)) : tipo === 'documento' ? document(path) : invoice(path)
    await expect(bind()).rejects.toThrow(/Ficheiro.*não.*encontrado/)
    await upload(tipo === 'evidência' ? 'obras-contratos' : 'obras', path)
    await expect(bind()).rejects.toThrow(/Ficheiro.*não.*encontrado/)
    await upload(tipo === 'evidência' ? 'obras' : 'obras-contratos', path)
    await expect(bind()).resolves.toHaveLength(1)
  })
  it.each(['evidência', 'documento', 'fatura'])('%s vinculado bloqueia DELETE e qualquer UPDATE de storage', async tipo => {
    const bucket = tipo === 'evidência' ? 'obras' : 'obras-contratos'
    const path = tipo === 'evidência' ? fotoPath() : tipo === 'documento' ? docPath() : fatPath()
    await upload(bucket, path)
    if (tipo === 'evidência') await evidence((await auto()).id, path)
    else if (tipo === 'documento') await document(path)
    else await invoice(path)
    // Privilegiado também: prova que o trigger protege o objeto, além da RLS existente.
    await expect(sql('DELETE FROM storage.objects WHERE bucket_id = $1 AND name = $2', [bucket, path])).rejects.toThrow(/vinculado/)
    for (const set of ["name = name || '.novo'", "metadata = '{\"size\":200}'", 'bucket_id = bucket_id']) {
      await expect(sql(`UPDATE storage.objects SET ${set} WHERE bucket_id = $1 AND name = $2`, [bucket, path])).rejects.toThrow(/vinculado/)
    }
  })
  it('objeto sem vínculo pode ser atualizado e apagado', async () => {
    const path = fotoPath(); await upload('obras', path)
    await sql("UPDATE storage.objects SET metadata = '{}' WHERE name = $1", [path])
    await sql('DELETE FROM storage.objects WHERE name = $1', [path])
  })
  it('importação privilegiada nova pode conservar autoria histórica', async () => {
    const r = (await sql(`INSERT INTO public.autos_medicao (subempreiteiro_id, numero, valor_periodo, created_by)
      VALUES ($1, $2, 10, $3) RETURNING created_by`, [sub, ++seq, outro]))[0]
    expect(r.created_by).toBe(outro)
  })
  it('helpers internos fechados e search_path fixo; RPC pública mantém o grant', async () => {
    const nomes = ['_obras_exigir_objeto', '_trg_obras_autoria_auto', '_trg_obras_vinculo_objeto', '_trg_obras_auto_objetos', '_trg_obras_proteger_objeto', '_trg_obras_fotos_objetos']
    const r = await sql(`SELECT p.proname, p.proconfig,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS autenticado,
      has_function_privilege('service_role', p.oid, 'EXECUTE') AS service
      FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY($1)`, [nomes])
    expect(r).toHaveLength(nomes.length)
    for (const f of r) {
      expect(f).toMatchObject({ anon: false, autenticado: false, service: false })
      expect(f.proconfig).toContain('search_path=public')
    }
    await expect(q(admin, `SELECT public._obras_exigir_objeto('obras', 'fake')`)).rejects.toThrow(/permission denied/)
    await expect(como(db, { papel: 'anon' }, tx => tx.query('SELECT public.custos_consolidados_por_obra($1)', [obra]))).rejects.toThrow(/permission denied/)
  })
  it('evidência legada ausente não satisfaz nova verificação', async () => {
    await expect(force(legado, "workflow = 'verificado'")).rejects.toThrow(/Ficheiro.*não.*encontrado/)
    // Repara apenas a foto para isolar as guardas de fatura e documento abaixo.
    const path = (await sql('SELECT path FROM public.auto_evidencias WHERE auto_id = $1', [legado]))[0].path
    await upload('obras', path)
  })
  it('fatura legada ausente não satisfaz novo pagamento', async () => {
    await expect(force(legado, "estado_pagamento = 'pago'")).rejects.toThrow(/Ficheiro.*não.*encontrado/)
  })
  it('documento obrigatório atual sem arquivo não satisfaz aprovação', async () => {
    await expect(force(legado, "workflow = 'validado', estado = 'validado'")).rejects.toThrow(/Ficheiro.*não.*encontrado/)
  })
  it('auto legado já verificado não aprova com foto válida declarada mas ausente', async () => {
    await expect(q(gestor, 'SELECT public.auto_aprovar($1)', [legadoFotoVerificado])).rejects.toThrow(/Ficheiro.*não.*encontrado/)
  })
  it('auto legado já aprovado não paga com foto válida declarada mas ausente', async () => {
    await expect(q(gestor, 'SELECT public.marcar_auto_pago($1)', [legadoFotoAprovado])).rejects.toThrow(/Ficheiro.*não.*encontrado/)
  })
  it.each(['afericao', 'relatorio', 'ocorrencia', 'auto', 'galeria'])('%s exige upload real para novo path e protege o objeto', async tipo => {
    const pasta = { afericao: 'afericoes', relatorio: 'relatorios', ocorrencia: 'subempreitadas', auto: 'autos', galeria: 'galeria' }[tipo]
    const path = `${obra}/${pasta}/${++seq}-ab.jpg`
    await expect(bindFoto(tipo, path)).rejects.toThrow(/Ficheiro.*não.*encontrado/)
    await upload('obras', path)
    await expect(bindFoto(tipo, path)).resolves.toHaveLength(1)
    await expect(sql('DELETE FROM storage.objects WHERE name = $1', [path])).rejects.toThrow(/vinculado/)
    await expect(sql("UPDATE storage.objects SET metadata = '{}' WHERE name = $1", [path])).rejects.toThrow(/vinculado/)
  })
  it('relatório legado reaberto conserva leitura/edição mas não ressubmete foto ausente', async () => {
    await q(admin, `SELECT public.obra_reabrir_relatorio($1, 'Correção de relatório antigo')`, [legadoRelatorio])
    const r = (await q(leitura, 'SELECT * FROM public.obra_relatorios_diarios WHERE id = $1', [legadoRelatorio]))[0]
    expect(r.fotos).toHaveLength(1)
    await q(gestor, `SELECT public.obra_guardar_relatorio(p_id => $1, p_data => $2, p_clima => 'SOL',
      p_equipa_outros => 'Equipa', p_trabalhos => 'Trabalho revisto', p_houve_ocorrencias => true,
      p_ocorrencias => 'Ocorrência', p_fotos => $3::jsonb)`, [legadoRelatorio, r.data, [{ ...r.fotos[0], legenda: 'Revista' }]])
    await expect(q(gestor, 'SELECT public.obra_submeter_relatorio($1)', [legadoRelatorio])).rejects.toThrow(/Ficheiro.*não.*encontrado/)
  })
})
