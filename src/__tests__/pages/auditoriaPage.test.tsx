import { vi, describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { AuditoriaPage } from '@/app/pages/AuditoriaPage'
import { exportarXlsx } from '@/app/lib/exportXlsx'

const row = {
  id: '1', action: 'profiles.update', actor_id: 'a', created_at: '2026-10-08T10:00:00Z', target_id: 'u2',
  details: { role: { antes: 'armazem', depois: 'gestor' } },
}

vi.mock('@/app/pages/auditoria/dados', () => ({
  PAGE_SIZE: 50,
  limitesPeriodo: () => ({}),
  listarAuditoria: vi.fn(async () => ({ rows: [row], total: 1 })),
  exportarAuditoria: vi.fn(async () => [row]),
  listarPerfisNomes: vi.fn(async () => [{ id: 'a', nome: 'Ana' }, { id: 'u2', nome: 'Rui Silva' }]),
}))
vi.mock('@/app/lib/exportXlsx', () => ({ exportarXlsx: vi.fn(async () => {}) }))

describe('AuditoriaPage', () => {
  afterEach(cleanup)
  it('mostra frase legível e detalhes antes/depois', async () => {
    render(<AuditoriaPage />)
    expect(await screen.findByText('Ana alterou o utilizador Rui Silva (Papel)')).toBeTruthy()
    fireEvent.click(screen.getByText('Ver detalhes'))
    expect(screen.getByText('Armazém')).toBeTruthy()
    expect(screen.getByText('Gestor')).toBeTruthy()
  })
  it('exporta Excel com as colunas esperadas', async () => {
    render(<AuditoriaPage />)
    await screen.findByText(/Ana alterou/)
    fireEvent.click(screen.getByRole('button', { name: /Excel/ }))
    await waitFor(() => expect(exportarXlsx).toHaveBeenCalled())
    const linhas = vi.mocked(exportarXlsx).mock.calls[0][0]
    expect(Object.keys(linhas[0])).toEqual(['Data/Hora', 'Utilizador', 'Ação', 'Módulo', 'Campos alterados'])
    expect(linhas[0]['Campos alterados']).toBe('Papel: Armazém → Gestor')
  })
})

