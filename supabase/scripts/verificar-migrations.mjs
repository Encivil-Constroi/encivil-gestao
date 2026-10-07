// Compara as migrations do repositório com as aplicadas na BD.
// Uso: node supabase/scripts/verificar-migrations.mjs aplicadas.txt
//      (uma versão por linha, ex.: resultado de
//       SELECT version FROM supabase_migrations.schema_migrations  no SQL Editor)
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const versao = f => f.slice(0, 14)

export function compararMigrations(locais, aplicadas) {
  const ap = new Set(aplicadas)
  const loc = new Set(locais.map(versao))
  return {
    emFalta: locais.filter(f => !ap.has(versao(f))),
    desconhecidas: aplicadas.filter(v => !loc.has(v)),
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const DIR = fileURLToPath(new URL('../migrations/', import.meta.url))
  const locais = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()
  const ficheiro = process.argv[2]
  if (!ficheiro) {
    console.error('Indica o ficheiro com as versões aplicadas (ver cabeçalho).')
    process.exit(2)
  }
  const aplicadas = readFileSync(ficheiro, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  const r = compararMigrations(locais, aplicadas)
  console.log(`Por aplicar (${r.emFalta.length}):\n  ${r.emFalta.join('\n  ') || '—'}`)
  console.log(`Só na BD (${r.desconhecidas.length}):\n  ${r.desconhecidas.join('\n  ') || '—'}`)
  process.exit(r.emFalta.length || r.desconhecidas.length ? 1 : 0)
}
