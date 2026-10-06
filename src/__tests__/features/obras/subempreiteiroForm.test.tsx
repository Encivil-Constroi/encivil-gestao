import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { SubcontractorComArtigos } from '@/features/obras/legacy/subempreiteirosService'

const estado = vi.hoisted(() => ({
  sub: null as SubcontractorComArtigos | null,
  criar: vi.fn(), atualizar: vi.fn(), guardarFicha: vi.fn(), from: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: estado.from } }))
vi.mock('@/features/obras/hooks/useObras', () => ({
  useObras: () => ({ obras: [{ id: 'obra-1', name: 'Obra Norte', status: 'ativa' }], loading: false }),
}))
vi.mock('@/features/obras/legacy/useSubempreiteiros', () => ({
  useSubempreiteiro: () => ({ sub: estado.sub, loading: false }),
  useGuardarSubempreiteiro: () => ({ criar: estado.criar, atualizar: estado.atualizar, loading: false }),
}))
vi.mock('@/features/obras/hooks/useSubsControlo', () => ({
  useConfigSubs: () => ({ config: null }),
  useResumoOrcamento: () => ({ resumo: [] }),
  useItensOrcamento: () => ({ itens: [{ id: 'eap-1', codigo: '01.01', descricao: 'Reboco', unidade: 'm²', ativo: true }] }),
}))
vi.mock('@/features/obras/components/subempreitadas/useSubData', () => ({
  useFichaSub: () => ({ ficha: null }),
  useGuardarFichaSub: () => ({ guardar: estado.guardarFicha, loading: false }),
}))

import { SubempreiteiroFormPage } from '@/features/obras/components/subempreitadas/SubempreiteiroFormPage'

function abrir(caminho: string) {
  render(<MemoryRouter initialEntries={[caminho]}><Routes>
    <Route path="/novo" element={<SubempreiteiroFormPage />} />
    <Route path="/editar/:id" element={<SubempreiteiroFormPage />} />
    <Route path="/obras/subempreitada/:id" element={<p>Contratação guardada</p>} />
  </Routes></MemoryRouter>)
}

beforeEach(() => {
  estado.sub = null
  const resultado = { id: 'sub-1', items: [
    { id: 'artigo-1', description: 'Reboco', unit: 'm²', unitPrice: 10, plannedQuantity: 20 },
    { id: 'artigo-2', description: 'Reboco', unit: 'm²', unitPrice: 10, plannedQuantity: 20 },
  ] }
  estado.criar.mockResolvedValue(resultado)
  estado.atualizar.mockResolvedValue(resultado)
  estado.from.mockReturnValue({
    select: () => ({ eq: async () => ({ data: [], error: null }) }),
    update: () => ({ eq: async () => ({ error: null }) }),
  })
  estado.guardarFicha.mockResolvedValue(true)
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('ligação ao orçamento no formulário de contratação', () => {
  it('envia a ligação no pedido inicial, incluindo artigos repetidos sem ligação', async () => {
    abrir('/novo?obra=obra-1')
    fireEvent.change(screen.getByLabelText(/Nome do Subempreiteiro/), { target: { value: 'Sub Reboco' } })
    fireEvent.click(screen.getByRole('button', { name: /Preços unitários/ }))
    fireEvent.change(screen.getByPlaceholderText(/Descrição/), { target: { value: 'Reboco' } })
    fireEvent.change(screen.getByPlaceholderText('€/un'), { target: { value: '10' } })
    fireEvent.change(screen.getByPlaceholderText('Qtd'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('Item do orçamento (EAP)'), { target: { value: 'eap-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar artigo' }))
    fireEvent.change(screen.getAllByPlaceholderText(/Descrição/)[1], { target: { value: 'Reboco' } })
    fireEvent.change(screen.getAllByPlaceholderText('€/un')[1], { target: { value: '10' } })
    fireEvent.change(screen.getAllByPlaceholderText('Qtd')[1], { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar Contratação' }))

    await screen.findByText('Contratação guardada')
    expect(estado.criar.mock.calls[0][0].items).toEqual([
      { description: 'Reboco', unit: 'm²', unitPrice: 10, plannedQuantity: 20, orcamentoItemId: 'eap-1' },
      { description: 'Reboco', unit: 'm²', unitPrice: 10, plannedQuantity: 20, orcamentoItemId: null },
    ])
    expect(estado.from).not.toHaveBeenCalled()
  })

  it('carrega e preserva a ligação ao editar sem consultar ou atualizar artigos na página', async () => {
    estado.sub = {
      id: 'sub-1', obraId: 'obra-1', name: 'Sub Reboco', type: 'unitario', status: 'rascunho', active: true,
      createdAt: new Date('2026-10-01'), updatedAt: new Date('2026-10-01'), agreedValue: 200, retencaoPercentagem: 5,
      items: [{ id: 'artigo-1', subcontractorId: 'sub-1', description: 'Reboco', unit: 'm²', unitPrice: 10,
        plannedQuantity: 20, isExtra: false, orcamentoItemId: 'eap-1' }],
    }
    abrir('/editar/sub-1')
    expect(screen.getByLabelText('Item do orçamento (EAP)')).toHaveValue('eap-1')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Alterações' }))

    await screen.findByText('Contratação guardada')
    expect(estado.atualizar.mock.calls[0]).toEqual(['sub-1', expect.objectContaining({ items: [
      { description: 'Reboco', unit: 'm²', unitPrice: 10, plannedQuantity: 20, orcamentoItemId: 'eap-1' },
    ] })])
    expect(estado.from).not.toHaveBeenCalled()
  })
})
