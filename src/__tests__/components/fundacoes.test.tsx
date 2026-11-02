import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { Inbox, LayoutGrid, Package } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { EmptyState } from '@/app/components/EmptyState'
import { PageHeader, LARGURA_PAGINA, LARGURA_FORMULARIO } from '@/app/components/PageHeader'
import { SeparadoresNav } from '@/app/components/SeparadoresNav'
import { FiltroChips } from '@/app/components/FiltroChips'
import { CampoSelect, CLASSE_CAMPO } from '@/app/components/CampoSelect'
afterEach(cleanup)

describe('Button', () => {
  it('desativado não usa opacidade e usa cor muted', () => {
    render(<Button disabled>Guardar</Button>)
    const b = screen.getByRole('button', { name: 'Guardar' })
    expect(b.className).not.toContain('disabled:opacity-50')
    expect(b.className).toContain('disabled:bg-muted')
    expect(b.className).toContain('disabled:pointer-events-none')
  })
  it('alvos maiores no telemóvel', () => {
    render(<Button>Ok</Button>)
    expect(screen.getByRole('button').className).toContain('h-10')
    expect(screen.getByRole('button').className).toContain('md:h-9')
  })
})

describe('SeparadoresNav', () => {
  const itens = [
    { para: '/armazem', rotulo: 'Visão geral', Icone: LayoutGrid, fim: true },
    { para: '/armazem/inventario', rotulo: 'Inventário', Icone: Package },
  ]
  it('marca o ativo com aria-current e não mostra gradientes sem overflow', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/armazem/inventario']}>
        <SeparadoresNav itens={itens} ariaLabel="Secções do armazém" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('navigation', { name: 'Secções do armazém' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Inventário/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /Visão geral/ })).not.toHaveAttribute('aria-current')
    expect(container.querySelectorAll('[data-sombra-scroll]')).toHaveLength(0)
  })
})

describe('FiltroChips', () => {
  it('expõe aria-pressed e chama onChange', () => {
    const onChange = vi.fn()
    render(
      <FiltroChips ariaLabel="Estado" valor="todos" onChange={onChange}
        opcoes={[{ valor: 'todos', rotulo: 'Todos', contagem: 3 }, { valor: 'ativos', rotulo: 'Ativos' }]} />,
    )
    expect(screen.getByRole('group', { name: 'Estado' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Todos/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Ativos' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('3')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ativos' }))
    expect(onChange).toHaveBeenCalledWith('ativos')
  })
})

describe('PageHeader', () => {
  it('renderiza h1, descrição, ações e link Voltar', () => {
    render(
      <MemoryRouter>
        <PageHeader titulo="Armazém" descricao="Stock" voltar="/obras" acoes={<button>Nova</button>} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Armazém' })).toBeInTheDocument()
    expect(screen.getByText('Stock')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '/obras')
    expect(screen.getByRole('button', { name: 'Nova' })).toBeInTheDocument()
  })
  it('sem voltar nem descrição não os renderiza', () => {
    const { container } = render(<MemoryRouter><PageHeader titulo="X" /></MemoryRouter>)
    expect(screen.queryByRole('link')).toBeNull()
    expect(container.querySelector('p')).toBeNull()
  })
  it('exporta as duas larguras', () => {
    expect(LARGURA_PAGINA).toBe('max-w-6xl mx-auto w-full')
    expect(LARGURA_FORMULARIO).toBe('max-w-3xl mx-auto w-full')
  })
})

describe('CampoSelect', () => {
  it('select nativo com a classe partilhada e ref', () => {
    const ref = { current: null as HTMLSelectElement | null }
    render(
      <CampoSelect ref={ref} aria-label="Obra" defaultValue="b">
        <option value="a">A</option><option value="b">B</option>
      </CampoSelect>,
    )
    const s = screen.getByRole('combobox', { name: 'Obra' })
    expect(s.className).toContain('appearance-none')
    expect(s.className).toContain('min-h-11')
    expect(ref.current).toBe(s)
    expect(CLASSE_CAMPO).toContain('bg-input-background')
  })
})

describe('EmptyState', () => {
  it('sem descrição não renderiza <p>', () => {
    const { container } = render(<EmptyState icon={Inbox} title="Vazio" />)
    expect(container.querySelector('p')).toBeNull()
  })
  it('ação usa Button e compacto reduz padding', () => {
    const onClick = vi.fn()
    const { container } = render(<EmptyState compacto icon={Inbox} title="Vazio" description="d" action={{ label: 'Limpar filtros', onClick }} />)
    const b = screen.getByRole('button', { name: 'Limpar filtros' })
    expect(b).toHaveAttribute('data-slot', 'button')
    fireEvent.click(b); expect(onClick).toHaveBeenCalled()
    expect(container.firstElementChild?.className).toContain('py-8')
  })
})
