import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { SubResumoRow } from '../../db'
import { SubResumoLista } from './SubResumoLista'

const sub: SubResumoRow = {
  sub_id: 'sub-1', obra_id: 'obra-1', obra_nome: 'Obra Norte', nome: 'Alvenaria Silva',
  especialidade: 'Alvenaria', tipo: 'global', estado: 'validado', valor_contrato: 10000,
  executado: 2500, executado_pct: 25, atraso_dias_total: 3, ocorrencias_abertas: 2,
  tem_contrato: false, data_fim_prevista: '2026-10-30', saude: 'atencao', motivos: ['Duas ocorrências abertas'],
}

describe('resumo das subempreitadas', () => {
  it('mostra saúde com texto, execução, ocorrências e contrato por contratação', () => {
    render(<MemoryRouter><SubResumoLista subs={[sub]} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: /Alvenaria Silva/ })).toHaveAttribute('href', '/obras/subempreitada/sub-1')
    expect(screen.getByText('Atenção')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25')
    expect(screen.getByText(/Sem contrato anexado/)).toBeInTheDocument()
    expect(screen.getByText(/Duas ocorrências abertas/)).toBeInTheDocument()
  })
})
