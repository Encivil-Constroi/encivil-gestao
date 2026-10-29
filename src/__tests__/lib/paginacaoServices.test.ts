import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// Cliente falso que imita o PostgREST com max_rows = 1000: cada pedido devolve no
// máximo 1000 linhas, sem erro. `.range(de, ate)` escolhe a fatia; `.limit(n)` também corta.
const m = vi.hoisted(() => {
  const dados: Record<string, unknown[]> = {}
  const erros: Record<string, { code: string; message: string } | undefined> = {}
  const chamadas: { origem: string; metodo: string; args: unknown[] }[] = []
  function builder(origem: string) {
    let de = 0
    let ate = Infinity
    const alvo = {} as Record<string, unknown>
    const proxy: unknown = new Proxy(alvo, {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
            const erro = erros[origem]
            const linhas = erro ? null : (dados[origem] ?? []).slice(de, Math.min(ate + 1, de + 1000))
            return Promise.resolve({ data: linhas, error: erro ?? null }).then(ok, ko)
          }
        }
        return (...args: unknown[]) => {
          chamadas.push({ origem, metodo: prop, args })
          if (prop === 'range') { de = args[0] as number; ate = args[1] as number }
          if (prop === 'limit') { ate = de + (args[0] as number) - 1 }
          return proxy
        }
      },
    })
    return proxy
  }
  return { dados, erros, chamadas, builder }
})

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (t: string) => m.builder(t),
    rpc: (fn: string) => m.builder(`rpc:${fn}`),
  },
}))

vi.mock('@/features/obras/services/obrasService', () => ({ listarObras: vi.fn().mockResolvedValue([]), listarPainel: vi.fn() }))
vi.mock('@/features/custos/custosService', () => ({ custosMateriaisCombustivelPorObra: vi.fn().mockResolvedValue({}) }))
vi.mock('@/features/subempreiteiros/services/subempreiteirosService', () => ({
  listarSubempreiteiros: vi.fn().mockResolvedValue([]),
  listarSubempreiteirosComExecutado: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/features/alertas/services/alertasService', () => ({ listarAlertasAtivos: vi.fn().mockResolvedValue([]) }))
vi.mock('@/features/obras/services/subsControloService', () => ({ buscarPainelCeo: vi.fn() }))
vi.mock('@/features/frota/services/frotaService', () => ({ listarResumoViaturas: vi.fn() }))
vi.mock('@/features/ferramentas/services/emprestimosService', () => ({ listarEmprestimos: vi.fn() }))

import { exportarMateriais, exportarCombustivel, exportarAutos, exportarFaturas } from '@/features/contabilidade/contabilidadeService'
import { listarAbastecimentos } from '@/features/combustivel/services/abastecimentosService'
import { listarParaAnalise } from '@/features/combustivel/services/pedidosService'
import { listarArtigosArmazem, exportarMovimentosArmazem, listarMateriaisPorObra } from '@/features/movimentos/services/armazemService'
import { listarMovimentos } from '@/features/movimentos/services/movimentosService'
import { listarProdutos } from '@/features/produtos/services/produtosService'
import { listarAssiduidadeEquipa } from '@/features/horarios/services/assiduidadeService'
import { listarFaltas } from '@/features/horarios/services/faltasService'
import { listarColaboradores } from '@/features/colaboradores/services/colaboradoresService'
import { exportarTabela } from '@/features/backup/backupService'
import { listarSubempreiteiros, listarSubempreiteirosComExecutado } from '@/features/obras/legacy/subempreiteirosService'
import { carregarPessoas } from '@/app/pages/relatorios/dados'
import { useResumoObras } from '@/features/dashboard/hooks/useResumoObras'

const N = 1500
const gerar = (f: (i: number) => Record<string, unknown>) => Array.from({ length: N }, (_, i) => f(i))
const uuid = (i: number) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`

beforeEach(() => {
  for (const k of Object.keys(m.dados)) delete m.dados[k]
  for (const k of Object.keys(m.erros)) delete m.erros[k]
  m.chamadas.length = 0
})

const ordens = (origem: string) => m.chamadas.filter(c => c.origem === origem && c.metodo === 'order').map(c => c.args[0])

describe('sem corte de 1000 linhas (max_rows do PostgREST)', () => {
  it('exportarMateriais devolve as 1500 linhas', async () => {
    m.dados.movimentos_stock = gerar(i => ({ id: uuid(i), created_at: '2026-07-15T08:00:00Z', tipo: 'saida', subtipo: 'OBRA', quantidade: 1, responsavel: 'R', destino_obra: null, produtos: null, obras: null }))
    expect(await exportarMateriais()).toHaveLength(N)
    expect(ordens('movimentos_stock').slice(0, 2)).toEqual(['created_at', 'id'])
  })

  it('exportarCombustivel, exportarAutos e exportarFaturas devolvem as 1500 linhas', async () => {
    m.dados.comb_abastecimentos = gerar(i => ({ id: uuid(i), data: '2026-07-01', litros: 1, custo_total: 1, responsavel: 'R', local: null, observacoes: null, comb_veiculos: null, obras: null }))
    m.dados.autos_medicao = gerar(i => ({ id: uuid(i), numero: i, data_medicao: '2026-07-01', valor_periodo: 1, estado: 'validado', estado_pagamento: 'pago', data_pagamento: null, referencia_pagamento: null, validado_em: null, subempreiteiros: null }))
    m.dados.faturas_fornecedor = gerar(i => ({ id: uuid(i), fornecedor: 'F', data_recepcao: '2026-07-01', estado: 'RECEBIDA', obras: null }))
    expect(await exportarCombustivel()).toHaveLength(N)
    expect(await exportarAutos()).toHaveLength(N)
    expect(await exportarFaturas()).toHaveLength(N)
  })

  it('combustível: listarAbastecimentos e listarParaAnalise devolvem as 1500 linhas', async () => {
    m.dados.comb_abastecimentos = gerar(i => ({ id: uuid(i), data: '2026-07-01', litros: 1, custo_total: 1, created_at: '2026-07-01T00:00:00Z', responsavel: 'R', comb_veiculos: null, obras: null }))
    expect(await listarAbastecimentos()).toHaveLength(N)
    expect(await listarParaAnalise('2026-01-01', '2026-12-31')).toHaveLength(N)
    expect(m.chamadas.some(c => c.metodo === 'limit')).toBe(false)
  })

  it('armazém: artigos, produtos, materiais por obra e exportação de movimentos', async () => {
    m.dados.produtos = gerar(i => ({ id: uuid(i), nome: `A${i}`, codigo: `C${i}`, unidade: 'un', stock_atual: 1, stock_minimo: 0, custo_unitario: 1, foto_path: null, created_at: '2026-01-01', updated_at: '2026-01-01' }))
    m.dados['rpc:armazem_materiais_por_obra'] = gerar(i => ({ obra_id: 'o', obra_nome: 'O', produto_id: uuid(i), enviado: 1, devolvido: 0, liquido: 1, valor: 1, ultimo_movimento: '2026-01-01' }))
    m.dados.movimentos_stock = gerar(i => ({ id: uuid(i), created_at: '2026-07-01T00:00:00Z', tipo: 'saida', quantidade: 1, produtos: null, obras: null }))
    expect(await listarArtigosArmazem()).toHaveLength(N)
    expect(await listarProdutos()).toHaveLength(N)
    expect(await listarMateriaisPorObra()).toHaveLength(N)
    expect(ordens('rpc:armazem_materiais_por_obra').slice(0, 4)).toEqual(['obra_nome', 'obra_id', 'produto_nome', 'produto_id'])
    expect(await exportarMovimentosArmazem()).toHaveLength(N)
    expect(ordens('produtos')).toContain('id')
  })

  it('listarMovimentos sem limite traz tudo; com limite/offset mantém a página pedida', async () => {
    m.dados.movimentos_stock = gerar(i => ({ id: uuid(i), created_at: '2026-07-01T00:00:00Z', tipo: 'saida', quantidade: 1, produtos: null }))
    expect(await listarMovimentos({ dataInicio: new Date('2026-01-01') })).toHaveLength(N)
    expect(await listarMovimentos({ limit: 20 })).toHaveLength(20)
    expect(await listarMovimentos({ limit: 20, offset: 40 })).toHaveLength(20)
  })

  it('RH: assiduidade da equipa, faltas e resumo de pessoas', async () => {
    m.dados.resumo_assiduidade_dia = gerar(i => ({ colaborador_id: uuid(i), data: '2026-07-01', horas_previstas: 8 }))
    m.dados.faltas = gerar(i => ({ id: uuid(i), colaborador_id: 'c', tipo_falta_id: 't', data_inicio: '2026-07-01', data_fim: '2026-07-01', estado: 'INJUSTIFICADA', created_at: '2026-07-01' }))
    m.dados['rpc:colaboradores_contactos'] = []
    expect(await listarAssiduidadeEquipa(2026, 7)).toHaveLength(N)
    expect(await listarFaltas()).toHaveLength(N)
    const p = await carregarPessoas('2026-07-01', '2026-07-31')
    expect(p.diasRegistados).toBe(N)
    expect(p.horasPrevistas).toBe(8 * N)
    expect(p.faltas.injustificadas).toBe(N)
  })

  it('colaboradores: os contactos da RPC chegam para as 1500 fichas', async () => {
    m.dados.colaboradores = gerar(i => ({ id: uuid(i), nome: `N${i}`, numero_mecan: `${i}`, cargo: 'x', obra_id: null, user_id: null, ativo: true, foto_path: null, setor: null, created_at: '2026-01-01', obras: null }))
    m.dados['rpc:colaboradores_contactos'] = gerar(i => ({ id: uuid(i), telemovel: `9${i}`, email: null, notas: null }))
    const lista = await listarColaboradores()
    expect(lista).toHaveLength(N)
    expect(lista[N - 1].telemovel).toBe(`9${N - 1}`)
    expect(ordens('rpc:colaboradores_contactos')).toContain('id')
  })

  it('colaboradores (BD antiga, PGRST202): contactos da tabela também paginados', async () => {
    m.dados.colaboradores = gerar(i => ({ id: uuid(i), nome: `N${i}`, telemovel: `9${i}` }))
    m.erros['rpc:colaboradores_contactos'] = { code: 'PGRST202', message: 'x' }
    const lista = await listarColaboradores()
    expect(lista[N - 1].telemovel).toBe(`9${N - 1}`)
  })

  it('backup: os contactos da RPC chegam para as 1500 fichas', async () => {
    m.dados.colaboradores = gerar(i => ({ id: uuid(i), nome: `N${i}` }))
    m.dados['rpc:colaboradores_contactos'] = gerar(i => ({ id: uuid(i), telemovel: `9${i}` }))
    const r = await exportarTabela('colaboradores') as { telemovel?: string }[]
    expect(r).toHaveLength(N)
    expect(r[N - 1].telemovel).toBe(`9${N - 1}`)
  })

  it('subempreiteiros: lista e executado sem corte', async () => {
    m.dados.subempreiteiros = gerar(i => ({ id: uuid(i), obra_id: 'o', nome: `S${i}`, tipo: 'global', valor_global: 1, percentagem_retencao: 0, estado: 'validado', ativo: true, created_at: '2026-01-01', updated_at: '2026-01-01', validado_em: null }))
    m.dados.autos_medicao = gerar(i => ({ subempreiteiro_id: uuid(i), valor_periodo: 10, valor_glosado: 0, estado: 'validado' }))
    expect(await listarSubempreiteiros()).toHaveLength(N)
    const comExec = await listarSubempreiteirosComExecutado()
    expect(comExec[N - 1].executed).toBe(10)
  })

  it('dashboard: autos por validar contam todos os autos', async () => {
    m.dados.autos_medicao = gerar(i => ({ id: uuid(i), valor_periodo: 1, valor_glosado: 0, estado: 'rascunho' }))
    const { result } = renderHook(() => useResumoObras())
    await waitFor(() => expect(result.current.resumo).toBeTruthy())
    expect(result.current.resumo?.autosPorValidar).toBe(N)
  })
})

describe('exportarMateriais inclui devoluções de obra', () => {
  it('saída de 100 e devolução de 40 a 5 € → custo líquido 300, devolução negativa', async () => {
    const produtos = { nome: 'Cimento', codigo: 'P1', unidade: 'saco', custo_unitario: 5 }
    m.dados.movimentos_stock = [
      { id: uuid(1), created_at: '2026-07-01T08:00:00Z', tipo: 'saida', subtipo: 'OBRA', quantidade: 100, responsavel: 'R', destino_obra: null, produtos, obras: { nome: 'O' } },
      { id: uuid(2), created_at: '2026-07-02T08:00:00Z', tipo: 'entrada', subtipo: 'DEVOLUCAO_OBRA', quantidade: 40, responsavel: 'R', destino_obra: null, produtos, obras: { nome: 'O' } },
    ]
    const linhas = await exportarMateriais()
    expect(m.chamadas).toContainEqual({ origem: 'movimentos_stock', metodo: 'or', args: ['tipo.eq.saida,subtipo.eq.DEVOLUCAO_OBRA'] })
    expect(linhas.map(l => l['Tipo'])).toEqual(['Saída', 'Devolução'])
    expect(linhas[1]['Quantidade']).toBe(-40)
    expect(linhas[1]['Custo Total (€)']).toBe(-200)
    expect(linhas.reduce((s, l) => s + Number(l['Custo Total (€)']), 0)).toBe(300)
  })
})
