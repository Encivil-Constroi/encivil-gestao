import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { FluxoCaixaSemana, SubsPainelCeo, SubsPainelSub } from '@/features/obras/db'

const estado = vi.hoisted(() => ({
  painel: { painel: null as unknown, loading: false, error: null as string | null, reload: vi.fn() },
  fluxo: { fluxo: [] as unknown[], loading: false, error: null as string | null, reload: vi.fn() },
}))

vi.mock('@/features/obras/hooks/useSubsControlo', () => ({
  usePainelCeo: () => estado.painel,
  useFluxoCaixaSubs: () => estado.fluxo,
}))

import { PainelCEO } from '@/features/obras/components/subempreitadas/painel/PainelCEO'
import { ordenarSubs } from '@/features/obras/components/subempreitadas/painel/TabelaSubs'
import { ordenarAlertas } from '@/features/obras/components/subempreitadas/painel/AlertasSubs'

const sub = (o: Partial<SubsPainelSub>): SubsPainelSub => ({
  sub_id: 's1', nome: 'Alfa Lda', obra_id: 'o1', obra_nome: 'Obra Norte', contratado: 1000, orcado_ligado: 900,
  certificado: 500, executado_pct: 50, progresso_fisico_pct: 30, desvio_pp: 20, glosado: 50, taxa_glosa_pct: 9.1,
  ocorrencias_altas: 0, docs_estado: 'ok', docs_em_falta: [], por_pagar: 100, saude: 'ok', ...o,
})

const painel = (o: Partial<SubsPainelCeo> = {}): SubsPainelCeo => ({
  totais: {
    contratado: 10000, orcado_subempreitadas: 9000, certificado: 4000, pago: 1500, por_pagar: 1200, retencao_acumulada: 200,
    retencao_libertada: 50, em_aprovacao_valor: 800, em_aprovacao_n: 2, glosado: 300, taxa_glosa_pct: 12.5,
  },
  por_sub: [
    sub({ sub_id: 's1', nome: 'Alfa Lda', por_pagar: 100 }),
    sub({ sub_id: 's2', nome: 'Beta SA', por_pagar: 900, desvio_pp: null, progresso_fisico_pct: null, docs_estado: 'critico', docs_em_falta: ['CERT_SS'] }),
  ],
  passivo_documental: { subs_com_pendencia: 1, valor_por_pagar_em_risco: 900 },
  alertas: [
    { tipo: 'x', sub_id: 's1', obra_id: 'o1', texto: 'Aviso médio', gravidade: 'media' },
    { tipo: 'y', sub_id: 's2', obra_id: 'o1', texto: 'Problema grave', gravidade: 'alta' },
  ],
  ...o,
})

const semana = (d: string, a: number, e: number): FluxoCaixaSemana => ({ semana_inicio: d, aprovado: a, em_aprovacao: e, n_autos: 1 })

const mostrar = () => render(<MemoryRouter><PainelCEO obraId={null} /></MemoryRouter>)

afterEach(() => {
  cleanup()
  estado.painel = { painel: null, loading: false, error: null, reload: vi.fn() }
  estado.fluxo = { fluxo: [], loading: false, error: null, reload: vi.fn() }
})

describe('PainelCEO', () => {
  it('mostra A carregar enquanto não há dados', () => {
    estado.painel.loading = true
    mostrar()
    expect(screen.getByRole('status')).toHaveTextContent('A carregar o painel')
  })

  it('mostra o erro e permite tentar de novo', () => {
    estado.painel.error = 'Falhou'
    mostrar()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(estado.painel.reload).toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Falhou')
  })

  it('mostra KPIs, taxa de glosa e passivo documental', () => {
    estado.painel.painel = painel()
    mostrar()
    const kpis = screen.getByLabelText('Indicadores das subempreitadas')
    for (const r of ['Contratado', 'Certificado', 'Pago', 'Por pagar', 'Retenção acumulada', 'Em aprovação', 'Glosado', 'Taxa de glosa']) {
      expect(within(kpis).getByText(r)).toBeInTheDocument()
    }
    expect(within(kpis).getByText('12,5%')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('1 subempreiteiro com documentos em falta')
  })

  it('esconde o passivo documental quando não há pendências e mostra estado vazio da tabela', () => {
    estado.painel.painel = painel({ por_sub: [], alertas: [], passivo_documental: { subs_com_pendencia: 0, valor_por_pagar_em_risco: 0 } })
    mostrar()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    expect(screen.getByText('Sem alertas ativos.')).toBeInTheDocument()
    expect(screen.getByText(/Ainda não há subempreitadas/)).toBeInTheDocument()
  })

  it('lista alertas por gravidade com texto e liga ao subempreiteiro', () => {
    estado.painel.painel = painel()
    mostrar()
    const itens = screen.getAllByRole('listitem').filter(li => li.textContent?.match(/Grave|Atenção/))
    expect(itens[0]).toHaveTextContent('Grave')
    expect(screen.getByRole('link', { name: 'Problema grave' })).toHaveAttribute('href', '/obras/subempreitada/s2')
  })

  it('tabela: por pagar descendente por defeito e ordenável', () => {
    estado.painel.painel = painel()
    mostrar()
    const tabela = screen.getByRole('table', { name: /Subempreiteiros/ })
    const nomes = () => within(tabela).getAllByRole('link').map(a => a.textContent)
    expect(nomes()).toEqual(['Beta SA', 'Alfa Lda'])
    fireEvent.click(within(tabela).getByRole('button', { name: 'Subempreiteiro' }))
    expect(nomes()).toEqual(['Alfa Lda', 'Beta SA'])
    expect(within(tabela).getByRole('columnheader', { name: 'Subempreiteiro' })).toHaveAttribute('aria-sort', 'ascending')
  })

  it('tabela: desvio, documentos em falta com texto e desvio nulo', () => {
    estado.painel.painel = painel()
    mostrar()
    expect(screen.getByText('+20 pp')).toBeInTheDocument()
    expect(screen.getByText('Pago à frente da obra')).toBeInTheDocument()
    expect(screen.getByText('Em falta')).toBeInTheDocument()
    expect(screen.getByText('Certidão da Segurança Social')).toBeInTheDocument()
    expect(screen.getByText(/sem físico/)).toBeInTheDocument()
  })

  it('fluxo de caixa: vazio, carregamento, erro e dados com legenda em texto', () => {
    estado.painel.painel = painel()
    mostrar()
    expect(screen.getByText(/Sem pagamentos previstos/)).toBeInTheDocument()
    cleanup()
    estado.fluxo.loading = true
    mostrar()
    expect(screen.getByText('A carregar o fluxo de caixa…')).toBeInTheDocument()
    cleanup()
    estado.fluxo.loading = false
    estado.fluxo.error = 'Sem ligação'
    mostrar()
    expect(screen.getByText(/Sem ligação/)).toBeInTheDocument()
    cleanup()
    estado.fluxo.error = null
    estado.fluxo.fluxo = [semana('2026-10-05', 1000, 0), semana('2026-10-12', 500, 250)]
    mostrar()
    expect(screen.getByRole('img', { name: /Fluxo de caixa previsto/ })).toBeInTheDocument()
    expect(screen.getByText('Aprovado (a pagar)')).toBeInTheDocument()
    expect(screen.getByText('Estimado (em aprovação)')).toBeInTheDocument()
  })
})

describe('ordenação', () => {
  it('ordenarSubs trata desvio nulo como o menor e desempata por nome', () => {
    const a = sub({ sub_id: 'a', nome: 'A', desvio_pp: null })
    const b = sub({ sub_id: 'b', nome: 'B', desvio_pp: 5 })
    const c = sub({ sub_id: 'c', nome: 'C', desvio_pp: 5 })
    expect(ordenarSubs([a, b, c], 'desvio_pp', 'desc').map(s => s.sub_id)).toEqual(['b', 'c', 'a'])
  })
  it('ordenarAlertas põe graves primeiro sem alterar o original', () => {
    const lista = [
      { tipo: 'a', sub_id: null, obra_id: null, texto: 't1', gravidade: 'baixa' as const },
      { tipo: 'b', sub_id: null, obra_id: null, texto: 't2', gravidade: 'alta' as const },
    ]
    expect(ordenarAlertas(lista).map(a => a.texto)).toEqual(['t2', 't1'])
    expect(lista[0].texto).toBe('t1')
  })
})
