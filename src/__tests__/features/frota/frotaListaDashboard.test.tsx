import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router'
import type { ResumoViaturaRow, EntregaRow, HistoricoManutencaoRow } from '@/features/frota/db'
import { resumo, dataEm, mockUseRole } from './frotaFixtures'

const mocks = vi.hoisted(() => ({
  role: 'admin' as string,
  viaturas: [] as ResumoViaturaRow[],
  entregas: [] as EntregaRow[],
  manutencoes: [] as HistoricoManutencaoRow[],
  avaliar: vi.fn(async () => 2 as number | null),
}))

vi.mock('@/features/auth/useRole', () => ({ useRole: () => mockUseRole(mocks.role) }))
vi.mock('@/features/frota/hooks/useFrota', () => ({
  useResumoFrota: () => ({ viaturas: mocks.viaturas, loading: false, error: null, reload: vi.fn() }),
  useAvaliarFrota: () => ({ avaliar: mocks.avaliar, loading: false }),
  useUltimasEntregas: () => ({ entregas: mocks.entregas, loading: false }),
  useUltimasManutencoes: () => ({ manutencoes: mocks.manutencoes, loading: false }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { ViaturasListaPage } from '@/features/frota/components/ViaturasListaPage'
import { FrotaDashboardPage } from '@/features/frota/components/FrotaDashboardPage'

function Local() {
  const l = useLocation()
  return <p data-testid="local">{l.pathname}{l.search}</p>
}

function abrir(caminho: string) {
  render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="/frota" element={<FrotaDashboardPage />} />
        <Route path="/frota/viaturas" element={<><ViaturasListaPage /><Local /></>} />
        <Route path="*" element={<Local />} />
      </Routes>
    </MemoryRouter>,
  )
}

const hilux = resumo({ id: 'a', identificacao: '50-AA-50', marca: 'Toyota', modelo: 'Hilux', estado_operacional: 'LIVRE', km_atual: 12500, data_fim_seguro: dataEm(200), data_proxima_ipo: dataEm(10) })
const volvo = resumo({
  id: 'b', identificacao: '11-BB-22', marca: 'Volvo', modelo: 'FH', estado_operacional: 'EM_USO', condutor_nome: 'João Silva',
  condutor_desde: '2026-09-01', obra_id: 'o1', obra_nome: 'Obra Norte', alertas_urgentes: 1, data_fim_seguro: dataEm(-2),
})
const giratoria = resumo({ id: 'c', identificacao: 'GIR-01', marca: 'CAT', modelo: '320', tipo: 'maquina', unidade_contador: 'horas', km_atual: 830, estado_operacional: 'OFICINA' })

beforeEach(() => {
  mocks.role = 'admin'
  mocks.viaturas = [hilux, volvo, giratoria]
  mocks.entregas = []
  mocks.manutencoes = []
  mocks.avaliar.mockClear()
})
afterEach(cleanup)

describe('ViaturasListaPage', () => {
  it('mostra a matrícula em destaque, estado, colaborador, obra e leitura', () => {
    abrir('/frota/viaturas')
    const cartao = screen.getByText('11-BB-22').closest('li')!
    expect(within(cartao).getByText('Volvo FH')).toBeInTheDocument()
    expect(within(cartao).getByText('Em uso')).toBeInTheDocument()
    expect(within(cartao).getByText('João Silva')).toBeInTheDocument()
    expect(within(cartao).getByText('Obra Norte')).toBeInTheDocument()
    expect(screen.getByText(/830 h/)).toBeInTheDocument()   // máquina em horas
    expect(screen.getByText(/12\s?500 km/)).toBeInTheDocument()
  })

  it('pastilhas mostram as contagens e filtram por estado', () => {
    abrir('/frota/viaturas')
    expect(screen.getByRole('button', { name: /Todos\s*3/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Em uso\s*1/ }))
    expect(screen.getByText('11-BB-22')).toBeInTheDocument()
    expect(screen.queryByText('50-AA-50')).not.toBeInTheDocument()
    expect(screen.getByTestId('local').textContent).toBe('/frota/viaturas?estado=EM_USO')
  })

  it('lê ?estado= e ?obra= do endereço', () => {
    abrir('/frota/viaturas?estado=OFICINA')
    expect(screen.getByText('GIR-01')).toBeInTheDocument()
    expect(screen.queryByText('50-AA-50')).not.toBeInTheDocument()
    cleanup()
    abrir('/frota/viaturas?obra=o1')
    expect(screen.getByText('11-BB-22')).toBeInTheDocument()
    expect(screen.queryByText('GIR-01')).not.toBeInTheDocument()
  })

  it('separa viaturas de máquinas', () => {
    abrir('/frota/viaturas')
    fireEvent.click(screen.getByRole('button', { name: 'Máquinas' }))
    expect(screen.getByText('GIR-01')).toBeInTheDocument()
    expect(screen.queryByText('50-AA-50')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Viaturas' }))
    expect(screen.queryByText('GIR-01')).not.toBeInTheDocument()
    expect(screen.getByText('50-AA-50')).toBeInTheDocument()
  })

  it('pesquisa por matrícula, modelo e condutor', () => {
    abrir('/frota/viaturas')
    const caixa = screen.getByLabelText('Pesquisar viaturas')
    fireEvent.change(caixa, { target: { value: 'joao' } })
    expect(screen.getByText('11-BB-22')).toBeInTheDocument()
    expect(screen.queryByText('50-AA-50')).not.toBeInTheDocument()
    fireEvent.change(caixa, { target: { value: 'hilux' } })
    expect(screen.getByText('50-AA-50')).toBeInTheDocument()
    fireEvent.change(caixa, { target: { value: 'nada' } })
    expect(screen.getByText('Nenhuma viatura corresponde aos filtros.')).toBeInTheDocument()
  })

  it('filtro por obra só aparece com obras em uso e filtra', () => {
    abrir('/frota/viaturas')
    fireEvent.change(screen.getByLabelText('Filtrar por obra'), { target: { value: 'o1' } })
    expect(screen.getByText('11-BB-22')).toBeInTheDocument()
    expect(screen.queryByText('GIR-01')).not.toBeInTheDocument()
  })

  it('ações rápidas: Entregar na livre, Devolver na em uso, nenhuma na oficina', () => {
    abrir('/frota/viaturas')
    expect(screen.getByRole('link', { name: /Entregar/ })).toHaveAttribute('href', '/frota/entregar?viatura=a')
    expect(screen.getByRole('link', { name: /Devolver/ })).toHaveAttribute('href', '/frota/devolver?viatura=b')
    expect(screen.getAllByRole('link', { name: /Entregar|Devolver/ })).toHaveLength(2)
  })

  it('quem só consulta não vê ações rápidas', () => {
    mocks.role = 'leitura'
    abrir('/frota/viaturas')
    expect(screen.queryByRole('link', { name: /Entregar|Devolver/ })).not.toBeInTheDocument()
  })

  it('o cartão leva à ficha', () => {
    abrir('/frota/viaturas')
    expect(screen.getByText('50-AA-50').closest('a')).toHaveAttribute('href', '/frota/viatura/a')
  })

  it('indicadores de revisão, seguro e IPO com a cor do prazo', () => {
    abrir('/frota/viaturas')
    const cartao = screen.getByText('11-BB-22').closest('li')!
    expect(within(cartao).getByTitle('Revisão: expirado')).toBeInTheDocument()   // 1 alerta urgente
    expect(within(cartao).getByTitle('Seguro: expirado')).toBeInTheDocument()
    expect(within(cartao).getByTitle('IPO: sem data')).toBeInTheDocument()
    const outro = screen.getByText('50-AA-50').closest('li')!
    expect(within(outro).getByTitle('Seguro: em dia')).toBeInTheDocument()
    expect(within(outro).getByTitle('IPO: a vencer')).toBeInTheDocument()
  })

  it('sem viaturas: convite a criar a primeira (só quem pode)', () => {
    mocks.viaturas = []
    abrir('/frota/viaturas')
    expect(screen.getByRole('link', { name: 'Criar a primeira viatura' })).toHaveAttribute('href', '/frota/viatura/nova')
    cleanup()
    mocks.role = 'leitura'
    abrir('/frota/viaturas')
    expect(screen.queryByRole('link', { name: 'Criar a primeira viatura' })).not.toBeInTheDocument()
    expect(screen.getByText('Ainda não há viaturas nem máquinas ativas.')).toBeInTheDocument()
  })
})

describe('FrotaDashboardPage', () => {
  it('contadores clicáveis levam à lista filtrada', () => {
    abrir('/frota')
    expect(screen.getByRole('link', { name: /3\s*Total/ })).toHaveAttribute('href', '/frota/viaturas')
    expect(screen.getByRole('link', { name: /1\s*Livres/ })).toHaveAttribute('href', '/frota/viaturas?estado=LIVRE')
    expect(screen.getByRole('link', { name: /1\s*Em uso/ })).toHaveAttribute('href', '/frota/viaturas?estado=EM_USO')
    expect(screen.getByRole('link', { name: /1\s*Na oficina/ })).toHaveAttribute('href', '/frota/viaturas?estado=OFICINA')
  })

  it('alertas: prazos urgentes e seguros/IPO expirados ou a vencer', () => {
    abrir('/frota')
    expect(screen.getByText(/1 prazo urgente/)).toBeInTheDocument()
    expect(screen.getByText(/Seguro .*atrasado 2 dias/)).toBeInTheDocument()
    expect(screen.getByText(/IPO .*vence em 10 dias/)).toBeInTheDocument()
  })

  it('sem alertas mostra mensagem tranquilizadora', () => {
    mocks.viaturas = [resumo({ data_fim_seguro: dataEm(300) })]
    abrir('/frota')
    expect(screen.getByText(/Tudo em dia/)).toBeInTheDocument()
  })

  it('"Quem tem o quê" lista as viaturas em uso com colaborador e obra', () => {
    abrir('/frota')
    const seccao = screen.getByText('Quem tem o quê').closest('section')!
    expect(within(seccao).getByText('11-BB-22')).toBeInTheDocument()
    expect(within(seccao).getByText(/João Silva/)).toBeInTheDocument()
    expect(within(seccao).getByText('Obra Norte')).toBeInTheDocument()
    expect(within(seccao).queryByText('50-AA-50')).not.toBeInTheDocument()
  })

  it('"Quem tem o quê" mostra no máximo 8 e oferece ver todas', () => {
    mocks.viaturas = Array.from({ length: 10 }, (_, i) => resumo({ identificacao: `EM-USO-${i}`, estado_operacional: 'EM_USO' }))
    abrir('/frota')
    const seccao = screen.getByText('Quem tem o quê').closest('section')!
    expect(within(seccao).getAllByRole('link', { name: /EM-USO/ })).toHaveLength(8)
    expect(within(seccao).getByRole('link', { name: 'Ver todas (10)' })).toHaveAttribute('href', '/frota/viaturas?estado=EM_USO')
  })

  it('últimas entregas e manutenções com ligações "Ver todas"', () => {
    mocks.entregas = [{
      id: 'e1', veiculo_id: 'a', veiculo_nome: 'Hilux', identificacao: '50-AA-50', tipo: 'ENTREGA', colaborador_id: 'c1', colaborador_nome: 'Maria Costa',
      obra_id: null, obra_nome: null, data: '2026-09-30', km: 1, combustivel: 'CHEIO', adblue: 'NA', oleo: 'OK', refrigeracao: 'OK', pneus: 'OK',
      limpeza: 'OK', inventario: {}, danos: [], observacoes: null, entrega_ref: null, para_oficina: false, registado_por: 'x', criado_em: '2026-09-30T10:00:00Z',
    }]
    mocks.manutencoes = [{
      id: 'm1', veiculo_id: 'a', veiculo_nome: 'Hilux', identificacao: '11-BB-22', unidade_contador: 'km', item_id: null, item_rotulo: 'Óleo do motor',
      descricao: null, data: '2026-09-29', km_na_altura: 1, custo: null, oficina: null, observacoes: null, condutor_nome: null,
      registado_por: 'x', registado_em: '2026-09-29T10:00:00Z', editado_por: null, editado_em: null,
    }]
    abrir('/frota')
    expect(screen.getByText(/Entregue a Maria Costa/)).toBeInTheDocument()
    expect(screen.getByText(/Óleo do motor/)).toBeInTheDocument()
    const links = screen.getAllByRole('link', { name: 'Ver todas' }).map(a => a.getAttribute('href'))
    expect(links).toEqual(['/frota/entregas', '/frota/manutencao'])
  })

  it('"Avaliar prazos" só para quem escreve na frota', async () => {
    abrir('/frota')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Avaliar prazos/ })) })
    expect(mocks.avaliar).toHaveBeenCalledTimes(1)
    cleanup()
    mocks.role = 'leitura'
    abrir('/frota')
    expect(screen.queryByRole('button', { name: /Avaliar prazos/ })).not.toBeInTheDocument()
  })
})
