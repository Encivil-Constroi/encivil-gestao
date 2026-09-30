import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router'
import type { ContextoRow, PedidoRow } from '@/features/combustivel/db'

const m = vi.hoisted(() => ({
  uid: 'motorista-1',
  papel: 'motorista',
  podeAprovar: false,
  pedido: null as PedidoRow | null,
  pedidos: [] as PedidoRow[],
  filtros: [] as unknown[],
  contexto: null as ContextoRow | null,
  estadoBomba: null as null | { sessaoAtiva: boolean; bombaOcupada: boolean; bloqueioMotivo: string | null },
  autorizar: vi.fn(async (_id: string) => true),
  recusar: vi.fn(async (_id: string, _m: string | null) => true),
  cancelar: vi.fn(async (_id: string) => true),
  ligar: vi.fn(async (_id: string) => true),
  registar: vi.fn(async () => true),
  concluir: vi.fn(async () => 'abast-1'),
  criar: vi.fn(async (p: { id: string }) => p.id),
}))

vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: { id: m.uid } }) }))
vi.mock('@/features/auth/useRole', () => ({
  useRole: () => ({ role: m.papel, isMotorista: m.papel === 'motorista', isAdmin: m.papel === 'admin', isGestor: m.papel === 'gestor' }),
}))
vi.mock('@/features/combustivel/hooks/usePedidos', () => ({
  usePedido: () => ({ pedido: m.pedido, loading: false, error: m.pedido ? null : 'Pedido não encontrado' }),
  usePedidos: (f: unknown) => { m.filtros.push(f); return { pedidos: m.pedidos, loading: false, error: null } },
  usePodeAprovar: () => ({ podeAprovar: m.podeAprovar, loading: false }),
  useContextoAbastecimento: () => ({ contexto: m.contexto, loading: false, error: null }),
  useViaturasAtivas: () => ({ viaturas: [
    { id: 'v1', nome: 'Ford Transit', codigo: 'V1', identificacao: '50-AA-50', tipo_combustivel: 'gasoleo' },
    { id: '22222222-2222-2222-2222-222222222222', nome: 'Hilux', codigo: 'V2', identificacao: null, tipo_combustivel: 'gasolina' },
  ], loading: false }),
  useCriarPedido: () => ({ criar: m.criar, loading: false, error: null }),
  useDecisaoPedido: () => ({ autorizar: m.autorizar, recusar: m.recusar, aprovarAntigo: vi.fn(), loading: false, error: null }),
  useCancelarPedido: () => ({ cancelar: m.cancelar, loading: false, error: null }),
  useContadorInicial: () => ({ registar: m.registar, loading: false, error: null }),
  useLigarBomba: () => ({ ligar: m.ligar, loading: false, error: null }),
  useConcluirPedido: () => ({ concluir: m.concluir, loading: false, error: null }),
  usePrecos: () => ({ precos: [{ tipo_combustivel: 'gasoleo', preco_litro: 1.5, atualizado_em: '' }], loading: false, error: null }),
}))
vi.mock('@/features/combustivel/hooks/useBombaPolo2', () => ({
  useEstadoPedidoBomba: () => m.estadoBomba,
  useEstadoBomba: () => ({ estado: null, loading: false, error: null }),
  usePararBomba: () => ({ parar: vi.fn(), loading: false, error: null }),
}))
vi.mock('@/features/combustivel/services/fotosService', () => ({
  urlFotoCombustivel: (c: string) => `https://fotos/${c}`,
  enviarFotoAbastecimento: vi.fn(async () => 'v1/2026-09-30_p_1.jpg'),
  lerFotoComIA: vi.fn(async () => ({ valor: 10500, custo: null, confianca: 'alta' })),
}))
vi.mock('@/app/lib/push', () => ({ estadoPush: () => 'ativo', pedirNotificacoes: vi.fn() }))

import { PedidoPage } from '@/features/combustivel/components/pedidos/PedidoPage'
import { PedidosPage } from '@/features/combustivel/components/pedidos/PedidosPage'
import { NovoPedidoPage } from '@/features/combustivel/components/pedidos/NovoPedidoPage'
import { QrCombustivel } from '@/app/pages/pub/QrCombustivel'

function pedido(o: Partial<PedidoRow> = {}): PedidoRow {
  return {
    id: 'p1', veiculo_id: 'v1', veiculo_nome: 'Ford Transit', funcionario_nome: 'Zé Gaitas', data: '2026-09-30',
    tipo_fonte: 'POLO2', tipo_combustivel: 'gasoleo', estado: 'AGUARDA_AUTORIZACAO', contador: 10500, km_anterior: 10000,
    km_suspeito: false, foto_km_path: 'v1/2026-09-30_p1_1.jpg', observacoes: null, local: 'Polo 2',
    solicitante_id: 'motorista-1', colaborador_id: null, criado_em: new Date(Date.now() - 5 * 60_000).toISOString(),
    autorizado_em: null, decisao_em: null, motivo_recusa: null, contador_inicial: null, contador_inicial_origem: null,
    foto_contador_inicial_path: null, bomba_ligada_em: null, pump_auth_expires_at: null, pump_activated_at: null,
    pump_max_seconds: 600, contador_final: null, contador_final_origem: null, foto_final_path: null, litros: null,
    custo_total: null, preco_litro: null, concluido_em: null, cancelado_em: null, abastecimento_id: null,
    foto_url: null, foto_medidor_url: null, litros_gemini: null, custo_gemini: null, ...o,
  }
}

function Onde() { return <p data-testid="onde">{useLocation().pathname + useLocation().search}</p> }

function abrir(caminho: string) {
  render(
    <MemoryRouter initialEntries={[caminho]}>
      <Onde />
      <Routes>
        <Route path="/abastecer" element={<NovoPedidoPage />} />
        <Route path="/abastecer/pedidos" element={<PedidosPage />} />
        <Route path="/abastecer/pedido/:id" element={<PedidoPage />} />
        <Route path="/pub/combustivel" element={<QrCombustivel />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  m.uid = 'motorista-1'; m.papel = 'motorista'; m.podeAprovar = false
  m.pedido = pedido(); m.pedidos = []; m.filtros = []; m.estadoBomba = null
  m.contexto = { nome: 'Zé Gaitas', colaborador_id: 'c1', veiculo_id: 'v1', veiculo_nome: 'Ford Transit', veiculo_identificacao: '50-AA-50',
    tipo_combustivel: 'gasoleo', km_atual: 10000, pedido_aberto_id: null, pode_aprovar: false }
  for (const f of [m.autorizar, m.recusar, m.cancelar, m.ligar, m.registar, m.concluir, m.criar]) f.mockClear()
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
})
afterEach(cleanup)

describe('ecrã do pedido — motorista', () => {
  it('à espera: mostra há quanto tempo e deixa cancelar', async () => {
    abrir('/abastecer/pedido/p1')
    expect(screen.getByText('À espera de aprovação')).toBeInTheDocument()
    expect(screen.getByText(/há 5 min/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Cancelar pedido/ }))
    await waitFor(() => expect(m.cancelar).toHaveBeenCalledWith('p1'))
    // O motorista não vê botões de decisão
    expect(screen.queryByRole('button', { name: /Autorizar/ })).not.toBeInTheDocument()
  })

  it('recusado: mostra o motivo', () => {
    m.pedido = pedido({ estado: 'REJEITADO', motivo_recusa: 'Já abasteceu hoje' })
    abrir('/abastecer/pedido/p1')
    expect(screen.getByText('Pedido recusado')).toBeInTheDocument()
    expect(screen.getByText('Já abasteceu hoje')).toBeInTheDocument()
  })

  it('autorizado na Polo 2: primeiro a foto do contador', () => {
    m.pedido = pedido({ estado: 'AUTORIZADO' })
    abrir('/abastecer/pedido/p1')
    expect(screen.getByText('1. Foto do contador da bomba')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /LIGAR BOMBA/ })).not.toBeInTheDocument()
  })

  it('com a leitura inicial: o botão LIGAR BOMBA chama o servidor', async () => {
    m.pedido = pedido({ estado: 'AUTORIZADO', contador_inicial: 1000 })
    abrir('/abastecer/pedido/p1')
    fireEvent.click(screen.getByRole('button', { name: /LIGAR BOMBA/ }))
    await waitFor(() => expect(m.ligar).toHaveBeenCalledWith('p1'))
  })

  it('bomba bloqueada: botão desativado com o motivo', () => {
    m.pedido = pedido({ estado: 'AUTORIZADO', contador_inicial: 1000 })
    m.estadoBomba = { sessaoAtiva: false, bombaOcupada: false, bloqueioMotivo: 'Depósito em manutenção' }
    abrir('/abastecer/pedido/p1')
    expect(screen.getByText('Depósito em manutenção')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /LIGAR BOMBA/ })).toBeDisabled()
  })

  it('bomba a ligar e ocupada por outro: avisa que liga quando ficar livre', () => {
    m.pedido = pedido({ estado: 'AUTORIZADO', contador_inicial: 1000, bomba_ligada_em: new Date().toISOString(),
      pump_auth_expires_at: new Date(Date.now() + 60_000).toISOString() })
    m.estadoBomba = { sessaoAtiva: false, bombaOcupada: true, bloqueioMotivo: null }
    abrir('/abastecer/pedido/p1')
    expect(screen.getByText('A ligar a bomba…')).toBeInTheDocument()
    expect(screen.getByText(/Liga assim que ficar livre/)).toBeInTheDocument()
  })

  it('a abastecer: contagem e botão Terminei', () => {
    m.pedido = pedido({ estado: 'AUTORIZADO', contador_inicial: 1000, pump_activated_at: new Date().toISOString() })
    m.estadoBomba = { sessaoAtiva: true, bombaOcupada: false, bloqueioMotivo: null }
    abrir('/abastecer/pedido/p1')
    expect(screen.getByRole('button', { name: /Terminei/ })).toBeInTheDocument()
  })

  it('bomba parada: foto final, litros pela diferença com custo estimado, concluir', async () => {
    m.pedido = pedido({ estado: 'AUTORIZADO', contador_inicial: 10000, pump_activated_at: new Date(Date.now() - 700_000).toISOString() })
    m.estadoBomba = { sessaoAtiva: false, bombaOcupada: false, bloqueioMotivo: null }
    abrir('/abastecer/pedido/p1')
    expect(screen.getByText('4. Foto do contador no fim')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('4. Foto do contador no fim'), {
      target: { files: [new File(['x'], 'f.jpg', { type: 'image/jpeg', lastModified: Date.now() })] },
    })
    expect(await screen.findByText('500 L')).toBeInTheDocument()     // 10 500 − 10 000
    expect(screen.getByText(/750,00/)).toBeInTheDocument()            // 500 L × 1,50 €
    fireEvent.click(screen.getByRole('button', { name: 'Concluir abastecimento' }))
    await waitFor(() => expect(m.concluir).toHaveBeenCalledWith('p1', expect.objectContaining({ leituraFinal: 10500, litros: null, origem: 'IA' })))
  })

  it('concluído: litros e custo', () => {
    m.pedido = pedido({ estado: 'CONCLUIDO', litros: 45.2, custo_total: 67.8 })
    abrir('/abastecer/pedido/p1')
    expect(screen.getByText('Abastecimento registado')).toBeInTheDocument()
    expect(screen.getAllByText('45,2 L').length).toBeGreaterThan(0)
  })

  it('km suspeitos aparecem no detalhe', () => {
    m.pedido = pedido({ km_suspeito: true, km_anterior: 12000 })
    abrir('/abastecer/pedido/p1')
    expect(screen.getByText(/Km fora do normal/)).toHaveTextContent('12')
  })
})

describe('ecrã do pedido — quem aprova', () => {
  beforeEach(() => { m.uid = 'ceo'; m.papel = 'admin'; m.podeAprovar = true })

  it('não executa o pedido de outro; autoriza', async () => {
    abrir('/abastecer/pedido/p1')
    expect(screen.queryByText('À espera de aprovação')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Autorizar/ }))
    await waitFor(() => expect(m.autorizar).toHaveBeenCalledWith('p1'))
  })

  it('recusa com um motivo rápido', async () => {
    abrir('/abastecer/pedido/p1')
    fireEvent.click(screen.getByRole('button', { name: /Recusar/ }))
    const dialogo = screen.getByRole('dialog')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Km incorretos' }))
    fireEvent.click(within(dialogo).getByRole('button', { name: /^Recusar$/ }))
    await waitFor(() => expect(m.recusar).toHaveBeenCalledWith('p1', 'Km incorretos'))
  })

  it('sem permissão de aprovar (gestor): só vê, sem botões', () => {
    m.podeAprovar = false; m.papel = 'gestor'
    abrir('/abastecer/pedido/p1')
    expect(screen.queryByRole('button', { name: /Autorizar/ })).not.toBeInTheDocument()
    expect(screen.getByText('Zé Gaitas')).toBeInTheDocument()
  })
})

describe('lista de pedidos', () => {
  it('motorista: "Os meus pedidos", só os seus, sem filtros', () => {
    m.pedidos = [pedido()]
    abrir('/abastecer/pedidos')
    expect(screen.getByRole('heading', { name: 'Os meus pedidos' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(m.filtros.at(-1)).toMatchObject({ solicitanteId: 'motorista-1' })
  })

  it('quem aprova: todos, começa nos que aguardam, com tempo de espera e alerta de mais de 1 h', async () => {
    m.uid = 'ceo'; m.papel = 'admin'; m.podeAprovar = true
    // Como o servidor devolve: o mais recente primeiro
    m.pedidos = [
      pedido({ id: 'b', solicitante_id: 'outro', funcionario_nome: 'Rui' }),
      pedido({ id: 'a', criado_em: new Date(Date.now() - 90 * 60_000).toISOString() }),
    ]
    abrir('/abastecer/pedidos')
    expect(screen.getByRole('heading', { name: 'Pedidos de combustível' })).toBeInTheDocument()
    expect(m.filtros.at(-1)).toMatchObject({ estados: ['AGUARDA_AUTORIZACAO', 'AGUARDA_APROVACAO'], solicitanteId: undefined })
    expect(screen.getByText(/1 motorista espera há mais de 1 hora/)).toBeInTheDocument()
    expect(screen.getByText(/à espera há 1 h 30 min/)).toBeInTheDocument()
    // O mais antigo primeiro
    const cartoes = screen.getAllByRole('listitem')
    expect(within(cartoes[0]).getByText(/1 h 30/)).toBeInTheDocument()
    fireEvent.click(within(cartoes[1]).getByRole('button', { name: /Autorizar/ }))
    await waitFor(() => expect(m.autorizar).toHaveBeenCalledWith('b'))

    fireEvent.click(screen.getByRole('tab', { name: 'Concluídos' }))
    expect(m.filtros.at(-1)).toMatchObject({ estados: ['CONCLUIDO'] })
  })
})

describe('novo pedido', () => {
  it('preenche o nome e a viatura atribuída; envia com a foto dos km', async () => {
    abrir('/abastecer')
    expect(screen.getByText('Zé Gaitas')).toBeInTheDocument()
    expect(screen.getByLabelText('Viatura')).toHaveValue('v1')
    expect(screen.getByRole('radio', { name: 'Gasóleo' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.change(screen.getByLabelText('Foto dos km'), {
      target: { files: [new File(['x'], 'km.jpg', { type: 'image/jpeg', lastModified: Date.now() })] },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Pedir autorização' }))
    await waitFor(() => expect(m.criar).toHaveBeenCalledWith(expect.objectContaining({
      veiculoId: 'v1', tipoFonte: 'POLO2', tipoCombustivel: 'gasoleo', km: 10500, fotoKmPath: 'v1/2026-09-30_p_1.jpg', observacoes: null,
    })))
    expect(await screen.findByTestId('onde')).toHaveTextContent(/^\/abastecer\/pedido\//)
  })

  it('QR de outra viatura: escolhe essa viatura e o combustível dela', () => {
    abrir('/abastecer?v=22222222-2222-2222-2222-222222222222')
    expect(screen.getByLabelText('Viatura')).toHaveValue('22222222-2222-2222-2222-222222222222')
    expect(screen.getByRole('radio', { name: 'Gasolina' })).toHaveAttribute('aria-checked', 'true')
  })

  it('já tem um pedido em curso: vai direto para ele', () => {
    m.contexto = { ...m.contexto!, pedido_aberto_id: 'p1' }
    abrir('/abastecer')
    expect(screen.getByTestId('onde')).toHaveTextContent('/abastecer/pedido/p1')
  })

  it('conta sem nome: aviso e sem foto', () => {
    m.contexto = { ...m.contexto!, nome: null }
    abrir('/abastecer')
    expect(screen.getByText(/A sua conta não tem nome/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Foto dos km')).not.toBeInTheDocument()
  })

  it('km fora do normal: avisa antes de enviar', async () => {
    abrir('/abastecer')
    fireEvent.change(screen.getByLabelText('Foto dos km'), {
      target: { files: [new File(['x'], 'km.jpg', { type: 'image/jpeg', lastModified: Date.now() })] },
    })
    fireEvent.change(await screen.findByLabelText('Km atuais'), { target: { value: '9000' } })
    expect(screen.getByText(/parecem fora do normal/)).toBeInTheDocument()
  })
})

describe('QR antigo da viatura', () => {
  it('/pub/combustivel?v=… segue para /abastecer?v=…', () => {
    abrir('/pub/combustivel?v=22222222-2222-2222-2222-222222222222')
    expect(screen.getByTestId('onde')).toHaveTextContent('/abastecer?v=22222222-2222-2222-2222-222222222222')
  })
})
