import { useId, useState } from 'react'
import { Banknote, CircleAlert, FileText, TriangleAlert } from 'lucide-react'
import { fmtEuro } from '@/app/lib/format'
import type { WorkflowAuto } from '../../../db'
import { useMarcarAutoEmAtraso, usePagarAuto, useRegistarFaturaAuto } from '../../../hooks/useSubsControlo'
import { enviarFatura, urlAssinadaFatura } from './autoDados'

export type FaturaGuardada = { numero: string; data?: string; valor?: number; path?: string; nome?: string }

type Props = {
  autoId: string
  subId: string
  workflow: WorkflowAuto
  certificado: number
  aPagar: number
  fatura: FaturaGuardada | null
  estadoPagamento: 'por_pagar' | 'pago' | 'em_atraso'
  dataPagamento?: Date
  referenciaPagamento?: string
  dataVencimento?: string
  bloqueios: string[]
  avisos: string[]
  isAdmin: boolean
  podeGerir: boolean
  hoje: string
}

const campo = 'w-full px-3 py-2.5 bg-input-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary'
const dataPt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('pt-PT')

function FormFatura({ autoId, subId, certificado, hoje, onFeito }: { autoId: string; subId: string; certificado: number; hoje: string; onFeito: () => void }) {
  const { registar, loading, error } = useRegistarFaturaAuto()
  const [numero, setNumero] = useState('')
  const [data, setData] = useState(hoje)
  const [valor, setValor] = useState(String(certificado))
  const [ficheiro, setFicheiro] = useState<File | null>(null)
  const [aEnviar, setAEnviar] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const guardar = async () => {
    const v = Number(valor.replace(',', '.'))
    if (!numero.trim()) { setAviso('Indique o número da fatura.'); return }
    if (!data) { setAviso('Indique a data da fatura.'); return }
    if (!(v > 0)) { setAviso('O valor da fatura tem de ser superior a 0 €.'); return }
    if (!ficheiro) { setAviso('Anexe o ficheiro da fatura (PDF ou fotografia).'); return }
    setAviso(null)
    setAEnviar(true)
    try {
      const { path, nome } = await enviarFatura(subId, ficheiro)
      if (await registar({ autoId, numero: numero.trim(), data, valor: v, path, nome })) onFeito()
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'Não foi possível enviar a fatura.')
    } finally {
      setAEnviar(false)
    }
  }

  return (
    <div className="rounded-xl border border-border p-3 space-y-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block text-sm">Número da fatura<input value={numero} onChange={e => setNumero(e.target.value)} className={`${campo} mt-1`} /></label>
        <label className="block text-sm">Data<input type="date" value={data} onChange={e => setData(e.target.value)} className={`${campo} mt-1`} /></label>
        <label className="block text-sm">Valor sem IVA (€)<input type="number" inputMode="decimal" min="0" step="0.01" value={valor} onChange={e => setValor(e.target.value)} className={`${campo} mt-1`} /></label>
      </div>
      <label className="block text-sm">Ficheiro da fatura (PDF ou fotografia, até 20 MB)
        <input type="file" accept="application/pdf,image/*" onChange={e => setFicheiro(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" />
      </label>
      <button type="button" onClick={() => void guardar()} disabled={loading || aEnviar} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-60">
        {loading || aEnviar ? 'A guardar…' : 'Guardar fatura'}
      </button>
      {(aviso ?? error) && <p role="alert" className="text-sm text-destructive">{aviso ?? error}</p>}
    </div>
  )
}

export function AutoFaturaPagamento(p: Props) {
  const id = useId()
  const { pagar, loading: aPagarLoading, error: erroPagar } = usePagarAuto()
  const { marcar: marcarAtraso, loading: aMarcar, error: erroAtraso } = useMarcarAutoEmAtraso()
  const [formFatura, setFormFatura] = useState(false)
  const [referencia, setReferencia] = useState('')
  const [excecao, setExcecao] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [erroFicheiro, setErroFicheiro] = useState<string | null>(null)

  if (p.workflow !== 'validado') {
    return (
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold text-sm">Fatura e pagamento</h2>
        <p className="text-sm text-muted-foreground mt-1">Disponíveis depois de o auto ser aprovado.</p>
      </section>
    )
  }

  const pago = p.estadoPagamento === 'pago'
  const bloqueado = p.bloqueios.length > 0

  const abrirFatura = async () => {
    if (!p.fatura?.path) return
    setErroFicheiro(null)
    try { window.open(await urlAssinadaFatura(p.fatura.path), '_blank', 'noopener') } catch (e) {
      setErroFicheiro(e instanceof Error ? e.message : 'Não foi possível abrir a fatura.')
    }
  }

  const confirmarPagamento = async () => {
    setAviso(null)
    const comExcecao = bloqueado
    if (comExcecao && excecao.trim().length < 10) { setAviso('O motivo da exceção tem de ter pelo menos 10 caracteres.'); return }
    if (await pagar(p.autoId, referencia.trim() || null, comExcecao ? excecao.trim() : null)) { setReferencia(''); setExcecao('') }
  }

  return (
    <section aria-labelledby={`${id}-t`} className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <h2 id={`${id}-t`} className="font-semibold text-sm flex items-center gap-2"><Banknote className="w-4 h-4" aria-hidden="true" /> Fatura e pagamento</h2>

      <div className="space-y-2">
        <h3 className="text-sm font-medium flex items-center gap-1.5"><FileText className="w-4 h-4" aria-hidden="true" /> Fatura do subempreiteiro</h3>
        <p className="text-xs text-muted-foreground">O ERP não emite faturas: guarda a fatura emitida pelo subempreiteiro. Valores sem IVA.</p>
        {p.fatura ? (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Número</dt><dd className="font-medium">{p.fatura.numero}</dd>
            {p.fatura.data && <><dt className="text-muted-foreground">Data</dt><dd>{dataPt(p.fatura.data)}</dd></>}
            {p.fatura.valor != null && <><dt className="text-muted-foreground">Valor</dt><dd>{fmtEuro(p.fatura.valor)}</dd></>}
            <dt className="text-muted-foreground">Certificado</dt><dd>{fmtEuro(p.certificado)}</dd>
          </dl>
        ) : <p className="text-sm text-muted-foreground">Ainda não foi guardada nenhuma fatura.</p>}
        {p.fatura?.path && (
          <button type="button" onClick={() => void abrirFatura()} className="text-sm font-medium text-primary hover:underline">
            Ver ficheiro{p.fatura.nome ? ` (${p.fatura.nome})` : ''}
          </button>
        )}
        {erroFicheiro && <p role="alert" className="text-sm text-destructive">{erroFicheiro}</p>}
        {p.avisos.map(a => (
          <p key={a} className="flex items-start gap-1.5 text-sm text-warning"><TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" /> {a} (aviso — não impede o pagamento)</p>
        ))}
        {p.podeGerir && !pago && (formFatura
          ? <FormFatura autoId={p.autoId} subId={p.subId} certificado={p.certificado} hoje={p.hoje} onFeito={() => setFormFatura(false)} />
          : <button type="button" onClick={() => setFormFatura(true)} className="w-full py-2.5 rounded-xl border border-dashed border-border text-sm font-medium hover:bg-accent">
              {p.fatura ? 'Substituir fatura' : 'Guardar fatura do subempreiteiro'}
            </button>)}
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <h3 className="text-sm font-medium">Pagamento</h3>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">A pagar</dt><dd className="font-semibold">{fmtEuro(p.aPagar)}</dd>
          {p.dataVencimento && <><dt className="text-muted-foreground">Vencimento</dt><dd>{dataPt(p.dataVencimento)}</dd></>}
          {pago && p.dataPagamento && <><dt className="text-muted-foreground">Pago em</dt><dd>{p.dataPagamento.toLocaleDateString('pt-PT')}</dd></>}
          {pago && p.referenciaPagamento && <><dt className="text-muted-foreground">Referência</dt><dd className="font-mono">{p.referenciaPagamento}</dd></>}
        </dl>
        {pago && <p className="text-sm font-semibold text-success">Pagamento registado.</p>}
        {!pago && p.estadoPagamento === 'em_atraso' && <p className="text-sm text-destructive">Marcado em atraso de pagamento.</p>}

        {!pago && bloqueado && (
          <ul aria-label="Bloqueios do pagamento" className="space-y-1">
            {p.bloqueios.map(b => (
              <li key={b} className="flex items-start gap-1.5 text-sm text-destructive"><CircleAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" /> {b}</li>
            ))}
          </ul>
        )}

        {!pago && p.podeGerir && (
          <div className="space-y-2">
            <label className="block text-sm">Referência do pagamento (opcional)
              <input value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Ex.: transferência 2026-10-02" className={`${campo} mt-1`} />
            </label>
            {bloqueado && p.isAdmin && (
              <label className="block text-sm">Motivo da exceção (só administrador, fica registado)
                <textarea value={excecao} onChange={e => setExcecao(e.target.value)} rows={2} className={`${campo} mt-1`} />
              </label>
            )}
            {bloqueado && !p.isAdmin ? (
              <p className="text-sm text-muted-foreground">Pagamento bloqueado. Resolva o que falta acima ou peça ao administrador uma exceção.</p>
            ) : (
              <button type="button" onClick={() => void confirmarPagamento()} disabled={aPagarLoading}
                className="w-full py-3 rounded-xl bg-success text-success-foreground font-semibold text-sm disabled:opacity-60">
                {aPagarLoading ? 'A registar…' : bloqueado ? 'Pagar com exceção' : 'Marcar como pago'}
              </button>
            )}
            {p.estadoPagamento === 'por_pagar' && (
              <button type="button" onClick={() => void marcarAtraso(p.autoId)} disabled={aMarcar}
                className="w-full py-2.5 rounded-xl border border-destructive/30 text-destructive text-sm font-medium disabled:opacity-60">
                Marcar em atraso
              </button>
            )}
          </div>
        )}
        {(aviso ?? erroPagar ?? erroAtraso) && <p role="alert" className="text-sm text-destructive">{aviso ?? erroPagar ?? erroAtraso}</p>}
      </div>
    </section>
  )
}
