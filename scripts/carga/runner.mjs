// Testes de carga (só na stack Supabase LOCAL; ver env.mjs).
// Uso: node scripts/carga/runner.mjs --perfil=leve|medio|pesado|rutura [--duracao=60] [--passo=30] [--max=500] [--sem-integridade]
// VU = um utilizador do seed (carga-u<n>) com o seu cliente e o seu papel real (a RLS aplica-se); laço com
// pausa aleatória de 1–3 s. Mede por operação n, erros por classe, p50/p95/p99 e req/s; grava JSON em
// resultados/<perfil>-<ts>.json. Classes de erro: "rede" (socket/fetch falhado: gateway local saturado) é
// separada de "gateway" (502/503/504 do Kong sem código PostgREST: ligação Kong↔PostgREST fechada), de
// "servidor" (HTTP 5xx com erro do PostgREST/BD) e "cliente" (HTTP 4xx inesperado); "negocio" = recusa prevista pela regra.
import { createClient } from '@supabase/supabase-js'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHmac, randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API_URL, ANON_KEY, DIR_RESULTADOS, psql, senhaCarga } from './env.mjs'
import { OPERACOES, PESOS, VERIFICAR_TRUNCAGEM } from './cenarios.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : d }
const PERFIL = arg('perfil', 'leve')
const DURACAO = Number(arg('duracao', 60))
const PASSO = Number(arg('passo', 30))
const MAX_VUS = Number(arg('max', 500))
const COM_INTEGRIDADE = !process.argv.includes('--sem-integridade')
const TS = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)

const PERFIS = {
  leve:   { vus: 10,  rampa: 0,  mix: { leitura: 0.7, escrita: 0.3 } },
  // Pico de picagens: entrada da manhã, todos a picar em 30 s
  medio:  { vus: 50,  rampa: 30, mix: { leitura: 0.6, escrita: 0.4 }, pesos: { picagem: 12 } },
  pesado: { vus: 200, rampa: 20, mix: { leitura: 0.5, escrita: 0.2, fecho: 0.3 } },
  rutura: { degraus: 50, mix: { leitura: 0.7, escrita: 0.3 } },
}
const perfil = PERFIS[PERFIL]
if (!perfil) throw new Error(`Perfil desconhecido: ${PERFIL}`)
const opts = { auth: { persistSession: false, autoRefreshToken: false } }

// ── Erros ────────────────────────────────────────────────────────────────────
const RE_REDE = /fetch failed|UND_ERR|ECONNRESET|ECONNREFUSED|EPIPE|socket|ETIMEDOUT|network|terminated/i
const RE_NEGOCIO = /Stock insuficiente|Já tem um pedido em curso|Esta viatura já tem um pedido/i
const ehRede = (e) => !!e && (RE_REDE.test(String(e.message ?? e)) || RE_REDE.test(String(e.details ?? '')))
function classe(p) {
  if (!p.error) return null
  if (ehRede(p.error)) return 'rede'
  if (RE_NEGOCIO.test(p.error.message ?? '')) return 'negocio'
  if ([502, 503, 504].includes(p.status) && !p.error.code) return 'gateway'
  if ((p.status ?? 0) >= 500) return 'servidor'
  if (!p.status) return 'rede'
  return 'cliente'
}
const PRIORIDADE = ['servidor', 'cliente', 'gateway', 'rede', 'negocio']

// ── Utilizadores e sessões ───────────────────────────────────────────────────
// Ordem estratificada: qualquer prefixo da lista mantém a proporção de papéis do seed (30/30/20/10/5/5 %)
function utilizadoresEstratificados() {
  const linhas = psql(`select p.id, p.email, p.role from public.profiles p where p.email like 'carga-u%@local.test'
    order by p.role, (substring(p.email from 'carga-u([0-9]+)@'))::int`).split('\n').filter(Boolean)
    .map((l) => { const [id, email, papel] = l.split('|'); return { id, email, papel } })
  const porPapel = {}
  for (const u of linhas) (porPapel[u.papel] ??= []).push(u)
  const chave = []
  for (const lista of Object.values(porPapel)) lista.forEach((u, i) => chave.push([(i + 0.5) / lista.length, u]))
  return chave.sort((a, b) => a[0] - b[0] || a[1].papel.localeCompare(b[1].papel)).map((x) => x[1])
}

// Segredo JWT da stack local (só para emitir tokens quando o Auth local recusa logins por limite de taxa)
let jwtSecret
function segredoJwt() {
  if (jwtSecret) return jwtSecret
  const saida = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    cwd: process.env.CARGA_WORKDIR, encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'ignore'],
  })
  jwtSecret = JSON.parse(saida.slice(saida.indexOf('{'))).JWT_SECRET
  return jwtSecret
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
// Mesmas claims que o GoTrue local põe num login por senha (copiadas de um token real desta corrida)
function emitirToken(modelo, u) {
  const agora = Math.floor(Date.now() / 1000)
  const claims = { ...modelo, sub: u.id, email: u.email, session_id: randomUUID(), iat: agora, exp: agora + 3600,
    amr: [{ method: 'password', timestamp: agora }] }
  const corpo = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}`
  return `${corpo}.${createHmac('sha256', segredoJwt()).update(corpo).digest('base64url')}`
}
const sessoesInfo = { login: 0, emitidos: 0 }
let modeloClaims = null
let authEsgotado = false
const senha = senhaCarga()
async function autenticar(u) {
  if (!authEsgotado) {
    const c = createClient(API_URL, ANON_KEY, opts)
    const { data, error } = await c.auth.signInWithPassword({ email: u.email, password: senha })
    if (!error) {
      sessoesInfo.login++
      if (!modeloClaims) {
        const { sub: _s, email: _e, session_id: _i, iat: _a, exp: _x, amr: _m, ...resto } =
          JSON.parse(Buffer.from(data.session.access_token.split('.')[1], 'base64url').toString())
        modeloClaims = resto
      }
      return data.session.access_token
    }
    if (error.status !== 429) throw new Error(`login ${u.email}: ${error.message}`)
    authEsgotado = true
    modeloClaims ??= { iss: `${API_URL}/auth/v1`, aud: 'authenticated', role: 'authenticated', aal: 'aal1', phone: '',
      app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, is_anonymous: false }
  }
  sessoesInfo.emitidos++
  return emitirToken(modeloClaims, u)
}

// ── Fixtures (psql, idempotentes, marcador carga-) ───────────────────────────
let base = null
let proximaViatura = 0
function fixtures(vus) {
  base ??= fixturesBase((sql) => psql(sql).split('\n').filter(Boolean))
  const hoje = new Date().toISOString().slice(0, 10)
  const nPedidos = Math.ceil((PERFIL === 'rutura' ? 10 * PASSO : DURACAO) / 2) + 5
  const objetos = []
  for (const vu of vus) {
    vu.colaborador = base.porUser.get(vu.userId) ?? null
    vu.pedidos = []
    if (vu.papel === 'motorista' && proximaViatura < base.viaturas.length) {
      vu.viatura = base.viaturas[proximaViatura++]
      for (let k = 0; k < nPedidos; k++) {
        const id = randomUUID()
        const foto = `${vu.viatura}/${hoje}_${id}_${Date.now()}${k}.jpg`
        vu.pedidos.push({ id, foto })
        objetos.push(`('combustivel-taloes','${foto}')`)
      }
    }
  }
  for (let i = 0; i < objetos.length; i += 2000) {
    psql(`insert into storage.objects(bucket_id, name) values ${objetos.slice(i, i + 2000).join(',')}`)
  }
  return base.fx
}
function fixturesBase(lista) {
  // Colaboradores de obra ligados aos utilizadores "leitura" (pessoal de obra que pica o ponto)
  psql(`with l as (select p.id, row_number() over (order by p.email) rn from public.profiles p
          where p.email like 'carga-u%@local.test' and p.role = 'leitura'
            and not exists (select 1 from public.colaboradores c where c.user_id = p.id)),
        c as (select c.id, row_number() over (order by c.numero_mecan) rn from public.colaboradores c
          where c.numero_mecan like 'carga-0%' and c.user_id is null and c.ativo)
        update public.colaboradores x set user_id = l.id from l join c using (rn) where x.id = c.id`)
  const obras = lista(`select id from public.obras where nome like 'carga-%' and estado = 'ativa' and ativo`)
  const produtos = lista(`select id from public.produtos where codigo like 'carga-%' and ativo and stock_atual >= 200 order by random() limit 600`)
  const colaboradores = lista(`select id, obra_id, coalesce(user_id::text, '') from public.colaboradores where numero_mecan like 'carga-0%' and ativo`)
    .map((l) => { const [id, obra_id, user_id] = l.split('|'); return { id, obra_id: obra_id || null, user_id } })
  const porUser = new Map(colaboradores.filter((c) => c.user_id).map((c) => [c.user_id, c]))
  const viaturas = lista(`select id from public.comb_veiculos where codigo like 'carga-%' and ativo order by codigo`)
  // Pedidos abertos de corridas anteriores bloqueariam o motorista/viatura
  psql(`update public.comb_abastecimentos_pendentes set estado = 'CANCELADO', cancelado_em = now()
         where estado in ('AGUARDA_AUTORIZACAO','AUTORIZADO')
           and solicitante_id in (select id from public.profiles where email like 'carga-%')`)
  return { porUser, viaturas, fx: { obras, produtos, colaboradores } }
}

// ── Medição ──────────────────────────────────────────────────────────────────
const registos = [] // { op, t, ms, cls, pedidos }
let reenviosRede = 0
const amostrasErro = new Map()
const ctxBase = { ehRede, reenvio: () => { reenviosRede++ } }

function escolher(vu, pesosExtra) {
  const mix = perfil.mix
  const porClasse = {}
  for (const [nome, op] of Object.entries(OPERACOES)) {
    if (!op.papeis.includes(vu.papel) || (op.disponivel && !op.disponivel(vu))) continue
    ;(porClasse[op.classe] ??= []).push([nome, (pesosExtra?.[nome] ?? PESOS[nome] ?? 1)])
  }
  const classes = Object.keys(mix).filter((k) => porClasse[k])
  const total = classes.reduce((s, k) => s + mix[k], 0)
  let r = Math.random() * total
  let cls = classes[classes.length - 1]
  for (const k of classes) { if ((r -= mix[k]) < 0) { cls = k; break } }
  const ops = porClasse[cls]
  let w = Math.random() * ops.reduce((s, o) => s + o[1], 0)
  for (const [nome, p] of ops) { if ((w -= p) < 0) return nome }
  return ops[ops.length - 1][0]
}

async function executar(vu, nome, fx) {
  const t = Date.now()
  let res
  try {
    res = await OPERACOES[nome].fn({ c: vu.c, fx, vu, ctx: ctxBase })
  } catch (e) {
    res = { pedidos: [{ error: { message: String(e?.message ?? e) }, status: undefined }] }
  }
  if (res.semFixture) return
  const ms = Date.now() - t
  const clss = res.pedidos.map(classe).filter(Boolean)
  const cls = PRIORIDADE.find((k) => clss.includes(k)) ?? null
  if (cls) {
    const k = `${nome}|${cls}`
    const lista = amostrasErro.get(k) ?? []
    if (lista.length < 3) {
      const p = res.pedidos.find((x) => classe(x) === cls)
      lista.push(`${p.status ?? '-'} ${p.error.code ?? ''} ${String(p.error.message ?? '').slice(0, 160)}`)
      amostrasErro.set(k, lista)
    }
  }
  registos.push({ op: nome, t, ms, cls, pedidos: res.pedidos.length })
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
async function lacoVu(vu, fx, inicio, fim) {
  await dormir(Math.max(0, inicio - Date.now()))
  while (Date.now() < fim()) {
    await executar(vu, escolher(vu, perfil.pesos), fx)
    await dormir(1000 + Math.random() * 2000)
  }
}

const pct = (ord, p) => (ord.length ? ord[Math.min(ord.length - 1, Math.ceil((p / 100) * ord.length) - 1)] : null)
function resumir(regs, segundos) {
  const porOp = {}
  for (const r of regs) (porOp[r.op] ??= []).push(r)
  const linhas = {}
  const resumoLinha = (rs) => {
    const ok = rs.filter((r) => !r.cls || r.cls === 'negocio').map((r) => r.ms).sort((a, b) => a - b)
    const erros = { rede: 0, gateway: 0, servidor: 0, cliente: 0, negocio: 0 }
    for (const r of rs) if (r.cls) erros[r.cls]++
    return {
      n: rs.length, erros, p50: pct(ok, 50), p95: pct(ok, 95), p99: pct(ok, 99), max: ok.at(-1) ?? null,
      ops_s: +(rs.length / segundos).toFixed(2), req_s: +(rs.reduce((s, r) => s + r.pedidos, 0) / segundos).toFixed(2),
    }
  }
  for (const [op, rs] of Object.entries(porOp)) linhas[op] = resumoLinha(rs)
  const global = resumoLinha(regs)
  const n = regs.length || 1
  global.erro_app_pct = +(((global.erros.servidor + global.erros.cliente) / n) * 100).toFixed(3)
  global.erro_rede_pct = +(((global.erros.rede + global.erros.gateway) / n) * 100).toFixed(3)
  global.erro_total_pct = +(global.erro_app_pct + global.erro_rede_pct).toFixed(3)
  const porClasse = {}
  for (const r of regs) { const k = OPERACOES[r.op].classe; porClasse[k] = (porClasse[k] ?? 0) + 1 }
  global.mix = Object.fromEntries(Object.entries(porClasse).map(([k, v]) => [k, +((v / n) * 100).toFixed(1)]))
  return { global, operacoes: linhas }
}

function imprimir(titulo, r) {
  console.log(`\n${titulo}`)
  console.log('operação              n   rede  gw serv cli  neg    p50    p95    p99   req/s')
  const linha = (nome, x) => console.log(
    `${nome.padEnd(20)} ${String(x.n).padStart(4)} ${String(x.erros.rede).padStart(5)} ${String(x.erros.gateway).padStart(3)} ${String(x.erros.servidor).padStart(4)} ` +
    `${String(x.erros.cliente).padStart(4)} ${String(x.erros.negocio).padStart(4)} ${String(x.p50).padStart(6)} ${String(x.p95).padStart(6)} ` +
    `${String(x.p99).padStart(6)} ${String(x.req_s).padStart(7)}`)
  for (const [op, x] of Object.entries(r.operacoes).sort()) linha(op, x)
  linha('GLOBAL', r.global)
  console.log(`erros: app ${r.global.erro_app_pct}% · rede+gateway ${r.global.erro_rede_pct}% · mix ${JSON.stringify(r.global.mix)}`)
}

// ── pg_stat_statements ───────────────────────────────────────────────────────
function prepararStats() {
  psql(`create extension if not exists pg_stat_statements`)
  try { psql(`alter system set pg_stat_statements.track = 'all'; select pg_reload_conf();`) } catch { /* sem permissão: fica 'top' */ }
  psql(`select pg_stat_statements_reset()`)
  return psql(`show pg_stat_statements.track`)
}
function topQueries(ordem) {
  return psql(`select json_agg(x) from (select calls, round(total_exec_time::numeric, 1) total_ms, round(mean_exec_time::numeric, 2) mean_ms,
      round(max_exec_time::numeric, 1) max_ms, rows, shared_blks_hit, shared_blks_read, left(regexp_replace(query, '\\s+', ' ', 'g'), 400) query
    from pg_stat_statements where dbid = (select oid from pg_database where datname = current_database())
      and query not ilike '%pg_stat_statements%' order by ${ordem} desc limit 10) x`)
}

// ── Execução ─────────────────────────────────────────────────────────────────
async function prepararVus(utilizadores, de, ate) {
  const novos = []
  for (let i = de; i < ate; i++) {
    const u = utilizadores[i]
    const token = await autenticar(u)
    novos.push({ n: i + 1, email: u.email, papel: u.papel, userId: u.id,
      c: createClient(API_URL, ANON_KEY, { ...opts, global: { headers: { Authorization: `Bearer ${token}` } } }) })
    if (!authEsgotado) await dormir(150)
  }
  return novos
}

async function verificarTruncagem(vus) {
  const gestor = vus.find((v) => v.papel === 'gestor') ?? vus.find((v) => v.papel === 'armazem') ?? vus[0]
  const out = {}
  for (const [nome, q] of Object.entries(VERIFICAR_TRUNCAGEM)) {
    const { data, count, error } = await q(gestor.c)
    out[nome] = error ? { erro: error.message } : { devolvidas: data?.length ?? 0, total: count, truncado_max_rows: count != null && (data?.length ?? 0) < count && (data?.length ?? 0) === 1000 }
  }
  return { como: gestor.papel, listas: out }
}

function integridade() {
  if (!COM_INTEGRIDADE) return null
  const r = spawnSync(process.execPath, ['--no-deprecation', join(AQUI, 'concorrencia.mjs'), '--so=entradas-saidas-mistas'],
    { encoding: 'utf8', env: process.env, maxBuffer: 64 * 1024 * 1024 })
  const linhas = (r.stdout ?? '').split('\n').filter((l) => /^(OK|FALHA) /.test(l))
  return { codigo: r.status, ok: r.status === 0, linhas }
}

async function main() {
  const t0 = Date.now()
  const utilizadores = utilizadoresEstratificados()
  const nVus = PERFIL === 'rutura' ? Math.min(MAX_VUS, utilizadores.length) : perfil.vus
  console.log(`perfil=${PERFIL} VUs=${nVus} duração=${PERFIL === 'rutura' ? `${PASSO}s/degrau` : `${DURACAO}s`} alvo=${API_URL}`)
  const track = prepararStats()
  const resultado = { perfil: PERFIL, ts: TS, alvo: API_URL, ambiente: 'portátil local, Docker Desktop (Windows 11), stack Supabase CLI encivil-checkup',
    duracao_s: DURACAO, pg_stat_statements_track: track }

  if (PERFIL !== 'rutura') {
    const vus = await prepararVus(utilizadores, 0, nVus)
    const fx = fixtures(vus)
    resultado.sessoes = { ...sessoesInfo }
    resultado.papeis = vus.reduce((m, v) => ({ ...m, [v.papel]: (m[v.papel] ?? 0) + 1 }), {})
    resultado.truncagem = await verificarTruncagem(vus)
    psql(`select pg_stat_statements_reset()`)
    const inicio = Date.now() + 500
    const fimT = inicio + DURACAO * 1000
    await Promise.all(vus.map((vu, i) => lacoVu(vu, fx, inicio + (perfil.rampa ? (i / vus.length) * perfil.rampa * 1000 : 0), () => fimT)))
    const segundos = (Date.now() - inicio) / 1000
    Object.assign(resultado, resumir(registos, segundos))
    imprimir(`== ${PERFIL}: ${nVus} VUs, ${segundos.toFixed(0)} s`, resultado)
  } else {
    // Degraus de 50 VUs; cada degrau corre PASSO s; para quando erro > 1 % ou p95 > 3 s
    const vus = []
    let fx = null
    let parar = false
    resultado.degraus = []
    for (let alvo = perfil.degraus; alvo <= nVus && !parar; alvo += perfil.degraus) {
      const novos = await prepararVus(utilizadores, vus.length, alvo)
      if (!fx) fx = fixtures(novos)
      else Object.assign(fx, fixtures(novos))
      vus.push(...novos)
      if (resultado.degraus.length === 0) { resultado.truncagem = await verificarTruncagem(vus); psql(`select pg_stat_statements_reset()`) }
      const inicioDegrau = Date.now()
      const fimDegrau = inicioDegrau + PASSO * 1000
      for (const vu of novos) vu.corre = lacoVu(vu, fx, Date.now(), () => (parar ? 0 : resultado.fimAtual))
      resultado.fimAtual = fimDegrau
      await dormir(fimDegrau - Date.now())
      const regs = registos.filter((r) => r.t >= inicioDegrau && r.t < fimDegrau)
      const r = resumir(regs, PASSO)
      const rompeu = r.global.erro_total_pct > 1 || (r.global.p95 ?? 0) > 3000
      resultado.degraus.push({ vus: alvo, ...r.global, operacoes: r.operacoes })
      console.log(`degrau ${alvo} VUs: n=${r.global.n} p95=${r.global.p95} ms erro app ${r.global.erro_app_pct}% rede ${r.global.erro_rede_pct}% ${rompeu ? '<= RUTURA' : ''}`)
      if (rompeu) { resultado.ponto_rutura = alvo; parar = true }
      else resultado.fimAtual = fimDegrau + PASSO * 1000 + 60_000 // continua até ao próximo degrau
    }
    parar = true
    await Promise.all(vus.map((v) => v.corre))
    resultado.ponto_rutura ??= `não atingido até ${nVus} VUs`
    resultado.sessoes = { ...sessoesInfo }
    delete resultado.fimAtual
  }

  resultado.reenvios_rede_movimentos = reenviosRede
  resultado.amostras_erro = Object.fromEntries(amostrasErro)
  resultado.top_total = JSON.parse(topQueries('total_exec_time') || '[]')
  resultado.top_media = JSON.parse(topQueries('mean_exec_time') || '[]')
  resultado.integridade = integridade()
  resultado.duracao_total_s = Math.round((Date.now() - t0) / 1000)
  if (resultado.global) {
    const g = resultado.global
    const crit = PERFIL === 'pesado' ? { p95: 2000, erro: 0.5 } : { p95: 800, erro: 0 }
    resultado.criterio = { ...crit,
      passa_app: (g.p95 ?? Infinity) < crit.p95 && (crit.erro === 0 ? g.erro_app_pct === 0 : g.erro_app_pct < crit.erro),
      passa_total: (g.p95 ?? Infinity) < crit.p95 && (crit.erro === 0 ? g.erro_total_pct === 0 : g.erro_total_pct < crit.erro),
      integridade: resultado.integridade?.ok ?? null }
    console.log(`critério: p95 < ${crit.p95} ms, erros ${crit.erro === 0 ? '= 0' : `< ${crit.erro}%`} → app ${resultado.criterio.passa_app ? 'PASSA' : 'FALHA'}, incl. rede ${resultado.criterio.passa_total ? 'PASSA' : 'FALHA'}`)
  }
  if (resultado.integridade) console.log(`integridade: ${resultado.integridade.linhas.join(' | ')}`)
  console.log(`sessões: ${sessoesInfo.login} logins reais, ${sessoesInfo.emitidos} tokens emitidos localmente (limite de logins do Auth local)`)
  mkdirSync(DIR_RESULTADOS, { recursive: true })
  const f = join(DIR_RESULTADOS, `${PERFIL}-${TS}.json`)
  writeFileSync(f, JSON.stringify(resultado, null, 1))
  console.log(`gravado ${f}`)
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
