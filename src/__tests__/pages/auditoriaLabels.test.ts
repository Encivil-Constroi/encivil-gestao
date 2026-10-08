import { describe, it, expect } from 'vitest'
import { labelAction, severidadeAction } from '@/app/pages/AuditoriaPage'

describe('rótulos da auditoria', () => {
  it.each([
    ['colaboradores.insert', 'Criação em colaboradores'],
    ['obras.update', 'Alteração em obras'],
    ['faturas_fornecedor.delete', 'Eliminação em faturas de fornecedor'],
    ['comb_aprovadores.insert', 'Criação em aprovadores de combustível'],
    ['configuracoes_empresa.update', 'Alteração em configurações da empresa'],
    ['seguranca_config.update', 'Alteração em configuração de segurança'],
    ['tabela_desconhecida.update', 'Alteração em tabela_desconhecida'],
    ['mfa_obrigatorio', 'Verificação em dois passos obrigatória'],
    ['role_change', 'Alteração de papel'],
    ['delete_autos', 'Eliminação (autos)'],
    ['delete_autos_medicao', 'Eliminação (autos de medição)'],
    ['auto_devolver', 'Devolução de auto'],
    ['marcar_auto_pago', 'Auto marcado como pago'],
  ])('%s → %s', (a, l) => { expect(labelAction(a)).toBe(l) })
  it('severidade', () => {
    expect(severidadeAction('profiles.update')).toBe('high')
    expect(severidadeAction('seguranca_config.update')).toBe('high')
    expect(severidadeAction('obras.delete')).toBe('high')
    expect(severidadeAction('obras.update')).toBe('medium')
    expect(severidadeAction('mfa_obrigatorio')).toBe('high')
  })
})
