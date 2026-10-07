import { render, screen } from '@testing-library/react'
import { it, expect } from 'vitest'
import { CabecalhoImpresso, RodapeImpresso, estiloPaginaImpressa, dataHoraLisboa, PRINT } from '@/app/components/print'

it('cabeçalho mostra título, marca e logo', () => {
  render(<CabecalhoImpresso titulo="Relatório X" subtitulo="Out 2026" />)
  expect(screen.getByText('Relatório X')).toBeInTheDocument()
  expect(screen.getByText('ENCIVIL')).toBeInTheDocument()
  expect(screen.getByRole('img')).toHaveAttribute('src', '/icone_oficial.png')
})
it('rodapé com nota', () => {
  render(<RodapeImpresso nota="Confidencial" />)
  expect(screen.getByText(/Confidencial/)).toBeInTheDocument()
})
it('dataHoraLisboa usa fuso de Lisboa', () => {
  expect(dataHoraLisboa(new Date('2026-07-01T23:30:00Z'))).toBe('02/07/2026 00:30')
})
it('estilo inclui A4, numeração e cor de tinta', () => {
  const css = estiloPaginaImpressa('x')
  expect(css).toContain('size: A4'); expect(css).toContain('counter(pages)'); expect(css).toContain(PRINT.TINTA)
})
