import { useId, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import type { AutoVerificacaoRow, ResultadoVerificacao, WorkflowAuto } from '../../../db'
import { useIniciarVerificacao, useRegistarVerificacao, useVerificacoesAuto, useVerificarAuto } from '../../../hooks/useSubsControlo'

type Props = {
  autoId: string
  workflow: WorkflowAuto
  podeMedir: boolean
  isAdmin: boolean
}

export const RESULTADOS: { valor: ResultadoVerificacao; rotulo: string }[] = [
  { valor: 'pendente', rotulo: 'Por verificar' },
  { valor: 'conforme', rotulo: 'Conforme' },
  { valor: 'nao_conforme', rotulo: 'Não conforme' },
  { valor: 'na', rotulo: 'Não aplicável' },
]

type Rascunho = Record<number, { resultado: ResultadoVerificacao; observacao: string }>

const inicial = (itens: AutoVerificacaoRow[]): Rascunho =>
  Object.fromEntries(itens.map(i => [i.ordem, { resultado: i.resultado, observacao: i.observacao ?? '' }]))

const campo = 'w-full px-3 py-2 bg-input-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary'

export function AutoVerificacao({ autoId, workflow, podeMedir, isAdmin }: Props) {
  const id = useId()
  const { itens, loading, error: erroLista } = useVerificacoesAuto(autoId)
  const { iniciar, loading: aIniciar, error: erroIniciar } = useIniciarVerificacao()
  const { registar, loading: aGuardar, error: erroGuardar } = useRegistarVerificacao()
  const { verificar, loading: aVerificar, error: erroVerificar } = useVerificarAuto()
  const [editado, setEditado] = useState<Rascunho | null>(null)
  const [excecao, setExcecao] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const editavel = workflow === 'submetido' && podeMedir
  const valores = editado ?? inicial(itens)
  const val = (i: AutoVerificacaoRow) => valores[i.ordem] ?? { resultado: i.resultado, observacao: i.observacao ?? '' }
  const pendentes = itens.filter(i => val(i).resultado === 'pendente').length

  if (workflow === 'rascunho') return null

  const mudar = (ordem: number, patch: Partial<Rascunho[number]>) => {
    setOk(null)
    const atual = itens.find(i => i.ordem === ordem)
    if (atual) setEditado({ ...valores, [ordem]: { ...val(atual), ...patch } })
  }

  const guardar = async () => {
    setAviso(null)
    const semObs = itens.find(i => val(i).resultado === 'nao_conforme' && !val(i).observacao.trim())
    if (semObs) { setAviso(`Indique a observação do item não conforme: "${semObs.item}".`); return false }
    const okGuardar = await registar(autoId, itens.map(i => ({
      ordem: i.ordem, resultado: val(i).resultado, observacao: val(i).observacao.trim() || null,
    })))
    if (okGuardar) { setEditado(null); setOk('Ficha de verificação guardada.') }
    return okGuardar
  }

  const concluir = async (comExcecao: boolean) => {
    setAviso(null)
    if (comExcecao && excecao.trim().length < 10) { setAviso('O motivo da exceção tem de ter pelo menos 10 caracteres.'); return }
    if (editado && !(await guardar())) return
    if (await verificar(autoId, comExcecao ? excecao.trim() : null)) { setOk('Auto verificado.'); setExcecao('') }
  }

  const erroServidor = erroLista ?? erroIniciar ?? erroGuardar ?? erroVerificar

  return (
    <section aria-labelledby={`${id}-t`} className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <h2 id={`${id}-t`} className="font-semibold text-sm flex items-center gap-2"><ClipboardCheck className="w-4 h-4" aria-hidden="true" /> Ficha de verificação</h2>
      {loading && <p role="status" className="text-sm text-muted-foreground">A carregar…</p>}

      {!loading && itens.length === 0 && (
        workflow === 'submetido' && podeMedir ? (
          <button type="button" onClick={() => void iniciar(autoId)} disabled={aIniciar}
            className="w-full py-3 rounded-xl border border-primary text-primary font-semibold hover:bg-primary/5 disabled:opacity-60">
            {aIniciar ? 'A iniciar…' : 'Iniciar verificação'}
          </button>
        ) : <p className="text-sm text-muted-foreground">A ficha de verificação ainda não foi iniciada.</p>
      )}

      {itens.length > 0 && (
        <ol className="space-y-3">
          {itens.map(i => {
            const v = val(i)
            return (
              <li key={i.id} className="rounded-xl border border-border p-3 space-y-2">
                <p className="text-sm font-medium">{i.ordem}. {i.item}</p>
                {editavel ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select aria-label={`Resultado: ${i.item}`} value={v.resultado} onChange={e => mudar(i.ordem, { resultado: e.target.value as ResultadoVerificacao })} className={campo}>
                      {RESULTADOS.map(r => <option key={r.valor} value={r.valor}>{r.rotulo}</option>)}
                    </select>
                    <input aria-label={`Observação: ${i.item}`} value={v.observacao} onChange={e => mudar(i.ordem, { observacao: e.target.value })}
                      placeholder={v.resultado === 'nao_conforme' ? 'Observação (obrigatória)' : 'Observação (opcional)'} className={campo} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {RESULTADOS.find(r => r.valor === i.resultado)?.rotulo}{i.observacao ? ` — ${i.observacao}` : ''}
                  </p>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {editavel && itens.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{pendentes > 0 ? `${pendentes} por verificar.` : 'Todos os itens verificados.'}</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button type="button" onClick={() => void guardar()} disabled={aGuardar || !editado}
              className="flex-1 py-2.5 rounded-xl border border-border font-medium hover:bg-accent disabled:opacity-60">
              {aGuardar ? 'A guardar…' : 'Guardar verificação'}
            </button>
            <button type="button" onClick={() => void concluir(false)} disabled={aVerificar}
              className="flex-1 py-2.5 rounded-xl bg-success text-success-foreground font-semibold disabled:opacity-60">
              {aVerificar ? 'A concluir…' : 'Concluir verificação'}
            </button>
          </div>
          {isAdmin && (
            <div className="rounded-xl border border-warning/40 bg-warning/5 p-3 space-y-2">
              <label className="block text-sm">
                Motivo para verificar sem as fotografias mínimas (só administrador)
                <textarea value={excecao} onChange={e => setExcecao(e.target.value)} rows={2} className={`${campo} mt-1`} />
              </label>
              <button type="button" onClick={() => void concluir(true)} disabled={aVerificar}
                className="px-3 py-2 rounded-xl border border-warning text-sm font-medium disabled:opacity-60">
                Verificar com exceção
              </button>
            </div>
          )}
        </div>
      )}

      {ok && <p role="status" className="text-sm text-success">{ok}</p>}
      {(aviso ?? erroServidor) && <p role="alert" className="text-sm text-destructive">{aviso ?? erroServidor}</p>}
    </section>
  )
}
