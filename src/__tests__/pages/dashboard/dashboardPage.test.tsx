import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const m = vi.hoisted(() => ({ dados: null as unknown }))

vi.mock('@/app/pages/dashboard/dados', () => ({ carregarDashboard: vi.fn(async () => m.dados) }))
vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ role: 'admin', loading: false }) }))
vi.mock('@/features/alertas', () => ({ AlertasWidget: () => <p>ALERTAS MANUTENCAO</p> }))
vi.mock('@/app/pages/dashboard/ArmazemSecao', () => ({ ArmazemSecao: () => <p>SECAO ARMAZEM</p> }))

import { DashboardPage } from '@/app/pages/DashboardPage'
import { invalidateCache } from '@/app/lib/useAsync'

const ok = <T,>(data: T) => ({ ok: true as const, data })
const falha = { ok: false as const, erro: 'boom' }
const obra = (o: Record<string, unknown>) => ({ obra_id: 'o1', nome: 'Obra Norte', estado: 'ativa', saude: 'ok', orcamento: 100000, custo_total: 120000, motivos: [], ...o })

const base = () => ({
  atualizadoEm: new Date('2026-10-06T10:00:00Z'),
  visao: {
    obras: ok([obra({}), obra({ obra_id: 'o2', nome: 'Obra Sul', custo_total: 10000 })]),
    subs: ok({ totais: { por_pagar: 5000 }, alertas: [], por_sub: [], passivo_documental: { subs_com_pendencia: 0, valor_por_pagar_em_risco: 0 } }),
    frota: ok([]), artigosEmAlerta: ok(0), ferramentasEmAtraso: ok(0),
  },
  decisoes: { contratosPorValidar: ok(0), autosPorValidar: ok(2), pedidosCombustivel: ok(0), faltasPorDecidir: ok(0) },
})

function montar(dados: unknown) {
  m.dados = dados
  return render(<MemoryRouter><DashboardPage /></MemoryRouter>)
}

beforeEach(() => invalidateCache('dashboard-executivo'))
afterEach(cleanup)

describe('DashboardPage (admin)', () => {
  it('mostra decisões, obras em risco e KPIs coerentes com obras_painel', async () => {
    montar(base())
    expect(await screen.findByText('2 autos de medição por validar')).toBeTruthy()
    // obra com custo > orçamento aparece em "Obras em risco" com 120 %
    expect(screen.getByText('Obra Norte')).toBeTruthy()
    expect(screen.getByText('120%')).toBeTruthy()
    expect(screen.getByText('SECAO ARMAZEM')).toBeTruthy()
    expect(screen.getByText('ALERTAS MANUTENCAO')).toBeTruthy()
    expect(screen.queryByText(/Dados incompletos/)).toBeNull()
  })

  it('módulo em falha: aviso visível, KPI com — e restantes blocos mantêm-se', async () => {
    const d = base()
    d.visao.subs = falha as never
    d.decisoes.faltasPorDecidir = falha as never
    montar(d)
    expect(await screen.findByText(/Dados incompletos/)).toBeTruthy()
    expect(screen.getByText(/Subempreitadas, Faltas/)).toBeTruthy()
    expect(screen.getByText('2 autos de medição por validar')).toBeTruthy()
    expect(screen.getByText('Por pagar a subempreiteiros').previousElementSibling?.textContent).toBe('—')
  })

  it('sem pendências nem riscos mostra estados vazios', async () => {
    const d = base()
    d.visao.obras = ok([obra({ custo_total: 1000 })]) as never
    d.decisoes.autosPorValidar = ok(0) as never
    montar(d)
    expect(await screen.findByText('Nada pendente.')).toBeTruthy()
    expect(screen.getByText('Nenhuma obra em risco.')).toBeTruthy()
  })
})
