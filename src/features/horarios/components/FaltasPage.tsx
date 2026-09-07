import { useState, useMemo } from 'react'
import { CalendarX, Plus, Check, X, ChevronDown, Download } from 'lucide-react'
import { toast } from 'sonner'
import { useFaltas, useRegistarFalta, useAtualizarEstadoFalta, useTiposFalta } from '../hooks/useHorarios'
import { useColaboradores } from '@/features/colaboradores/hooks/useColaboradores'
import { exportarCsv } from '@/app/lib/exportCsv'
import type { Falta, FaltaEstado, FaltaPeriodo } from '@/app/types'
import type { NovaFalta } from '../services/horariosService'

const ESTADO_LABEL: Record<FaltaEstado, string> = {
  COMUNICADA:       'Comunicada',
  COM_COMPROVATIVO: 'Com comprovativo',
  JUSTIFICADA:      'Justificada',
  INJUSTIFICADA:    'Injustificada',
}

const ESTADO_CLS: Record<FaltaEstado, string> = {
  COMUNICADA:       'bg-muted text-muted-foreground',
  COM_COMPROVATIVO: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  JUSTIFICADA:      'bg-success/10 text-success',
  INJUSTIFICADA:    'bg-destructive/10 text-destructive',
}

const PERIODO_OPTS: { value: FaltaPeriodo; label: string }[] = [
  { value: 'DIA',   label: 'Dia inteiro' },
  { value: 'MANHA', label: 'Manhã' },
  { value: 'TARDE', label: 'Tarde' },
  { value: 'HORAS', label: 'Horas parciais' },
]

const inputCls = 'w-full px-3 py-2.5 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm'
const labelCls = 'block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5'

const FORM_VAZIO: NovaFalta = {
  colaboradorId: '',
  dataInicio: new Date().toISOString().split('T')[0],
  dataFim: new Date().toISOString().split('T')[0],
  periodo: 'DIA',
  tipoFaltaId: '',
  justificacaoTexto: '',
  dadoSaude: false,
  previsivel: false,
}

type FilterEstado = FaltaEstado | 'todos'

export function FaltasPage() {
  const [filterColabId, setFilterColabId] = useState('')
  const [filterEstado,  setFilterEstado]  = useState<FilterEstado>('todos')
  const [showNovo,      setShowNovo]      = useState(false)
  const [form,          setForm]          = useState<NovaFalta>(FORM_VAZIO)

  const filtros = useMemo(() => ({
    colaboradorId: filterColabId || undefined,
    estado:        filterEstado !== 'todos' ? filterEstado as FaltaEstado : undefined,
  }), [filterColabId, filterEstado])

  const { faltas, loading, reload }          = useFaltas(filtros)
  const { tiposFalta }                       = useTiposFalta()
  const { colaboradores }                    = useColaboradores()
  const { registar, loading: registando }    = useRegistarFalta()
  const { atualizar, loading: atualizando }  = useAtualizarEstadoFalta()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.colaboradorId) { toast.error('Selecione um colaborador.'); return }
    if (!form.dataInicio || !form.dataFim) { toast.error('Indique as datas.'); return }
    if (form.dataFim < form.dataInicio) { toast.error('A data de fim não pode ser anterior ao início.'); return }

    const result = await registar({ ...form, periodo: form.periodo || undefined, tipoFaltaId: form.tipoFaltaId || undefined })
    if (result) {
      toast.success('Falta registada.')
      setForm(FORM_VAZIO)
      setShowNovo(false)
      reload()
    }
  }

  async function handleEstado(falta: Falta, estado: FaltaEstado) {
    const result = await atualizar(falta.id, estado)
    if (result) {
      toast.success(`Falta marcada como ${ESTADO_LABEL[estado].toLowerCase()}.`)
      reload()
    }
  }

  function handleExport() {
    if (faltas.length === 0) return
    exportarCsv(
      faltas.map(f => ({
        'Colaborador':  f.colaboradorNome ?? '',
        'Data início':  f.dataInicio,
        'Data fim':     f.dataFim,
        'Período':      f.periodo ?? 'Dia inteiro',
        'Tipo':         f.tipoFaltaDesignacao ?? '',
        'Estado':       ESTADO_LABEL[f.estado],
        'Justificação': f.justificacaoTexto ?? '',
        'Dado saúde':   f.dadoSaude ? 'Sim' : 'Não',
        'Previsível':   f.previsivel ? 'Sim' : 'Não',
        'Prazo prova':  f.prazoProvaAte ?? '',
        'Comunicada em': f.comunicadaEm.toLocaleDateString('pt-PT'),
      })),
      'faltas',
    )
  }

  const selectCls = 'px-3 py-2 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm'

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold flex items-center gap-2">
            <CalendarX className="w-6 h-6 text-primary" />
            Faltas
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? 'A carregar…' : `${faltas.length} registo${faltas.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={faltas.length === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-xl hover:bg-accent transition-colors disabled:opacity-40"
            title="Exportar CSV"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Excel</span>
          </button>
          <button
            onClick={() => setShowNovo(v => !v)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors"
          >
            {showNovo ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showNovo ? 'Cancelar' : 'Registar falta'}
          </button>
        </div>
      </div>

      {/* Formulário novo */}
      {showNovo && (
        <div className="bg-card rounded-2xl border border-border p-5">
          <h2 className="font-semibold mb-4">Registar nova falta</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelCls}>Colaborador *</label>
                <select
                  className={inputCls}
                  value={form.colaboradorId}
                  onChange={e => setForm(f => ({ ...f, colaboradorId: e.target.value }))}
                  required
                >
                  <option value="">Selecionar colaborador…</option>
                  {colaboradores.map(c => (
                    <option key={c.id} value={c.id}>{c.nome} ({c.numeroMecan})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Data início *</label>
                <input
                  type="date"
                  className={inputCls}
                  value={form.dataInicio}
                  onChange={e => setForm(f => ({ ...f, dataInicio: e.target.value, dataFim: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className={labelCls}>Data fim *</label>
                <input
                  type="date"
                  className={inputCls}
                  value={form.dataFim}
                  min={form.dataInicio}
                  onChange={e => setForm(f => ({ ...f, dataFim: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className={labelCls}>Período</label>
                <select
                  className={inputCls}
                  value={form.periodo ?? ''}
                  onChange={e => setForm(f => ({ ...f, periodo: e.target.value as FaltaPeriodo }))}
                >
                  {PERIODO_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Tipo de falta</label>
                <select
                  className={inputCls}
                  value={form.tipoFaltaId ?? ''}
                  onChange={e => setForm(f => ({ ...f, tipoFaltaId: e.target.value }))}
                >
                  <option value="">Não especificado</option>
                  {tiposFalta.map(t => <option key={t.id} value={t.id}>{t.designacao}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Justificação / observações</label>
                <textarea
                  className={inputCls}
                  rows={2}
                  value={form.justificacaoTexto ?? ''}
                  onChange={e => setForm(f => ({ ...f, justificacaoTexto: e.target.value }))}
                  placeholder="Motivo, referência de documento…"
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.previsivel}
                    onChange={e => setForm(f => ({ ...f, previsivel: e.target.checked }))}
                    className="rounded"
                  />
                  Falta previsível
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.dadoSaude}
                    onChange={e => setForm(f => ({ ...f, dadoSaude: e.target.checked }))}
                    className="rounded"
                  />
                  Dado de saúde (RGPD)
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={registando}
                className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {registando ? 'A registar…' : 'Registar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className={labelCls}>Colaborador</label>
            <select
              className={selectCls + ' w-full'}
              value={filterColabId}
              onChange={e => setFilterColabId(e.target.value)}
            >
              <option value="">Todos</option>
              {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Estado</label>
            <select
              className={selectCls}
              value={filterEstado}
              onChange={e => setFilterEstado(e.target.value as FilterEstado)}
            >
              <option value="todos">Todos</option>
              {(Object.keys(ESTADO_LABEL) as FaltaEstado[]).map(e => (
                <option key={e} value={e}>{ESTADO_LABEL[e]}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {loading ? (
          <div className="divide-y divide-border">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <div className="skeleton h-3 w-24" />
                <div className="skeleton h-3 w-32" />
                <div className="skeleton h-5 w-20 ml-auto" />
              </div>
            ))}
          </div>
        ) : faltas.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            <CalendarX className="w-10 h-10 mx-auto mb-3 opacity-30" />
            Nenhuma falta registada.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {faltas.map(falta => (
              <FaltaRow
                key={falta.id}
                falta={falta}
                onEstado={handleEstado}
                atualizando={atualizando}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function FaltaRow({
  falta,
  onEstado,
  atualizando,
}: {
  falta: Falta
  onEstado: (f: Falta, e: FaltaEstado) => void
  atualizando: boolean
}) {
  const [open, setOpen] = useState(false)

  const diasCount = Math.max(
    1,
    Math.round((new Date(falta.dataFim).getTime() - new Date(falta.dataInicio).getTime()) / 86_400_000) + 1,
  )

  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{falta.colaboradorNome ?? '—'}</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold ${ESTADO_CLS[falta.estado]}`}>
              {ESTADO_LABEL[falta.estado]}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {falta.dataInicio === falta.dataFim
              ? new Date(falta.dataInicio + 'T12:00').toLocaleDateString('pt-PT')
              : `${new Date(falta.dataInicio + 'T12:00').toLocaleDateString('pt-PT')} – ${new Date(falta.dataFim + 'T12:00').toLocaleDateString('pt-PT')}`}
            {' '}&nbsp;·&nbsp; {diasCount} dia{diasCount !== 1 ? 's' : ''}
            {falta.tipoFaltaDesignacao && ` · ${falta.tipoFaltaDesignacao}`}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Acções rápidas para estados pendentes */}
          {falta.estado === 'COMUNICADA' && (
            <>
              <button
                onClick={() => onEstado(falta, 'JUSTIFICADA')}
                disabled={atualizando}
                className="p-1.5 hover:bg-success/10 text-muted-foreground hover:text-success rounded-lg transition-colors"
                title="Marcar como justificada"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => onEstado(falta, 'INJUSTIFICADA')}
                disabled={atualizando}
                className="p-1.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-lg transition-colors"
                title="Marcar como injustificada"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            onClick={() => setOpen(v => !v)}
            className="p-1.5 hover:bg-accent text-muted-foreground rounded-lg transition-colors"
            title="Detalhes"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {open && (
        <div className="px-4 pb-3 border-t border-border bg-muted/30 pt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          {falta.periodo && (
            <div>
              <p className="text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">Período</p>
              <p>{PERIODO_OPTS_MAP[falta.periodo] ?? falta.periodo}</p>
            </div>
          )}
          {falta.prazoProvaAte && (
            <div>
              <p className="text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">Prazo de prova</p>
              <p>{new Date(falta.prazoProvaAte + 'T12:00').toLocaleDateString('pt-PT')}</p>
            </div>
          )}
          {falta.justificacaoTexto && (
            <div className="sm:col-span-2">
              <p className="text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">Justificação</p>
              <p>{falta.justificacaoTexto}</p>
            </div>
          )}
          {falta.dadoSaude && (
            <div>
              <p className="text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">RGPD</p>
              <p>Dado de saúde</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">Registada em</p>
            <p>{falta.comunicadaEm.toLocaleDateString('pt-PT')}</p>
          </div>
          {/* Acções de estado completas */}
          {falta.estado !== 'JUSTIFICADA' && falta.estado !== 'INJUSTIFICADA' && (
            <div className="sm:col-span-3 flex gap-2 pt-1">
              <button
                onClick={() => onEstado(falta, 'JUSTIFICADA')}
                disabled={atualizando}
                className="px-3 py-1.5 bg-success/10 text-success rounded-lg text-xs font-medium hover:bg-success/20 transition-colors disabled:opacity-50"
              >
                Justificada
              </button>
              <button
                onClick={() => onEstado(falta, 'INJUSTIFICADA')}
                disabled={atualizando}
                className="px-3 py-1.5 bg-destructive/10 text-destructive rounded-lg text-xs font-medium hover:bg-destructive/20 transition-colors disabled:opacity-50"
              >
                Injustificada
              </button>
              {falta.estado === 'COMUNICADA' && (
                <button
                  onClick={() => onEstado(falta, 'COM_COMPROVATIVO')}
                  disabled={atualizando}
                  className="px-3 py-1.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg text-xs font-medium hover:bg-blue-200 transition-colors disabled:opacity-50"
                >
                  Com comprovativo
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const PERIODO_OPTS_MAP: Record<FaltaPeriodo, string> = {
  DIA:   'Dia inteiro',
  MANHA: 'Manhã',
  TARDE: 'Tarde',
  HORAS: 'Horas parciais',
}
