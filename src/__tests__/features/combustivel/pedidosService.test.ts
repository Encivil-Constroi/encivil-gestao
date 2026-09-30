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

import * as svc from '@/features/combustivel/services/pedidosService'

// Assinaturas reais, lidas das migrations (a última definição de cada função ganha)
const ficheiros = import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const sql = Object.keys(ficheiros).sort().map(f => ficheiros[f]).join('\n')

function parametros(fn: string): string[] {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\s*\\(([^)]*)\\)`, 'g')
  let ultimo: string | null = null
  for (const m of sql.matchAll(re)) ultimo = m[1]
  if (ultimo == null) throw new Error(`função ${fn} não existe nas migrations (${Object.keys(ficheiros).length} ficheiros)`)
  return ultimo.split(',').map(p => p.trim()).filter(Boolean)
    .filter(p => !/^OUT\s/i.test(p))
    .map(p => p.split(/\s+/)[0])
}

beforeEach(() => { chamadas.rpc = []; chamadas.resposta = null })

describe('RPCs do abastecimento: nomes dos parâmetros iguais aos do SQL', () => {
  const casos: [string, () => Promise<unknown>, string][] = [
    ['criarPedido', () => svc.criarPedido({ id: 'p', veiculoId: 'v', tipoFonte: 'POLO2', tipoCombustivel: 'gasoleo', km: 1, fotoKmPath: 'f', observacoes: null }), 'criar_pedido_abastecimento'],
    ['autorizarPedido', () => svc.autorizarPedido('p'), 'autorizar_abastecimento'],
    ['recusarPedido', () => svc.recusarPedido('p', 'm'), 'rejeitar_abastecimento'],
    ['aprovarRegistoAntigo', () => svc.aprovarRegistoAntigo('p'), 'aprovar_abastecimento_pendente'],
    ['cancelarPedido', () => svc.cancelarPedido('p'), 'cancelar_pedido_abastecimento'],
    ['registarContadorInicial', () => svc.registarContadorInicial('p', 1, 'f', 'IA'), 'registar_contador_inicial'],
    ['ligarBomba', () => svc.ligarBomba('p'), 'ligar_bomba'],
    ['concluirPedido', () => svc.concluirPedido('p', { leituraFinal: 1, litros: null, custo: null, fotoPath: 'f', origem: 'IA' }), 'concluir_pedido_abastecimento'],
    ['definirPreco', () => svc.definirPreco('gasoleo', 1.5), 'definir_preco_combustivel'],
    ['definirAprovador', () => svc.definirAprovador('u', true), 'definir_aprovador_combustivel'],
    ['fetchPodeAprovar', () => svc.fetchPodeAprovar(), 'pode_aprovar_combustivel'],
    ['fetchContexto', () => svc.fetchContexto(), 'meu_contexto_abastecimento'],
  ]

  it.each(casos)('%s → %s', async (_n, chamar, fn) => {
    await chamar()
    expect(chamadas.rpc).toHaveLength(1)
    expect(chamadas.rpc[0].fn).toBe(fn)
    expect(Object.keys(chamadas.rpc[0].args).sort()).toEqual(parametros(fn).sort())
  })
})

describe('respostas', () => {
  it('pode aprovar só com true explícito', async () => {
    chamadas.resposta = true
    expect(await svc.fetchPodeAprovar()).toBe(true)
    chamadas.resposta = null
    expect(await svc.fetchPodeAprovar()).toBe(false)
  })

  it('contexto: primeira linha, km como número', async () => {
    chamadas.resposta = [{ nome: 'Zé', km_atual: '9500', pedido_aberto_id: null }]
    expect(await svc.fetchContexto()).toMatchObject({ nome: 'Zé', km_atual: 9500 })
    chamadas.resposta = []
    expect(await svc.fetchContexto()).toBeNull()
  })
})
