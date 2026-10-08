import { useState, useMemo, Fragment } from 'react'
import { Shield, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { useAsync } from '../lib/useAsync'
import { exportarXlsx } from '../lib/exportXlsx'
import { toast } from 'sonner'
import { EventosSegurancaPainel } from './auditoria/EventosSegurancaPainel'
import {
  PAGE_SIZE, listarAuditoria, exportarAuditoria, listarPerfisNomes, limitesPeriodo,
  type FiltrosAuditoria,
} from './auditoria/dados'
import {
  TABELAS_FILTRO, OPERACAO_LABEL, labelAction, labelTabela, severidadeAction, camposAlterados,
  descreverRegisto, nomeDoAlvo, dataLisboa, somarDias, separarAction, type LogRow,
} from '../lib/auditoria/descrever'

export { labelAction, severidadeAction }

function moduloDe(action: string): string {
  const tabela = separarAction(action)?.tabela ?? (action.startsWith('delete_') ? action.slice(7) : null)
  return tabela ? labelTabela(tabela) : '—'
}

type PeriodFilter = 'todos' | 'hoje' | 'semana' | 'mes' | 'datas'

const PERIOD_OPTS: { value: PeriodFilter; label: string }[] = [
  { value: 'todos',  label: 'Todos' },
  { value: 'hoje',   label: 'Hoje' },
  { value: 'semana', label: 'Últimos 7 dias' },
  { value: 'mes',    label: 'Últimos 30 dias' },
  { value: 'datas',  label: 'Entre datas' },
]

const SEV_CLS: Record<'high' | 'medium' | 'low', string> = {
  high:   'bg-destructive/10 text-destructive border-destructive/30',
  medium: 'bg-warning/10 text-warning border-warning/30',
  low:    'bg-muted text-muted-foreground border-transparent',
}

const SEV_LABEL: Record<'high' | 'medium' | 'low', string> = { high: 'Sensível', medium: 'Normal', low: 'Informação' }

const FMT_HORA = new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' })
const FMT_DATA_HORA = new Intl.DateTimeFormat('pt-PT', {
  timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
})
const FMT_DIA = new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

function tituloDia(chave: string, hoje: string): string {
  if (chave === hoje) return 'Hoje'
  if (chave === somarDias(hoje, -1)) return 'Ontem'
  return FMT_DIA.format(new Date(`${chave}T12:00:00Z`))
}

function linhaCampos(r: LogRow): string {
  return camposAlterados(r.action, r.details).map(c => `${c.rotulo}: ${c.antes} → ${c.depois}`).join('; ')
}

type Separador = 'registos' | 'seguranca'

export function AuditoriaPage() {
  const [separador, setSeparador] = useState<Separador>('registos')
  const tabCls = (ativo: boolean) => `px-4 py-2 text-sm font-medium rounded-xl transition-colors ${ativo ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Auditoria" className="flex gap-2 no-print">
        <button type="button" role="tab" aria-selected={separador === 'registos'} className={tabCls(separador === 'registos')} onClick={() => setSeparador('registos')}>Registos</button>
        <button type="button" role="tab" aria-selected={separador === 'seguranca'} className={tabCls(separador === 'seguranca')} onClick={() => setSeparador('seguranca')}>Eventos de segurança</button>
      </div>
      {separador === 'registos' ? <RegistosAuditoria /> : <EventosSegurancaPainel />}
    </div>
  )
}

function RegistosAuditoria() {
  const [page,      setPage]      = useState(0)
  const [period,    setPeriod]    = useState<PeriodFilter>('todos')
  const [dataDesde, setDataDesde] = useState('')
  const [dataAte,   setDataAte]   = useState('')
  const [atorId,    setAtorId]    = useState('')
  const [tabela,    setTabela]    = useState('')
  const [operacao,  setOperacao]  = useState('')
  const [expanded,  setExpanded]  = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)

  const { data: profiles } = useAsync(() => listarPerfisNomes(), [])

  const nomes = useMemo(() => {
    const m = new Map<string, string>()
    profiles?.forEach(p => m.set(p.id, p.nome))
    return m
  }, [profiles])

  const filtros: FiltrosAuditoria = useMemo(() => {
    const f: FiltrosAuditoria = {}
    if (atorId) f.atorId = atorId
    if (tabela) f.tabela = tabela
    if (operacao === 'insert' || operacao === 'update' || operacao === 'delete') f.operacao = operacao
    if (period === 'datas') {
      if (dataDesde) f.desde = dataDesde
      if (dataAte) f.ate = dataAte
    } else if (period !== 'todos') {
      const l = limitesPeriodo(period)
      if (l.desde) f.desde = l.desde
    }
    return f
  }, [atorId, tabela, operacao, period, dataDesde, dataAte])

  const { data: result, loading } = useAsync(
    () => listarAuditoria(filtros, page),
    [filtros, page],
    { errorMsg: 'Erro ao carregar auditoria' },
  )

  const rows       = useMemo(() => result?.rows ?? [], [result?.rows])
  const totalCount = result?.total ?? 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const hasFilter  = period !== 'todos' || atorId !== '' || tabela !== '' || operacao !== ''

  const nomeAtor = (r: LogRow) => r.actor_id ? (nomes.get(r.actor_id) ?? `${r.actor_id.slice(0, 8)}…`) : 'Sistema'

  const grupos = useMemo(() => {
    const m = new Map<string, LogRow[]>()
    for (const r of rows) {
      const k = dataLisboa(new Date(r.created_at))
      const l = m.get(k)
      if (l) l.push(r); else m.set(k, [r])
    }
    return [...m.entries()]
  }, [rows])
  const hoje = dataLisboa(new Date())

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function limpar() {
    setPeriod('todos'); setDataDesde(''); setDataAte(''); setAtorId(''); setTabela(''); setOperacao(''); setPage(0)
  }

  async function handleExport() {
    setExporting(true)
    try {
      const todas = await exportarAuditoria(filtros)
      const linhas = todas.map(r => ({
        'Data/Hora':         FMT_DATA_HORA.format(new Date(r.created_at)),
        'Utilizador':        nomeAtor(r),
        'Ação':              descreverRegisto(r, nomeAtor(r), nomeDoAlvo(r, nomes)),
        'Módulo':            moduloDe(r.action),
        'Campos alterados':  linhaCampos(r),
      }))
      await exportarXlsx(linhas, 'auditoria', 'Auditoria')
      toast.success(`${linhas.length} entradas exportadas`)
    } catch {
      toast.error('Erro ao exportar')
    } finally {
      setExporting(false)
    }
  }

  const selectCls = 'px-3 py-2 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring text-sm'
  const labelCls  = 'block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5'

  return (
    <div className="space-y-4">
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

      <div className="bg-card rounded-2xl border border-border p-4 no-print">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label htmlFor="aud-pessoa" className={labelCls}>Pessoa</label>
            <select id="aud-pessoa" value={atorId} onChange={e => { setAtorId(e.target.value); setPage(0) }} className={`${selectCls} w-full`}>
              <option value="">Todas as pessoas</option>
              {(profiles ?? []).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="aud-modulo" className={labelCls}>Módulo</label>
            <select id="aud-modulo" value={tabela} onChange={e => { setTabela(e.target.value); setPage(0) }} className={`${selectCls} w-full`}>
              <option value="">Todas</option>
              {TABELAS_FILTRO.map(t => <option key={t} value={t}>{labelTabela(t)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="aud-tipo" className={labelCls}>Tipo</label>
            <select id="aud-tipo" value={operacao} onChange={e => { setOperacao(e.target.value); setPage(0) }} className={`${selectCls} w-full`}>
              <option value="">Todos</option>
              {Object.entries(OPERACAO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="aud-periodo" className={labelCls}>Período</label>
            <select id="aud-periodo" value={period} onChange={e => { setPeriod(e.target.value as PeriodFilter); setPage(0) }} className={`${selectCls} w-full`}>
              {PERIOD_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        {(period === 'datas' || hasFilter) && (
          <div className="flex flex-wrap items-end gap-3 mt-3">
            {period === 'datas' && (
              <>
                <div>
                  <label htmlFor="aud-desde" className={labelCls}>De</label>
                  <input id="aud-desde" type="date" value={dataDesde} onChange={e => { setDataDesde(e.target.value); setPage(0) }} className={selectCls} />
                </div>
                <div>
                  <label htmlFor="aud-ate" className={labelCls}>Até</label>
                  <input id="aud-ate" type="date" value={dataAte} onChange={e => { setDataAte(e.target.value); setPage(0) }} className={selectCls} />
                </div>
              </>
            )}
            {hasFilter && (
              <button onClick={limpar} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-xl hover:bg-accent transition-colors">
                Limpar
              </button>
            )}
          </div>
        )}
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {loading ? (
          <div>
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
            Nenhum registo de auditoria{hasFilter ? ' para os filtros selecionados' : ''}.
          </div>
        ) : (
          <div>
            {grupos.map(([dia, lista]) => (
              <Fragment key={dia}>
                <h2 className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground bg-muted/50 border-b border-border first-letter:uppercase">
                  {tituloDia(dia, hoje)}
                </h2>
                <div className="divide-y divide-border">
                  {lista.map(row => {
                    const sev    = severidadeAction(row.action)
                    const campos = camposAlterados(row.action, row.details)
                    const isOpen = expanded.has(row.id)
                    const frase  = descreverRegisto(row, nomeAtor(row), nomeDoAlvo(row, nomes))
                    return (
                      <div key={row.id} className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          <span className="text-xs text-muted-foreground tabular-nums pt-0.5 shrink-0">
                            {FMT_HORA.format(new Date(row.created_at))}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground break-words">{frase}</p>
                            <span className={`inline-flex items-center mt-1 px-2 py-0.5 rounded-lg border text-xs font-semibold ${SEV_CLS[sev]}`}>
                              {SEV_LABEL[sev]}
                            </span>
                          </div>
                          {campos.length > 0 && (
                            <button
                              onClick={() => toggleExpand(row.id)}
                              aria-expanded={isOpen}
                              className="px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg border border-border transition-colors shrink-0"
                            >
                              {isOpen ? 'Fechar detalhes' : 'Ver detalhes'}
                            </button>
                          )}
                        </div>
                        {isOpen && campos.length > 0 && (
                          <div className="mt-3 overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-muted-foreground">
                                  <th className="py-1 pr-3 font-semibold">Campo</th>
                                  <th className="py-1 pr-3 font-semibold">Antes</th>
                                  <th className="py-1 font-semibold">Depois</th>
                                </tr>
                              </thead>
                              <tbody>
                                {campos.map(c => (
                                  <tr key={c.campo} className="border-t border-border">
                                    <td className="py-1 pr-3 font-medium">{c.rotulo}</td>
                                    <td className="py-1 pr-3 text-muted-foreground break-words">{c.antes}</td>
                                    <td className="py-1 break-words">{c.depois}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </Fragment>
            ))}
          </div>
        )}

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
