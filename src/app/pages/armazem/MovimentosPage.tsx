import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ChevronLeft, ChevronRight, Download, ArrowLeftRight, X, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { SubtipoMovimento } from '@/app/lib/armazemDb'
import type { MovementType } from '@/app/types'
import { getUnitLabel } from '@/app/data/mockData'
import { exportarXlsx } from '@/app/lib/exportXlsx'
import { fmtEuro, fmtNumber } from '@/app/lib/format'
import { EmptyState } from '@/app/components/EmptyState'
import { SkeletonList } from '@/app/components/Skeletons'
import { useObras } from '@/features/obras/hooks/useObras'
import { useArtigosArmazem, useMovimentosArmazem } from '@/features/movimentos/hooks/useArmazem'
import { exportarMovimentosArmazem, POR_PAGINA, type FiltrosMovArmazem, type MovimentoArmazem } from '@/features/movimentos/services/armazemService'
import { rotuloMovimento, SUBTIPOS_ENTRADA, SUBTIPOS_SAIDA } from '@/features/movimentos/armazemRegras'
import { visualMovimento } from '@/features/movimentos/components/movimentoVisual'
import { MiniFoto } from '@/features/movimentos/components/MiniFoto'

type Periodo = 'todos' | 'hoje' | 'semana' | 'mes'

function desdeDoPeriodo(p: Periodo, agora = new Date()): string | undefined {
  if (p === 'todos') return undefined
  const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  if (p === 'semana') d.setDate(d.getDate() - 6)
  if (p === 'mes') d.setDate(1)
  return d.toISOString()
}

const fmtDia = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const fmtHora = new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit' })

function chaveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function agruparPorDia(movs: MovimentoArmazem[]): { dia: string; data: Date; itens: MovimentoArmazem[] }[] {
  const grupos = new Map<string, { dia: string; data: Date; itens: MovimentoArmazem[] }>()
  for (const m of movs) {
    const k = chaveDia(m.data)
    const g = grupos.get(k) ?? { dia: k, data: m.data, itens: [] }
    g.itens.push(m)
    grupos.set(k, g)
  }
  return [...grupos.values()]
}

const sel = 'px-3 py-2.5 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm w-full'
const lbl = 'block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5'

function detalhe(m: MovimentoArmazem): string[] {
  const partes: string[] = []
  if (m.obraNome) partes.push(m.obraNome)
  else if (m.destino && m.subtipo !== 'VENDA') partes.push(m.destino)
  if (m.fornecedor) partes.push(`Fornecedor ${m.fornecedor}`)
  if (m.cliente) partes.push(`Cliente ${m.cliente}`)
  if (m.numeroFatura) partes.push(`Fatura ${m.numeroFatura}`)
  if (m.precoUnitario != null) partes.push(`${fmtEuro(m.precoUnitario)}/un.`)
  return partes
}

export function MovimentosPage() {
  const [params] = useSearchParams()
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [tipo, setTipo] = useState<'' | MovementType>('')
  const [subtipo, setSubtipo] = useState<'' | SubtipoMovimento>('')
  const [obraId, setObraId] = useState('')
  const [produtoId, setProdutoId] = useState(params.get('produto') ?? '')
  const [pesquisa, setPesquisa] = useState('')
  const [pagina, setPagina] = useState(0)
  const [aExportar, setAExportar] = useState(false)

  const { obras } = useObras(true)
  const { artigos } = useArtigosArmazem()

  const filtros = useMemo((): FiltrosMovArmazem => ({
    desde: desdeDoPeriodo(periodo),
    tipo: tipo || undefined,
    subtipo: subtipo || undefined,
    obraId: obraId || undefined,
    produtoId: produtoId || undefined,
    pesquisa: pesquisa.trim() || undefined,
  }), [periodo, tipo, subtipo, obraId, produtoId, pesquisa])

  const { movimentos, total, loading, error } = useMovimentosArmazem(filtros, pagina)
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const dias = useMemo(() => agruparPorDia(movimentos), [movimentos])
  const comFiltros = periodo !== 'mes' || !!(tipo || subtipo || obraId || produtoId || pesquisa.trim())

  const mudar = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPagina(0) }

  const subtiposVisiveis = tipo === 'entrada' ? SUBTIPOS_ENTRADA : tipo === 'saida' ? SUBTIPOS_SAIDA : [...SUBTIPOS_ENTRADA, ...SUBTIPOS_SAIDA]

  async function exportar() {
    setAExportar(true)
    try {
      const todos = await exportarMovimentosArmazem(filtros)
      await exportarXlsx(todos.map(m => ({
        Data: m.data.toLocaleDateString('pt-PT'),
        Hora: fmtHora.format(m.data),
        Artigo: m.produtoNome,
        Código: m.produtoCodigo,
        Tipo: rotuloMovimento(m.tipo, m.subtipo),
        Quantidade: m.quantidade,
        Unidade: m.unidade,
        'Stock antes': m.stockAntes,
        'Stock depois': m.stockDepois,
        Obra: m.obraNome ?? '',
        Fornecedor: m.fornecedor ?? '',
        Cliente: m.cliente ?? '',
        'N.º fatura': m.numeroFatura ?? '',
        'Preço unitário': m.precoUnitario ?? '',
        Responsável: m.responsavel,
        Observações: m.observacoes ?? '',
      })), 'movimentos_armazem', 'Movimentos')
      toast.success(`${todos.length} movimento${todos.length !== 1 ? 's' : ''} exportado${todos.length !== 1 ? 's' : ''}`)
    } catch {
      toast.error('Erro ao exportar')
    } finally {
      setAExportar(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {loading ? 'A carregar…' : total > 0 ? `${total} movimento${total !== 1 ? 's' : ''}${paginas > 1 ? ` · página ${pagina + 1} de ${paginas}` : ''}` : 'Nenhum movimento'}
        </p>
        <button type="button" onClick={exportar} disabled={aExportar || loading || total === 0}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
          <Download className="w-4 h-4" aria-hidden="true" />{aExportar ? 'A exportar…' : 'Excel'}
        </button>
      </div>

      <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <input type="search" value={pesquisa} onChange={e => mudar(setPesquisa)(e.target.value)} aria-label="Pesquisar movimentos"
            placeholder="Fornecedor, cliente, fatura, responsável…" className={`${sel} pl-9`} />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div><label className={lbl} htmlFor="f-periodo">Período</label>
            <select id="f-periodo" value={periodo} onChange={e => mudar(setPeriodo)(e.target.value as Periodo)} className={sel}>
              <option value="todos">Tudo</option><option value="hoje">Hoje</option><option value="semana">Últimos 7 dias</option><option value="mes">Este mês</option>
            </select></div>
          <div><label className={lbl} htmlFor="f-tipo">Tipo</label>
            <select id="f-tipo" value={tipo} onChange={e => { mudar(setTipo)(e.target.value as '' | MovementType); setSubtipo('') }} className={sel}>
              <option value="">Entradas e saídas</option><option value="entrada">Entradas</option><option value="saida">Saídas</option><option value="ajuste">Contagens</option>
            </select></div>
          <div><label className={lbl} htmlFor="f-subtipo">Subtipo</label>
            <select id="f-subtipo" value={subtipo} onChange={e => mudar(setSubtipo)(e.target.value as '' | SubtipoMovimento)} className={sel}>
              <option value="">Todos</option>
              {subtiposVisiveis.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
            </select></div>
          <div><label className={lbl} htmlFor="f-obra">Obra</label>
            <select id="f-obra" value={obraId} onChange={e => mudar(setObraId)(e.target.value)} className={sel}>
              <option value="">Todas</option>{obras.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select></div>
          <div className="col-span-2 lg:col-span-1"><label className={lbl} htmlFor="f-artigo">Artigo</label>
            <select id="f-artigo" value={produtoId} onChange={e => mudar(setProdutoId)(e.target.value)} className={sel}>
              <option value="">Todos</option>{artigos.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select></div>
        </div>
        {comFiltros && (
          <button type="button" onClick={() => { setPeriodo('mes'); setTipo(''); setSubtipo(''); setObraId(''); setProdutoId(''); setPesquisa(''); setPagina(0) }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" aria-hidden="true" />Limpar filtros
          </button>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {loading && movimentos.length === 0 ? <SkeletonList rows={6} cols={3} />
        : !loading && movimentos.length === 0 && !error ? (
          <EmptyState icon={ArrowLeftRight} title="Sem movimentos" description={comFiltros ? 'Nenhum movimento corresponde aos filtros escolhidos.' : 'Ainda não há movimentos neste período.'} />
        ) : (
          <div className="space-y-5">
            {dias.map(g => (
              <section key={g.dia} aria-label={fmtDia.format(g.data)}>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 capitalize">{fmtDia.format(g.data)}</h3>
                <ul className="bg-card rounded-2xl border border-border divide-y divide-border overflow-hidden">
                  {g.itens.map(m => {
                    const v = visualMovimento(m.tipo, m.subtipo)
                    const sinal = m.tipo === 'entrada' ? '+' : m.tipo === 'saida' ? '−' : ''
                    const extras = detalhe(m)
                    return (
                      <li key={m.id} data-testid="movimento" className="flex items-start gap-3 p-3">
                        <MiniFoto caminho={m.fotoPath} alt="" />
                        <div className="flex-1 min-w-0">
                          <Link to={`/armazem/produto/${m.produtoId}`} className="font-medium text-sm hover:underline block truncate">{m.produtoNome}</Link>
                          <p className="mt-0.5 flex items-center gap-1.5 text-xs">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-semibold ${v.fundo} ${v.cor}`}>
                              <v.Icone className="w-3 h-3" aria-hidden="true" />{rotuloMovimento(m.tipo, m.subtipo)}
                            </span>
                            <span className="text-muted-foreground">{fmtHora.format(m.data)} · {m.responsavel}</span>
                          </p>
                          {extras.length > 0 && <p className="text-xs text-muted-foreground mt-1 truncate">{extras.join(' · ')}</p>}
                          {m.observacoes && <p className="text-xs text-muted-foreground mt-0.5 italic truncate">{m.observacoes}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`font-bold tabular-nums ${v.cor}`}>{sinal}{fmtNumber(m.quantidade)} <span className="text-xs font-medium">{getUnitLabel(m.unidade)}</span></p>
                          <p className="text-xs text-muted-foreground tabular-nums">{fmtNumber(m.stockAntes)} → {fmtNumber(m.stockDepois)}</p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}

            {paginas > 1 && (
              <nav className="flex items-center justify-center gap-3" aria-label="Páginas">
                <button type="button" onClick={() => setPagina(p => Math.max(0, p - 1))} disabled={pagina === 0} aria-label="Página anterior" className="p-2 rounded-lg border border-border hover:bg-accent disabled:opacity-40"><ChevronLeft className="w-4 h-4" aria-hidden="true" /></button>
                <span className="text-sm text-muted-foreground">{pagina + 1} / {paginas}</span>
                <button type="button" onClick={() => setPagina(p => Math.min(paginas - 1, p + 1))} disabled={pagina >= paginas - 1} aria-label="Página seguinte" className="p-2 rounded-lg border border-border hover:bg-accent disabled:opacity-40"><ChevronRight className="w-4 h-4" aria-hidden="true" /></button>
              </nav>
            )}
          </div>
        )}
    </div>
  )
}
