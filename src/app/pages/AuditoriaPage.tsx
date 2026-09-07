import { useState, useMemo } from 'react'
import { Shield, ChevronLeft, ChevronRight, Download, ChevronDown, ChevronRight as Expand } from 'lucide-react'
import { useAsync } from '../lib/useAsync'
import { exportarCsv } from '../lib/exportCsv'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'

const PAGE_SIZE = 50

type LogRow = {
  id: string
  action: string
  actor_id: string | null
  created_at: string
  details: Record<string, unknown> | null
  target_id: string | null
}

type Profile = { id: string; nome: string; email: string }

type PeriodFilter = 'todos' | 'hoje' | 'semana' | 'mes'

const PERIOD_OPTS: { value: PeriodFilter; label: string }[] = [
  { value: 'todos',  label: 'Todos' },
  { value: 'hoje',   label: 'Hoje' },
  { value: 'semana', label: 'Esta semana' },
  { value: 'mes',    label: 'Este mês' },
]

function labelAction(action: string): string {
  if (action.startsWith('delete_'))  return `Eliminação (${action.slice(7)})`
  switch (action) {
    case 'role_change':              return 'Alteração de papel'
    case 'validar_subempreiteiro':   return 'Validação subempreiteiro'
    case 'validar_auto':             return 'Validação auto'
    default: return action
  }
}

function severidadeAction(action: string): 'high' | 'medium' | 'low' {
  if (action === 'role_change' || action.startsWith('delete_')) return 'high'
  if (action.startsWith('validar_')) return 'medium'
  return 'low'
}

const SEV_CLS: Record<'high' | 'medium' | 'low', string> = {
  high:   'bg-destructive/10 text-destructive border-destructive/30',
  medium: 'bg-warning/10 text-warning border-warning/30',
  low:    'bg-muted text-muted-foreground border-transparent',
}

function periodStart(period: PeriodFilter): string | null {
  if (period === 'hoje') {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString()
  }
  if (period === 'semana') {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString()
  }
  if (period === 'mes') {
    const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString()
  }
  return null
}

export function AuditoriaPage() {
  const [page,         setPage]         = useState(0)
  const [period,       setPeriod]       = useState<PeriodFilter>('todos')
  const [actionFilter, setActionFilter] = useState('')
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set())
  const [exporting,    setExporting]    = useState(false)

  const { data: profiles } = useAsync(
    async () => {
      const { data } = await supabase.from('profiles').select('id, nome, email')
      return (data ?? []) as Profile[]
    },
    [],
  )

  const profileMap = useMemo(() => {
    const m = new Map<string, Profile>()
    profiles?.forEach(p => m.set(p.id, p))
    return m
  }, [profiles])

  const deps = [page, period, actionFilter] as const

  const { data: result, loading } = useAsync(
    async () => {
      const from = page * PAGE_SIZE
      const to   = from + PAGE_SIZE - 1

      let query = supabase
        .from('audit_log')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to)

      const start = periodStart(period)
      if (start) query = query.gte('created_at', start)
      if (actionFilter.trim()) query = query.ilike('action', `%${actionFilter.trim()}%`)

      const { data, count, error } = await query
      if (error) throw error
      return { rows: (data ?? []) as LogRow[], count: count ?? 0 }
    },
    deps,
    { errorMsg: 'Erro ao carregar auditoria' },
  )

  const rows      = result?.rows ?? []
  const totalCount = result?.count ?? 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const hasFilter = period !== 'todos' || actionFilter.trim() !== ''

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handleExport() {
    setExporting(true)
    try {
      let query = supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })

      const start = periodStart(period)
      if (start) query = query.gte('created_at', start)
      if (actionFilter.trim()) query = query.ilike('action', `%${actionFilter.trim()}%`)

      const { data, error } = await query
      if (error) throw error

      type RawRow = { action: string; actor_id: string | null; created_at: string; details: unknown; id: string; target_id: string | null }
      const csvRows = (data ?? []).map((r: RawRow) => ({
        'Data/Hora':  new Date(r.created_at).toLocaleString('pt-PT'),
        'Acção':      labelAction(r.action),
        'Código':     r.action,
        'Utilizador': r.actor_id ? (profileMap.get(r.actor_id)?.nome ?? r.actor_id.slice(0, 8)) : '—',
        'Email':      r.actor_id ? (profileMap.get(r.actor_id)?.email ?? '') : '',
        'Alvo (ID)':  r.target_id ?? '',
        'Detalhes':   r.details ? JSON.stringify(r.details as Record<string, unknown>) : '',
      }))
      exportarCsv(csvRows, 'auditoria')
      toast.success(`${csvRows.length} entradas exportadas`)
    } catch {
      toast.error('Erro ao exportar')
    } finally {
      setExporting(false)
    }
  }

  const selectCls = 'px-3 py-2 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm'
  const inputCls  = 'px-3 py-2 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm w-full'

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 flex-wrap no-print">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            Auditoria
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading
              ? 'A carregar…'
              : `${totalCount} registo${totalCount !== 1 ? 's' : ''}${totalPages > 1 ? ` · página ${page + 1} de ${totalPages}` : ''}`
            }
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || loading || totalCount === 0}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border border-border hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          <Download className="w-4 h-4" />
          {exporting ? 'A exportar…' : 'Excel'}
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-card rounded-2xl border border-border p-4 no-print">
        <div className="flex flex-col sm:flex-row gap-3">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Período</label>
            <select
              value={period}
              onChange={e => { setPeriod(e.target.value as PeriodFilter); setPage(0) }}
              className={selectCls}
            >
              {PERIOD_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Acção</label>
            <input
              type="text"
              placeholder="Filtrar por tipo de acção…"
              value={actionFilter}
              onChange={e => { setActionFilter(e.target.value); setPage(0) }}
              className={inputCls}
            />
          </div>
          {hasFilter && (
            <div className="flex items-end">
              <button
                onClick={() => { setPeriod('todos'); setActionFilter(''); setPage(0) }}
                className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-xl hover:bg-accent transition-colors"
              >
                Limpar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {loading ? (
          <div className="space-y-0">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-border last:border-0">
                <div className="skeleton h-3 w-28" />
                <div className="skeleton h-5 w-40" />
                <div className="skeleton h-3 w-24 ml-auto" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
            Nenhum registo de auditoria{hasFilter ? ' para os filtros seleccionados' : ''}.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map(row => {
              const sev    = severidadeAction(row.action)
              const actor  = row.actor_id ? profileMap.get(row.actor_id) : null
              const hasDetails = !!row.details && Object.keys(row.details).length > 0
              const isOpen = expanded.has(row.id)

              return (
                <div key={row.id}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    {/* Severidade + acção */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-lg border text-xs font-semibold ${SEV_CLS[sev]}`}>
                          {labelAction(row.action)}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">{row.action}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span>
                          {new Date(row.created_at).toLocaleString('pt-PT', {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                        {actor ? (
                          <span className="font-medium text-foreground">{actor.nome}</span>
                        ) : row.actor_id ? (
                          <span className="font-mono">{row.actor_id.slice(0, 8)}…</span>
                        ) : (
                          <span>Sistema</span>
                        )}
                        {row.target_id && (
                          <span className="font-mono opacity-60">{row.target_id.slice(0, 8)}…</span>
                        )}
                      </div>
                    </div>

                    {/* Expandir detalhes */}
                    {hasDetails && (
                      <button
                        onClick={() => toggleExpand(row.id)}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors shrink-0"
                        title={isOpen ? 'Fechar detalhes' : 'Ver detalhes'}
                      >
                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
                      </button>
                    )}
                  </div>

                  {/* Detalhes expandidos */}
                  {isOpen && hasDetails && (
                    <div className="px-4 pb-3">
                      <pre className="text-xs bg-muted rounded-xl p-3 overflow-x-auto font-mono text-muted-foreground">
                        {JSON.stringify(row.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-border flex items-center justify-between gap-3 no-print">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl border border-border hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </button>
            <span className="text-sm text-muted-foreground">
              Página <span className="font-semibold text-foreground">{page + 1}</span> de {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1 || loading}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl border border-border hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Seguinte
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
