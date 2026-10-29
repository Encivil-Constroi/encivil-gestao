// @vitest-environment node
// Funções chamadas sem JWT de utilizador têm de ter verify_jwt = false no config.toml,
// senão a gateway responde 401 antes de a função correr:
//   pump-status             — o Shelly envia a chave sb_publishable_* (não é um JWT)
//   notificar-abastecimento — o trigger (pg_net) envia a chave sb_publishable_* + x-segredo
//   send-push-frota         — o pg_cron (pg_net) envia a chave sb_publishable_* + x-frota-secret
//   enviar-resumo-alertas   — o agendador envia a chave sb_publishable_* + o segredo próprio
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

const config = readFileSync(fileURLToPath(new URL('../config.toml', import.meta.url)), 'utf8')

function verifyJwt(funcao) {
  const secao = config.split(/^\[/m).find(s => s.startsWith(`functions.${funcao}]`))
  return secao?.match(/^verify_jwt\s*=\s*(true|false)\s*$/m)?.[1]
}

describe('supabase/config.toml', () => {
  it.each(['pump-status', 'notificar-abastecimento', 'send-push-frota', 'enviar-resumo-alertas'])('[functions.%s] verify_jwt = false', funcao => {
    expect(verifyJwt(funcao)).toBe('false')
  })
})
