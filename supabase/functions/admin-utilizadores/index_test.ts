// deno test --no-lock --node-modules-dir=none --allow-env supabase/functions/
import { assertEquals } from 'jsr:@std/assert@1'

Deno.env.set('SUPABASE_URL', 'https://teste.supabase.co')
Deno.env.set('SUPABASE_ANON_KEY', 'chave-anonima')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'chave-servico')

const servirOriginal = Deno.serve
;(Deno as unknown as { serve: unknown }).serve = () => ({})
const { temMfaVerificado, mfaAtivo, PADRAO_TELEMOVEL, ESQUEMAS_PAYLOAD } = await import('./index.ts')
const { validar } = await import('../_shared/validar.ts')
;(Deno as unknown as { serve: unknown }).serve = servirOriginal

Deno.test('temMfaVerificado', () => {
  assertEquals(temMfaVerificado({ factors: [{ status: 'verified' }] }), true)
  assertEquals(temMfaVerificado({ factors: [{ status: 'unverified' }] }), false)
  assertEquals(temMfaVerificado({}), false)
  assertEquals(temMfaVerificado({ factors: null }), false)
})

Deno.test('mfaAtivo usa a RPC quando existe (a listagem não traz factors)', () => {
  assertEquals(mfaAtivo({ id: 'a' }, new Set(['a'])), true)
  assertEquals(mfaAtivo({ id: 'b' }, new Set(['a'])), false)
  assertEquals(mfaAtivo({ id: 'b', factors: [{ status: 'verified' }] }, new Set(['a'])), false)
})

Deno.test('mfaAtivo sem a RPC cai para os factors', () => {
  assertEquals(mfaAtivo({ id: 'a', factors: [{ status: 'verified' }] }, null), true)
  assertEquals(mfaAtivo({ id: 'a' }, null), false)
})

Deno.test('telemóvel aceita separadores usuais e rejeita letras', () => {
  for (const t of ['912345678', '+351 912 345 678', '912-345-678', '(+351) 912 345 678']) assertEquals(PADRAO_TELEMOVEL.test(t), true, t)
  for (const t of ['91x345678', '912;345', '<script>']) assertEquals(PADRAO_TELEMOVEL.test(t), false, t)
})

Deno.test('linkRecuperacao recusa userId que não é uuid', () => {
  assertEquals(validar(ESQUEMAS_PAYLOAD.linkRecuperacao, { userId: 'abc' }).ok, false)
  assertEquals(validar(ESQUEMAS_PAYLOAD.linkRecuperacao, {}).ok, false)
  assertEquals(validar(ESQUEMAS_PAYLOAD.linkRecuperacao, { userId: '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d' }).ok, true)
})
