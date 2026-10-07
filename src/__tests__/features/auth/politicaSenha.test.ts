import { describe, it, expect } from 'vitest'
import { validarSenha, mensagemSenha, SENHA_MIN } from '@/features/auth/lib/politicaSenha'

describe('política de senha (espelha o Supabase: lower_upper_letters_digits, mínimo 12)', () => {
  it('aceita senha forte', () => { expect(validarSenha('Obra2026Segura')).toEqual([]) })
  it('mínimo de 12', () => {
    expect(SENHA_MIN).toBe(12)
    expect(validarSenha('Abc12345678')).toContain('curta')
    expect(validarSenha('Abc123456789')).not.toContain('curta')
  })
  it.each([
    ['OBRA2026SEGURA', 'sem_minuscula'],
    ['obra2026segura', 'sem_maiuscula'],
    ['ObraSeguraTotal', 'sem_digito'],
  ])('%s → %s', (s, falha) => { expect(validarSenha(s)).toContain(falha) })
  it('acentos contam como letras mas não substituem maiúscula ASCII', () => {
    expect(validarSenha('ÁGUAÇÃOÉ2026')).toContain('sem_minuscula')
  })
  it('mensagem em pt-PT lista o que falta', () => {
    expect(mensagemSenha(validarSenha('abc'))).toBe(
      'A palavra-passe tem de ter pelo menos 12 caracteres, uma maiúscula e um algarismo.')
    expect(mensagemSenha([])).toBeNull()
  })
})
