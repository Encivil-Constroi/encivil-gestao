import { useState } from 'react'
import { Clock, Plus, Pencil, Archive, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { useHorarios, useGuardarHorario, useArquivarHorario } from '../hooks/useHorarios'
import type { Horario } from '@/app/types'
import type { NovoHorario } from '../services/horariosService'

const DIAS_LABEL = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

const inputCls = 'w-full px-3 py-2.5 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm'
const labelCls = 'block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5'

const FORM_VAZIO: NovoHorario = {
  designacao: '',
  periodoDiarioH: 8,
  periodoSemanalH: 40,
  diasSemana: [1, 2, 3, 4, 5],
  horaEntrada: '08:00',
  horaSaida: '17:00',
  toleranciaEntradaMin: 5,
}

export function HorariosPage() {
  const { horarios, loading, reload } = useHorarios(false)
  const { criar, atualizar, loading: saving } = useGuardarHorario()
  const { arquivar, loading: archiving } = useArquivarHorario()

  const [editingId, setEditingId] = useState<string | 'novo' | null>(null)
  const [form, setForm] = useState<NovoHorario>(FORM_VAZIO)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  function abrirNovo() {
    setForm(FORM_VAZIO)
    setEditingId('novo')
  }

  function abrirEditar(h: Horario) {
    setForm({
      designacao: h.designacao,
      periodoDiarioH: h.periodoDiarioH,
      periodoSemanalH: h.periodoSemanalH,
      intervaloMin: h.intervaloMin,
      intervaloInicio: h.intervaloInicio,
      intervaloFim: h.intervaloFim,
      diasSemana: h.diasSemana,
      horaEntrada: h.horaEntrada,
      horaSaida: h.horaSaida,
      toleranciaEntradaMin: h.toleranciaEntradaMin,
      validoDe: h.validoDe,
      validoAte: h.validoAte,
    })
    setEditingId(h.id)
  }

  function fechar() { setEditingId(null) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.designacao.trim()) { toast.error('A designação é obrigatória.'); return }
    if (form.diasSemana.length === 0) { toast.error('Selecione pelo menos um dia.'); return }

    if (editingId === 'novo') {
      const result = await criar(form)
      if (result) { toast.success('Horário criado.'); reload(); fechar() }
    } else if (editingId) {
      const result = await atualizar(editingId, form)
      if (result) { toast.success('Horário actualizado.'); reload(); fechar() }
    }
  }

  async function handleArquivar(h: Horario) {
    if (!confirm(`Arquivar o horário "${h.designacao}"?`)) return
    await arquivar(h.id)
    toast.success('Horário arquivado.')
    reload()
  }

  function toggleDia(dia: number) {
    setForm(f => ({
      ...f,
      diasSemana: f.diasSemana.includes(dia)
        ? f.diasSemana.filter(d => d !== dia)
        : [...f.diasSemana, dia].sort(),
    }))
  }

  const ativos   = horarios.filter(h => h.ativo)
  const inativos = horarios.filter(h => !h.ativo)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold flex items-center gap-2">
            <Clock className="w-6 h-6 text-primary" />
            Horários de Trabalho
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {ativos.length} horário{ativos.length !== 1 ? 's' : ''} activo{ativos.length !== 1 ? 's' : ''}
          </p>
        </div>
        {editingId === null && (
          <button
            onClick={abrirNovo}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            Novo horário
          </button>
        )}
      </div>

      {/* Formulário inline */}
      {editingId !== null && (
        <div className="bg-card rounded-2xl border border-border p-5">
          <h2 className="font-semibold mb-4">{editingId === 'novo' ? 'Novo horário' : 'Editar horário'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelCls}>Designação *</label>
                <input
                  type="text"
                  className={inputCls}
                  value={form.designacao}
                  onChange={e => setForm(f => ({ ...f, designacao: e.target.value }))}
                  placeholder="ex: Horário Geral Obra"
                  required
                />
              </div>
              <div>
                <label className={labelCls}>Horas/dia *</label>
                <input
                  type="number"
                  min={1} max={12} step={0.5}
                  className={inputCls}
                  value={form.periodoDiarioH}
                  onChange={e => setForm(f => ({ ...f, periodoDiarioH: parseFloat(e.target.value) }))}
                  required
                />
              </div>
              <div>
                <label className={labelCls}>Horas/semana *</label>
                <input
                  type="number"
                  min={1} max={60} step={0.5}
                  className={inputCls}
                  value={form.periodoSemanalH}
                  onChange={e => setForm(f => ({ ...f, periodoSemanalH: parseFloat(e.target.value) }))}
                  required
                />
              </div>
              <div>
                <label className={labelCls}>Hora de entrada *</label>
                <input
                  type="time"
                  className={inputCls}
                  value={form.horaEntrada}
                  onChange={e => setForm(f => ({ ...f, horaEntrada: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className={labelCls}>Hora de saída *</label>
                <input
                  type="time"
                  className={inputCls}
                  value={form.horaSaida}
                  onChange={e => setForm(f => ({ ...f, horaSaida: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className={labelCls}>Tolerância entrada (min)</label>
                <input
                  type="number"
                  min={0} max={30}
                  className={inputCls}
                  value={form.toleranciaEntradaMin}
                  onChange={e => setForm(f => ({ ...f, toleranciaEntradaMin: parseInt(e.target.value) }))}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>Dias de trabalho *</label>
              <div className="flex gap-2 flex-wrap">
                {[1, 2, 3, 4, 5, 6, 7].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDia(d)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      form.diasSemana.includes(d)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card text-muted-foreground border-border hover:border-primary/50'
                    }`}
                  >
                    {DIAS_LABEL[d]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {saving ? 'A guardar…' : 'Guardar'}
              </button>
              <button
                type="button"
                onClick={fechar}
                className="px-5 py-2.5 border border-border rounded-xl text-sm text-muted-foreground hover:bg-accent transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-card rounded-2xl border border-border p-4">
              <div className="skeleton h-4 w-40 mb-2" />
              <div className="skeleton h-3 w-64" />
            </div>
          ))}
        </div>
      ) : ativos.length === 0 && editingId === null ? (
        <div className="bg-card rounded-2xl border border-border p-10 text-center text-muted-foreground text-sm">
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
          Nenhum horário criado ainda.
        </div>
      ) : (
        <div className="space-y-2">
          {ativos.map(h => (
            <div key={h.id} className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{h.designacao}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {h.horaEntrada} – {h.horaSaida} &nbsp;·&nbsp;
                    {h.periodoDiarioH}h/dia, {h.periodoSemanalH}h/sem &nbsp;·&nbsp;
                    {h.diasSemana.map(d => DIAS_LABEL[d]).join(', ')}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setExpandedId(expandedId === h.id ? null : h.id)}
                    className="p-1.5 hover:bg-accent rounded-lg transition-colors text-muted-foreground"
                    title="Detalhes"
                  >
                    {expandedId === h.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => abrirEditar(h)}
                    className="p-1.5 hover:bg-accent rounded-lg transition-colors text-muted-foreground"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleArquivar(h)}
                    disabled={archiving}
                    className="p-1.5 hover:bg-destructive/10 rounded-lg transition-colors text-muted-foreground hover:text-destructive"
                    title="Arquivar"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {expandedId === h.id && (
                <div className="px-4 pb-3 border-t border-border bg-muted/30 pt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">Tolerância</p>
                    <p>{h.toleranciaEntradaMin} min</p>
                  </div>
                  {h.intervaloMin && (
                    <div>
                      <p className="text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">Intervalo</p>
                      <p>{h.intervaloMin} min {h.intervaloInicio && `(${h.intervaloInicio}–${h.intervaloFim})`}</p>
                    </div>
                  )}
                  {h.validoDe && (
                    <div>
                      <p className="text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">Vigência</p>
                      <p>{h.validoDe}{h.validoAte ? ` → ${h.validoAte}` : ' →'}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {inativos.length > 0 && (
            <details className="mt-4">
              <summary className="text-xs text-muted-foreground cursor-pointer select-none px-1 py-1">
                {inativos.length} horário{inativos.length !== 1 ? 's' : ''} arquivado{inativos.length !== 1 ? 's' : ''}
              </summary>
              <div className="space-y-1 mt-2">
                {inativos.map(h => (
                  <div key={h.id} className="bg-card/60 rounded-xl border border-border px-4 py-2.5 opacity-60">
                    <p className="text-sm font-medium line-through">{h.designacao}</p>
                    <p className="text-xs text-muted-foreground">{h.horaEntrada} – {h.horaSaida}</p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
