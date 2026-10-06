import { describe, it, expect } from 'vitest'
import { labelAction, severidadeAction } from '@/app/pages/AuditoriaPage'

describe('rótulos da auditoria', () => {
  it.each([
    ['colaboradores.insert', 'Criação em colaboradores'],
    ['obras.update', 'Alteração em obras'],
    ['faturas.delete', 'Eliminação em faturas'],
    ['mfa_obrigatorio', 'Verificação em dois passos obrigatória'],
    ['role_change', 'Alteração de papel'],
    ['delete_autos', 'Eliminação (autos)'],
  ])('%s → %s', (a, l) => { expect(labelAction(a)).toBe(l) })
  it('severidade', () => {
    expect(severidadeAction('profiles.update')).toBe('high')
    expect(severidadeAction('seguranca_config.update')).toBe('high')
    expect(severidadeAction('obras.delete')).toBe('high')
    expect(severidadeAction('obras.update')).toBe('medium')
    expect(severidadeAction('mfa_obrigatorio')).toBe('high')
  })
})
