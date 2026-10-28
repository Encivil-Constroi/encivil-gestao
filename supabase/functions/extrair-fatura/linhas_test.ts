import { assertEquals, assertThrows } from 'jsr:@std/assert@1'
import { validarLinhas } from './linhas.ts'

Deno.test('validarLinhas aceita linhas bem formadas e null nos campos opcionais', () => {
  const l = [{ descricao: 'Cimento', quantidade: 2, unidade: null, preco_unitario: 1.5, total_linha: null }]
  assertEquals(validarLinhas(l), l)
})
Deno.test('validarLinhas recusa descrição nula, vazia ou não string', () => {
  assertThrows(() => validarLinhas([{ descricao: null }]))
  assertThrows(() => validarLinhas([{ descricao: '   ' }]))
  assertThrows(() => validarLinhas([{ descricao: 5 }]))
})
Deno.test('validarLinhas recusa números não finitos ou texto', () => {
  assertThrows(() => validarLinhas([{ descricao: 'x', quantidade: '3' }]))
  assertThrows(() => validarLinhas([{ descricao: 'x', preco_unitario: Infinity }]))
  assertThrows(() => validarLinhas([{ descricao: 'x', total_linha: NaN }]))
})
Deno.test('validarLinhas recusa valores fora do intervalo das colunas NUMERIC', () => {
  assertThrows(() => validarLinhas([{ descricao: 'x', quantidade: 1e7 }]))
  assertThrows(() => validarLinhas([{ descricao: 'x', quantidade: -1e7 }]))
  assertThrows(() => validarLinhas([{ descricao: 'x', preco_unitario: 1e8 }]))
  assertThrows(() => validarLinhas([{ descricao: 'x', total_linha: 1e10 }]))
  assertThrows(() => validarLinhas([{ descricao: 'x', total_linha: 9999999999.999 }]))
  validarLinhas([{ descricao: 'x', quantidade: 9999999.999, preco_unitario: 99999999.9999, total_linha: -9999999999.99 }])
})
Deno.test('validarLinhas recusa o que não é lista ou lista vazia', () => {
  assertThrows(() => validarLinhas(undefined))
  assertThrows(() => validarLinhas([]))
  assertThrows(() => validarLinhas([null]))
})
