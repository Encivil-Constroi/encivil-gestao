import { useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, CheckCircle2, Clock, AlertTriangle } from 'lucide-react'
import { useColaboradores } from '@/features/colaboradores/hooks/useColaboradores'
import { useAssiduidadeMes, useValidarSupplementar } from '../hooks/useAssiduidade'
import type { ResumoAssiduidade } from '@/app/types'

function fmt(h: number | undefined): string {
  if (h === undefined) return '—'
  return `${h.toFixed(1)}h`
}

function DesvioChip({ desvio }: { desvio: number | undefined }) {
  if (desvio === undefined) return <span className="text-muted-foreground text-xs">—</span>
  if (Math.abs(desvio) < 0.1) return <span className="text-xs text-green-600 dark:text-green-400">OK</span>
  if (desvio > 0) return (
    <span className="text-xs font-medium text-amber-600 dark:text-amber-400">+{desvio.toFixed(1)}h</span>
  )
  return <span className="text-xs font-medium text-red-600 dark:text-red-400">{desvio.toFixed(1)}h</span>
}

function LinhaResumo({
  r,
  onValidar,
  saving,
}: {
  r: ResumoAssiduidade
  onValidar: (horas: number) => Promise<void>
  saving: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [horas, setHoras] = useState(String(r.horasSuplPropostas ?? 0))

  const diaSemana = new Date(r.data + 'T12:00:00').toLocaleDateString('pt-PT', { weekday: 'short' })
  const diaNum    = r.data.slice(8, 10)

  return (
    <tr className="border-b border-border/50 hover:bg-muted/20 transition-colors">
      <td className="py-2 px-3 text-sm">
        <span className="font-medium">{diaNum}</span>
        <span className="text-muted-foreground text-xs ml-1 capitalize">{diaSemana}</span>
      </td>
      <td className="py-2 px-3 text-sm text-right">{fmt(r.horasPrevistas)}</td>
      <td className="py-2 px-3 text-sm text-right">{fmt(r.horasEfetivas)}</td>
      <td className="py-2 px-3 text-sm text-right">
        <DesvioChip desvio={r.desvio} />
      </td>
      <td className="py-2 px-3 text-sm text-right">
        {(r.horasSuplPropostas ?? 0) > 0 ? (
          <span className="text-amber-600 dark:text-amber-400 font-medium">
            {fmt(r.horasSuplPropostas)}
          </span>
        ) : '—'}
      </td>
      <td className="py-2 px-3 text-sm text-right">
        {r.horasSuplValidadas !== undefined ? (
          <span className="text-green-600 dark:text-green-400 font-medium flex items-center gap-1 justify-end">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {fmt(r.horasSuplValidadas)}
          </span>
        ) : (r.horasSuplPropostas ?? 0) > 0 ? (
          editando ? (
            <div className="flex items-center gap-1 justify-end">
              <input
                type="number" min="0" max="24" step="0.5"
                value={horas}
                onChange={e => setHoras(e.target.value)}
                className="w-16 border border-input rounded px-1.5 py-0.5 text-xs bg-background"
              />
              <button
                onClick={async () => { await onValidar(parseFloat(horas)); setEditando(false) }}
                disabled={saving}
                className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded disabled:opacity-50"
              >
                ✓
              </button>
              <button onClick={() => setEditando(false)} className="text-xs text-muted-foreground px-1">✕</button>
            </div>
          ) : (
            <button
              onClick={() => setEditando(true)}
              className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
            >
              Validar
            </button>
          )
        ) : '—'}
      </td>
    </tr>
  )
}

export function AssiduidadePage() {
  const hoje = new Date()
  const [ano, setAno]     = useState(hoje.getFullYear())
  const [mes, setMes]     = useState(hoje.getMonth() + 1)
  const [colaboradorId, setColaboradorId] = useState('')

  const { colaboradores } = useColaboradores(true)
  const { resumos, loading, reload } = useAssiduidadeMes(colaboradorId || undefined, ano, mes)
  const { validar, loading: saving }  = useValidarSupplementar()

  function navMes(delta: number) {
    const d = new Date(ano, mes - 1 + delta, 1)
    setAno(d.getFullYear())
    setMes(d.getMonth() + 1)
  }

  const nomeMes = new Date(ano, mes - 1, 1).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })

  const totalPrev  = resumos.reduce((s, r) => s + (r.horasPrevistas ?? 0), 0)
  const totalEf    = resumos.reduce((s, r) => s + (r.horasEfetivas ?? 0), 0)
  const totalSuplP = resumos.reduce((s, r) => s + (r.horasSuplPropostas ?? 0), 0)
  const totalSuplV = resumos.reduce((s, r) => s + (r.horasSuplValidadas ?? 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 p-2.5 rounded-xl">
          <CalendarDays className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Assiduidade</h1>
          <p className="text-sm text-muted-foreground">Registo de presenças e horas por colaborador</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48">
          <label className="text-xs font-medium text-muted-foreground block mb-1">Colaborador</label>
          <select
            className="w-full border border-input rounded-lg px-3 py-2 bg-background text-sm"
            value={colaboradorId}
            onChange={e => setColaboradorId(e.target.value)}
          >
            <option value="">Selecionar colaborador…</option>
            {colaboradores.map(c => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Mês</label>
          <div className="flex items-center gap-2">
            <button onClick={() => navMes(-1)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium capitalize min-w-32 text-center">{nomeMes}</span>
            <button onClick={() => navMes(1)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {!colaboradorId && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Selecione um colaborador para ver a assiduidade.
        </div>
      )}

      {colaboradorId && (
        <>
          {/* Resumo do mês */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Horas previstas', value: fmt(totalPrev),  icon: Clock,          color: 'text-muted-foreground' },
              { label: 'Horas efetivas',  value: fmt(totalEf),    icon: CheckCircle2,   color: 'text-green-600 dark:text-green-400' },
              { label: 'Supl. propostas', value: fmt(totalSuplP), icon: AlertTriangle,  color: 'text-amber-600 dark:text-amber-400' },
              { label: 'Supl. validadas', value: fmt(totalSuplV), icon: CheckCircle2,   color: 'text-primary' },
            ].map(stat => (
              <div key={stat.label} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                  <span className="text-xs text-muted-foreground">{stat.label}</span>
                </div>
                <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Tabela */}
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-7 h-7 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : resumos.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm bg-card border border-border rounded-xl">
              Sem dados de assiduidade para este mês.
              <br />
              <span className="text-xs">O cálculo automático corre diariamente às 22:30 UTC.</span>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="text-left py-2 px-3 font-medium">Dia</th>
                      <th className="text-right py-2 px-3 font-medium">Previstas</th>
                      <th className="text-right py-2 px-3 font-medium">Efetivas</th>
                      <th className="text-right py-2 px-3 font-medium">Desvio</th>
                      <th className="text-right py-2 px-3 font-medium">Supl. prop.</th>
                      <th className="text-right py-2 px-3 font-medium">Supl. valid.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumos.map(r => (
                      <LinhaResumo
                        key={r.data}
                        r={r}
                        saving={saving}
                        onValidar={async horas => {
                          await validar(r.colaboradorId, r.data, horas)
                          reload()
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
