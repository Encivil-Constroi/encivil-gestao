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

import * as svc from '@/features/frota/services/manutencaoService'
import { registarManutencao } from '@/features/frota/services/frotaService'

// Assinaturas reais, lidas das migrations (a última definição de cada função ganha)
const ficheiros = import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const sql = Object.keys(ficheiros).sort().map(f => ficheiros[f]).join('\n')

function parametros(fn: string): string[] {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\s*\\(([^)]*)\\)`, 'g')
  let ultimo: string | null = null
  for (const m of sql.matchAll(re)) ultimo = m[1]
  if (ultimo == null) throw new Error(`função ${fn} não existe nas migrations (${Object.keys(ficheiros).length} ficheiros)`)
  return ultimo.split(',').map(p => p.trim()).filter(Boolean).map(p => p.split(/\s+/)[0])
}

beforeEach(() => { chamadas.rpc = []; chamadas.resposta = null })

describe('RPCs da manutenção: nomes dos parâmetros iguais aos do SQL', () => {
  const casos: [string, () => Promise<unknown>, string][] = [
    ['registarManutencao', () => registarManutencao({
      veiculoId: 'v', itemId: 'i', descricao: null, data: '2026-09-10', km: 1, custo: 1, oficina: null, observacoes: null,
      atualizaProxima: true, proximaData: null,
    }), 'registar_manutencao'],
    ['editarManutencao', () => svc.editarManutencao({
      id: 'm', itemId: 'i', descricao: null, data: '2026-09-10', km: 1, custo: 1, oficina: null, observacoes: null,
    }), 'editar_manutencao'],
    ['listarHistorico', () => svc.listarHistorico({ veiculoId: 'v', desde: '2026-01-01', ate: '2026-12-31' }), 'frota_historico_manutencoes'],
    ['definirEstadoViatura', () => svc.definirEstadoViatura('v', 'OFICINA'), 'definir_estado_viatura'],
  ]

  it.each(casos)('%s → %s', async (_n, chamar, fn) => {
    await chamar()
    expect(chamadas.rpc).toHaveLength(1)
    expect(chamadas.rpc[0].fn).toBe(fn)
    expect(Object.keys(chamadas.rpc[0].args).sort()).toEqual(parametros(fn).sort())
  })
})
