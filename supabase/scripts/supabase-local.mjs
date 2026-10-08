// Prepara .supabase-local/ — uma pasta de trabalho para `npx supabase start --workdir .supabase-local`
// com as migrations do projeto adaptadas para arrancarem num Postgres limpo.
// Nunca liga à produção: só escreve ficheiros locais.
//   node supabase/scripts/supabase-local.mjs
//   npx supabase start --workdir .supabase-local
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { adaptar } from '../tests/pg-harness.mjs'

const RAIZ = fileURLToPath(new URL('../../', import.meta.url))
const ORIGEM = RAIZ + 'supabase/'
const DESTINO = RAIZ + '.supabase-local/supabase/'

// O Postgres do Supabase local tem PostGIS: a adaptação do PGlite para geofences não é precisa
const precisaAdaptar = nome => !/geofence/.test(nome)

mkdirSync(DESTINO, { recursive: true })

const config = readFileSync(ORIGEM + 'config.toml', 'utf8')
  .replace(/^project_id = ".*"$/m, 'project_id = "encivil-local"')
  // Sem seed.sql no repositório: os dados de teste vêm de semear-local.mjs
  .replace(/(\[db\.seed\][\s\S]*?)enabled = true/, '$1enabled = false')
  // No CLI, [auth.email] enable_signup = false desliga o fornecedor de email inteiro (nem login).
  // Os registos continuam fechados por [auth] enable_signup = false.
  .replace(/(\[auth\.email\][\s\S]*?)enable_signup = false/, '$1enable_signup = true')
writeFileSync(DESTINO + 'config.toml', config)

// Recria as migrations do zero para não ficarem ficheiros antigos/renomeados
rmSync(DESTINO + 'migrations', { recursive: true, force: true })
mkdirSync(DESTINO + 'migrations')
const ficheiros = readdirSync(ORIGEM + 'migrations').filter(f => f.endsWith('.sql')).sort()
for (const f of ficheiros) {
  const sql = readFileSync(ORIGEM + 'migrations/' + f, 'utf8')
  writeFileSync(DESTINO + 'migrations/' + f, precisaAdaptar(f) ? adaptar(f, sql) : sql)
}

// Edge Functions (para `npx supabase functions serve --workdir .supabase-local`)
if (existsSync(ORIGEM + 'functions')) {
  rmSync(DESTINO + 'functions', { recursive: true, force: true })
  cpSync(ORIGEM + 'functions', DESTINO + 'functions', { recursive: true })
}

// Templates de email referenciados por content_path no config.toml
if (existsSync(ORIGEM + 'templates')) {
  rmSync(DESTINO + 'templates', { recursive: true, force: true })
  cpSync(ORIGEM + 'templates', DESTINO + 'templates', { recursive: true })
}

console.log(`Pasta pronta: ${DESTINO} (${ficheiros.length} migrations)`)
console.log('Seguinte: npx supabase start --workdir .supabase-local')
