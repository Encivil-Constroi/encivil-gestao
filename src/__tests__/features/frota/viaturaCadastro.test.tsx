import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'

const mocks = vi.hoisted(() => ({
  role: 'admin' as string,
  viaturas: [] as unknown[],
  criar: vi.fn(async (input: unknown) => (input ? { id: 'nova-1' } : null)),
  atualizar: vi.fn(async (id: string) => ({ id })),
}))

vi.mock('@/features/auth/useRole', () => ({
  useRole: () => ({
    role: mocks.role, isAdmin: mocks.role === 'admin', isGestor: mocks.role === 'gestor',
    isMecanico: mocks.role === 'mecanico',
    podeFrota: ['admin', 'gestor', 'mecanico'].includes(mocks.role),
    podeCombustivel: ['admin', 'gestor', 'armazem'].includes(mocks.role),
  }),
}))

vi.mock('@/features/frota/hooks/useFrota', () => ({
  useResumoFrota: () => ({ viaturas: mocks.viaturas, loading: false, error: null, reload: vi.fn() }),
  useAvaliarFrota: () => ({ avaliar: vi.fn(), loading: false }),
  useFichaViatura: () => ({
    ficha: {
      viatura: { id: 'v1', codigo: 'V-01/A', nome: 'Carrinha & Cª', identificacao: '00-AA-00', tipo: 'viatura', unidadeContador: 'km' },
      kmAtual: 9800, itens: [], alertas: [], manutencoes: [], checklists: [], atribuicoes: [],
      colaboradores: new Map(),
    },
    loading: false, error: null, reload: vi.fn(),
  }),
  useCatalogo: () => ({ catalogo: [], loading: false, error: null, reload: vi.fn() }),
  useColaboradoresAtivos: () => ({ colaboradores: [] }),
  useAtribuirCondutor: () => ({ atribuir: vi.fn(), loading: false }),
}))
vi.mock('@/features/frota/services/frotaService', () => ({ urlFotoChecklist: (k: string) => k }))

// Objeto estável: o formulário copia `vehicle` para o estado num useEffect, e um objeto novo a cada render entra em ciclo
const { veiculoV1 } = vi.hoisted(() => ({ veiculoV1: { id: 'v1', code: 'V-01', name: 'Carrinha', type: 'viatura', fuelType: 'gasoleo', counterUnit: 'km' } }))
vi.mock('@/features/combustivel/hooks/useCombustivel', () => ({
  useVeiculo: (id?: string) => ({
    vehicle: id ? veiculoV1 : null,
    loading: false, error: null, reload: vi.fn(),
  }),
  useGuardarVeiculo: () => ({ criar: mocks.criar, atualizar: mocks.atualizar, loading: false }),
}))
vi.mock('@/features/combustivel/services/veiculosService', () => ({
  gerarCodigoVeiculoPreview: async () => 'V-02',
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { FrotaPage } from '@/features/frota/components/FrotaPage'
import { FichaViaturaPage } from '@/features/frota/components/FichaViaturaPage'
import { VeiculoFormPage } from '@/app/pages/VeiculoFormPage'

function abrir(caminho: string) {
  render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="/frota" element={<FrotaPage />} />
        <Route path="/frota/viatura/nova" element={<VeiculoFormPage />} />
        <Route path="/frota/viatura/:id/editar" element={<VeiculoFormPage />} />
        <Route path="/frota/viatura/:id" element={<FichaViaturaPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const clicar = (el: Element) => act(async () => { fireEvent.click(el) })

beforeEach(() => {
  mocks.role = 'admin'
  mocks.viaturas = []
  mocks.criar.mockClear()
  mocks.atualizar.mockClear()
})
afterEach(cleanup)

describe('FrotaPage — cadastro de viaturas', () => {
  it.each(['admin', 'gestor', 'armazem'])('%s vê "Nova viatura" a apontar para o formulário', papel => {
    mocks.role = papel
    abrir('/frota')
    expect(screen.getByRole('link', { name: 'Nova viatura' })).toHaveAttribute('href', '/frota/viatura/nova')
    expect(screen.getByRole('link', { name: 'Criar a primeira viatura' })).toHaveAttribute('href', '/frota/viatura/nova')
  })

  it.each(['mecanico', 'leitura'])('%s não vê "Nova viatura" nem o convite', papel => {
    mocks.role = papel
    abrir('/frota')
    expect(screen.queryByRole('link', { name: 'Nova viatura' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Criar a primeira viatura' })).not.toBeInTheDocument()
    expect(screen.getByText('Ainda não há viaturas nem máquinas ativas.')).toBeInTheDocument()
  })
})

describe('FichaViaturaPage — ações da viatura', () => {
  it.each(['admin', 'gestor', 'armazem'])('%s vê Editar, QR e Consumo', papel => {
    mocks.role = papel
    abrir('/frota/viatura/v1')
    expect(screen.getByRole('link', { name: 'Editar' })).toHaveAttribute('href', '/frota/viatura/v1/editar')
    expect(screen.getByRole('button', { name: 'QR' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Consumo' })).toHaveAttribute('href', '/abastecimento/analise?viatura=v1')
  })

  it('leitura vê Consumo mas não Editar nem QR', () => {
    mocks.role = 'leitura'
    abrir('/frota/viatura/v1')
    expect(screen.getByRole('link', { name: 'Consumo' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'QR' })).not.toBeInTheDocument()
  })

  it('mecânico não vê Editar, QR nem Consumo', () => {
    mocks.role = 'mecanico'
    abrir('/frota/viatura/v1')
    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'QR' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Consumo' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Imprimir ficha' })).toBeInTheDocument()
  })

  it('QR abre a página de impressão numa nova janela com nome e código codificados', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    abrir('/frota/viatura/v1')
    await clicar(screen.getByRole('button', { name: 'QR' }))
    expect(open).toHaveBeenCalledWith('/pub/imprimir-qr?v=v1&vn=Carrinha%20%26%20C%C2%AA&vc=V-01%2FA', '_blank')
    open.mockRestore()
  })
})

describe('VeiculoFormPage — navegação', () => {
  it('depois de criar vai para a ficha da viatura nova', async () => {
    abrir('/frota/viatura/nova')
    expect(screen.getByRole('heading', { name: 'Nova viatura / máquina' })).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText(/Camião Volvo/), { target: { value: 'Giratória CAT' } })
    await clicar(screen.getByRole('button', { name: 'Criar Viatura' }))
    expect(mocks.criar).toHaveBeenCalledWith(expect.objectContaining({ name: 'Giratória CAT' }))
    expect(await screen.findByRole('heading', { name: 'Carrinha & Cª' })).toBeInTheDocument()
  })

  it('depois de editar volta para a ficha da viatura', async () => {
    abrir('/frota/viatura/v1/editar')
    expect(screen.getByRole('heading', { name: 'Editar viatura' })).toBeInTheDocument()
    await clicar(screen.getByRole('button', { name: 'Guardar Alterações' }))
    expect(mocks.atualizar).toHaveBeenCalledWith('v1', expect.objectContaining({ name: 'Carrinha' }))
    expect(await screen.findByRole('heading', { name: 'Carrinha & Cª' })).toBeInTheDocument()
  })

  it('arquivar volta para a lista da Frota', async () => {
    abrir('/frota/viatura/v1/editar')
    await clicar(screen.getByRole('button', { name: /Arquivar/ }))
    expect(mocks.atualizar).toHaveBeenCalledWith('v1', { active: false })
    expect(await screen.findByRole('heading', { name: 'Frota' })).toBeInTheDocument()
  })
})
