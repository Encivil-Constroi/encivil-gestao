import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import type { VeiculoFrotaRow, LinhaTempoRow, EstadoOperacional } from '@/features/frota/db'
import { mockUseRole, dataEm } from './frotaFixtures'

const base: VeiculoFrotaRow = {
  id: 'v1', codigo: 'V-01/A', nome: 'Carrinha & Cª', marca: 'Toyota', modelo: 'Hilux', identificacao: '50-AA-50', tipo: 'viatura',
  tipo_combustivel: 'gasoleo', unidade_contador: 'km', estado_operacional: 'LIVRE', obra_atual_id: null,
  data_ultima_revisao: '2026-06-01', km_ultima_revisao: 9000, km_registo: 8000, data_fim_seguro: null, seguro_foto_path: null,
  data_proxima_ipo: null, ipo_foto_path: null, observacoes: null, ativo: true, created_at: '2026-01-15T10:00:00Z', created_by: null,
}

const ev = (tipo: LinhaTempoRow['tipo'], titulo: string, extra: Partial<LinhaTempoRow> = {}): LinhaTempoRow => ({
  quando: '2026-09-20T09:30:00Z', tipo, titulo, detalhe: null, leitura: null, utilizador: null, ref_id: `${tipo}-${titulo}`, ...extra,
})

const mocks = vi.hoisted(() => ({
  role: 'admin' as string,
  detalhe: null as unknown as VeiculoFrotaRow,
  obraNome: null as string | null,
  atribuicoes: [] as unknown[],
  eventos: [] as LinhaTempoRow[],
  definir: vi.fn(async (_id: string, _e: string) => true),
}))

vi.mock('@/features/auth/useRole', () => ({ useRole: () => mockUseRole(mocks.role) }))
vi.mock('@/features/frota/hooks/useFrota', () => ({
  useFichaViatura: () => ({
    ficha: {
      viatura: { id: 'v1', codigo: 'V-01/A', nome: 'Carrinha & Cª', identificacao: '50-AA-50', tipo: 'viatura', unidadeContador: 'km' },
      detalhe: mocks.detalhe, obraNome: mocks.obraNome,
      kmAtual: 9800, itens: [], alertas: [], manutencoes: [], checklists: [], atribuicoes: mocks.atribuicoes,
      colaboradores: new Map([['c1', 'João Silva']]),
    },
    loading: false, error: null, reload: vi.fn(),
  }),
  useCatalogo: () => ({ catalogo: [], loading: false, error: null, reload: vi.fn() }),
  useLinhaTempo: () => ({ eventos: mocks.eventos, loading: false, error: null, reload: vi.fn() }),
  useDefinirEstadoViatura: () => ({ definir: mocks.definir, loading: false }),
}))
vi.mock('@/features/frota/services/frotaService', () => ({ urlFotoChecklist: (k: string) => k }))
vi.mock('@/features/frota/lib/fotosFrota', () => ({ urlFotoDocumento: (p: string | null) => (p ? `https://fotos.test/${p}` : null) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { FichaViaturaPage } from '@/features/frota/components/FichaViaturaPage'

function abrir() {
  render(
    <MemoryRouter initialEntries={['/frota/viatura/v1']}>
      <Routes>
        <Route path="/frota/viatura/:id" element={<FichaViaturaPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const clicar = (el: Element) => act(async () => { fireEvent.click(el) })
const comEstado = (estado: EstadoOperacional) => { mocks.detalhe = { ...base, estado_operacional: estado } }

beforeEach(() => {
  mocks.role = 'admin'
  mocks.detalhe = base
  mocks.obraNome = null
  mocks.atribuicoes = []
  mocks.eventos = []
  mocks.definir.mockClear()
})
afterEach(cleanup)

describe('FichaViaturaPage — cabeçalho e estado', () => {
  it('mostra matrícula, marca/modelo, estado e condutor atual com obra', () => {
    comEstado('EM_USO')
    mocks.obraNome = 'Obra Norte'
    mocks.atribuicoes = [{ id: 'a1', veiculo_id: 'v1', colaborador_id: 'c1', desde: '2026-09-01', ate: null }]
    abrir()
    expect(screen.getByRole('heading', { name: '50-AA-50' })).toBeInTheDocument()
    expect(screen.getByText('Toyota Hilux')).toBeInTheDocument()
    expect(screen.getByText('Em uso')).toBeInTheDocument()
    expect(screen.getByText('João Silva')).toBeInTheDocument()
    expect(screen.getByText('desde 01/09/2026')).toBeInTheDocument()
    expect(screen.getByText('Obra Norte')).toBeInTheDocument()
  })

  it('já não permite atribuir condutor diretamente na ficha', () => {
    abrir()
    expect(screen.queryByText('Condutor responsável')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})

describe('FichaViaturaPage — botões por permissão e estado', () => {
  it('livre: Entregar, manutenção, checklist e oficina', () => {
    abrir()
    expect(screen.getByRole('link', { name: /Entregar/ })).toHaveAttribute('href', '/frota/entregar?viatura=v1')
    expect(screen.queryByRole('link', { name: /Devolver/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Registar manutenção/ })).toHaveAttribute('href', '/frota/manutencao/nova?viatura=v1')
    expect(screen.getByRole('link', { name: /Checklist/ })).toHaveAttribute('href', '/frota/viatura/v1/checklist')
    expect(screen.getByRole('button', { name: /Pôr na oficina/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Editar/ })).toHaveAttribute('href', '/frota/viatura/v1/editar')
    expect(screen.getByRole('link', { name: /Consumo/ })).toHaveAttribute('href', '/abastecimento/analise?viatura=v1')
    expect(screen.getByRole('link', { name: /Imprimir ficha/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'QR' })).toBeInTheDocument()
  })

  it('em uso: Devolver e sem botão de oficina', () => {
    comEstado('EM_USO')
    abrir()
    expect(screen.getByRole('link', { name: /Devolver/ })).toHaveAttribute('href', '/frota/devolver?viatura=v1')
    expect(screen.queryByRole('link', { name: /Entregar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /oficina/i })).not.toBeInTheDocument()
  })

  it('na oficina: não entrega nem devolve e permite tirar da oficina', async () => {
    comEstado('OFICINA')
    abrir()
    expect(screen.queryByRole('link', { name: /Entregar|Devolver/ })).not.toBeInTheDocument()
    await clicar(screen.getByRole('button', { name: /Tirar da oficina/ }))
    expect(mocks.definir).toHaveBeenCalledWith('v1', 'LIVRE')
  })

  it('pôr na oficina chama definir_estado com OFICINA', async () => {
    abrir()
    await clicar(screen.getByRole('button', { name: /Pôr na oficina/ }))
    expect(mocks.definir).toHaveBeenCalledWith('v1', 'OFICINA')
  })

  it('QR abre a página de impressão com nome e código codificados', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    abrir()
    await clicar(screen.getByRole('button', { name: 'QR' }))
    expect(open).toHaveBeenCalledWith('/pub/imprimir-qr?v=v1&vn=Carrinha%20%26%20C%C2%AA&vc=V-01%2FA', '_blank')
    open.mockRestore()
  })

  it('mecânico escreve na frota (entrega, manutenção, checklist, editar) mas não vê Consumo', () => {
    mocks.role = 'mecanico'
    abrir()
    expect(screen.getByRole('link', { name: /Entregar/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Registar manutenção/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Checklist/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Editar/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Imprimir ficha/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Consumo/ })).not.toBeInTheDocument()
  })

  it('armazém edita e vê o QR e o Consumo, mas não regista nada na frota', () => {
    mocks.role = 'armazem'
    abrir()
    expect(screen.getByRole('link', { name: /Editar/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'QR' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Consumo/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Entregar|Registar manutenção|Checklist/ })).not.toBeInTheDocument()
  })

  it('leitura só consulta', () => {
    mocks.role = 'leitura'
    abrir()
    expect(screen.queryByRole('link', { name: /Editar|Entregar|Registar manutenção|Checklist/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'QR' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Consumo/ })).toBeInTheDocument()
  })
})

describe('FichaViaturaPage — documentos', () => {
  it('mostra a data, o estado do prazo e a foto; sem foto indica-o', () => {
    mocks.detalhe = { ...base, data_fim_seguro: dataEm(10), seguro_foto_path: 'viaturas/v1/seguro_1.jpg', data_proxima_ipo: dataEm(-5) }
    abrir()
    const seccao = screen.getByText('Documentos').closest('section')!
    expect(within(seccao).getByText('A vencer')).toBeInTheDocument()
    expect(within(seccao).getByText('Expirado')).toBeInTheDocument()
    expect(within(seccao).getByAltText('Foto: Seguro')).toHaveAttribute('src', 'https://fotos.test/viaturas/v1/seguro_1.jpg')
    expect(within(seccao).getByText('Sem foto')).toBeInTheDocument()
  })

  it('a foto abre em ecrã inteiro e fecha', async () => {
    mocks.detalhe = { ...base, data_fim_seguro: dataEm(200), seguro_foto_path: 'viaturas/v1/seguro_1.jpg' }
    abrir()
    await clicar(screen.getByRole('button', { name: /Mostrar seguro em ecrã inteiro/ }))
    const dialogo = screen.getByRole('dialog')
    expect(within(dialogo).getByRole('img')).toHaveAttribute('src', 'https://fotos.test/viaturas/v1/seguro_1.jpg')
    expect(within(dialogo).getByText(/^Seguro · 50-AA-50/)).toBeInTheDocument()
    await clicar(within(dialogo).getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('FichaViaturaPage — estado à chegada vs atual', () => {
  it('compara leituras e mostra o percorrido e a última revisão', () => {
    abrir()
    const seccao = screen.getByText('Estado à chegada e atual').closest('section')!
    expect(within(seccao).getByText('15/01/2026')).toBeInTheDocument()
    expect(within(seccao).getByText(/Km à chegada/).nextElementSibling?.textContent).toMatch(/8\s?000 km/)
    expect(within(seccao).getByText(/Km atuais/).nextElementSibling?.textContent).toMatch(/9\s?800 km/)
    expect(within(seccao).getByText(/Percorreu desde a chegada/).nextElementSibling?.textContent).toMatch(/1\s?800 km/)
    expect(within(seccao).getByText(/01\/06\/2026/)).toBeInTheDocument()
  })

  it('máquinas falam em horas', () => {
    mocks.detalhe = { ...base, tipo: 'maquina', unidade_contador: 'horas', km_registo: 100 }
    abrir()
    expect(screen.getByText('Horas à chegada')).toBeInTheDocument()
    expect(screen.getByText('Trabalhou desde a chegada')).toBeInTheDocument()
  })
})

describe('FichaViaturaPage — linha do tempo', () => {
  beforeEach(() => {
    mocks.eventos = [
      ev('ENTREGA', 'Entregue a João Silva', { quando: '2026-09-25T09:00:00Z', detalhe: 'Obra Norte', leitura: 9700, utilizador: 'Ana Gestora' }),
      ev('MANUTENCAO', 'Óleo do motor', { quando: '2026-09-20T09:00:00Z', utilizador: 'Rui Mecânico' }),
      ev('CHECKLIST', 'Checklist — estado OK'),
      ev('ABASTECIMENTO', 'Abastecimento 40 L'),
      ev('REGISTO', 'Viatura registada', { leitura: 8000 }),
    ]
  })

  it('mostra tudo, com quem fez e a leitura', () => {
    abrir()
    const tempo = screen.getByText('Linha do tempo').closest('section')!
    expect(within(tempo).getAllByRole('listitem')).toHaveLength(5)
    expect(within(tempo).getByText(/por Ana Gestora/)).toBeInTheDocument()
    expect(within(tempo).getByText(/9\s?700 km/)).toBeInTheDocument()
    expect(within(tempo).getByText('Obra Norte')).toBeInTheDocument()
  })

  it('filtra por tipo', async () => {
    abrir()
    const tempo = screen.getByText('Linha do tempo').closest('section')!
    await clicar(within(tempo).getByRole('button', { name: 'Manutenção' }))
    expect(within(tempo).getAllByRole('listitem')).toHaveLength(1)
    expect(within(tempo).getByText('Óleo do motor')).toBeInTheDocument()
    await clicar(within(tempo).getByRole('button', { name: 'Entregas' }))
    expect(within(tempo).getByText('Entregue a João Silva')).toBeInTheDocument()
    await clicar(within(tempo).getByRole('button', { name: 'Tudo' }))
    expect(within(tempo).getAllByRole('listitem')).toHaveLength(5)
  })

  it('mostra o último registo de entrega e a ligação para todas', () => {
    abrir()
    const seccao = screen.getByText('Entregas e devoluções').closest('section')!
    expect(within(seccao).getByText('Entregue a João Silva')).toBeInTheDocument()
    expect(within(seccao).getByRole('link', { name: 'Ver todas' })).toHaveAttribute('href', '/frota/entregas?viatura=v1')
  })

  it('sem eventos mostra mensagem', () => {
    mocks.eventos = []
    abrir()
    expect(screen.getByText('Sem eventos.')).toBeInTheDocument()
    expect(screen.getByText('Ainda sem entregas nem devoluções.')).toBeInTheDocument()
  })
})
