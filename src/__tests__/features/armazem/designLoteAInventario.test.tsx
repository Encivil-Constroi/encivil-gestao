import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { produto } from './inventarioMocks'

const estado = vi.hoisted(() => ({ ativos: [] as unknown[] }))

vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ podeArmazem: true }) }))
vi.mock('@/app/lib/fotosArmazem', () => ({ urlFotoArmazem: () => null }))
vi.mock('@/app/lib/exportXlsx', () => ({ exportarXlsx: vi.fn() }))
vi.mock('@/features/produtos/hooks/useProdutos', () => ({
  useProdutos: () => ({ products: estado.ativos, loading: false, reload: vi.fn() }),
  useProdutosArquivados: () => ({ products: [], loading: false, reload: vi.fn() }),
  useRestaurarProduto: () => ({ restaurar: vi.fn(), loading: false }),
}))

const memoria = new Map<string, string>()
vi.stubGlobal('localStorage', { getItem: (k: string) => memoria.get(k) ?? null, setItem: (k: string, v: string) => { memoria.set(k, v) }, removeItem: (k: string) => { memoria.delete(k) }, clear: () => memoria.clear() })

import { InventarioPage } from '@/app/pages/armazem/InventarioPage'

const abrir = () => render(<MemoryRouter><InventarioPage /></MemoryRouter>)

afterEach(() => { cleanup(); memoria.clear(); vi.unstubAllGlobals(); vi.stubGlobal('localStorage', { getItem: (k: string) => memoria.get(k) ?? null, setItem: (k: string, v: string) => { memoria.set(k, v) }, removeItem: (k: string) => { memoria.delete(k) }, clear: () => memoria.clear() }) })

describe('Inventário (lote A)', () => {
  it('mostra quantidades com vírgula decimal e não com ponto', () => {
    estado.ativos = [produto({ id: 'a', currentStock: 1453.52, minStock: 10.5 })]
    abrir()
    expect(screen.getByText('1453,52')).toBeInTheDocument()
    expect(screen.queryByText('1453.52')).toBeNull()
    expect(screen.getByText(/mín\. 10,5/)).toBeInTheDocument()
  })

  it('sem preferência guardada e em ecrã móvel abre em lista', () => {
    estado.ativos = [produto({ id: 'a' })]
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('max-width: 767px'), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    abrir()
    expect(screen.getByRole('button', { name: 'Ver em lista' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('sem foto, o cartão da grelha usa faixa baixa em vez de 4:3', () => {
    estado.ativos = [produto({ id: 'a', fotoPath: null })]
    abrir()
    expect(screen.getByTestId('sem-foto').className).toContain('h-20')
    expect(screen.getByTestId('sem-foto').className).not.toContain('aspect-[4/3]')
  })
})
