import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const m = vi.hoisted(() => ({ dados: null as unknown, linhas: [] as unknown[] }))

vi.mock('@/app/pages/dashboard/dados', () => ({ carregarDashboard: vi.fn(async () => m.dados) }))
vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ role: 'admin', loading: false }) }))
vi.mock('@/features/alertas', () => ({ AlertasWidget: () => null }))
vi.mock('@/app/pages/dashboard/ArmazemSecao', () => ({ ArmazemSecao: () => null }))
vi.mock('@/app/pages/auditoria/dados', () => ({
  PAGE_SIZE: 50,
  limitesPeriodo: () => ({}),
  listarAuditoria: vi.fn(async () => ({ rows: m.linhas, total: m.linhas.length })),
  exportarAuditoria: vi.fn(async () => []),
  listarPerfisNomes: vi.fn(async () => [{ id: 'a', nome: 'Ana' }]),
}))
vi.mock('@/app/pages/auditoria/EventosSegurancaPainel', () => ({ EventosSegurancaPainel: () => <p>PAINEL SEGURANCA</p> }))

import { DashboardPage } from '@/app/pages/DashboardPage'
import { AuditoriaPage } from '@/app/pages/AuditoriaPage'
import { Secao } from '@/app/pages/inicio/widgets/ui'
import { invalidateCache } from '@/app/lib/useAsync'
import { Building2 } from 'lucide-react'

const ok = <T,>(data: T) => ({ ok: true as const, data })
const dadosBase = () => ({
  atualizadoEm: new Date('2026-11-02T10:00:00Z'),
  visao: {
    obras: ok([]),
    subs: ok({ totais: { por_pagar: 0 }, alertas: [], por_sub: [], passivo_documental: { subs_com_pendencia: 0, valor_por_pagar_em_risco: 0 } }),
    frota: ok([]), artigosEmAlerta: ok(0), ferramentasEmAtraso: ok(0),
  },
  decisoes: { contratosPorValidar: ok(0), autosPorValidar: ok(0), pedidosCombustivel: ok(0), faltasPorDecidir: ok(0) },
})

beforeEach(() => { invalidateCache('dashboard-executivo') })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Lote D — Dashboard', () => {
  it('data por extenso começa por maiúscula, sem depender de CSS capitalize', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-02T12:00:00Z') })
    m.dados = dadosBase()
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    const data = await screen.findByText(/Segunda-feira, 2 de novembro de 2026/)
    expect(data.className).not.toContain('capitalize')
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy()
  })

  it('ações rápidas só têm duas famílias: principal e contorno (sem fundos verde/vermelho cheios)', async () => {
    m.dados = dadosBase()
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    const saida = await screen.findByRole('link', { name: /Registar saída/i })
    const entrada = screen.getByRole('link', { name: /Registar entrada/i })
    for (const l of [saida, entrada]) {
      expect(l.className).not.toMatch(/bg-(success|destructive)(?![/\w-])/)
    }
    expect(saida.className).toContain('border')
  })
})

describe('Lote D — widgets/ui', () => {
  it('link da secção tem alvo táctil (min-h-10)', () => {
    render(<MemoryRouter><Secao titulo="Obras" icone={Building2} para="/obras">x</Secao></MemoryRouter>)
    expect(screen.getByRole('link', { name: /Abrir/ }).className).toContain('min-h-10')
  })
})

describe('Lote D — Auditoria', () => {
  const linha = (action: string) => ({ id: action, action, actor_id: 'a', created_at: '2026-11-02T10:00:00Z', target_id: null, details: { nome: { antes: 'A', depois: 'B' } } })

  it('título vem antes dos separadores e estes são chips com aria-pressed', async () => {
    m.linhas = [linha('produtos.update')]
    render(<AuditoriaPage />)
    const h1 = await screen.findByRole('heading', { level: 1, name: /Auditoria/ })
    const grupo = screen.getByRole('group', { name: 'Vista' })
    expect(h1.compareDocumentPosition(grupo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(grupo).getByRole('button', { name: 'Registos' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(grupo).getByRole('button', { name: 'Eventos de segurança' }))
    expect(screen.getByText('PAINEL SEGURANCA')).toBeTruthy()
  })

  it('registo de severidade média não mostra o rótulo "Normal"', async () => {
    m.linhas = [linha('produtos.update')]
    render(<AuditoriaPage />)
    await screen.findByText("Ver detalhes")
    expect(screen.queryByText('Normal')).toBeNull()
  })

  it('registo sensível mantém o rótulo "Sensível"', async () => {
    m.linhas = [linha('profiles.delete')]
    render(<AuditoriaPage />)
    expect(await screen.findByText('Sensível')).toBeTruthy()
  })
})
