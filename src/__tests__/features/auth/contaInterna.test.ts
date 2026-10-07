import { describe, it, expect } from 'vitest'
import {
  normalizarLogin, emailEfetivo, loginDeEmail, senhaValida,
  paraEmailLogin, gerarSenha, DOMINIO_CONTA_INTERNA,
} from '@/features/auth/lib/contaInterna'

describe('contaInterna', () => {
  it('normalizarLogin tira acentos, espaços e maiúsculas', () => {
    expect(normalizarLogin('  João Silva ')).toBe('joao.silva')
  })
  it('emailEfetivo prefere email válido', () => {
    expect(emailEfetivo(' A@B.PT ', 'x')).toBe('a@b.pt')
  })
  it('emailEfetivo usa login interno sem email', () => {
    expect(emailEfetivo('', '123')).toBe(`123@${DOMINIO_CONTA_INTERNA}`)
  })
  it('emailEfetivo recusa login curto e email inválido', () => {
    expect(emailEfetivo('', 'ab')).toBeNull()
    expect(emailEfetivo('nao-email', '')).toBeNull()
  })
  it('loginDeEmail', () => {
    expect(loginDeEmail(`joao@${DOMINIO_CONTA_INTERNA}`)).toBe('joao')
    expect(loginDeEmail('a@b.pt')).toBeNull()
  })
  it('senhaValida segue a política (12+, maiúscula, minúscula, algarismo)', () => {
    expect(senhaValida('Abc12345678')).toBe(false)
    expect(senhaValida('abc123456789')).toBe(false)
    expect(senhaValida('Abc123456789')).toBe(true)
  })
  it('paraEmailLogin mantém email e converte utilizador', () => {
    expect(paraEmailLogin(' A@B.pt ')).toBe('a@b.pt')
    expect(paraEmailLogin('João Silva')).toBe(`joao.silva@${DOMINIO_CONTA_INTERNA}`)
  })
  it('gerarSenha tem o tamanho pedido e é válida', () => {
    const s = gerarSenha(12)
    expect(s).toHaveLength(12)
    expect(senhaValida(s)).toBe(true)
    expect(gerarSenha()).not.toBe(gerarSenha())
  })
})
