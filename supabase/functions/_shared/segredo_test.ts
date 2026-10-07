import { assertEquals } from 'jsr:@std/assert@1'
import { igualSeguro, autorizadoPorSegredo } from './segredo.ts'

Deno.test('igualSeguro', () => {
  assertEquals(igualSeguro('abc', 'abc'), true)
  assertEquals(igualSeguro('abc', 'abd'), false)
  assertEquals(igualSeguro('abc', 'abcd'), false)
  assertEquals(igualSeguro('', ''), true)
})
Deno.test('sem segredo configurado recusa sempre (falha fechada)', () => {
  assertEquals(autorizadoPorSegredo('Bearer ', ''), false)
  assertEquals(autorizadoPorSegredo(null, ''), false)
})
Deno.test('com segredo exige Bearer exato', () => {
  assertEquals(autorizadoPorSegredo('Bearer s3', 's3'), true)
  assertEquals(autorizadoPorSegredo('s3', 's3'), false)
  assertEquals(autorizadoPorSegredo(null, 's3'), false)
})
