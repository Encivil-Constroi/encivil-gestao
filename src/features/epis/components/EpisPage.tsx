import { useState } from 'react'
import { Shield, Plus, RotateCcw, ChevronDown, CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import { useColaboradores } from '@/features/colaboradores/hooks/useColaboradores'
import { useEpisColaborador, useTiposEpi } from '../hooks/useEpisColaborador'
import { useAtribuirEpi, useDevolverEpi } from '../hooks/useAtribuirEpi'
import type { AtribuicaoEpi } from '@/app/types'

function diasParaValidade(dataValidade?: string): number | null {
  if (!dataValidade) return null
  const diff = new Date(dataValidade).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function BadgeValidade({ dataValidade }: { dataValidade?: string }) {
  const dias = diasParaValidade(dataValidade)
  if (dias === null) return null
  if (dias < 0) return (
    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
      <AlertCircle className="w-3 h-3" /> Expirado há {Math.abs(dias)}d
    </span>
  )
  if (dias <= 7) return (
    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
      <AlertCircle className="w-3 h-3" /> {dias}d restantes
    </span>
  )
  if (dias <= 30) return (
    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400">
      <Clock className="w-3 h-3" /> {dias}d restantes
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-700 dark:text-green-400">
      <CheckCircle2 className="w-3 h-3" /> Válido
    </span>
  )
}

function EpiRow({ epi, onDevolver, loading }: {
  epi: AtribuicaoEpi; onDevolver: (id: string) => void; loading: boolean
}) {
  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border ${epi.devolvido ? 'border-border/30 bg-muted/30 opacity-60' : 'border-border bg-card'}`}>
      <div className="bg-primary/10 p-2 rounded-lg shrink-0">
        <Shield className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{epi.tipoEpiDesignacao}</p>
        <p className="text-xs text-muted-foreground">Entregue: {new Date(epi.dataEntrega).toLocaleDateString('pt-PT')}</p>
        {epi.dataValidade && (
          <p className="text-xs text-muted-foreground">Válido até: {new Date(epi.dataValidade).toLocaleDateString('pt-PT')}</p>
        )}
        {!epi.devolvido && <div className="mt-1.5"><BadgeValidade dataValidade={epi.dataValidade} /></div>}
        {epi.devolvido && epi.dataDevolucao && (
          <p className="text-xs text-muted-foreground mt-1">Devolvido: {new Date(epi.dataDevolucao).toLocaleDateString('pt-PT')}</p>
        )}
      </div>
      {!epi.devolvido && (
        <button
          onClick={() => onDevolver(epi.id)}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-muted/50 transition-colors disabled:opacity-50 shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Devolver
        </button>
      )}
    </div>
  )
}

function NovaAtribuicaoForm({ colaboradorId, onClose }: { colaboradorId: string; onClose: () => void }) {
  const { tipos } = useTiposEpi()
  const { atribuir, loading } = useAtribuirEpi(colaboradorId)
  const [tipoId, setTipoId] = useState('')
  const [dataEntrega, setDataEntrega] = useState(() => new Date().toISOString().split('T')[0])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!tipoId) return
    const result = await atribuir({ colaboradorId, tipoEpiId: tipoId, dataEntrega })
    if (result) onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
      <p className="text-sm font-semibold">Atribuir EPI</p>
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Tipo de EPI</label>
        <div className="relative">
          <select
            value={tipoId}
            onChange={e => setTipoId(e.target.value)}
            required
            className="w-full appearance-none bg-background border border-input rounded-lg px-3 py-2.5 text-sm pr-8"
          >
            <option value="">— Selecionar —</option>
            {tipos.map(t => <option key={t.id} value={t.id}>{t.designacao}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Data de entrega</label>
        <input
          type="date"
          value={dataEntrega}
          onChange={e => setDataEntrega(e.target.value)}
          required
          className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={loading || !tipoId}
          className="flex-1 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? 'A guardar…' : 'Atribuir'}
        </button>
        <button type="button" onClick={onClose} className="px-3 py-2 border border-border rounded-lg text-sm hover:bg-muted/50">
          Cancelar
        </button>
      </div>
    </form>
  )
}

export function EpisPage() {
  const { colaboradores } = useColaboradores(true)
  const [colaboradorId, setColaboradorId] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)
  const { epis, loading, reload } = useEpisColaborador(colaboradorId || undefined)
  const { devolver, loading: devolvendo } = useDevolverEpi(colaboradorId || undefined)

  async function handleDevolver(id: string) {
    await devolver(id, new Date().toISOString().split('T')[0])
    reload()
  }

  const ativos = epis.filter(e => !e.devolvido)
  const devolvidos = epis.filter(e => e.devolvido)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-xl">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">EPIs</h1>
            <p className="text-sm text-muted-foreground">Equipamentos de Proteção Individual</p>
          </div>
        </div>
        {colaboradorId && (
          <button
            onClick={() => setMostrarForm(f => !f)}
            className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" /> Atribuir EPI
          </button>
        )}
      </div>

      {/* Seletor de colaborador */}
      <div className="bg-card border border-border rounded-xl p-4">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block mb-1.5">Colaborador</label>
        <div className="relative">
          <select
            value={colaboradorId}
            onChange={e => { setColaboradorId(e.target.value); setMostrarForm(false) }}
            className="w-full appearance-none bg-background border border-input rounded-lg px-3 py-2.5 text-sm pr-8"
          >
            <option value="">— Selecionar colaborador —</option>
            {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome} ({c.numeroMecan})</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Formulário de atribuição */}
      {mostrarForm && colaboradorId && (
        <NovaAtribuicaoForm colaboradorId={colaboradorId} onClose={() => setMostrarForm(false)} />
      )}

      {!colaboradorId && (
        <p className="text-center text-sm text-muted-foreground py-12">Seleciona um colaborador para ver os EPIs.</p>
      )}

      {colaboradorId && !loading && epis.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-12">Nenhum EPI registado para este colaborador.</p>
      )}

      {/* EPIs ativos */}
      {ativos.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground px-1">Em uso ({ativos.length})</h2>
          {ativos.map(e => (
            <EpiRow key={e.id} epi={e} onDevolver={handleDevolver} loading={devolvendo} />
          ))}
        </div>
      )}

      {/* EPIs devolvidos */}
      {devolvidos.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground px-1">Devolvidos ({devolvidos.length})</h2>
          {devolvidos.map(e => (
            <EpiRow key={e.id} epi={e} onDevolver={handleDevolver} loading={devolvendo} />
          ))}
        </div>
      )}
    </div>
  )
}
