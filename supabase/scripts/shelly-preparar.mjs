// ================================================================
// ENCIVIL — Gera o script da bomba pronto a colar no Shelly
//
//   $env:PUMP_POLO2_SECRET = "<segredo>"        # PowerShell  (export no Git Bash)
//   node supabase/scripts/shelly-preparar.mjs
//
// Lê a chave pública (sb_publishable_…) de .env.local (ou --chave=) e o segredo da
// variável PUMP_POLO2_SECRET (ou --secret=, que fica no histórico da shell).
// Escreve supabase/scripts/_pronto/shelly-polo2.js — pasta IGNORADA pelo git: o ficheiro
// contém o segredo e nunca deve ser commitado. O segredo não é impresso.
// ================================================================
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const MARCA_CHAVE = '"SUBSTITUIR_PELA_CHAVE_PUBLICA"'
const MARCA_SEGREDO = '"SUBSTITUIR_PELO_PUMP_POLO2_SECRET"'

// Transformação pura (testada): devolve o código final ou lança erro com a razão.
export function prepararScript(base, { chave, segredo }) {
  if (!chave || !/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(chave)) {
    throw new Error('A chave tem de ser a chave pública (sb_publishable_…). A chave secreta (sb_secret_…) nunca vai para o aparelho.')
  }
  // Sem aspas, barras, espaços ou quebras de linha: o valor entra num literal de texto do script
  if (!segredo || !/^[A-Za-z0-9._~+=:-]{12,}$/.test(segredo)) {
    throw new Error('O segredo está vazio, é curto (< 12) ou tem caracteres não suportados (usar letras, números e . _ ~ + = : -).')
  }
  if (!base.includes(MARCA_CHAVE) || !base.includes(MARCA_SEGREDO)) {
    throw new Error('Marcador de chave/segredo não encontrado no script base (shelly-polo2.js foi alterado?).')
  }
  return base.replace(MARCA_CHAVE, JSON.stringify(chave)).replace(MARCA_SEGREDO, JSON.stringify(segredo))
}

function chaveDoEnv() {
  try {
    const env = readFileSync(fileURLToPath(new URL('../../.env.local', import.meta.url)), 'utf8')
    return env.match(/^\s*VITE_SUPABASE_PUBLISHABLE_KEY\s*=\s*"?([^"\r\n]+)"?/m)?.[1].trim()
  } catch { return undefined }
}

function principal() {
  const args = Object.fromEntries(process.argv.slice(2).map(a => {
    const [k, ...v] = a.replace(/^--/, '').split('=')
    return [k, v.join('=')]
  }))
  const chave = args.chave || chaveDoEnv()
  const segredo = args.secret || process.env.PUMP_POLO2_SECRET

  try {
    const base = readFileSync(fileURLToPath(new URL('./shelly-polo2.js', import.meta.url)), 'utf8')
    const codigo = prepararScript(base, { chave, segredo })
    const pasta = fileURLToPath(new URL('./_pronto/', import.meta.url))
    mkdirSync(pasta, { recursive: true })
    const destino = pasta + 'shelly-polo2.js'
    writeFileSync(destino, codigo, 'utf8')
    console.log(`\nScript pronto: ${destino}`)
    console.log('Contém o segredo da bomba: não partilhar nem commitar (pasta ignorada pelo git).')
    console.log('Próximo passo: docs/21-shelly-pro3-bomba.md §4 (colar no aparelho, Save, Start, «Run on startup»).\n')
  } catch (e) {
    console.error(`\nERRO: ${e.message}\n`)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal()
