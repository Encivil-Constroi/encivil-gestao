import { assertEquals } from 'jsr:@std/assert@1'
import { esc } from './html.ts'

Deno.test('esc escapa & < > " \'', () => {
  assertEquals(esc('<a href=x>'), '&lt;a href=x&gt;')
  assertEquals(esc(`a&b "c" 'd'`), 'a&amp;b &quot;c&quot; &#39;d&#39;')
})
Deno.test('esc trata null e undefined como vazio', () => {
  assertEquals(esc(null), '')
  assertEquals(esc(undefined), '')
})
