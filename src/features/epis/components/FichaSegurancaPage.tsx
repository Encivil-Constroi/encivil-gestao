import { useState } from 'react'
import { UserCheck, Shield, GraduationCap, ChevronDown, AlertCircle, CheckCircle2, Clock, Infinity } from 'lucide-react'
import { useColaboradores } from '@/features/colaboradores/hooks/useColaboradores'
import { useEpisColaborador } from '../hooks/useEpisColaborador'
import { useFormacoesColaborador } from '../hooks/useFormacoesColaborador'
import type { AtribuicaoEpi, FormacaoColaborador } from '@/app/types'

function diasRestantes(dataValidade?: string): number | null {
  if (!dataValidade) return null
  const diff = new Date(dataValidade).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function ValidadeChip({ dataValidade, limiares }: { dataValidade?: string; limiares: { urgente: number; atencao: number } }) {
  if (!dataValidade) return (
    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400">
      <Infinity className="w-3 h-3" /> Vitalícia
    </span>
  )
  const dias = diasRestantes(dataValidade)!
  if (dias < 0) return (
    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">
      <AlertCircle className="w-3 h-3" /> Expirado
    </span>
  )
  if (dias <= limiares.urgente) return (
    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
      <AlertCircle className="w-3 h-3" /> {dias}d
    </span>
  )
  if (dias <= limiares.atencao) return (
    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400">
      <Clock className="w-3 h-3" /> {dias}d
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-700 dark:text-green-400">
      <CheckCircle2 className="w-3 h-3" /> OK
    </span>
  )
}

function SeccaoEpis({ epis }: { epis: AtribuicaoEpi[] }) {
  const ativos = epis.filter(e => !e.devolvido)
  const expiradosOuUrgentes = ativos.filter(e => {
    const dias = diasRestantes(e.dataValidade)
    return dias !== null && dias <= 7
  })

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className={`flex items-center justify-between px-4 py-3 border-b border-border/50 ${
        expiradosOuUrgentes.length > 0 ? 'bg-destructive/5' : ''
      }`}>
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">EPIs</span>
        </div>
        <div className="flex items-center gap-2">
          {expiradosOuUrgentes.length > 0 && (
            <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-medium">
              {expiradosOuUrgentes.length} urgente{expiradosOuUrgentes.length !== 1 ? 's' : ''}
            </span>
          )}
          <span className="text-xs text-muted-foreground">{ativos.length} ativo{ativos.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
      {ativos.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Nenhum EPI atribuído.</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {ativos.map(e => (
            <li key={e.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{e.tipoEpiDesignacao}</p>
                <p className="text-xs text-muted-foreground">
                  Entregue {new Date(e.dataEntrega).toLocaleDateString('pt-PT')}
                  {e.dataValidade && ` · até ${new Date(e.dataValidade).toLocaleDateString('pt-PT')}`}
                </p>
              </div>
              <ValidadeChip dataValidade={e.dataValidade} limiares={{ urgente: 7, atencao: 30 }} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SeccaoFormacoes({ formacoes }: { formacoes: FormacaoColaborador[] }) {
  const expiradas = formacoes.filter(f => {
    const dias = diasRestantes(f.dataValidade)
    return dias !== null && dias < 0
  })
  const urgentes = formacoes.filter(f => {
    const dias = diasRestantes(f.dataValidade)
    return dias !== null && dias >= 0 && dias <= 30
  })

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className={`flex items-center justify-between px-4 py-3 border-b border-border/50 ${
        expiradas.length > 0 ? 'bg-destructive/5' : urgentes.length > 0 ? 'bg-amber-500/5' : ''
      }`}>
        <div className="flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Formações</span>
        </div>
        <div className="flex items-center gap-2">
          {expiradas.length > 0 && (
            <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-medium">
              {expiradas.length} expirada{expiradas.length !== 1 ? 's' : ''}
            </span>
          )}
          <span className="text-xs text-muted-foreground">{formacoes.length} registada{formacoes.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
      {formacoes.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Nenhuma formação registada.</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {formacoes.map(f => (
            <li key={f.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{f.tipoDesignacao}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(f.dataConclusao).toLocaleDateString('pt-PT')}
                  {f.entidade && ` · ${f.entidade}`}
                </p>
              </div>
              <ValidadeChip dataValidade={f.dataValidade} limiares={{ urgente: 30, atencao: 90 }} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function FichaSegurancaPage() {
  const { colaboradores } = useColaboradores(true)
  const [colaboradorId, setColaboradorId] = useState('')

  const { epis, loading: loadingEpis } = useEpisColaborador(colaboradorId || undefined)
  const { formacoes, loading: loadingFormacoes } = useFormacoesColaborador(colaboradorId || undefined)
  const loading = loadingEpis || loadingFormacoes

  const colaborador = colaboradores.find(c => c.id === colaboradorId)

  const episExpirados = epis.filter(e => {
    if (e.devolvido) return false
    const dias = diasRestantes(e.dataValidade)
    return dias !== null && dias < 0
  })
  const formacoesExpiradas = formacoes.filter(f => {
    const dias = diasRestantes(f.dataValidade)
    return dias !== null && dias < 0
  })
  const totalProblemas = episExpirados.length + formacoesExpiradas.length

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 p-2.5 rounded-xl">
          <UserCheck className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Ficha de Segurança</h1>
          <p className="text-sm text-muted-foreground">EPIs e formações por colaborador</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block mb-1.5">Colaborador</label>
        <div className="relative">
          <select
            value={colaboradorId}
            onChange={e => setColaboradorId(e.target.value)}
            className="w-full appearance-none bg-background border border-input rounded-lg px-3 py-2.5 text-sm pr-8"
          >
            <option value="">— Selecionar colaborador —</option>
            {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome} ({c.numeroMecan})</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {!colaboradorId && (
        <p className="text-center text-sm text-muted-foreground py-12">Seleciona um colaborador para ver a ficha.</p>
      )}

      {colaboradorId && loading && (
        <p className="text-center text-sm text-muted-foreground py-8">A carregar…</p>
      )}

      {colaboradorId && !loading && (
        <>
          {/* Resumo de conformidade */}
          {colaborador && (
            <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
              totalProblemas > 0
                ? 'bg-destructive/5 border-destructive/30'
                : 'bg-green-500/5 border-green-500/30'
            }`}>
              {totalProblemas > 0
                ? <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
                : <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />}
              <div>
                <p className="text-sm font-semibold">{colaborador.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {totalProblemas > 0
                    ? `${totalProblemas} item${totalProblemas !== 1 ? 's' : ''} a resolver`
                    : 'Conformidade verificada'}
                </p>
              </div>
            </div>
          )}

          <SeccaoEpis epis={epis} />
          <SeccaoFormacoes formacoes={formacoes} />
        </>
      )}
    </div>
  )
}
