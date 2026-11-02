import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('@/features/colaboradores/hooks/useColaboradores', () => ({
  useColaboradores: () => ({ colaboradores: [{ id: 'X', nome: 'Ana', numeroMecan: '1' }] }),
}))
vi.mock('@/features/epis/hooks/useEpisColaborador', () => ({
  useEpisColaborador: () => ({ epis: [], loading: false, reload: vi.fn() }),
  useTiposEpi: () => ({ tipos: [] }),
}))
vi.mock('@/features/epis/hooks/useAtribuirEpi', () => ({
  useAtribuirEpi: () => ({ atribuir: vi.fn(), loading: false }),
  useDevolverEpi: () => ({ devolver: vi.fn(), loading: false }),
}))
vi.mock('@/features/epis/hooks/useFormacoesColaborador', () => ({
  useFormacoesColaborador: () => ({ formacoes: [], loading: false }),
  useTiposFormacao: () => ({ tipos: [] }),
}))
vi.mock('@/features/epis/hooks/useRegistarFormacao', () => ({
  useRegistarFormacao: () => ({ registar: vi.fn(), loading: false }),
  useUploadCertificado: () => ({ upload: vi.fn(), loading: false }),
}))

import { EpisPage } from '@/features/epis/components/EpisPage'
import { FormacoesPage } from '@/features/epis/components/FormacoesPage'
import { FichaSegurancaPage } from '@/features/epis/components/FichaSegurancaPage'

afterEach(cleanup)

describe.each([
  ['EpisPage', EpisPage, 'Os EPIs aparecem aqui.'],
  ['FormacoesPage', FormacoesPage, 'As formações aparecem aqui.'],
  ['FichaSegurancaPage', FichaSegurancaPage, 'A ficha aparece aqui.'],
])('%s sem colaborador escolhido', (_nome, Pagina, descricao) => {
  it('mostra o estado inicial "Escolha um colaborador" e nunca "Seleciona "', () => {
    const { container } = render(<Pagina />)
    expect(screen.getByText('Escolha um colaborador')).toBeInTheDocument()
    expect(screen.getByText(descricao)).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/Seleciona /)
  })
})
