import { assertEquals } from 'jsr:@std/assert@1'
import { validar, type Esquema } from './validar.ts'

const E: Esquema = {
  email: { tipo: 'email', obrigatorio: true },
  nome: { tipo: 'texto', max: 5 },
  id: { tipo: 'uuid' },
  papel: { tipo: 'enum', valores: ['admin', 'leitura'] },
  n: { tipo: 'numero', min: 0, max: 10 },
  ativo: { tipo: 'booleano' },
}

Deno.test('aceita e remove campos desconhecidos', () => {
  const r = validar(E, { email: 'a@b.pt', nome: 'Rui', extra: 'x' })
  assertEquals(r, { ok: true, valor: { email: 'a@b.pt', nome: 'Rui' } })
})
Deno.test('erros em pt-PT', () => {
  assertEquals(validar(E, {}), { ok: false, erro: 'Campo "email" obrigatório.' })
  assertEquals(validar(E, { email: 'x' }), { ok: false, erro: 'Campo "email" inválido.' })
  assertEquals(validar(E, { email: 'a@b.pt', nome: 'demasiado' }), { ok: false, erro: 'Campo "nome" inválido.' })
  assertEquals(validar(E, { email: 'a@b.pt', id: 'nao-uuid' }), { ok: false, erro: 'Campo "id" inválido.' })
  assertEquals(validar(E, { email: 'a@b.pt', papel: 'root' }), { ok: false, erro: 'Campo "papel" inválido.' })
  assertEquals(validar(E, { email: 'a@b.pt', n: 11 }), { ok: false, erro: 'Campo "n" inválido.' })
  assertEquals(validar(E, { email: 'a@b.pt', n: Number.NaN }), { ok: false, erro: 'Campo "n" inválido.' })
  assertEquals(validar(E, { email: 'a@b.pt', ativo: 'sim' }), { ok: false, erro: 'Campo "ativo" inválido.' })
})
Deno.test('corpo que não é objeto', () => {
  assertEquals(validar(E, null), { ok: false, erro: 'Pedido inválido.' })
  assertEquals(validar(E, []), { ok: false, erro: 'Pedido inválido.' })
  assertEquals(validar(E, 'x'), { ok: false, erro: 'Pedido inválido.' })
})
Deno.test('null em campo opcional conta como ausente', () => {
  assertEquals(validar(E, { email: 'a@b.pt', nome: null }), { ok: true, valor: { email: 'a@b.pt' } })
})
