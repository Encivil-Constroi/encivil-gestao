// Homologação exclusivamente local. Provisionamento usa Auth admin/DB local;
// operações de domínio usam tokens de utilizadores e RLS, nunca service role.
// node supabase/scripts/validar-obras-local.mjs --bootstrap
// OBRAS_LOCAL_REQUIRED_MIGRATION=<versão confirmada pelo root> node ... --validate
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DB_CONTAINER = 'supabase_db_encivil-local'
const USERS = [
  { key: 'engenharia1', email: 'engenharia1.obras@local.test', nome: 'Engenharia 1 Local', role: 'medicoes' },
  { key: 'engenharia2', email: 'engenharia2.obras@local.test', nome: 'Engenharia 2 Local', role: 'medicoes' },
  { key: 'leitura', email: 'leitura.obras@local.test', nome: 'Autor Leitura Local', role: 'leitura' },
  { key: 'motorista', email: 'motorista.obras@local.test', nome: 'Motorista Obras Local', role: 'motorista' },
]
const lit = value => `'${String(value).replace(/'/g, "''")}'`
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const credentialsPath = () => resolve(process.env.OBRAS_LOCAL_STATE ?? join(tmpdir(), 'encivil-obras-homologacao-local.json'))
const evidencePath = () => resolve(process.env.OBRAS_LOCAL_EVIDENCE ?? join(tmpdir(), 'encivil-obras-homologacao-evidence.json'))
const parseJson = text => JSON.parse(text.replace(/^\uFEFF/, ''))

export function assertLocalUrl(value) {
  let url
  try { url = new URL(value) } catch { /* mensagem segura abaixo */ }
  if (!url || url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Recusado: API_URL tem de ser uma origem HTTP localhost sem credenciais, path ou parâmetros')
  }
  return url.origin
}

export function assertLocalDatabaseReady(checks) {
  assert.equal(checks.migration, true, 'Aguarda confirmação/aplicação pelo root da migration T2 no ambiente local')
  for (const [guard, label] of [
    ['objectGuard', 'exigência de objeto físico'], ['photoTriggers', 'triggers de fotos'],
    ['storageTrigger', 'proteção de objetos vinculados'], ['parentLock', 'lock ordenado do auto pai'],
    ['mfaGuard', 'negação de relato com MFA em falta'],
  ]) {
    assert.equal(checks[guard], true, `Stack local sem ${label}; ledger isolado não comprova a aplicação das guardas`)
  }
}

function preflight(required) {
  assert.match(required, /^\d{14}$/, 'Timestamp de migration inválido')
  assert.ok(required >= '20261008100000', 'A migration requerida deve incluir a T2 20261008100000')
  const checks = parseJson(psql(`WITH defs AS (
    SELECT pg_get_functiondef(to_regprocedure('public._obras_exigir_objeto(text,text)')) AS object_def,
      upper(pg_get_functiondef(to_regprocedure('public._trg_auto_linha_imutavel()'))) AS parent_def,
      upper(pg_get_functiondef(to_regprocedure('public.pode_relatar_obra(uuid)'))) AS mfa_def
  ) SELECT json_build_object(
    'migration', EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = ${lit(required)}),
    'objectGuard', COALESCE(object_def LIKE '%storage.objects%' AND upper(object_def) LIKE '%FOR SHARE%', false),
    'photoTriggers', NOT EXISTS (
      SELECT 1 FROM (VALUES ('public.obra_afericoes'), ('public.obra_relatorios_diarios'),
        ('public.sub_ocorrencias'), ('public.autos_medicao')) AS expected(table_name)
      WHERE NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = to_regclass(expected.table_name)
        AND t.tgname = 'trg_obras_fotos_objetos' AND t.tgenabled = 'O'
        AND t.tgfoid = to_regprocedure('public._trg_obras_fotos_objetos()'))),
    'storageTrigger', EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = to_regclass('storage.objects')
      AND t.tgname = 'trg_obras_proteger_objeto' AND t.tgenabled = 'O'
      AND t.tgfoid = to_regprocedure('public._trg_obras_proteger_objeto()')),
    'parentLock', COALESCE(parent_def LIKE '%FROM PUBLIC.AUTOS_MEDICAO%'
      AND parent_def LIKE '%ORDER BY A.ID%' AND position('FOR UPDATE' IN parent_def) > 0
      AND position('FOR UPDATE' IN parent_def) < position('SELECT A.WORKFLOW' IN parent_def), false)
      AND EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = to_regclass('public.auto_linhas')
        AND t.tgname = 'trg_auto_linha_imutavel' AND t.tgenabled = 'O'
        AND t.tgfoid = to_regprocedure('public._trg_auto_linha_imutavel()')),
    'mfaGuard', COALESCE(mfa_def LIKE '%NOT PUBLIC.MFA_EM_FALTA()%', false)
  ) FROM defs;`))
  assertLocalDatabaseReady(checks)
  return checks
}

function assertTemporaryPath(path) {
  const fromTemp = relative(resolve(tmpdir()), path)
  const fromRoot = relative(ROOT, path)
  if (!fromTemp || fromTemp.startsWith('..') || isAbsolute(fromTemp)
      || (!fromRoot.startsWith('..') && !isAbsolute(fromRoot))) {
    throw new Error('Recusado: credenciais/evidência têm de ficar em TEMP fora do repositório')
  }
}

function config() {
  // A guarda precede qualquer leitura de chaves, incluindo um status inexistente.
  if (process.env.API_URL) assertLocalUrl(process.env.API_URL)
  const statusFile = process.env.OBRAS_LOCAL_STATUS ?? join(tmpdir(), 'encivil-obras-pronto-local-status.json')
  const status = existsSync(statusFile) ? parseJson(readFileSync(statusFile, 'utf8')) : {}
  const apiUrl = assertLocalUrl(process.env.API_URL ?? status.API_URL ?? '')
  const anonKey = process.env.ANON_KEY ?? status.ANON_KEY ?? status.PUBLISHABLE_KEY
  const serviceKey = process.env.SERVICE_ROLE_KEY ?? status.SERVICE_ROLE_KEY
  if (!anonKey || !serviceKey) throw new Error('Faltam chaves da stack local no ambiente/status')
  assertTemporaryPath(credentialsPath()); assertTemporaryPath(evidencePath())
  return { apiUrl, anonKey, serviceKey }
}

function psql(sql) {
  try {
    return execFileSync('docker', ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'],
      { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000 }).trim()
  } catch {
    throw new Error('Consulta à base de dados local falhou; nenhum SQL ou credencial foi impresso')
  }
}

async function request(cfg, token, route, { method = 'GET', body, binary = false, headers = {} } = {}) {
  const r = await fetch(`${cfg.apiUrl}${route}`, {
    method, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { apikey: cfg.anonKey, ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body == null ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body),
  })
  const data = binary ? Buffer.from(await r.arrayBuffer()) : await r.json().catch(() => null)
  return { ok: r.ok, status: r.status, data }
}

function expectOk(r, label) {
  assert.equal(r.ok, true, `${label}: HTTP ${r.status} (${r.data?.code ?? r.data?.error ?? 'sem código'})`)
  return r.data
}

async function rpc(cfg, token, name, args) {
  return request(cfg, token, `/rest/v1/rpc/${name}`, { method: 'POST', body: args })
}

async function login(cfg, user) {
  const r = await request(cfg, null, '/auth/v1/token?grant_type=password', { method: 'POST', body: { email: user.email, password: user.password } })
  const session = expectOk(r, 'Login local')
  assert.equal(session.user.id, user.id, 'Sessão deve pertencer à conta esperada')
  assert.ok(session.access_token, 'Auth deve devolver token')
  return session.access_token
}

async function bootstrap(cfg) {
  const state = { apiUrl: cfg.apiUrl, createdAt: new Date().toISOString(), users: {}, fixture: {} }
  const adminCfg = { ...cfg, anonKey: cfg.serviceKey }
  const listed = expectOk(await request(adminCfg, cfg.serviceKey, '/auth/v1/admin/users?per_page=200'), 'Listar contas locais')
  for (const user of USERS) {
    const password = `LocalA9!${randomBytes(24).toString('base64url')}`
    const old = listed.users?.find(u => u.email === user.email)
    const result = expectOk(await request(adminCfg, cfg.serviceKey, old ? `/auth/v1/admin/users/${old.id}` : '/auth/v1/admin/users',
      { method: old ? 'PUT' : 'POST', body: { email: user.email, password, email_confirm: true, user_metadata: { nome: user.nome } } }), 'Provisionar conta local')
    const id = result.id ?? result.user?.id
    assert.match(id, /^[0-9a-f-]{36}$/)
    psql(`UPDATE public.profiles SET role = ${lit(user.role)}, nome = ${lit(user.nome)} WHERE id = ${lit(id)};`)
    state.users[user.key] = { ...user, id, password }
  }
  const obra = randomUUID(), sub = randomUUID(), artigo = randomUUID(), run = randomBytes(4).toString('hex')
  psql(`BEGIN;
    INSERT INTO public.obras (id, nome, cliente, estado, latitude, longitude, data_inicio, data_prevista_fim)
    VALUES (${lit(obra)}, ${lit(`Homologação Obras ${run}`)}, 'Cliente fictício local', 'ativa', 38.7, -9.14, CURRENT_DATE - 10, CURRENT_DATE + 60);
    INSERT INTO public.obra_autores (obra_id, user_id) VALUES (${lit(obra)}, ${lit(state.users.leitura.id)});
    INSERT INTO public.subempreiteiros (id, obra_id, nome, tipo, estado) VALUES (${lit(sub)}, ${lit(obra)}, 'Subempreitada fictícia local', 'unitario', 'validado');
    INSERT INTO public.subempreiteiro_artigos (id, subempreiteiro_id, descricao, unidade, preco_unitario, quantidade_prevista)
    VALUES (${lit(artigo)}, ${lit(sub)}, 'Betão local', 'm3', 10, 100); COMMIT;`)
  state.fixture = { obra, sub, artigo, run, today: today() }
  const token = await login(cfg, state.users.engenharia1)
  const fase = expectOk(await rpc(cfg, token, 'obra_guardar_fase', { p_obra_id: obra, p_nome: 'Estrutura local', p_peso: 1, p_progresso: 20 }), 'Criar fase como engenharia')
  state.fixture.fase = fase
  writeFileSync(credentialsPath(), JSON.stringify(state, null, 2), { mode: 0o600 })
  console.log(`Bootstrap local concluído: 4 contas fictícias, 1 obra, 1 fase. Credenciais apenas em ${credentialsPath()}`)
  return state
}

async function checkAccess(cfg, state) {
  assert.equal(state.apiUrl, cfg.apiUrl, 'Fixture deve pertencer à mesma API local')
  const tokens = {}
  const results = []
  for (const user of USERS) {
    const account = state.users[user.key]
    assert.equal(account.role, user.role)
    const token = await login(cfg, account)
    tokens[user.key] = token
    assert.equal(expectOk(await rpc(cfg, token, 'auth_role', {}), 'Papel remoto'), user.role)
    assert.equal(expectOk(await rpc(cfg, token, 'mfa_em_falta', {}), 'MFA real da sessão'), false)
    const medir = expectOk(await rpc(cfg, token, 'pode_medir_obras', {}), 'Permissão de medições')
    assert.equal(medir, user.role === 'medicoes')
    const relatar = expectOk(await rpc(cfg, token, 'pode_relatar_obra', { p_obra_id: state.fixture.obra }), 'Permissão de relato')
    assert.equal(relatar, user.role !== 'motorista')
    const visao = await rpc(cfg, token, 'obra_visao', { p_obra_id: state.fixture.obra })
    if (user.role === 'motorista') {
      assert.equal(visao.ok, false, 'Motorista não abre a ficha da obra')
      assert.match(visao.data?.message ?? '', /não encontrada|permissão/i)
    } else {
      assert.equal(Array.isArray(expectOk(visao, 'Abrir ficha')), false, 'PostgREST devolve composto como objeto')
      assert.equal(visao.data.obra_id, state.fixture.obra)
    }
    results.push({ scenario: `acesso-${user.key}`, status: 'pass', medir, relatar, fichaHttp: visao.status })
  }
  return { tokens, results }
}

function expectDenied(r, label, pattern = /permissão|row.level|permission|não encontrado|não encontrada/i) {
  assert.equal(r.ok, false, `${label}: operação indevida foi aceite`)
  const message = r.data?.message ?? r.data?.error ?? ''
  assert.match(message, pattern, `${label}: rejeição deve corresponder à regra, não à falta do endpoint (HTTP ${r.status}, ${r.data?.code ?? 'sem código'}: ${message})`)
  return { scenario: label, status: 'pass', http: r.status, code: r.data?.code ?? null }
}

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ9kAAAAASUVORK5CYII=', 'base64')
// Bytes sintéticos distintos continuam uma imagem PNG; não são provas de GPS/câmara.
const testImage = () => Buffer.concat([PIXEL, randomBytes(16)])
const fotoPath = (obra, folder) => `${obra}/${folder}/${Date.now()}-${randomBytes(5).toString('hex')}.png`
const encodedPath = path => path.split('/').map(encodeURIComponent).join('/')

async function upload(cfg, token, path, bytes) {
  return request(cfg, token, `/storage/v1/object/obras/${encodedPath(path)}`, {
    method: 'POST', body: bytes, headers: { 'Content-Type': 'image/png', 'x-upsert': 'false' },
  })
}

async function getBytes(cfg, token, path) {
  const r = await request(cfg, token, `/storage/v1/object/public/obras/${encodedPath(path)}?homologacao=${randomUUID()}`,
    { binary: true, headers: { 'Cache-Control': 'no-cache' } })
  assert.equal(r.ok, true, 'Arquivo original deve continuar acessível')
  return r.data
}

async function protectStorage(cfg, token, path, original, results) {
  const destination = fotoPath(path.split('/')[0], path.split('/')[1])
  const attempts = [
    ['storage-delete', '/storage/v1/object/obras', { method: 'DELETE', body: { prefixes: [path] } }],
    ['storage-upsert', `/storage/v1/object/obras/${encodedPath(path)}`, {
      method: 'POST', body: testImage(), headers: { 'Content-Type': 'image/png', 'x-upsert': 'true' },
    }],
    ['storage-move', '/storage/v1/object/move', {
      method: 'POST', body: { bucketId: 'obras', sourceKey: path, destinationKey: destination },
    }],
  ]
  const expectedHash = hash(original)
  for (const [name, route, options] of attempts) {
    const r = await request(cfg, token, route, options)
    // Storage pode devolver DELETE 200 + [] quando a RLS esconde os objetos:
    // nesse caso a ausência de recibo comprova a recusa sem fingir HTTP de erro.
    const denied = !r.ok || (name === 'storage-delete' && Array.isArray(r.data) && r.data.length === 0)
    assert.equal(denied, true, `${name}: objeto vinculado não pode ser modificado`)
    const remaining = await getBytes(cfg, token, path)
    assert.equal(hash(remaining), expectedHash, `${name}: bytes físicos devem permanecer idênticos`)
    assert.deepEqual(remaining, original, `${name}: conteúdo original preservado`)
    results.push({ scenario: `${name}-${path.split('/')[1]}`, status: 'pass', http: r.status, bytesPreserved: true, bytes: original.length })
  }
  const moved = await request(cfg, token, `/storage/v1/object/public/obras/${encodedPath(destination)}`, { binary: true })
  assert.equal(moved.ok, false, 'Move recusado não pode deixar uma cópia no destino')
}

async function validate(cfg) {
  const required = process.env.OBRAS_LOCAL_REQUIRED_MIGRATION ?? '20261008100000'
  const report = { localOnly: true, startedAt: new Date().toISOString(), migration: required, results: [] }
  try {
    report.preflight = preflight(required)
    const state = parseJson(readFileSync(credentialsPath(), 'utf8'))
    const { tokens, results } = await checkAccess(cfg, state)
    report.results.push(...results)
    const { obra, sub, artigo } = state.fixture
    const day = today()
    // Uma obra nova por bootstrap separa testes API dos relatórios do navegador.
    const fotos = []
    for (const folder of ['afericoes', 'relatorios']) {
      const path = fotoPath(obra, folder), bytes = testImage()
      expectOk(await upload(cfg, tokens.engenharia1, path, bytes), `Upload ${folder} como engenharia`)
      assert.deepEqual(await getBytes(cfg, tokens.engenharia2, path), bytes)
      fotos.push({ path, legenda: `Homologação ${folder}`, bytes })
    }
    const fotoAfericao = { path: fotos[0].path, legenda: fotos[0].legenda }
    const afericao = expectOk(await rpc(cfg, tokens.engenharia1, 'obra_registar_afericao', {
      p_obra_id: obra, p_data: day, p_progresso_pct: 35, p_resumo: 'Aferição API local', p_fotos: [fotoAfericao],
    }), 'Aferição engenharia 1')
    const afericoes = expectOk(await request(cfg, tokens.engenharia2, `/rest/v1/obra_afericoes?id=eq.${afericao}&select=id,fotos,autor_id`), 'Consulta engenharia 2')
    assert.equal(afericoes.length, 1)
    assert.equal(afericoes[0].autor_id, state.users.engenharia1.id)
    assert.deepEqual(afericoes[0].fotos, [fotoAfericao])
    report.results.push({ scenario: 'afericao-upload-consulta-engenharia2', status: 'pass', http: 200 })
    report.results.push(expectDenied(await rpc(cfg, tokens.engenharia1, 'obra_registar_afericao', {
      p_obra_id: obra, p_resumo: 'Arquivo ausente', p_fotos: [{ path: fotoPath(obra, 'afericoes') }],
    }), 'afericao-path-ausente', /Ficheiro não encontrado/))
    for (const key of ['leitura', 'motorista']) {
      report.results.push(expectDenied(await rpc(cfg, tokens[key], 'obra_registar_afericao', {
        p_obra_id: obra, p_resumo: 'Aferição indevida', p_fotos: [],
      }), `afericao-negada-${key}`))
      report.results.push(expectDenied(await request(cfg, tokens[key], '/rest/v1/obra_afericoes', {
        method: 'POST', body: { obra_id: obra, data: day, resumo: 'Escrita direta indevida', fotos: [] },
      }), `afericao-rls-direta-${key}`))
    }
    const invisible = expectOk(await request(cfg, tokens.motorista,
      `/rest/v1/obra_afericoes?id=eq.${afericao}&select=id`), 'Consulta filtrada por RLS motorista')
    assert.deepEqual(invisible, [], 'Motorista não pode ler aferição por PostgREST direto')
    report.results.push({ scenario: 'afericao-rls-leitura-motorista', status: 'pass', http: 200, rows: 0 })

    const fotoRelatorio = { path: fotos[1].path, legenda: fotos[1].legenda }
    const baseRelatorio = { p_obra_id: obra, p_data: day, p_clima: 'SOL', p_equipa_outros: 'Equipa fictícia',
      p_trabalhos: 'Trabalhos fictícios locais', p_houve_ocorrencias: true, p_ocorrencias: 'Ocorrência fictícia', p_fotos: [fotoRelatorio] }
    const relatorio = expectOk(await rpc(cfg, tokens.engenharia1, 'obra_guardar_relatorio', baseRelatorio), 'Rascunho engenharia')
    const detalhe = expectOk(await rpc(cfg, tokens.engenharia2, 'obra_relatorio_detalhe', { p_id: relatorio }), 'Ler rascunho como engenharia 2')
    assert.equal(detalhe.estado, 'rascunho')
    report.results.push(expectDenied(await rpc(cfg, tokens.engenharia2, 'obra_guardar_relatorio', {
      ...baseRelatorio, p_id: relatorio, p_trabalhos: 'Alteração de outra autoria',
    }), 'relatorio-outro-autor', /autor|permissão/i))
    expectOk(await rpc(cfg, tokens.engenharia1, 'obra_submeter_relatorio', { p_id: relatorio }), 'Submeter relatório')
    report.results.push(expectDenied(await rpc(cfg, tokens.engenharia1, 'obra_guardar_relatorio', {
      ...baseRelatorio, p_id: relatorio, p_trabalhos: 'Alteração depois de submeter',
    }), 'relatorio-submetido-imutavel', /submetido|rascunho/i))
    const submitted = expectOk(await rpc(cfg, tokens.engenharia2, 'obra_relatorio_detalhe', { p_id: relatorio }), 'Consultar relatório submetido')
    assert.equal(submitted.estado, 'submetido')
    assert.equal(submitted.trabalhos, baseRelatorio.p_trabalhos)
    report.results.push({ scenario: 'relatorio-rascunho-submissao-consulta-engenharia2', status: 'pass', http: 200 })
    const yesterday = psql("SELECT to_char((now() AT TIME ZONE 'Europe/Lisbon')::date - 1, 'YYYY-MM-DD');")
    const relLeitura = expectOk(await rpc(cfg, tokens.leitura, 'obra_guardar_relatorio', {
      ...baseRelatorio, p_data: yesterday, p_houve_ocorrencias: false, p_ocorrencias: null, p_fotos: [],
    }), 'Autor leitura designado guarda relatório')
    expectOk(await rpc(cfg, tokens.leitura, 'obra_submeter_relatorio', { p_id: relLeitura }), 'Autor leitura designado submete')
    report.results.push({ scenario: 'leitura-designada-guarda-submete', status: 'pass', http: 200 })
    report.results.push(expectDenied(await rpc(cfg, tokens.motorista, 'obra_guardar_relatorio', {
      ...baseRelatorio, p_data: yesterday, p_fotos: [],
    }), 'motorista-nao-guarda-relatorio'))
    report.results.push(expectDenied(await rpc(cfg, tokens.engenharia1, 'obra_guardar_relatorio', {
      ...baseRelatorio, p_data: yesterday, p_fotos: [{ path: fotoPath(obra, 'relatorios') }],
    }), 'relatorio-path-ausente', /Ficheiro não encontrado/))
    for (const foto of fotos) {
      await protectStorage(cfg, tokens.engenharia1, foto.path, foto.bytes, report.results)
    }
    const afericaoPreservada = expectOk(await request(cfg, tokens.engenharia2,
      `/rest/v1/obra_afericoes?id=eq.${afericao}&select=fotos`), 'Vínculo da aferição preservado')
    assert.deepEqual(afericaoPreservada[0].fotos, [fotoAfericao])
    const relatorioPreservado = expectOk(await rpc(cfg, tokens.engenharia2,
      'obra_relatorio_detalhe', { p_id: relatorio }), 'Vínculo do relatório preservado')
    assert.deepEqual(relatorioPreservado.fotos, [fotoRelatorio])
    report.results.push({ scenario: 'storage-vinculos-preservados', status: 'pass', http: 200 })

    const created = expectOk(await rpc(cfg, tokens.engenharia1, 'criar_auto_rpc', {
      p_sub_id: sub, p_data: day, p_percentagem: null, p_valor: 20, p_notas: 'Auto fictício de homologação',
    }), 'Criar auto como engenharia 1')
    assert.equal(Array.isArray(created), true, 'criar_auto_rpc devolve tabela como lista PostgREST')
    assert.equal(created.length, 1, 'A criação do auto deve devolver uma única linha')
    assert.equal(Number.isInteger(created[0].numero), true, 'Auto deve ter numeração atribuída pelo servidor')
    const auto = created[0].id
    assert.match(auto, /^[0-9a-f-]{36}$/)
    expectOk(await request(cfg, tokens.engenharia1, '/rest/v1/auto_linhas', {
      method: 'POST', body: { auto_id: auto, artigo_id: artigo, descricao: 'Betão local', unidade: 'm3', preco_unitario: 10, quantidade: 2 },
    }), 'Criar linha como engenharia 1')
    for (let i = 0; i < 2; i++) {
      const path = fotoPath(obra, 'autos'), bytes = testImage()
      expectOk(await upload(cfg, tokens.engenharia1, path, bytes), 'Upload evidência auto')
      const registered = expectOk(await rpc(cfg, tokens.engenharia1, 'auto_registar_evidencia', {
        p_auto_id: auto, p_path: path, p_legenda: 'Evidência local sintética', p_lat: 38.7, p_lon: -9.14,
        p_precisao_m: 5, p_tirada_em: new Date().toISOString(), p_hash: hash(bytes),
      }), 'Registrar evidência com GPS sintético')
      assert.equal(registered.valida, true)
    }
    expectOk(await rpc(cfg, tokens.engenharia1, 'auto_submeter', { p_auto_id: auto }), 'Submeter auto')
    expectOk(await rpc(cfg, tokens.engenharia2, 'auto_iniciar_verificacao', { p_auto_id: auto }), 'Engenharia 2 inicia verificação')
    const itens = expectOk(await request(cfg, tokens.engenharia2, `/rest/v1/auto_verificacoes?auto_id=eq.${auto}&select=ordem&order=ordem`), 'Ler checklist')
    assert.ok(itens.length > 0)
    expectOk(await rpc(cfg, tokens.engenharia2, 'auto_registar_verificacao', {
      p_auto_id: auto, p_itens: itens.map(({ ordem }) => ({ ordem, resultado: 'conforme', observacao: null })),
    }), 'Engenharia 2 preenche checklist')
    report.results.push(expectDenied(await rpc(cfg, tokens.motorista, 'auto_verificar', { p_auto_id: auto }), 'motorista-nao-verifica-auto'))
    expectOk(await rpc(cfg, tokens.engenharia2, 'auto_verificar', { p_auto_id: auto }), 'Engenharia 2 verifica auto')
    const verified = expectOk(await request(cfg, tokens.engenharia1, `/rest/v1/autos_medicao?id=eq.${auto}&select=id,workflow,created_by,verificado_por`), 'Consultar autoria e verificação')
    assert.equal(verified[0].created_by, state.users.engenharia1.id)
    assert.equal(verified[0].verificado_por, state.users.engenharia2.id)
    assert.equal(verified[0].workflow, 'verificado')
    report.results.push(expectDenied(await rpc(cfg, tokens.engenharia2, 'auto_aprovar', { p_auto_id: auto }), 'medicoes-nao-aprova-auto'))
    report.results.push({ scenario: 'auto-criado-engenharia1-verificado-engenharia2', status: 'pass', http: 200 })
    state.fixture.validation = { afericao, relatorio, relatorioLeitura: relLeitura, auto }
    writeFileSync(credentialsPath(), JSON.stringify(state, null, 2), { mode: 0o600 })
    report.status = 'pass'
  } catch (error) {
    report.status = 'fail'
    report.failure = error instanceof Error ? error.message : 'Falha sem detalhes sensíveis'
    throw error
  } finally {
    report.finishedAt = new Date().toISOString()
    writeFileSync(evidencePath(), JSON.stringify(report, null, 2), { mode: 0o600 })
    console.log(`Homologação local: ${report.status}; ${report.results.length} verificações concluídas. Evidência redigida: ${evidencePath()}`)
  }
  return report
}

async function main() {
  const cfg = config()
  if (process.argv.includes('--bootstrap')) return bootstrap(cfg)
  if (process.argv.includes('--check-access')) {
    const { results } = await checkAccess(cfg, parseJson(readFileSync(credentialsPath(), 'utf8')))
    console.log(`Acesso local confirmado: ${results.length} papéis reais, sem alterar MFA`)
    return results
  }
  if (process.argv.includes('--validate')) return validate(cfg)
  throw new Error('Use --bootstrap, --check-access ou --validate; este script não aplica migrations')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Não imprime respostas Auth, cabeçalhos, tokens ou palavras-passe.
    console.error(error instanceof Error ? error.message : 'Falha na homologação local')
    process.exitCode = 1
  })
}
