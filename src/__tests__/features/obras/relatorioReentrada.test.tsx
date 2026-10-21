import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RelatorioDetalhe } from '@/features/obras/services/relatoriosDiariosService'
import type { DadosRelatorio } from '@/features/obras/lib/relatorioDiario'
import { clearAsyncCache } from '@/app/lib/useAsync'

const m = vi.hoisted(() => ({
  relatorio: null as RelatorioDetalhe | null,
  guardar: vi.fn<(id: string | null, obraId: string, dados: DadosRelatorio) => Promise<string>>(),
}))
const NativeRequest = globalThis.Request
vi.stubGlobal('Request', class extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) { super(input, { ...init, signal: undefined }) }
})
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ role: 'admin', isAdmin: true, isGestor: false }) }))
vi.mock('@/app/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@/features/obras/lib/fotosObras', () => ({ urlFotoObra: () => null }))
vi.mock('@/features/obras/services/relatoriosDiariosService', () => ({
  obterRelatorioDiario: async () => structuredClone(m.relatorio),
  guardarRelatorioDiario: m.guardar,
  submeterRelatorioDiario: async () => { m.relatorio = { ...m.relatorio!, estado: 'submetido' }; return true },
  reabrirRelatorioDiario: async () => { m.relatorio = { ...m.relatorio!, estado: 'rascunho' }; return true },
  listarEquipaParaRelatorio: async () => [],
  listarSubempreitadasParaRelatorio: async () => [],
  autorDesignadoParaRelatorio: async () => true,
}))
vi.mock('@/features/obras/components/FotoCapture', () => ({ FotoCapture: () => null }))
import { RelatorioDiarioPage } from '@/features/obras/components/RelatorioDiarioPage'

beforeEach(() => {
  m.relatorio = {
    id: 'rel-1', obra_id: 'obra-1', obra_nome: 'Obra teste', autor_id: 'u1', autor_nome: 'Admin teste',
    estado: 'rascunho', data: '2026-10-07', clima: 'SOL', temperatura_c: null, clima_descricao: '',
    equipa_ids: [], equipa_outros: 'Equipa teste', subempreiteiros_ids: [], trabalhos: 'Trabalhos iniciais',
    houve_ocorrencias: false, ocorrencias: null, observacoes: null, fotos: [], equipa: [], subempreiteiros: [],
    submetido_em: null, submetido_por: null, submetido_por_nome: null, reaberto_em: null,
    reaberto_por: null, reaberto_por_nome: null, reaberto_motivo: null,
    criado_em: '2026-10-07T12:00:00Z', atualizado_em: '2026-10-07T12:00:00Z',
  }
  m.guardar.mockReset().mockImplementation(async (id, obraId, dados) => {
    if (m.relatorio!.estado === 'submetido') throw new Error('Este relatório já foi submetido e não pode ser alterado')
    m.relatorio = { ...m.relatorio!, ...dados, id: id!, obra_id: obraId }
    return 'rel-1'
  })
})
afterEach(() => { cleanup(); clearAsyncCache() })
const montar = () => {
  const router = createMemoryRouter([
    { path: '/obras/relatorio-diario/:rid', element: <RelatorioDiarioPage /> },
    { path: '/obras/:id', element: <p>Ficha da obra</p> },
  ], { initialEntries: ['/obras/relatorio-diario/rel-1'] })
  render(<RouterProvider router={router} />)
  return router
}
const submeter = async () => {
  await waitFor(() => expect(screen.getByLabelText('Clima')).toHaveValue('SOL'))
  fireEvent.click(screen.getByRole('button', { name: 'Submeter relatório' }))
  await screen.findByRole('button', { name: 'Reabrir relatório' })
}
const reabrir = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Reabrir relatório' }))
  fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Correção dos trabalhos' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar reabertura' }))
  await screen.findByRole('button', { name: 'Submeter relatório' })
}

describe('relatório existente após submissão', () => {
  it('protege a edição de relatório reaberto antes de voltar à obra', async () => {
    const router = montar()
    await submeter()
    await reabrir()
    fireEvent.change(screen.getByLabelText('Trabalhos realizados'), { target: { value: 'Correção ainda por guardar' } })
    fireEvent.click(screen.getByRole('link', { name: 'Ver obra' }))
    expect(await screen.findByRole('button', { name: 'Guardar e sair' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/obras/relatorio-diario/rel-1')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar e sair' }))
    await screen.findByText('Ficha da obra')
    expect(m.relatorio!.trabalhos).toBe('Correção ainda por guardar')
  })

  it('não tenta autosave de rascunho editado depois de o submeter', async () => {
    montar()
    await waitFor(() => expect(screen.getByLabelText('Trabalhos realizados')).toHaveValue('Trabalhos iniciais'))
    fireEvent.change(screen.getByLabelText('Trabalhos realizados'), { target: { value: 'Trabalhos finais' } })
    await submeter()
    await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 1200)) })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(m.relatorio!.estado).toBe('submetido')
    expect(m.relatorio!.trabalhos).toBe('Trabalhos finais')
    expect(m.guardar).toHaveBeenCalledTimes(1)
  })
})
