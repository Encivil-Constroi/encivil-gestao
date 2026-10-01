import { describe, it, expect, vi, beforeEach } from 'vitest'

const chamadas = vi.hoisted(() => ({ rpc: [] as { fn: string; args: Record<string, unknown> }[], resposta: null as unknown }))

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown> = {}) => {
      chamadas.rpc.push({ fn, args })
      return Promise.resolve({ data: chamadas.resposta, error: null })
    },
  },
}))

import type { DadosEntrega } from '@/features/frota/db'
import { entregarViatura, devolverViatura, listarEntregas } from '@/features/frota/services/entregasService'

// Assinaturas reais, lidas das migrations (a última definição de cada função ganha)
const ficheiros = import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const sql = Object.keys(ficheiros).sort().map(f => ficheiros[f]).join('\n')

function parametros(fn: string): string[] {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\s*\\(([^)]*)\\)`, 'g')
  let ultimo: string | null = null
  for (const m of sql.matchAll(re)) ultimo = m[1]
  if (ultimo == null) throw new Error(`função ${fn} não existe nas migrations`)
  return ultimo.split(',').map(p => p.trim()).filter(Boolean).map(p => p.split(/\s+/)[0])
}

const dados: DadosEntrega = {
  combustivel: 'CHEIO', adblue: 'OK', oleo: 'OK', refrigeracao: 'OK', pneus: 'OK', limpeza: 'OK',
  inventario: { colete: true }, danos: [{ vista: 'frente', x: 0.5, y: 0.5 }],
}

beforeEach(() => { chamadas.rpc = []; chamadas.resposta = 'id-1' })

describe('RPCs da entrega: nomes dos parâmetros iguais aos do SQL', () => {
  it('entregar_viatura', async () => {
    await entregarViatura({ ...dados, veiculoId: 'v', colaboradorId: 'c', obraId: null, data: '2026-10-01', km: 10, observacoes: null })
    expect(chamadas.rpc[0].fn).toBe('entregar_viatura')
    expect(Object.keys(chamadas.rpc[0].args).sort()).toEqual(parametros('entregar_viatura').sort())
  })

  it('devolver_viatura', async () => {
    await devolverViatura({ ...dados, veiculoId: 'v', data: '2026-10-01', km: 10, observacoes: null, paraOficina: true })
    expect(chamadas.rpc[0].fn).toBe('devolver_viatura')
    expect(Object.keys(chamadas.rpc[0].args).sort()).toEqual(parametros('devolver_viatura').sort())
    expect(chamadas.rpc[0].args.p_para_oficina).toBe(true)
  })

  it('frota_listar_entregas converte o km para número', async () => {
    chamadas.resposta = [{ id: 'e1', km: '1500.5' }]
    const r = await listarEntregas('v1')
    expect(chamadas.rpc[0].fn).toBe('frota_listar_entregas')
    expect(Object.keys(chamadas.rpc[0].args).sort()).toEqual(parametros('frota_listar_entregas').sort())
    expect(r[0].km).toBe(1500.5)
  })
})
