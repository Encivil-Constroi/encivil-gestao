import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import type { ItemCatalogoRow, Categoria, Natureza } from '@/features/frota/db'

const mocks = vi.hoisted(() => ({
  registarChecklist: vi.fn(async () => 'novo-id' as string | null),
  catalogo: [] as unknown[],
  itensViatura: [] as unknown[],
  role: 'mecanico' as string,
}))

vi.mock('@/features/frota/hooks/useFrota', () => ({
  useFichaViatura: () => ({
    ficha: {
      viatura: { id: 'v1', codigo: 'V0001', nome: 'Carrinha 1', identificacao: '00-AA-00', tipo: 'viatura', unidadeContador: 'km' },
      kmAtual: 9800, itens: mocks.itensViatura, alertas: [], manutencoes: [], checklists: [], atribuicoes: [],
      colaboradores: new Map(),
    },
    loading: false, error: null, reload: vi.fn(),
  }),
  useCatalogo: () => ({ catalogo: mocks.catalogo, loading: false, error: null, reload: vi.fn() }),
  useRegistarChecklist: () => ({ registar: mocks.registarChecklist, loading: false, error: null }),
}))

vi.mock('@/features/auth/useRole', () => ({
  useRole: () => ({
    role: mocks.role, isAdmin: mocks.role === 'admin', isGestor: mocks.role === 'gestor',
    isMecanico: mocks.role === 'mecanico', podeFrota: ['admin', 'gestor', 'mecanico'].includes(mocks.role),
  }),
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
import { toast } from 'sonner'
import { ChecklistPage } from '@/features/frota/components/ChecklistPage'

let seq = 0
function item(o: Partial<ItemCatalogoRow> & { categoria: Categoria; natureza: Natureza; rotulo: string }): ItemCatalogoRow {
  seq++
  return {
    id: `i${seq}`, chave: `k${seq}`, intervalo_km_padrao: null, intervalo_meses_padrao: null,
    limiar_atencao_km: 2000, limiar_urgente_km: 500, limiar_atencao_dias: 30, limiar_urgente_dias: 7,
    ordem: seq, ativo: true, criado_por: null, criado_em: '', atualizado_em: '', ...o,
  }
}

const luzes  = item({ categoria: 'INSPECAO_RAPIDA', natureza: 'CHECKLIST', rotulo: 'Luzes' })
const pneus  = item({ categoria: 'INSPECAO_RAPIDA', natureza: 'CHECKLIST', rotulo: 'Pneus' })
const adblue = item({ categoria: 'INSPECAO_RAPIDA', natureza: 'CHECKLIST', rotulo: 'AdBlue' })
const oleo   = item({ categoria: 'REVISAO_PERIODICA', natureza: 'MANUTENCAO', rotulo: 'Óleo', intervalo_km_padrao: 15000, intervalo_meses_padrao: 12 })
const seguro = item({ categoria: 'OBRIGACAO_LEGAL', natureza: 'MANUTENCAO', rotulo: 'Seguro', intervalo_meses_padrao: 12 })

function abrir(pagina: React.ReactNode, caminho: string) {
  render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="/frota/viatura/:id/checklist" element={pagina} />
        <Route path="/frota/viatura/:id" element={<p>FICHA</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const clicar = (el: Element) => act(async () => { fireEvent.click(el) })

beforeEach(() => {
  mocks.catalogo = [luzes, pneus, adblue, oleo, seguro]
  mocks.itensViatura = [{ id: 'f-ad', veiculo_id: 'v1', item_id: adblue.id, ativo: false }]
  mocks.registarChecklist.mockClear()
  vi.mocked(toast.error).mockClear()
})
afterEach(cleanup)

describe('ChecklistPage', () => {
  it('mostra só os itens de checklist que se aplicam à viatura', () => {
    abrir(<ChecklistPage />, '/frota/viatura/v1/checklist')
    expect(screen.getByText('Luzes')).toBeInTheDocument()
    expect(screen.getByText('Pneus')).toBeInTheDocument()
    expect(screen.queryByText('AdBlue')).not.toBeInTheDocument()   // excluído nesta viatura
    expect(screen.queryByText('Óleo')).not.toBeInTheDocument()     // é de manutenção
  })

  it('não envia com itens por avaliar', async () => {
    abrir(<ChecklistPage />, '/frota/viatura/v1/checklist')
    await clicar(screen.getAllByRole('radio', { name: 'OK' })[0])
    await clicar(screen.getByRole('button', { name: 'Registar checklist' }))
    expect(mocks.registarChecklist).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Falta avaliar 1 item.')
  })

  it('um problema sem descrição não é aceite; com descrição segue tudo para a RPC', async () => {
    abrir(<ChecklistPage />, '/frota/viatura/v1/checklist')
    const [luzesOk] = screen.getAllByRole('radio', { name: 'OK' })
    await clicar(luzesOk)
    await clicar(screen.getAllByRole('radio', { name: 'Mau' })[1])   // pneus: mau
    await clicar(screen.getByRole('button', { name: 'Registar checklist' }))
    expect(mocks.registarChecklist).not.toHaveBeenCalled()
    expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(/Descreva o problema em: Pneus/)

    fireEvent.change(screen.getByLabelText('Observação: Pneus'), { target: { value: 'Pneu traseiro com bolha' } })
    fireEvent.change(screen.getByLabelText(/^Km/), { target: { value: '9900' } })
    await clicar(screen.getByRole('button', { name: 'Registar checklist' }))
    expect(mocks.registarChecklist).toHaveBeenCalledTimes(1)
    const [args] = mocks.registarChecklist.mock.calls[0] as unknown as [{ veiculoId: string; km: number; itens: unknown[] }]
    expect(args.veiculoId).toBe('v1')
    expect(args.km).toBe(9900)
    expect(args.itens).toEqual([
      { itemId: luzes.id, estado: 'OK', observacao: '' },
      { itemId: pneus.id, estado: 'MAU', observacao: 'Pneu traseiro com bolha' },
    ])
    expect(await screen.findByText('FICHA')).toBeInTheDocument()
  })

  it('"Restantes OK" preenche só o que falta', async () => {
    abrir(<ChecklistPage />, '/frota/viatura/v1/checklist')
    await clicar(screen.getAllByRole('radio', { name: 'Atenção' })[0])
    await clicar(screen.getByRole('button', { name: 'Restantes OK' }))
    expect(screen.getAllByRole('radio', { name: 'Atenção' })[0]).toHaveAttribute('aria-checked', 'true')
    expect(screen.getAllByRole('radio', { name: 'OK' })[1]).toHaveAttribute('aria-checked', 'true')
  })
})
