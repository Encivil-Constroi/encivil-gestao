import { assertEquals } from 'jsr:@std/assert@1'
import { normalizarLogin, emailEfetivo, loginDeEmail, senhaValida, DOMINIO_CONTA_INTERNA, traduzErroAuth } from './regras.ts'

Deno.test('normalizarLogin tira acentos, espaços e maiúsculas', () => {
  assertEquals(normalizarLogin('  João Silva '), 'joao.silva')
})
Deno.test('emailEfetivo prefere email válido', () => {
  assertEquals(emailEfetivo(' A@B.PT ', 'x'), 'a@b.pt')
})
Deno.test('emailEfetivo usa login interno sem email', () => {
  assertEquals(emailEfetivo('', '123'), `123@${DOMINIO_CONTA_INTERNA}`)
})
Deno.test('emailEfetivo recusa login curto e email inválido', () => {
  assertEquals(emailEfetivo('', 'ab'), null)
  assertEquals(emailEfetivo('nao-email', ''), null)
})
Deno.test('loginDeEmail', () => {
  assertEquals(loginDeEmail(`joao@${DOMINIO_CONTA_INTERNA}`), 'joao')
  assertEquals(loginDeEmail('a@b.pt'), null)
})
Deno.test('senhaValida exige 8', () => {
  assertEquals(senhaValida('1234567'), false)
  assertEquals(senhaValida('12345678'), true)
})
Deno.test('traduzErroAuth mapeia duplicado e senha fraca', () => {
  assertEquals(traduzErroAuth('User already registered'), 'Este email/utilizador já está registado no sistema.')
  assertEquals(traduzErroAuth('Password should be at least 6 characters'), 'Senha demasiado fraca. Escolha outra mais forte.')
  assertEquals(traduzErroAuth('Password is known to be weak and easy to guess'), 'Senha demasiado fraca. Escolha outra mais forte.')
  assertEquals(traduzErroAuth('outro'), 'outro')
})
