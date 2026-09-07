import { useState, useEffect, useCallback } from 'react'
import { FileBarChart, Share2, Printer, TrendingDown, TrendingUp, Fuel, Wrench, AlertTriangle, RefreshCw, Download } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { fmtEuro, fmtNumber } from '../lib/format'
import { exportarCsv } from '../lib/exportCsv'

type Dados = {
  semanaLabel:   string
  entradas:      number
  saidas:        number
  abastecimentos: number
  totalLitros:   number
  totalCombust:  number
  ferramAtrasadas: number
  stockCritico:  number
  stockBaixo:    number
}

function semanaAtual(): { inicio: Date; fim: Date } {
  const hoje  = new Date()
  const diaSemana = hoje.getDay() === 0 ? 6 : hoje.getDay() - 1
  const inicio = new Date(hoje)
  inicio.setDate(hoje.getDate() - diaSemana)
  inicio.setHours(0, 0, 0, 0)
  const fim = new Date(inicio)
  fim.setDate(inicio.getDate() + 6)
  fim.setHours(23, 59, 59, 999)
  return { inicio, fim }
}

function semanaAnterior(): { inicio: Date; fim: Date } {
  const { inicio } = semanaAtual()
  const fim2 = new Date(inicio)
  fim2.setDate(inicio.getDate() - 1)
  fim2.setHours(23, 59, 59, 999)
  const inicio2 = new Date(fim2)
  inicio2.setDate(fim2.getDate() - 6)
  inicio2.setHours(0, 0, 0, 0)
  return { inicio: inicio2, fim: fim2 }
}

function fmtSemana(inicio: Date, fim: Date) {
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit' }
  return `${inicio.toLocaleDateString('pt-PT', opts)} – ${fim.toLocaleDateString('pt-PT', opts)}`
}

type SemanaKey = 'atual' | 'anterior'

export function RelatorioSemanalPage() {
  const [dados,    setDados]    = useState<Dados | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [semana,   setSemana]   = useState<SemanaKey>('atual')

  const carregar = useCallback(async (key: SemanaKey) => {
    setLoading(true)
    setError('')

    const { inicio, fim } = key === 'atual' ? semanaAtual() : semanaAnterior()
    const isoInicio = inicio.toISOString().split('T')[0]
    const isoFim    = fim.toISOString().split('T')[0]

    const today = new Date().toISOString().split('T')[0]

    const [movRes, combRes, atrasoRes, stockRes] = await Promise.all([
      supabase
        .from('movimentos_stock')
        .select('tipo')
        .gte('created_at', inicio.toISOString())
        .lte('created_at', fim.toISOString()),
      supabase
        .from('comb_abastecimentos')
        .select('litros, custo_total')
        .gte('data', isoInicio)
        .lte('data', isoFim),
      supabase
        .from('emprestimos_ferramentas')
        .select('id')
        .eq('estado', 'ativo')
        .not('data_prevista_devolucao', 'is', null)
        .lt('data_prevista_devolucao', today),
      supabase
        .from('produtos')
        .select('stock_atual, stock_minimo')
        .eq('ativo', true),
    ])

    if (movRes.error || combRes.error || atrasoRes.error || stockRes.error) {
      setError('Erro ao carregar dados. Verifique a ligação.')
      setLoading(false)
      return
    }

    type MovRow   = { tipo: string }
    type CombRow  = { litros: number; custo_total: number }
    type StockRow = { stock_atual: number; stock_minimo: number }

    const movs   = (movRes.data  ?? []) as unknown as MovRow[]
    const combs  = (combRes.data ?? []) as unknown as CombRow[]
    const stocks = (stockRes.data ?? []) as unknown as StockRow[]

    const entradas  = movs.filter(m => m.tipo === 'entrada').length
    const saidas    = movs.filter(m => m.tipo === 'saida').length
    const litros    = combs.reduce((s, c) => s + Number(c.litros),     0)
    const custo     = combs.reduce((s, c) => s + Number(c.custo_total), 0)
    const critico   = stocks.filter(p => p.stock_atual <= 0).length
    const baixo     = stocks.filter(p => p.stock_atual > 0 && p.stock_atual <= p.stock_minimo).length

    setDados({
      semanaLabel:    fmtSemana(inicio, fim),
      entradas,
      saidas,
      abastecimentos: combs.length,
      totalLitros:    litros,
      totalCombust:   custo,
      ferramAtrasadas: (atrasoRes.data ?? []).length,
      stockCritico:   critico,
      stockBaixo:     baixo,
    })
    setLoading(false)
  }, [])

  useEffect(() => { void carregar(semana) }, [semana, carregar])

  const exportarCSV = () => {
    if (!dados) return
    exportarCsv([{
      'Semana':                  dados.semanaLabel,
      'Entradas armazém':        dados.entradas,
      'Saídas armazém':          dados.saidas,
      'Abastecimentos':          dados.abastecimentos,
      'Total litros':            dados.totalLitros,
      'Custo combustível (€)':   dados.totalCombust,
      'Ferramentas em atraso':   dados.ferramAtrasadas,
      'Produtos sem stock':      dados.stockCritico,
      'Produtos stock baixo':    dados.stockBaixo,
    }], 'relatorio_semanal')
  }

  const partilharWhatsApp = () => {
    if (!dados) return
    const txt = [
      `🏗️ *ENCIVIL — Relatório Semanal*`,
      `📅 Semana: ${dados.semanaLabel}`,
      ``,
      `📦 *Armazém*`,
      `• ${dados.entradas} entrada${dados.entradas !== 1 ? 's' : ''} · ${dados.saidas} saída${dados.saidas !== 1 ? 's' : ''}`,
      ``,
      `⛽ *Combustível*`,
      `• ${dados.abastecimentos} abastecimento${dados.abastecimentos !== 1 ? 's' : ''} · ${fmtNumber(dados.totalLitros)} L · ${fmtEuro(dados.totalCombust)}`,
      ``,
      `🔧 *Ferramentas em atraso*`,
      `• ${dados.ferramAtrasadas} ferramenta${dados.ferramAtrasadas !== 1 ? 's' : ''} por devolver`,
      ``,
      `⚠️ *Stock*`,
      `• ${dados.stockCritico} sem stock · ${dados.stockBaixo} stock baixo`,
    ].join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank')
  }

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Relatório Semanal</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Resumo operacional para partilha com os responsáveis</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void carregar(semana)}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
            title="Actualizar"
          >
            <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
          </button>
          {dados && (
            <>
              <button
                onClick={exportarCSV}
                className="flex items-center gap-2 px-4 py-2.5 bg-accent text-foreground rounded-xl font-medium hover:bg-accent/80 active:scale-[0.98] transition-all text-sm"
                title="Exportar CSV"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">CSV</span>
              </button>
              <button
                onClick={partilharWhatsApp}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#25D366] text-white rounded-xl font-medium hover:bg-[#20BD5C] active:scale-[0.98] transition-all text-sm"
              >
                <Share2 className="w-4 h-4" />
                WhatsApp
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2.5 bg-accent text-foreground rounded-xl font-medium hover:bg-accent/80 active:scale-[0.98] transition-all text-sm"
              >
                <Printer className="w-4 h-4" />
                <span className="hidden sm:inline">Imprimir</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Seletor de semana */}
      <div className="flex gap-2">
        {(['atual', 'anterior'] as const).map(k => (
          <button
            key={k}
            onClick={() => setSemana(k)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              semana === k ? 'bg-primary text-primary-foreground' : 'bg-accent text-muted-foreground hover:text-foreground'
            }`}
          >
            {k === 'atual' ? 'Esta semana' : 'Semana anterior'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-card rounded-2xl border border-border p-4 space-y-2">
              <div className="skeleton h-3 w-20" />
              <div className="skeleton h-8 w-14" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      ) : dados ? (
        <>
          <p className="text-sm text-muted-foreground -mt-1">Semana de {dados.semanaLabel}</p>

          {/* KPIs Armazém */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <FileBarChart className="w-4 h-4" /> Armazém
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card rounded-2xl border border-border p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground">Entradas</p>
                  <TrendingDown className="w-4 h-4 text-success" />
                </div>
                <p className="text-3xl font-bold text-success">{dados.entradas}</p>
              </div>
              <div className="bg-card rounded-2xl border border-border p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground">Saídas</p>
                  <TrendingUp className="w-4 h-4 text-warning" />
                </div>
                <p className="text-3xl font-bold text-warning">{dados.saidas}</p>
              </div>
            </div>
          </section>

          {/* KPIs Combustível */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Fuel className="w-4 h-4" /> Combustível
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-card rounded-2xl border border-border p-4">
                <p className="text-xs text-muted-foreground mb-1">Abastecimentos</p>
                <p className="text-2xl font-bold">{dados.abastecimentos}</p>
              </div>
              <div className="bg-card rounded-2xl border border-border p-4">
                <p className="text-xs text-muted-foreground mb-1">Total litros</p>
                <p className="text-2xl font-bold">{fmtNumber(dados.totalLitros)}</p>
                <p className="text-xs text-muted-foreground">L</p>
              </div>
              <div className="bg-card rounded-2xl border border-border p-4">
                <p className="text-xs text-muted-foreground mb-1">Custo total</p>
                <p className="text-xl font-bold">{fmtEuro(dados.totalCombust)}</p>
              </div>
            </div>
          </section>

          {/* Alertas */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Alertas
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <div className={`bg-card rounded-2xl border p-4 ${dados.ferramAtrasadas > 0 ? 'border-destructive/40 bg-destructive/5' : 'border-border'}`}>
                <div className="flex items-center gap-1 mb-1">
                  <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Ferramentas em atraso</p>
                </div>
                <p className={`text-2xl font-bold ${dados.ferramAtrasadas > 0 ? 'text-destructive' : 'text-foreground'}`}>
                  {dados.ferramAtrasadas}
                </p>
              </div>
              <div className={`bg-card rounded-2xl border p-4 ${dados.stockCritico > 0 ? 'border-destructive/40 bg-destructive/5' : 'border-border'}`}>
                <p className="text-xs text-muted-foreground mb-1">Sem stock</p>
                <p className={`text-2xl font-bold ${dados.stockCritico > 0 ? 'text-destructive' : 'text-foreground'}`}>
                  {dados.stockCritico}
                </p>
              </div>
              <div className={`bg-card rounded-2xl border p-4 ${dados.stockBaixo > 0 ? 'border-warning/40 bg-warning/5' : 'border-border'}`}>
                <p className="text-xs text-muted-foreground mb-1">Stock baixo</p>
                <p className={`text-2xl font-bold ${dados.stockBaixo > 0 ? 'text-warning' : 'text-foreground'}`}>
                  {dados.stockBaixo}
                </p>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
