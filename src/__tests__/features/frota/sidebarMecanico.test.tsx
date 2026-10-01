import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const papel = vi.hoisted(() => ({ atual: 'mecanico' }))
vi.mock('@/features/auth/useRole', () => ({
  useRole: () => ({
    role: papel.atual, isAdmin: papel.atual === 'admin', isGestor: papel.atual === 'gestor',
    isMecanico: papel.atual === 'mecanico',
  }),
}))

// A contagem de pedidos lê do Supabase: aqui só interessa o menu
vi.mock('@/features/combustivel/hooks/useAprovacao', () => ({
  usePodeAprovar: () => ({ podeAprovar: false, loading: false }),
  useContagemAguardam: () => 0,
}))

import { Sidebar } from '@/app/components/Sidebar'

function opcoes(p: string): string[] {
  papel.atual = p
  render(<MemoryRouter><Sidebar /></MemoryRouter>)
  const nav = screen.getAllByRole('navigation')[0]
  return within(nav).getAllByRole('link').map(l => l.textContent?.trim() ?? '')
}

afterEach(cleanup)

describe('menu lateral', () => {
  it('o mecânico vê só a Frota e a Ajuda', () => {
    expect(opcoes('mecanico')).toEqual(['Frota', 'Ajuda'])
  })

  it('admin vê a Frota e tudo o que já via', () => {
    const o = opcoes('admin')
    for (const x of ['Dashboard', 'Produtos', 'Abastecimento', 'Frota', 'Alertas', 'Obras', 'Utilizadores', 'Configurações']) {
      expect(o).toContain(x)
    }
  })

  it('armazém vê a Frota (só leitura) sem ganhar menus de gestão', () => {
    const o = opcoes('armazem')
    expect(o).toContain('Frota')
    expect(o).not.toContain('Alertas')
    expect(o).not.toContain('Utilizadores')
  })
})
