import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import type { ObraResumoRow } from '@/features/obras/db'
import { obraFixture } from './obrasFixtures'

const estado = vi.hoisted(() => ({
  obras: [] as unknown[], loading: false, error: null as string | null, role: 'gestor', reload: vi.fn(),
}))

vi.mock('@/features/obras/hooks/useObras', () => ({
  usePainelObras: () => ({ obras: estado.obras, loading: estado.loading, error: estado.error, reload: estado.reload }),
}))
vi.mock('@/features/auth/useRole', () => ({
  useRole: () => ({ role: estado.role, podeObras: ['admin', 'gestor'].includes(estado.role) }),
}))

import { ObrasPainelPage } from '@/features/obras/components/ObrasPainelPage'
import { ObrasListaPage } from '@/features/obras/components/ObrasListaPage'
import { ObrasLayout } from '@/features/obras/components/ObrasLayout'

function mostrar(obras: ObraResumoRow[], opcoes: Partial<typeof estado> = {}) {
  Object.assign(estado, { obras, loading: false, error: null, role: 'gestor' }, opcoes)
  return render(<MemoryRouter><ObrasPainelPage /></MemoryRouter>)
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

const critica = () => obraFixture({
  nome: 'Moradia Cascais', estado: 'ativa', saude: 'critico', motivos: ['Prazo ultrapassado há 5 dias', 'Ocorrência grave aberta'],
  progresso_pct: 35, progresso_esperado_pct: 70, data_prevista_fim: '2020-01-01', orcamento: 100000, custo_total: 95000,
  equipa_n: 6, viaturas_n: 2, ferramentas_n: 3, subs_n: 4, ocorrencias_abertas: 2, relatorios_n: 8, dias_sem_relatorio: 4, ultimo_relatorio: '2026-05-06',
})
const saudavel = () => obraFixture({
  nome: 'Armazém Seixal', estado: 'ativa', saude: 'ok', progresso_pct: 50, progresso_esperado_pct: 48, data_prevista_fim: '2099-12-31',
  orcamento: 50000, custo_total: 10000, dias_sem_relatorio: 0, ultimo_relatorio: '2026-05-10',
})

describe('Painel das obras', () => {
  it('mostra uma carga em curso com semáforo em cor, texto e ícone', () => {
    mostrar([critica(), saudavel()])
    const cartao = screen.getByRole('link', { name: 'Abrir obra Moradia Cascais' })
    expect(within(cartao).getByText('Crítico')).toBeInTheDocument()
    expect(within(cartao).getByText('Prazo ultrapassado há 5 dias')).toBeInTheDocument()
    expect(within(cartao).getByRole('img', { name: /Progresso 35 por cento, previsto 70 por cento/ })).toBeInTheDocument()
    expect(within(cartao).getByText('35 pontos atrás do previsto')).toBeInTheDocument()
    expect(within(cartao).getByText('2 ocorrências abertas')).toBeInTheDocument()
    expect(cartao).toHaveAttribute('href', `/obras/${(estado.obras[0] as ObraResumoRow).obra_id}`)
    const ok = screen.getByRole('link', { name: 'Abrir obra Armazém Seixal' })
    expect(within(ok).getByText('Em dia')).toBeInTheDocument()
  })

  it('só as obras em curso aparecem como cartões; as paradas ficam numa lista à parte', () => {
    mostrar([
      critica(), obraFixture({ nome: 'Futura', estado: 'planeada' }),
      obraFixture({ nome: 'Parada', estado: 'suspensa' }), obraFixture({ nome: 'Acabada', estado: 'concluida' }),
    ])
    expect(screen.getAllByRole('link', { name: /^Abrir obra/ })).toHaveLength(1)
    expect(screen.getByText('Futura')).toBeInTheDocument()
    expect(screen.getByText('Parada')).toBeInTheDocument()
    expect(screen.queryByText('Acabada')).not.toBeInTheDocument()
  })

  it('ordena as obras em curso da mais grave para a menos grave', () => {
    mostrar([saudavel(), critica(), obraFixture({ nome: 'Em atenção', saude: 'atencao', motivos: ['Custo ≥ 90 % do orçamento'] })])
    const nomes = screen.getAllByRole('link', { name: /^Abrir obra/ }).map(l => l.getAttribute('aria-label'))
    expect(nomes).toEqual(['Abrir obra Moradia Cascais', 'Abrir obra Em atenção', 'Abrir obra Armazém Seixal'])
  })

  it('a secção "Precisa de atenção" lista os motivos e omite as obras em dia', () => {
    mostrar([critica(), saudavel()])
    const sec = screen.getByRole('heading', { name: 'Precisa de atenção' }).closest('section')!
    expect(within(sec).getByText(/Moradia Cascais/)).toBeInTheDocument()
    expect(within(sec).getByText(/Prazo ultrapassado há 5 dias · Ocorrência grave aberta/)).toBeInTheDocument()
    expect(within(sec).queryByText(/Armazém Seixal/)).not.toBeInTheDocument()
  })

  it('sem problemas não mostra "Precisa de atenção" e diz que está tudo em dia', () => {
    mostrar([saudavel()])
    expect(screen.queryByText('Precisa de atenção')).not.toBeInTheDocument()
    expect(screen.getByText('Todas em dia')).toBeInTheDocument()
  })

  it('KPIs do topo', () => {
    mostrar([critica(), saudavel()])
    expect(screen.getByText('Obras em curso')).toBeInTheDocument()
    expect(screen.getByText('1 crítica · 0 em atenção')).toBeInTheDocument()
    expect(screen.getByText('43%')).toBeInTheDocument() // (35 + 50) / 2 = 42,5 → 43
    expect(screen.getByText('Progresso médio')).toBeInTheDocument()
    expect(screen.getByText('Ocorrências abertas')).toBeInTheDocument()
    expect(screen.getByText(/1 obra sem relatório recente/)).toBeInTheDocument()
  })

  it('estado de carregamento, erro (com nova tentativa) e vazio', () => {
    const { unmount } = mostrar([], { loading: true })
    expect(screen.getByLabelText('A carregar obras')).toBeInTheDocument()
    unmount()

    const r = mostrar([], { error: 'Falha de rede' })
    expect(screen.getByText('Falha de rede')).toBeInTheDocument()
    screen.getByRole('button', { name: 'Tentar de novo' }).click()
    expect(estado.reload).toHaveBeenCalled()
    r.unmount()

    mostrar([])
    expect(screen.getByText('Ainda não há obras')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Criar obra' })).toHaveAttribute('href', '/obras/nova')
  })

  it('quem não gere obras não vê "Criar obra" no vazio', () => {
    mostrar([], { role: 'leitura' })
    expect(screen.queryByRole('link', { name: 'Criar obra' })).not.toBeInTheDocument()
  })
})

describe('Layout das Obras', () => {
  function layout(role: string) {
    estado.role = role
    render(
      <MemoryRouter initialEntries={['/obras']}>
        <Routes><Route path="/obras" element={<ObrasLayout />}><Route index element={<p>conteudo</p>} /></Route></Routes>
      </MemoryRouter>,
    )
  }

  it('tem os quatro separadores do desenho', () => {
    layout('gestor')
    const nav = screen.getByRole('navigation', { name: 'Secções das obras' })
    const ligacoes = within(nav).getAllByRole('link').map(l => [l.textContent?.trim(), l.getAttribute('href')])
    expect(ligacoes).toEqual([
      ['Painel', '/obras'], ['Obras', '/obras/lista'], ['Relatórios diários', '/obras/relatorios'], ['Subempreitadas', '/obras/subempreitadas'],
    ])
    expect(screen.getByText('conteudo')).toBeInTheDocument()
  })

  it('"Nova obra" só para quem gere obras', () => {
    layout('gestor')
    expect(screen.getByRole('link', { name: /Nova obra/ })).toHaveAttribute('href', '/obras/nova')
    cleanup()
    layout('medicoes')
    expect(screen.queryByRole('link', { name: /Nova obra/ })).not.toBeInTheDocument()
  })
})

describe('Lista de obras', () => {
  function lista(entrada = '/obras/lista') {
    Object.assign(estado, { obras: [critica(), obraFixture({ nome: 'Futura', estado: 'planeada', cliente: 'Câmara' }), obraFixture({ nome: 'Fechada', estado: 'concluida' })], loading: false, error: null })
    render(<MemoryRouter initialEntries={[entrada]}><Routes><Route path="/obras/lista" element={<ObrasListaPage />} /></Routes></MemoryRouter>)
  }

  it('mostra todas e filtra pelo estado do endereço', () => {
    lista()
    expect(screen.getAllByRole('link')).toHaveLength(3)
    cleanup()
    lista('/obras/lista?estado=concluida')
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByText('Fechada')).toBeInTheDocument()
  })

  it('pesquisa sem acentos nem maiúsculas', () => {
    lista('/obras/lista?q=camara')
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByText('Futura')).toBeInTheDocument()
  })

  it('mensagem quando nada corresponde', () => {
    lista('/obras/lista?q=zzz')
    expect(screen.getByText('Nenhuma obra corresponde ao filtro.')).toBeInTheDocument()
  })
})
