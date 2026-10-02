import { useId, useState } from 'react'
import { Scissors } from 'lucide-react'
import { fmtEuro } from '@/app/lib/format'
import type { AutoGlosaRow, MotivoGlosa, WorkflowAuto } from '../../../db'
import { useGlosarAuto, useGlosasAuto, useLevantarGlosa } from '../../../hooks/useSubsControlo'
import { arred2 } from '../../../lib/medicao'

type Props = {
  autoId: string
  workflow: WorkflowAuto
  valorPeriodo: number
  podeMedir: boolean
  podeGerir: boolean
}

export const MOTIVOS_GLOSA: { valor: MotivoGlosa; rotulo: string }[] = [
  { valor: 'QUALIDADE', rotulo: 'Qualidade' },
  { valor: 'QUANTIDADE_NAO_CONFIRMADA', rotulo: 'Quantidade não confirmada' },
  { valor: 'ATRASO', rotulo: 'Atraso' },
  { valor: 'SEGURANCA', rotulo: 'Segurança' },
  { valor: 'DOCUMENTACAO', rotulo: 'Documentação' },
  { valor: 'OUTRO', rotulo: 'Outro' },
]

const campo = 'w-full px-3 py-2.5 bg-input-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary'
const rotuloMotivo = (m: MotivoGlosa) => MOTIVOS_GLOSA.find(x => x.valor === m)?.rotulo ?? m

function LinhaGlosa({ g, podeLevantar }: { g: AutoGlosaRow; podeLevantar: boolean }) {
  const { levantar, loading, error } = useLevantarGlosa()
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)

  const confirmar = async () => {
    if (motivo.trim().length < 5) { setAviso('O motivo tem de ter pelo menos 5 caracteres.'); return }
    setAviso(null)
    if (await levantar(g.id, motivo.trim())) { setAberto(false); setMotivo('') }
  }

  const levantada = g.estado === 'levantada'
  return (
    <li className={`rounded-xl border p-3 space-y-1.5 ${levantada ? 'border-border opacity-70' : 'border-destructive/30 bg-destructive/5'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{rotuloMotivo(g.motivo)}{levantada && ' · levantada'}</p>
          <p className="text-sm text-muted-foreground">{g.descricao}</p>
          {levantada && g.motivo_levantamento && <p className="text-xs text-muted-foreground">Motivo do levantamento: {g.motivo_levantamento}</p>}
        </div>
        <span className={`text-sm font-semibold whitespace-nowrap ${levantada ? 'line-through' : 'text-destructive'}`}>− {fmtEuro(g.valor)}</span>
      </div>
      {podeLevantar && !levantada && (aberto ? (
        <div className="space-y-2">
          <input aria-label="Motivo do levantamento" value={motivo} onChange={e => setMotivo(e.target.value)} className={campo} placeholder="Motivo do levantamento" />
          <div className="flex gap-2">
            <button type="button" onClick={() => void confirmar()} disabled={loading} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
              {loading ? 'A levantar…' : 'Confirmar levantamento'}
            </button>
            <button type="button" onClick={() => setAberto(false)} className="px-3 py-2 rounded-xl border border-border text-sm">Cancelar</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAberto(true)} className="text-xs font-medium text-primary hover:underline">Levantar glosa</button>
      ))}
      {(aviso ?? error) && <p role="alert" className="text-xs text-destructive">{aviso ?? error}</p>}
    </li>
  )
}

export function AutoGlosas({ autoId, workflow, valorPeriodo, podeMedir, podeGerir }: Props) {
  const id = useId()
  const { glosas, loading, error: erroLista } = useGlosasAuto(autoId)
  const { glosar, loading: aGlosar, error: erroGlosar } = useGlosarAuto()
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState<MotivoGlosa>('QUALIDADE')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)

  const aplicadas = arred2(glosas.filter(g => g.estado === 'aplicada').reduce((s, g) => s + Number(g.valor), 0))
  const disponivel = arred2(valorPeriodo - aplicadas)
  const aberta = workflow !== 'validado'

  const aplicar = async () => {
    const v = Number(valor.replace(',', '.'))
    if (!descricao.trim()) { setAviso('Descreva o motivo da glosa.'); return }
    if (!(v > 0)) { setAviso('O valor da glosa tem de ser superior a 0 €.'); return }
    if (arred2(v) > disponivel) { setAviso(`A soma das glosas não pode ultrapassar o valor do auto (disponível: ${fmtEuro(disponivel)}).`); return }
    setAviso(null)
    const r = await glosar({ p_auto_id: autoId, p_motivo: motivo, p_descricao: descricao.trim(), p_valor: arred2(v), p_linha_id: null, p_ocorrencia_id: null })
    if (r) { setAberto(false); setDescricao(''); setValor('') }
  }

  return (
    <section aria-labelledby={`${id}-t`} className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id={`${id}-t`} className="font-semibold text-sm flex items-center gap-2"><Scissors className="w-4 h-4" aria-hidden="true" /> Glosas</h2>
        <span className="text-sm font-semibold text-destructive">{aplicadas > 0 ? `− ${fmtEuro(aplicadas)}` : ''}</span>
      </div>
      <p className="text-xs text-muted-foreground">Descontos ao valor do auto por defeitos, quantidades não confirmadas, atrasos ou falta de documentos.</p>
      {loading && <p role="status" className="text-sm text-muted-foreground">A carregar…</p>}
      {!loading && glosas.length === 0 && <p className="text-sm text-muted-foreground">Sem glosas.</p>}
      {glosas.length > 0 && (
        <ul className="space-y-2">{glosas.map(g => <LinhaGlosa key={g.id} g={g} podeLevantar={podeGerir && aberta} />)}</ul>
      )}

      {podeMedir && aberta && (aberto ? (
        <div className="rounded-xl border border-border p-3 space-y-2">
          <label className="block text-sm">Motivo
            <select value={motivo} onChange={e => setMotivo(e.target.value as MotivoGlosa)} className={`${campo} mt-1`}>
              {MOTIVOS_GLOSA.map(m => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
            </select>
          </label>
          <label className="block text-sm">Descrição
            <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2} className={`${campo} mt-1`} />
          </label>
          <label className="block text-sm">Valor (€)
            <input type="number" inputMode="decimal" min="0" step="0.01" value={valor} onChange={e => setValor(e.target.value)} className={`${campo} mt-1`} />
          </label>
          <p className="text-xs text-muted-foreground">Disponível para glosar: {fmtEuro(disponivel)}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void aplicar()} disabled={aGlosar} className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground font-semibold text-sm disabled:opacity-60">
              {aGlosar ? 'A aplicar…' : 'Aplicar glosa'}
            </button>
            <button type="button" onClick={() => setAberto(false)} className="px-4 py-2.5 rounded-xl border border-border text-sm">Cancelar</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAberto(true)} className="w-full py-2.5 rounded-xl border border-dashed border-border text-sm font-medium hover:bg-accent">
          Nova glosa
        </button>
      ))}
      {!aberta && <p className="text-xs text-muted-foreground">O auto está aprovado: as glosas já não podem ser alteradas.</p>}
      {(aviso ?? erroGlosar ?? erroLista) && <p role="alert" className="text-sm text-destructive">{aviso ?? erroGlosar ?? erroLista}</p>}
    </section>
  )
}
