import { assertEquals } from 'jsr:@std/assert@1'
import { normalizarLogin, emailEfetivo, loginDeEmail, senhaValida, DOMINIO_CONTA_INTERNA, traduzErroAuth, linkRecuperacaoApp } from './regras.ts'

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
Deno.test('senhaValida segue a política do Supabase (12+, maiúscula, minúscula, algarismo)', () => {
  assertEquals(senhaValida('Abc12345678'), false)
  assertEquals(senhaValida('abc123456789'), false)
  assertEquals(senhaValida('ABC123456789'), false)
  assertEquals(senhaValida('Abcdefghijkl'), false)
  assertEquals(senhaValida('Abc123456789'), true)
})
Deno.test('traduzErroAuth mapeia duplicado e senha fraca', () => {
  assertEquals(traduzErroAuth('User already registered'), 'Este email/utilizador já está registado no sistema.')
  assertEquals(traduzErroAuth('Password should be at least 6 characters'), 'Senha demasiado fraca. Escolha outra mais forte.')
  assertEquals(traduzErroAuth('Password is known to be weak and easy to guess'), 'Senha demasiado fraca. Escolha outra mais forte.')
  assertEquals(traduzErroAuth('outro'), 'outro')
})

Deno.test('linkRecuperacaoApp aponta para a nossa página com token_hash codificado', () => {
  assertEquals(linkRecuperacaoApp('https://app.x', 'ab+c/d='),
    'https://app.x/reset-password?token_hash=ab%2Bc%2Fd%3D&type=recovery')
})
