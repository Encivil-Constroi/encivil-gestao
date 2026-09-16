import { useState } from 'react'
import { FileX, Plus, Filter, CheckCircle2, XCircle, Clock, Paperclip } from 'lucide-react'
import { useColaboradores } from '@/features/colaboradores/hooks/useColaboradores'
import { useFaltas, useTiposFalta, useRegistarFalta, useAtualizarEstadoFalta } from '../hooks/useFaltas'
import type { EstadoFalta } from '../services/faltasService'
import type { NovaFalta } from '../services/faltasService'

const ESTADO_CONFIG: Record<EstadoFalta, { label: string; cls: string }> = {
  COMUNICADA:       { label: 'Comunicada',       cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  COM_COMPROVATIVO: { label: 'Com comprovativo', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  JUSTIFICADA:      { label: 'Justificada',      cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  INJUSTIFICADA:    { label: 'Injustificada',    cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
}

function EstadoBadge({ estado }: { estado: EstadoFalta }) {
  const { label, cls } = ESTADO_CONFIG[estado]
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
}

function NovaFaltaForm({
  colaboradores, tipos, onRegistar, onCancelar, loading,
}: {
  colaboradores: { id: string; nome: string }[]
  tipos: { id: string; designacao: string }[]
  onRegistar: (v: NovaFalta) => Promise<void>
  onCancelar: () => void
  loading: boolean
}) {
  const hoje = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState<NovaFalta>({
    colaboradorId: '',
    dataInicio: hoje,
    dataFim: hoje,
    periodo: 'DIA',
    tipoFaltaId: '',
    dadoSaude: false,
    previsivel: false,
  })

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium block mb-1">Colaborador *</label>
        <select className="w-full border border-input rounded-lg px-3 py-2 bg-background text-sm"
          value={form.colaboradorId}
          onChange={e => setForm(f => ({ ...f, colaboradorId: e.target.value }))}>
          <option value="">Selecionar…</option>
          {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium block mb-1">Data início *</label>
          <input type="date" className="w-full border border-input rounded-lg px-3 py-2 bg-background text-sm"
            value={form.dataInicio}
            onChange={e => setForm(f => ({ ...f, dataInicio: e.target.value, dataFim: e.target.value }))} />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Data fim *</label>
          <input type="date" className="w-full border border-input rounded-lg px-3 py-2 bg-background text-sm"
            value={form.dataFim} min={form.dataInicio}
            onChange={e => setForm(f => ({ ...f, dataFim: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium block mb-1">Período</label>
          <select className="w-full border border-input rounded-lg px-3 py-2 bg-background text-sm"
            value={form.periodo ?? 'DIA'}
            onChange={e => setForm(f => ({ ...f, periodo: e.target.value as typeof form.periodo }))}>
            <option value="DIA">Dia completo</option>
            <option value="MANHA">Manhã</option>
            <option value="TARDE">Tarde</option>
            <option value="HORAS">Horas (parcial)</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Tipo de falta</label>
          <select className="w-full border border-input rounded-lg px-3 py-2 bg-background text-sm"
            value={form.tipoFaltaId ?? ''}
            onChange={e => setForm(f => ({ ...f, tipoFaltaId: e.target.value || undefined }))}>
            <option value="">Sem tipo específico</option>
            {tipos.map(t => <option key={t.id} value={t.id}>{t.designacao}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="text-sm font-medium block mb-1">Justificação (texto)</label>
        <textarea className="w-full border border-input rounded-lg px-3 py-2 bg-background text-sm resize-none"
          rows={2}
          value={form.justificacaoTexto ?? ''}
          onChange={e => setForm(f => ({ ...f, justificacaoTexto: e.target.value || undefined }))}
          placeholder="Opcional…" />
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.previsivel ?? false}
            onChange={e => setForm(f => ({ ...f, previsivel: e.target.checked }))} />
          Ausência prevista
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.dadoSaude ?? false}
            onChange={e => setForm(f => ({ ...f, dadoSaude: e.target.checked }))} />
          Dado de saúde (RGPD)
        </label>
      </div>
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancelar}
          className="flex-1 py-2 border border-input rounded-lg text-sm hover:bg-muted/50 transition-colors">
          Cancelar
        </button>
        <button type="button"
          disabled={!form.colaboradorId || !form.dataInicio || !form.dataFim || loading}
          onClick={() => void onRegistar(form)}
          className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors">
          {loading ? 'A registar…' : 'Registar Falta'}
        </button>
      </div>
    </div>
  )
}

export function FaltasPage() {
  const [filtroColab, setFiltroColab] = useState('')
  const [modoNovo, setModoNovo]       = useState(false)

  const { colaboradores }                  = useColaboradores(true)
  const { tipos }                          = useTiposFalta()
  const { faltas, loading, reload }        = useFaltas(filtroColab || undefined)
  const { registar, loading: saving }      = useRegistarFalta()
  const { atualizar, loading: atualizando} = useAtualizarEstadoFalta()

  async function handleRegistar(form: NovaFalta) {
    await registar(form)
    reload()
    setModoNovo(false)
  }

  async function handleEstado(id: string, estado: EstadoFalta) {
    await atualizar(id, estado)
    reload()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-xl">
            <FileX className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Faltas</h1>
            <p className="text-sm text-muted-foreground">Registo e gestão de faltas dos colaboradores</p>
          </div>
        </div>
        {!modoNovo && (
          <button onClick={() => setModoNovo(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" /> Registar Falta
          </button>
        )}
      </div>

      {modoNovo && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2"><Plus className="w-4 h-4" /> Nova Falta</h2>
          <NovaFaltaForm
            colaboradores={colaboradores}
            tipos={tipos}
            onRegistar={handleRegistar}
            onCancelar={() => setModoNovo(false)}
            loading={saving}
          />
        </div>
      )}

      {/* Filtro */}
      <div className="flex items-center gap-3 bg-card border border-border rounded-xl p-3">
        <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
        <select
          className="flex-1 bg-transparent text-sm outline-none"
          value={filtroColab}
          onChange={e => setFiltroColab(e.target.value)}
        >
          <option value="">Todos os colaboradores</option>
          {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-7 h-7 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : faltas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm bg-card border border-border rounded-xl">
          Nenhuma falta registada.
        </div>
      ) : (
        <div className="space-y-2">
          {faltas.map(f => (
            <div key={f.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex flex-wrap items-start gap-3 justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{f.colaboradorNome ?? f.colaboradorId}</span>
                    <EstadoBadge estado={f.estado} />
                    {f.previsivel && (
                      <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">Prevista</span>
                    )}
                    {f.dadoSaude && (
                      <span className="text-xs bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Paperclip className="w-3 h-3" /> Dado saúde
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {f.dataInicio === f.dataFim ? f.dataInicio : `${f.dataInicio} → ${f.dataFim}`}
                    {f.periodo && f.periodo !== 'DIA' && ` · ${f.periodo.toLowerCase()}`}
                    {f.tipoFaltaDesignacao && ` · ${f.tipoFaltaDesignacao}`}
                  </p>
                  {f.prazoProvaAte && f.estado === 'COMUNICADA' && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Prazo de prova: {f.prazoProvaAte}
                    </p>
                  )}
                  {f.justificacaoTexto && (
                    <p className="text-xs text-muted-foreground mt-1 italic">&ldquo;{f.justificacaoTexto}&rdquo;</p>
                  )}
                </div>
                {/* Ações de transição de estado */}
                {(f.estado === 'COMUNICADA' || f.estado === 'COM_COMPROVATIVO') && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => void handleEstado(f.id, 'JUSTIFICADA')}
                      disabled={atualizando}
                      className="flex items-center gap-1 text-xs bg-green-500/10 text-green-700 dark:text-green-400 px-2.5 py-1.5 rounded-lg hover:bg-green-500/20 transition-colors disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Justificar
                    </button>
                    <button
                      onClick={() => void handleEstado(f.id, 'INJUSTIFICADA')}
                      disabled={atualizando}
                      className="flex items-center gap-1 text-xs bg-red-500/10 text-red-700 dark:text-red-400 px-2.5 py-1.5 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Injustificar
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
