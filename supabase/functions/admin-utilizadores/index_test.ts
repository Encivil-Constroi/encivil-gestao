// deno test --no-lock --node-modules-dir=none --allow-env supabase/functions/
import { assertEquals } from 'jsr:@std/assert@1'

Deno.env.set('SUPABASE_URL', 'https://teste.supabase.co')
Deno.env.set('SUPABASE_ANON_KEY', 'chave-anonima')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'chave-servico')

const servirOriginal = Deno.serve
;(Deno as unknown as { serve: unknown }).serve = () => ({})
const { temMfaVerificado } = await import('./index.ts')
;(Deno as unknown as { serve: unknown }).serve = servirOriginal

Deno.test('temMfaVerificado', () => {
  assertEquals(temMfaVerificado({ factors: [{ status: 'verified' }] }), true)
  assertEquals(temMfaVerificado({ factors: [{ status: 'unverified' }] }), false)
  assertEquals(temMfaVerificado({}), false)
  assertEquals(temMfaVerificado({ factors: null }), false)
})
