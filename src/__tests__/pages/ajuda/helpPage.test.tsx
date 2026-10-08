import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, act, cleanup } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('react-router', () => ({
  Link: ({ to, children, className }: { to: string; children: ReactNode; className?: string }) =>
    <a href={to} className={className}>{children}</a>,
  useNavigate: () => vi.fn(),
}))

const estado = vi.hoisted(() => ({ role: 'armazem' as string | null }))
vi.mock('@/features/auth/useRole', () => ({
  useRole: () => ({ role: estado.role, isAdmin: estado.role === 'admin', nome: 'Ana Costa' }),
}))
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: { email: 'ana@x.pt' } }) }))

import { HelpPage } from '@/app/pages/HelpPage'
import { GUIAS_POR_PAPEL } from '@/app/pages/ajuda/conteudo'

const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari'
const UA_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120'

function definirUA(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true })
}
function definirStandalone(sim: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true, writable: true,
    value: (q: string) => ({
      matches: sim && q.includes('standalone'), media: q, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
}

beforeEach(() => {
  estado.role = 'armazem'
  definirUA(UA_WINDOWS)
  definirStandalone(false)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('HelpPage por perfil', () => {
  it('armazém vê o guia do armazém e não vê o seletor de perfil', () => {
    render(<HelpPage />)
    expect(screen.getByRole('heading', { name: GUIAS_POR_PAPEL.armazem[0].titulo })).toBeInTheDocument()
    expect(screen.queryByLabelText('Ver o guia de')).toBeNull()
  })

  it('admin vê o seletor e, ao mudar para motorista, vê o guia do motorista', () => {
    estado.role = 'admin'
    render(<HelpPage />)
    const sel = screen.getByLabelText('Ver o guia de') as HTMLSelectElement
    expect(sel.value).toBe('admin')
    expect(within(sel).getAllByRole('option')).toHaveLength(7)
    expect(screen.getByRole('heading', { name: GUIAS_POR_PAPEL.admin[0].titulo })).toBeInTheDocument()
    fireEvent.change(sel, { target: { value: 'motorista' } })
    expect(screen.getByRole('heading', { name: GUIAS_POR_PAPEL.motorista[0].titulo })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: GUIAS_POR_PAPEL.admin[0].titulo })).toBeNull()
  })

  it('sem papel carregado usa o guia de leitura', () => {
    estado.role = null
    render(<HelpPage />)
    expect(screen.getByRole('heading', { name: GUIAS_POR_PAPEL.leitura[0].titulo })).toBeInTheDocument()
  })

  it('mostra o nome da pessoa', () => {
    render(<HelpPage />)
    expect(screen.getByText(/Olá, Ana/)).toBeInTheDocument()
  })

  it('pesquisa sem acentos filtra as secções e mostra aviso sem resultados', () => {
    render(<HelpPage />)
    const caixa = screen.getByRole('searchbox')
    fireEvent.change(caixa, { target: { value: 'zzzzzz' } })
    expect(screen.getByText(/Nada encontrado/)).toBeInTheDocument()
    fireEvent.change(caixa, { target: { value: 'saida' } })
    expect(screen.queryByText(/Nada encontrado/)).toBeNull()
  })

  it('tem a secção de recuperar o acesso e as perguntas frequentes', () => {
    render(<HelpPage />)
    expect(screen.getByRole('heading', { name: 'Recuperar o acesso' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Perguntas frequentes' })).toBeInTheDocument()
  })

  it('o negrito dos passos sai em <strong> e o texto nunca é HTML', () => {
    const { container } = render(<HelpPage />)
    expect(container.querySelector('li strong')).not.toBeNull()
    expect(container.querySelector('[onerror]')).toBeNull()
  })
})

describe('HelpPage instalação', () => {
  it('no iPhone mostra os passos com Partilhar na plataforma detetada', () => {
    definirUA(UA_IPHONE)
    render(<HelpPage />)
    const detetada = screen.getByRole('region', { name: /iPhone/ })
    expect(within(detetada).getByText(/Partilhar/)).toBeInTheDocument()
  })

  it('no Windows a plataforma detetada é o computador', () => {
    render(<HelpPage />)
    expect(screen.getByRole('region', { name: /computador/i })).toBeInTheDocument()
  })

  it('com a app já instalada diz que está instalada e não mostra passos', () => {
    definirUA(UA_IPHONE)
    definirStandalone(true)
    render(<HelpPage />)
    expect(screen.getByText('A app já está instalada neste aparelho.')).toBeInTheDocument()
    expect(screen.queryByText(/Partilhar/)).toBeNull()
  })

  it('mostra o botão Instalar app quando o navegador o permite', async () => {
    render(<HelpPage />)
    expect(screen.queryByRole('button', { name: 'Instalar app' })).toBeNull()
    const prompt = vi.fn(() => Promise.resolve())
    const ev = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt, userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    })
    act(() => { window.dispatchEvent(ev) })
    const botao = await screen.findByRole('button', { name: 'Instalar app' })
    expect(ev.defaultPrevented).toBe(true)
    fireEvent.click(botao)
    expect(prompt).toHaveBeenCalled()
  })
})

describe('HelpPage cartões', () => {
  it('abre e fecha um cartão de guia', () => {
    render(<HelpPage />)
    const botao = screen.getByRole('button', { name: GUIAS_POR_PAPEL.armazem[1].titulo })
    expect(botao).toHaveAttribute('aria-expanded', 'false')
    const antes = screen.getAllByRole('listitem').length
    fireEvent.click(botao)
    expect(botao).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('listitem')).toHaveLength(antes + GUIAS_POR_PAPEL.armazem[1].passos.length)
    fireEvent.click(botao)
    expect(screen.getAllByRole('listitem')).toHaveLength(antes)
  })

  it('a pontuação a seguir ao negrito não fica separada', () => {
    definirUA(UA_IPHONE)
    render(<HelpPage />)
    const passo = within(screen.getByRole('region', { name: /iPhone/ })).getByText('Adicionar ao ecrã principal').closest('p') as HTMLElement
    expect(passo.textContent).toMatch(/principal\.$/)
  })
})
