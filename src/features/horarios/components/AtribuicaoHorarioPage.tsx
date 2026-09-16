import { useState } from 'react'
import { CalendarClock, Plus, CalendarCheck } from 'lucide-react'
import { useColaboradores } from '@/features/colaboradores/hooks/useColaboradores'
import { useHorarios, useHorarioColaborador, useAtribuirHorario } from '../hooks/useHorarios'

export function AtribuicaoHorarioPage() {
  const { colaboradores, loading: loadingColab } = useColaboradores(true)
  const { horarios, loading: loadingHor }         = useHorarios(true)
  const { atribuir, loading: saving }             = useAtribuirHorario()

  const [colaboradorId, setColaboradorId] = useState('')
  const [horarioId, setHorarioId]         = useState('')
  const [validoDe, setValidoDe]           = useState(new Date().toISOString().slice(0, 10))
  const [validoAte, setValidoAte]         = useState('')
  const [sucesso, setSucesso]             = useState(false)

  const { atribuicoes, reload } = useHorarioColaborador(colaboradorId || undefined)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!colaboradorId || !horarioId || !validoDe) return
    await atribuir(colaboradorId, horarioId, validoDe, validoAte || undefined)
    setSucesso(true)
    reload()
    setHorarioId('')
    setValidoDe(new Date().toISOString().slice(0, 10))
    setValidoAte('')
    setTimeout(() => setSucesso(false), 3000)
  }

  const loading = loadingColab || loadingHor

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 p-2.5 rounded-xl">
          <CalendarClock className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Atribuição de Horários</h1>
          <p className="text-sm text-muted-foreground">Associar horário de trabalho a cada colaborador</p>
        </div>
      </div>

      <form onSubmit={e => void handleSubmit(e)} className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nova Atribuição
        </h2>

        <div>
          <label className="text-sm font-medium block mb-1">Colaborador *</label>
          <select
            className="w-full border border-input rounded-lg px-3 py-2 bg-background text-sm"
            value={colaboradorId}
            onChange={e => setColaboradorId(e.target.value)}
            disabled={loading}
          >
            <option value="">Selecionar colaborador…</option>
            {colaboradores.map(c => (
              <option key={c.id} value={c.id}>{c.nome} — {c.numeroMecan}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">Horário *</label>
          <select
            className="w-full border border-input rounded-lg px-3 py-2 bg-background text-sm"
            value={horarioId}
            onChange={e => setHorarioId(e.target.value)}
            disabled={loading}
          >
            <option value="">Selecionar horário…</option>
            {horarios.map(h => (
              <option key={h.id} value={h.id}>
                {h.designacao} ({h.horaEntrada}–{h.horaSaida}, {h.periodoDiarioH}h/dia)
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium block mb-1">Válido de *</label>
            <input type="date"
              className="w-full border border-input rounded-lg px-3 py-2 bg-background text-sm"
              value={validoDe}
              onChange={e => setValidoDe(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Válido até (opcional)</label>
            <input type="date"
              className="w-full border border-input rounded-lg px-3 py-2 bg-background text-sm"
              value={validoAte}
              onChange={e => setValidoAte(e.target.value)}
              min={validoDe}
            />
          </div>
        </div>

        {sucesso && (
          <div className="p-3 bg-green-500/10 text-green-600 dark:text-green-400 rounded-lg text-sm flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 shrink-0" />
            Horário atribuído com sucesso.
          </div>
        )}

        <button type="submit"
          disabled={!colaboradorId || !horarioId || !validoDe || saving}
          className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors">
          {saving ? 'A guardar…' : 'Atribuir Horário'}
        </button>
      </form>

      {colaboradorId && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold mb-4">Histórico de horários do colaborador</h2>
          {atribuicoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum horário atribuído.</p>
          ) : (
            <ul className="space-y-2">
              {atribuicoes.map((a, i) => (
                <li key={i} className="flex items-center gap-3 text-sm p-2 rounded-lg bg-muted/30">
                  <div className="flex-1">
                    <span className="font-medium">{a.horarioDesignacao ?? a.horarioId}</span>
                    <span className="text-muted-foreground ml-2">a partir de {a.validoDe}</span>
                    {a.validoAte && <span className="text-muted-foreground"> até {a.validoAte}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
