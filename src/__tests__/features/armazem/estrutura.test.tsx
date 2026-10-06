import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router'

const m = vi.hoisted(() => ({ papel: 'armazem', enviar: vi.fn() }))
vi.mock('@/features/auth/useRole', () => ({
  useRole: () => ({
    role: m.papel, isAdmin: m.papel === 'admin', isGestor: m.papel === 'gestor',
    isMecanico: m.papel === 'mecanico', isMotorista: m.papel === 'motorista',
    podeArmazem: ['admin', 'gestor', 'armazem'].includes(m.papel),
  }),
}))
vi.mock('@/features/combustivel/hooks/useAprovacao', () => ({
  usePodeAprovar: () => ({ podeAprovar: false, loading: false }),
  useContagemAguardam: () => 0,
}))
vi.mock('@/app/lib/fotosArmazem', async orig => ({
  ...(await orig<typeof import('@/app/lib/fotosArmazem')>()),
  enviarFotoArmazem: m.enviar,
  urlFotoArmazem: (c: string | null) => (c ? `https://fotos/${c}` : null),
}))

import { Sidebar } from '@/app/components/Sidebar'
import { ArmazemLayout } from '@/app/pages/armazem/ArmazemLayout'
import { Redirecionar } from '@/app/components/Redirecionar'
import { FotoInput } from '@/app/components/FotoInput'
import { caminhoFotoArmazem } from '@/app/lib/fotosArmazem'

function Onde() { return <p data-testid="onde">{useLocation().pathname + useLocation().search}</p> }

beforeEach(() => { m.papel = 'armazem'; m.enviar.mockReset() })
afterEach(cleanup)

describe('menu: um só item Armazém', () => {
  it('tem "Armazém" e já não tem Produtos, Novo Movimento, Histórico nem Ferramentas soltos', () => {
    m.papel = 'admin'
    render(<MemoryRouter initialEntries={['/armazem/ferramentas']}><Sidebar /></MemoryRouter>)
    const nav = screen.getAllByRole('navigation')[0]
    const itens = within(nav).getAllByRole('link').map(l => l.textContent?.trim())
    expect(itens).toContain('Armazém')
    for (const x of ['Produtos', 'Novo Movimento', 'Histórico', 'Ferramentas']) expect(itens).not.toContain(x)
    const link = within(nav).getByRole('link', { name: 'Armazém' })
    expect(link).toHaveAttribute('href', '/armazem')
    expect(link).toHaveClass('bg-sidebar-primary', 'text-sidebar-primary-foreground')
    for (const outro of within(nav).getAllByRole('link').filter(item => item !== link)) {
      expect(outro).not.toHaveClass('bg-sidebar-primary')
    }
  })
})

describe('layout do armazém', () => {
  const abrir = (url: string) => render(
    <MemoryRouter initialEntries={[url]}>
      <Routes><Route path="/armazem" element={<ArmazemLayout />}><Route path="*" element={<p>CONTEUDO</p>} /><Route index element={<p>CONTEUDO</p>} /></Route></Routes>
    </MemoryRouter>)

  it('5 separadores e botões Entrada/Saída para quem regista', () => {
    abrir('/armazem/inventario')
    const nav = screen.getByRole('navigation', { name: 'Secções do armazém' })
    expect(within(nav).getAllByRole('link').map(l => l.textContent)).toEqual(['Visão geral', 'Inventário', 'Movimentos', 'Ferramentas', 'Obras'])
    expect(within(nav).getByRole('link', { name: 'Inventário' }).className).toMatch(/border-primary/)
    expect(screen.getByRole('link', { name: /Entrada/ })).toHaveAttribute('href', '/armazem/movimento/entrada')
    expect(screen.getByRole('link', { name: /Saída/ })).toHaveAttribute('href', '/armazem/movimento/saida')
  })

  it('leitura vê tudo mas sem Entrada/Saída', () => {
    m.papel = 'leitura'
    abrir('/armazem')
    expect(screen.queryByRole('link', { name: /Entrada/ })).not.toBeInTheDocument()
    expect(screen.getByText('CONTEUDO')).toBeInTheDocument()
  })
})

describe('endereços antigos', () => {
  it.each([
    ['/produtos/p1', '/produtos/:id', '/armazem/produto/:id', '/armazem/produto/p1'],
    ['/ferramentas/f1/devolucao', '/ferramentas/:id/devolucao', '/armazem/ferramenta/:id/devolucao', '/armazem/ferramenta/f1/devolucao'],
    ['/ferramentas/emprestimo?ferramenta=f2', '/ferramentas/emprestimo', '/armazem/ferramenta/emprestimo', '/armazem/ferramenta/emprestimo?ferramenta=f2'],
  ])('%s → %s', (url, de, para, esperado) => {
    render(<MemoryRouter initialEntries={[url]}><Onde /><Routes>
      <Route path={de} element={<Redirecionar para={para} />} /><Route path="*" element={<p>OK</p>} />
    </Routes></MemoryRouter>)
    expect(screen.getByTestId('onde')).toHaveTextContent(esperado)
  })
})

describe('fotos do armazém', () => {
  it('caminhos aceites pela política do bucket', () => {
    expect(caminhoFotoArmazem({ tipo: 'produtos', id: 'p1' }, 'image/png', 5).caminho).toBe('produtos/p1/5.png')
    expect(caminhoFotoArmazem({ tipo: 'ferramentas', id: 'f1', prefixo: 'entrega_' }, 'x/y', 7)).toEqual({ caminho: 'ferramentas/f1/entrega_7.jpg', contentType: 'image/jpeg' })
  })

  it('tirar foto envia e devolve o caminho; colar uma imagem também', async () => {
    m.enviar.mockResolvedValue('produtos/p1/1.jpg')
    const onChange = vi.fn()
    render(<FotoInput dono={{ tipo: 'produtos', id: 'p1' }} valor={null} onChange={onChange} />)
    fireEvent.change(screen.getByTestId('foto-camera'), { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('produtos/p1/1.jpg'))
    const zona = screen.getByLabelText(/cole uma imagem/)
    const ficheiro = new File(['x'], 'b.png', { type: 'image/png' })
    const ev = new Event('paste', { bubbles: true }) as Event & { clipboardData: unknown }
    ev.clipboardData = { items: [{ type: 'image/png', getAsFile: () => ficheiro }] }
    zona.dispatchEvent(ev)
    await waitFor(() => expect(m.enviar).toHaveBeenCalledTimes(2))
  })

  it('prova de estado: só câmara (sem ficheiro nem colar)', () => {
    render(<FotoInput dono={{ tipo: 'ferramentas', id: 'f1', prefixo: 'entrega_' }} valor={null} onChange={() => {}} soCamera obrigatoria />)
    expect(screen.getByTestId('foto-camera')).toHaveAttribute('capture', 'environment')
    expect(screen.queryByTestId('foto-ficheiro')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Colar/ })).not.toBeInTheDocument()
  })

  it('erro no envio aparece', async () => {
    m.enviar.mockRejectedValue(new Error('Sem rede'))
    render(<FotoInput dono={{ tipo: 'produtos', id: 'p1' }} valor={null} onChange={() => {}} />)
    fireEvent.change(screen.getByTestId('foto-camera'), { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem rede')
  })
})
