import { useState } from 'react'
import { Clock, Plus, Edit2, Archive, ChevronDown, ChevronRight } from 'lucide-react'
import { useHorarios, useGuardarHorario, useArquivarHorario } from '../hooks/useHorarios'
import type { Horario } from '@/app/types'

const DIAS_LABELS: Record<number, string> = {
  1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb', 7: 'Dom',
}

function diasLabel(dias: number[]): string {
  if (dias.length === 5 && dias.every(d => [1,2,3,4,5].includes(d))) return 'Seg – Sex'
  if (dias.length === 6 && dias.every(d => [1,2,3,4,5,6].includes(d))) return 'Seg – Sáb'
  return dias.map(d => DIAS_LABELS[d] ?? d).join(', ')
}

const DIAS_OPCOES = [1,2,3,4,5,6,7]

type HorarioFormData = Omit<Horario, 'id' | 'createdAt'>

const DEFAULT: HorarioFormData = {
  designacao: '', periodoDiarioH: 8, periodoSemanalH: 40,
  horaEntrada: '08:00', horaSaida: '17:00',
  diasSemana: [1,2,3,4,5], toleranciaEntradaMin: 5, ativo: true,
}

function HorarioForm({
  inicial, onSalvar, onCancelar, loading,
}: {
  inicial: HorarioFormData;
  onSalvar: (v: HorarioFormData) => void;
  onCancelar: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<HorarioFormData>(inicial)

  function toggleDia(d: number) {
    setForm(f => ({
      ...f,
      diasSemana: f.diasSemana.includes(d)
        ? f.diasSemana.filter(x => x !== d)
        : [...f.diasSemana, d].sort((a,b) => a-b),
    }))
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium block mb-1">Designação *</label>
        <input
          className="w-full border border-input rounded-lg px-3 py-2 bg-background text-sm"
          value={form.designacao}
          onChange={e => setForm(f => ({ ...f, designacao: e.target.value }))}
          placeholder="ex: Normal 8h/dia"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium block mb-1">Hora entrada</label>
          <input type="time" className="w-full border border-input rounded-lg px-3 py-2 bg-background text-sm"
            value={form.horaEntrada}
            onChange={e => setForm(f => ({ ...f, horaEntrada: e.target.value }))} />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Hora saída</label>
          <input type="time" className="w-full border border-input rounded-lg px-3 py-2 bg-background text-sm"
            value={form.horaSaida}
            onChange={e => setForm(f => ({ ...f, horaSaida: e.target.value }))} />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">H/dia</label>
          <input type="number" min="1" max="24" step="0.5"
            className="w-full border border-input rounded-lg px-3 py-2 bg-background text-sm"
            value={form.periodoDiarioH}
            onChange={e => setForm(f => ({ ...f, periodoDiarioH: +e.target.value }))} />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">H/semana</label>
          <input type="number" min="1" max="60" step="0.5"
            className="w-full border border-input rounded-lg px-3 py-2 bg-background text-sm"
            value={form.periodoSemanalH}
            onChange={e => setForm(f => ({ ...f, periodoSemanalH: +e.target.value }))} />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Tolerância entrada (min)</label>
          <input type="number" min="0" max="30"
            className="w-full border border-input rounded-lg px-3 py-2 bg-background text-sm"
            value={form.toleranciaEntradaMin}
            onChange={e => setForm(f => ({ ...f, toleranciaEntradaMin: +e.target.value }))} />
        </div>
      </div>
      <div>
        <label className="text-sm font-medium block mb-2">Dias de trabalho</label>
        <div className="flex gap-2 flex-wrap">
          {DIAS_OPCOES.map(d => (
            <button key={d} type="button"
              onClick={() => toggleDia(d)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                form.diasSemana.includes(d)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {DIAS_LABELS[d]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancelar}
          className="flex-1 py-2 border border-input rounded-lg text-sm hover:bg-muted/50 transition-colors">
          Cancelar
        </button>
        <button type="button" disabled={!form.designacao || form.diasSemana.length === 0 || loading}
          onClick={() => onSalvar(form)}
          className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors">
          {loading ? 'A guardar…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

export function HorariosPage() {
  const { horarios, loading, error, reload } = useHorarios(false)
  const { criar, atualizar, loading: saving } = useGuardarHorario()
  const { arquivar, loading: archiving } = useArquivarHorario()

  const [modo, setModo] = useState<'lista' | 'novo' | { editar: HorarioFormData }>('lista')
  const [expandido, setExpandido] = useState<string | null>(null)

  async function handleSalvar(formData: HorarioFormData) {
    if (typeof modo === 'object' && 'editar' in modo && 'id' in modo.editar) {
      await atualizar((modo.editar as Horario).id, formData)
    } else {
      await criar(formData)
    }
    reload()
    setModo('lista')
  }

  async function handleArquivar(id: string) {
    if (!confirm('Arquivar este horário?')) return
    await arquivar(id)
    reload()
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (error) return (
    <div className="p-4 bg-destructive/10 text-destructive rounded-lg text-sm">{error}</div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-xl">
            <Clock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Horários de Trabalho</h1>
            <p className="text-sm text-muted-foreground">{horarios.length} horário{horarios.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        {modo === 'lista' && (
          <button onClick={() => setModo('novo')}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" /> Novo Horário
          </button>
        )}
      </div>

      {(modo === 'novo' || (typeof modo === 'object' && 'editar' in modo)) && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold mb-4">
            {typeof modo === 'object' && 'editar' in modo ? 'Editar Horário' : 'Novo Horário'}
          </h2>
          <HorarioForm
            inicial={typeof modo === 'object' && 'editar' in modo ? modo.editar : DEFAULT}
            onSalvar={handleSalvar}
            onCancelar={() => setModo('lista')}
            loading={saving}
          />
        </div>
      )}

      <div className="space-y-2">
        {horarios.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Nenhum horário criado. Crie o primeiro horário padrão.
          </div>
        )}
        {horarios.map(h => (
          <div key={h.id} className={`bg-card border rounded-xl overflow-hidden ${!h.ativo ? 'opacity-60' : 'border-border'}`}>
            <div
              className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => setExpandido(e => e === h.id ? null : h.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{h.designacao}</span>
                  {!h.ativo && (
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Arquivado</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {h.horaEntrada}–{h.horaSaida} · {diasLabel(h.diasSemana)} · {h.periodoDiarioH}h/dia
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={e => { e.stopPropagation(); setModo({ editar: h as HorarioFormData }) }}
                  className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground">
                  <Edit2 className="w-4 h-4" />
                </button>
                {h.ativo && (
                  <button onClick={e => { e.stopPropagation(); void handleArquivar(h.id) }}
                    disabled={archiving}
                    className="p-1.5 hover:bg-destructive/10 rounded-lg transition-colors text-muted-foreground hover:text-destructive">
                    <Archive className="w-4 h-4" />
                  </button>
                )}
                {expandido === h.id
                  ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>
            {expandido === h.id && (
              <div className="px-4 pb-4 pt-0 border-t border-border/50 bg-muted/20">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Período diário</p>
                    <p className="font-medium">{h.periodoDiarioH}h</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Período semanal</p>
                    <p className="font-medium">{h.periodoSemanalH}h</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Tolerância entrada</p>
                    <p className="font-medium">{h.toleranciaEntradaMin} min</p>
                  </div>
                  {h.intervaloInicio && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Intervalo</p>
                      <p className="font-medium">{h.intervaloInicio}–{h.intervaloFim}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
