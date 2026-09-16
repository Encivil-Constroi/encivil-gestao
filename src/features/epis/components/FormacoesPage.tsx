import { useState } from 'react'
import { GraduationCap, Plus, ChevronDown, CheckCircle2, AlertCircle, Clock, Infinity } from 'lucide-react'
import { useColaboradores } from '@/features/colaboradores/hooks/useColaboradores'
import { useFormacoesColaborador, useTiposFormacao } from '../hooks/useFormacoesColaborador'
import { useRegistarFormacao, useUploadCertificado } from '../hooks/useRegistarFormacao'
import type { FormacaoColaborador } from '@/app/types'

function diasParaValidade(dataValidade?: string): number | null {
  if (!dataValidade) return null
  const diff = new Date(dataValidade).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function BadgeValidade({ dataValidade }: { dataValidade?: string }) {
  if (!dataValidade) return (
    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400">
      <Infinity className="w-3 h-3" /> Vitalícia
    </span>
  )
  const dias = diasParaValidade(dataValidade)!
  if (dias < 0) return (
    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
      <AlertCircle className="w-3 h-3" /> Expirada há {Math.abs(dias)}d
    </span>
  )
  if (dias <= 30) return (
    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
      <AlertCircle className="w-3 h-3" /> {dias}d restantes
    </span>
  )
  if (dias <= 90) return (
    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400">
      <Clock className="w-3 h-3" /> {dias}d restantes
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-700 dark:text-green-400">
      <CheckCircle2 className="w-3 h-3" /> Válida
    </span>
  )
}

function FormacaoRow({ formacao }: { formacao: FormacaoColaborador }) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card">
      <div className="bg-primary/10 p-2 rounded-lg shrink-0">
        <GraduationCap className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{formacao.tipoDesignacao}</p>
        {formacao.entidade && <p className="text-xs text-muted-foreground">{formacao.entidade}</p>}
        <p className="text-xs text-muted-foreground">Concluída: {new Date(formacao.dataConclusao).toLocaleDateString('pt-PT')}</p>
        {formacao.dataValidade && (
          <p className="text-xs text-muted-foreground">Válida até: {new Date(formacao.dataValidade).toLocaleDateString('pt-PT')}</p>
        )}
        <div className="mt-1.5">
          <BadgeValidade dataValidade={formacao.dataValidade} />
        </div>
      </div>
      {formacao.certificadoKey && (
        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded shrink-0">PDF</span>
      )}
    </div>
  )
}

function NovaFormacaoForm({ colaboradorId, onClose }: { colaboradorId: string; onClose: () => void }) {
  const { tipos } = useTiposFormacao()
  const { registar, loading } = useRegistarFormacao(colaboradorId)
  const { upload, loading: uploading } = useUploadCertificado()
  const [tipoId, setTipoId] = useState('')
  const [dataConclusao, setDataConclusao] = useState(() => new Date().toISOString().split('T')[0])
  const [entidade, setEntidade] = useState('')
  const [ficheiro, setFicheiro] = useState<File | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!tipoId) return
    let certificadoKey: string | undefined
    if (ficheiro) {
      const key = await upload({ colaboradorId, file: ficheiro })
      certificadoKey = key ?? undefined
    }
    const result = await registar({
      colaboradorId, tipoId, dataConclusao,
      entidade: entidade || undefined,
      certificadoKey,
    })
    if (result) onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
      <p className="text-sm font-semibold">Registar Formação</p>
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Tipo de Formação</label>
        <div className="relative">
          <select
            value={tipoId}
            onChange={e => setTipoId(e.target.value)}
            required
            className="w-full appearance-none bg-background border border-input rounded-lg px-3 py-2.5 text-sm pr-8"
          >
            <option value="">— Selecionar —</option>
            {tipos.map(t => (
              <option key={t.id} value={t.id}>
                {t.designacao}{t.validadeAnos ? ` (${t.validadeAnos}a)` : ' (vitalícia)'}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Data de conclusão</label>
        <input
          type="date"
          value={dataConclusao}
          onChange={e => setDataConclusao(e.target.value)}
          required
          className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Entidade formadora (opcional)</label>
        <input
          type="text"
          value={entidade}
          onChange={e => setEntidade(e.target.value)}
          placeholder="Ex: ACT, empresa certificada…"
          className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Certificado (PDF, opcional)</label>
        <input
          type="file"
          accept="application/pdf,image/*"
          onChange={e => setFicheiro(e.target.files?.[0] ?? null)}
          className="w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-border file:text-xs file:bg-background hover:file:bg-muted/50"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={loading || uploading || !tipoId}
          className="flex-1 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {loading || uploading ? 'A guardar…' : 'Registar'}
        </button>
        <button type="button" onClick={onClose} className="px-3 py-2 border border-border rounded-lg text-sm hover:bg-muted/50">
          Cancelar
        </button>
      </div>
    </form>
  )
}

export function FormacoesPage() {
  const { colaboradores } = useColaboradores(true)
  const [colaboradorId, setColaboradorId] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)
  const { formacoes, loading } = useFormacoesColaborador(colaboradorId || undefined)

  const validas = formacoes.filter(f => !f.dataValidade || diasParaValidade(f.dataValidade)! >= 0)
  const expiradas = formacoes.filter(f => f.dataValidade && diasParaValidade(f.dataValidade)! < 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-xl">
            <GraduationCap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Formações</h1>
            <p className="text-sm text-muted-foreground">Registo de formações e certificações</p>
          </div>
        </div>
        {colaboradorId && (
          <button
            onClick={() => setMostrarForm(f => !f)}
            className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" /> Registar
          </button>
        )}
      </div>

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

      {mostrarForm && colaboradorId && (
        <NovaFormacaoForm colaboradorId={colaboradorId} onClose={() => setMostrarForm(false)} />
      )}

      {!colaboradorId && (
        <p className="text-center text-sm text-muted-foreground py-12">Seleciona um colaborador para ver as formações.</p>
      )}

      {colaboradorId && !loading && formacoes.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-12">Nenhuma formação registada.</p>
      )}

      {validas.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground px-1">Válidas ({validas.length})</h2>
          {validas.map(f => <FormacaoRow key={f.id} formacao={f} />)}
        </div>
      )}

      {expiradas.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground px-1">Expiradas ({expiradas.length})</h2>
          {expiradas.map(f => <FormacaoRow key={f.id} formacao={f} />)}
        </div>
      )}
    </div>
  )
}
