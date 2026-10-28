// Ambiente local de carga: lê o estado da stack Supabase local e recusa qualquer
// alvo que não seja a própria máquina (guarda anti-produção).
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..', '..')
export const DIR_RESULTADOS = join(AQUI, 'resultados')

// Obrigatório e sem default: a raiz do repo aponta para outra stack local (trabalho paralelo) que nunca se toca.
const PROJECTO_ESPERADO = 'encivil-checkup'
const workdir = process.env.CARGA_WORKDIR
if (!workdir) {
  throw new Error(`ABORTADO: defina CARGA_WORKDIR com a pasta que contém supabase/ da stack "${PROJECTO_ESPERADO}".`)
}
const configToml = join(workdir, 'supabase', 'config.toml')
const projectId = existsSync(configToml)
  ? (readFileSync(configToml, 'utf8').match(/^project_id\s*=\s*"([^"]+)"/m) ?? [])[1]
  : undefined
if (projectId !== PROJECTO_ESPERADO) {
  throw new Error(`ABORTADO: CARGA_WORKDIR tem project_id "${projectId ?? 'desconhecido'}"; esperado "${PROJECTO_ESPERADO}".`)
}

function lerStatus() {
  // cwd em vez de --workdir: com shell no Windows os argumentos não são citados e caminhos com espaços partem.
  const saida = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    cwd: workdir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  const ini = saida.indexOf('{')
  if (ini < 0) throw new Error('supabase status não devolveu JSON (a stack local está a correr?)')
  return JSON.parse(saida.slice(ini))
}

const s = lerStatus()
export const API_URL = s.API_URL
export const ANON_KEY = s.ANON_KEY
export const SERVICE_ROLE_KEY = s.SERVICE_ROLE_KEY
export const DB_URL = s.DB_URL

const hostApi = new URL(API_URL).hostname
const hostDb = new URL(DB_URL).hostname
for (const h of [hostApi, hostDb]) {
  if (h !== '127.0.0.1' && h !== 'localhost') {
    throw new Error(`ABORTADO: o alvo "${h}" não é local. Os testes de carga nunca correm contra produção.`)
  }
}

// Contentor Docker da BD: o que publica a porta de DB_URL (evita confundir stacks locais).
export const DB_CONTAINER =
  process.env.CARGA_DB_CONTAINER ||
  execFileSync(
    'docker',
    ['ps', '--filter', `publish=${new URL(DB_URL).port}`, '--filter', 'name=supabase_db_', '--format', '{{.Names}}'],
    { encoding: 'utf8' },
  ).trim().split(/\r?\n/)[0]
if (DB_CONTAINER !== `supabase_db_${PROJECTO_ESPERADO}`) throw new Error(`ABORTADO: contentor "${DB_CONTAINER}" não é o da stack ${PROJECTO_ESPERADO}.`)
if (!DB_CONTAINER) throw new Error('Contentor da BD local não encontrado (docker ps).')

/** Executa SQL como superutilizador na BD local (via psql no contentor). Devolve stdout. */
export function psql(sql) {
  const r = spawnSync(
    'docker',
    ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'],
    { input: sql, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  )
  if (r.status !== 0) throw new Error(`psql falhou: ${r.stderr || r.stdout}`)
  return r.stdout.trim()
}

/** Senha comum dos utilizadores de carga: CARGA_SENHA, senão a gerada (guardada em resultados/, ignorada pelo git). */
export function senhaCarga() {
  if (process.env.CARGA_SENHA) return process.env.CARGA_SENHA
  const f = join(DIR_RESULTADOS, 'senha.txt')
  if (existsSync(f)) return readFileSync(f, 'utf8').trim()
  mkdirSync(DIR_RESULTADOS, { recursive: true })
  const nova = randomBytes(12).toString('base64url')
  writeFileSync(f, nova + '\n')
  return nova
}

export const PAPEIS = ['admin', 'gestor', 'armazem', 'medicoes', 'mecanico', 'motorista', 'leitura']
export const emailPapel = (papel) => `carga-${papel}@local.test`
export const emailUtilizador = (n) => `carga-u${n}@local.test`
