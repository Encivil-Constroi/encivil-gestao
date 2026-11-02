import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'

const estado = vi.hoisted(() => ({
  role: 'admin',
  materiais: [] as unknown[],
}))

vi.mock('@/features/auth/useRole', () => ({
  useRole: () => ({
    role: estado.role, isAdmin: estado.role === 'admin', isGestor: estado.role === 'gestor',
    podeObras: ['admin', 'gestor'].includes(estado.role),
    podeSubempreitadas: ['admin', 'gestor', 'medicoes'].includes(estado.role),
  }),
}))
vi.mock('@/app/lib/exportCsv', () => ({ exportarCsv: vi.fn() }))
vi.mock('@/features/obras/hooks/useFichaRecursos', () => ({
  useMateriaisObra: () => ({ materiais: estado.materiais, loading: false, error: null, reload: vi.fn() }),
}))
vi.mock('@/features/obras/components/subempreitadas/useSubData', () => ({
  usePainelSub: () => ({ painel: null, loading: false, error: null, reload: vi.fn() }),
  useFichaSub: () => ({ ficha: null, loading: false, error: null, reload: vi.fn() }),
  useOcorrenciasSub: () => ({
    ocorrencias: [{ id: 'o1', tipo: 'PROBLEMA', gravidade: 'alta', data: '2026-10-01', descricao: 'Infiltração', dias_atraso: 0, fotos: [], resolvido: true, resolucao: 'ok' }],
    loading: false, error: null, reload: vi.fn(),
  }),
  useAnexarContrato: () => ({ anexar: vi.fn(), loading: false, error: null }),
  useRemoverContrato: () => ({ remover: vi.fn(), loading: false, error: null }),
  useRegistarOcorrencia: () => ({ registar: vi.fn(), loading: false, error: null }),
  useResolverOcorrencia: () => ({ resolver: vi.fn(), loading: false, error: null }),
  useGuardarFichaSub: () => ({ guardar: vi.fn(), loading: false, error: null }),
}))
vi.mock('@/features/obras/components/FotoCapture', () => ({ FotoCapture: () => null }))
vi.mock('@/features/obras/components/FotosGaleria', () => ({ FotosGaleria: () => null }))

import { Materiais } from '@/features/obras/components/ficha/Materiais'
import { ObrasLayout } from '@/features/obras/components/ObrasLayout'
import { SubFichaCEO } from '@/features/obras/components/subempreitadas/SubFichaCEO'

afterEach(() => { cleanup(); estado.role = 'admin'; estado.materiais = [] })

const material = (i: number) => ({ produto_id: `p${i}`, nome: `Artigo ${i}`, unidade: 'kg', enviado: 1453.52, devolvido: 0, liquido: 1453.52, valor: 10, ultimo_movimento: '2026-09-30' })

describe('Materiais da obra', () => {
  it('mostra 50 linhas e "Mostrar mais" acrescenta mais 50', () => {
    estado.materiais = Array.from({ length: 120 }, (_, i) => material(i))
    render(<MemoryRouter><Materiais obraId="o1" /></MemoryRouter>)
    const linhas = () => within(screen.getByRole('table')).getAllByRole('row').length - 1
    expect(linhas()).toBe(50)
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar mais (70 restantes)' }))
    expect(linhas()).toBe(100)
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar mais (20 restantes)' }))
    expect(linhas()).toBe(120)
    expect(screen.queryByRole('button', { name: /Mostrar mais/ })).not.toBeInTheDocument()
  })

  it('alinha as colunas numéricas à direita e usa vírgula decimal', () => {
    estado.materiais = [material(1)]
    render(<MemoryRouter><Materiais obraId="o1" /></MemoryRouter>)
    expect(screen.getByRole('columnheader', { name: 'Enviado' })).toHaveClass('text-right')
    expect(screen.getAllByText('1453,52 kg')[0]).toHaveClass('text-right')
  })
})

describe('ObrasLayout — ação do cabeçalho', () => {
  const layout = (entrada: string) => render(
    <MemoryRouter initialEntries={[entrada]}>
      <Routes><Route path="/obras" element={<ObrasLayout />}><Route index element={<p>x</p>} /><Route path="subempreitadas" element={<p>y</p>} /></Route></Routes>
    </MemoryRouter>,
  )

  it('em /obras/subempreitadas mostra só "Nova contratação"', () => {
    layout('/obras/subempreitadas')
    expect(screen.getByRole('link', { name: /Nova contratação/ })).toHaveAttribute('href', '/obras/subempreitada/novo')
    expect(screen.queryByRole('link', { name: /Nova obra/ })).not.toBeInTheDocument()
  })

  it('fora das subempreitadas mostra só "Nova obra"', () => {
    layout('/obras')
    expect(screen.getByRole('link', { name: /Nova obra/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Nova contratação/ })).not.toBeInTheDocument()
  })

  it('medições vê "Nova contratação" mas não "Nova obra"', () => {
    estado.role = 'medicoes'
    layout('/obras/subempreitadas')
    expect(screen.getByRole('link', { name: /Nova contratação/ })).toBeInTheDocument()
    cleanup()
    layout('/obras')
    expect(screen.queryByRole('link', { name: /Nova obra/ })).not.toBeInTheDocument()
  })
})

describe('SubFichaCEO — ocorrências', () => {
  it('mostra o tipo com rótulo pt-PT e não o enum em maiúsculas', () => {
    render(<SubFichaCEO subId="s1" obraId="o1" />)
    expect(screen.getByRole('option', { name: 'Segurança' })).toBeInTheDocument()
    expect(screen.queryByText(/PROBLEMA/)).not.toBeInTheDocument()
    expect(screen.getByText(/Problema · /)).toBeInTheDocument()
  })
})
