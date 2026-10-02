import { useEffect, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { useRole } from '@/features/auth/useRole'
import type { SubsConfigRow, TipoDocSub } from '../../db'
import { useConfigSubs, useGuardarConfigSubs } from '../../hooks/useSubsControlo'
import { ROTULO_DOC } from '../../lib/compliance'
import { botaoPrimario, botaoSecundario, inputCls } from '../ui'

type Campo = { chave: keyof SubsConfigRow; rotulo: string; min: number; max: number; passo: string }

const CAMPOS_NUMERICOS: Campo[] = [
  { chave: 'retencao_padrao_pct', rotulo: 'Retenção de garantia padrão (%)', min: 0, max: 100, passo: '0.5' },
  { chave: 'prazo_pagamento_dias', rotulo: 'Prazo de pagamento (dias)', min: 0, max: 365, passo: '1' },
  { chave: 'alcada_gestor_ate', rotulo: 'Alçada do gestor: certificado até (€)', min: 0, max: 100000000, passo: '0.01' },
  { chave: 'aviso_validade_dias', rotulo: 'Aviso de validade dos documentos (dias)', min: 0, max: 365, passo: '1' },
  { chave: 'raio_padrao_m', rotulo: 'Raio da obra para evidências (m)', min: 1, max: 100000, passo: '1' },
  { chave: 'precisao_max_m', rotulo: 'Precisão máxima do GPS (m)', min: 1, max: 10000, passo: '1' },
  { chave: 'foto_idade_max_min', rotulo: 'Idade máxima da fotografia (min)', min: 1, max: 10080, passo: '1' },
  { chave: 'min_fotos_verificacao', rotulo: 'Fotografias válidas para verificar', min: 0, max: 50, passo: '1' },
]

const TIPOS_DOC = Object.keys(ROTULO_DOC) as TipoDocSub[]

type Estado = {
  numeros: Record<string, string>
  docs: TipoDocSub[]
  bloquearDocs: boolean
  exigirFatura: boolean
  checklist: string
}

function deConfig(c: SubsConfigRow): Estado {
  return {
    numeros: Object.fromEntries(CAMPOS_NUMERICOS.map(f => [f.chave, String(c[f.chave])])),
    docs: c.docs_obrigatorios,
    bloquearDocs: c.bloquear_pagamento_sem_docs,
    exigirFatura: c.exigir_fatura_para_pagar,
    checklist: c.checklist_padrao.map(i => (typeof i === 'string' ? i : i.item)).join('\n'),
  }
}

export function ConfigSubsDialog({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const { isAdmin } = useRole()
  const { config, loading, error: erroLeitura, reload } = useConfigSubs()
  const { guardar, loading: aGuardar, error: erroGuardar } = useGuardarConfigSubs()
  const [estado, setEstado] = useState<Estado | null>(null)
  const [erroLocal, setErroLocal] = useState<string | null>(null)

  useEffect(() => {
    if (aberto && config) setEstado(deConfig(config))
  }, [aberto, config])

  if (!aberto || !isAdmin) return null

  const submeter = async (e: FormEvent) => {
    e.preventDefault()
    if (!estado) return
    const cfg: Record<string, number> = {}
    for (const f of CAMPOS_NUMERICOS) {
      const v = Number(estado.numeros[f.chave])
      if (estado.numeros[f.chave] === '' || !Number.isFinite(v) || v < f.min || v > f.max) {
        setErroLocal(`${f.rotulo}: indique um valor entre ${f.min} e ${f.max}.`); return
      }
      cfg[f.chave] = v
    }
    const checklist = estado.checklist.split('\n').map(l => l.trim()).filter(Boolean)
    if (checklist.length === 0) { setErroLocal('A lista de verificação precisa de pelo menos um item.'); return }
    setErroLocal(null)
    const r = await guardar({
      ...cfg,
      docs_obrigatorios: estado.docs,
      bloquear_pagamento_sem_docs: estado.bloquearDocs,
      exigir_fatura_para_pagar: estado.exigirFatura,
      checklist_padrao: checklist,
    })
    if (r !== null) onFechar()
  }

  const alternarDoc = (t: TipoDocSub) => setEstado(s => s && ({ ...s, docs: s.docs.includes(t) ? s.docs.filter(d => d !== t) : [...s.docs, t] }))

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="cfg-subs-titulo" className="bg-card w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-border">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border sticky top-0 bg-card">
          <h2 id="cfg-subs-titulo" className="flex-1 font-semibold">Configuração das subempreitadas</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="p-2 rounded-lg hover:bg-accent"><X className="w-4 h-4" aria-hidden="true" /></button>
        </div>
        {loading && !estado && <p role="status" className="p-4 text-sm text-muted-foreground">A carregar…</p>}
        {erroLeitura && <p role="alert" className="p-4 text-sm text-destructive">{erroLeitura} <button type="button" className="underline" onClick={reload}>Tentar de novo</button></p>}
        {estado && (
          <form onSubmit={e => void submeter(e)} className="p-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {CAMPOS_NUMERICOS.map(f => (
                <label key={f.chave} className="text-sm">{f.rotulo}
                  <input className={inputCls} type="number" inputMode="decimal" min={f.min} max={f.max} step={f.passo} required
                    value={estado.numeros[f.chave]} onChange={e => setEstado({ ...estado, numeros: { ...estado.numeros, [f.chave]: e.target.value } })} />
                </label>
              ))}
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Documentos obrigatórios</legend>
              {TIPOS_DOC.map(t => (
                <label key={t} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={estado.docs.includes(t)} onChange={() => alternarDoc(t)} /> {ROTULO_DOC[t]}
                </label>
              ))}
            </fieldset>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={estado.bloquearDocs} onChange={e => setEstado({ ...estado, bloquearDocs: e.target.checked })} />
              Bloquear pagamento com documentos em falta ou expirados
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={estado.exigirFatura} onChange={e => setEstado({ ...estado, exigirFatura: e.target.checked })} />
              Exigir a fatura do subempreiteiro guardada para pagar
            </label>
            <label className="block text-sm">Lista de verificação padrão (um item por linha)
              <textarea className={inputCls} rows={6} value={estado.checklist} onChange={e => setEstado({ ...estado, checklist: e.target.value })} />
            </label>
            {(erroLocal || erroGuardar) && <p role="alert" className="text-sm text-destructive">{erroLocal || erroGuardar}</p>}
            <div className="flex gap-2">
              <button className={botaoPrimario} disabled={aGuardar}>{aGuardar ? 'A guardar…' : 'Guardar configuração'}</button>
              <button type="button" className={botaoSecundario} onClick={onFechar}>Cancelar</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
