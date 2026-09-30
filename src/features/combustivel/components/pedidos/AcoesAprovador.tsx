import { useState } from 'react'
import { ShieldCheck, XCircle, Ban, CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { PedidoRow } from '../../db'
import { useCancelarPedido, useDecisaoPedido } from '../../hooks/usePedidos'
import { botaoPerigo, botaoSecundario, inputCls } from './ui'

const MOTIVOS_RAPIDOS = ['Já abasteceu há pouco', 'Km incorretos', 'Foto ilegível', 'Use o posto de rua', 'Use a bomba Polo 2']

type Dialogo = null | 'recusar' | 'cancelar'

export function AcoesAprovador({ pedido, compacto = false }: { pedido: PedidoRow; compacto?: boolean }) {
  const { autorizar, recusar, aprovarAntigo, loading, error } = useDecisaoPedido()
  const { cancelar, loading: aCancelar, error: erroCancelar } = useCancelarPedido()
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const [motivo, setMotivo] = useState('')

  const ocupado = loading || aCancelar
  const bombaUsada = pedido.pump_activated_at != null
  const podeRecusar = pedido.estado === 'AGUARDA_AUTORIZACAO' || pedido.estado === 'AGUARDA_APROVACAO'
    || (pedido.estado === 'AUTORIZADO' && !bombaUsada)
  const podeCancelar = pedido.estado === 'AUTORIZADO'

  const aoAutorizar = async () => {
    if (await autorizar(pedido.id)) toast.success(`Autorizado — ${pedido.funcionario_nome} foi avisado.`)
  }
  const aoAprovarAntigo = async () => {
    if (await aprovarAntigo(pedido.id)) toast.success('Abastecimento aprovado e lançado.')
  }
  const aoRecusar = async () => {
    const ok = await recusar(pedido.id, motivo.trim() || null)
    if (ok) { toast.success(`Recusado — ${pedido.funcionario_nome} foi avisado.`); setDialogo(null); setMotivo('') }
  }
  const aoCancelar = async () => {
    if (await cancelar(pedido.id)) { toast.success('Pedido cancelado.'); setDialogo(null) }
  }

  const tamanho = compacto ? 'py-2.5' : 'py-3.5 text-base'

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {pedido.estado === 'AGUARDA_AUTORIZACAO' && (
          <button type="button" onClick={aoAutorizar} disabled={ocupado}
            className={`flex-1 inline-flex items-center justify-center gap-2 ${tamanho} bg-success text-success-foreground rounded-xl text-sm font-bold hover:bg-success/90 active:scale-[0.98] transition-all disabled:opacity-60`}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="w-5 h-5" aria-hidden="true" />}
            Autorizar
          </button>
        )}
        {pedido.estado === 'AGUARDA_APROVACAO' && (
          <button type="button" onClick={aoAprovarAntigo} disabled={ocupado}
            className={`flex-1 inline-flex items-center justify-center gap-2 ${tamanho} bg-success text-success-foreground rounded-xl text-sm font-bold disabled:opacity-60`}>
            <CheckCircle2 className="w-5 h-5" aria-hidden="true" /> Aprovar registo
          </button>
        )}
        {podeRecusar && (
          <button type="button" onClick={() => setDialogo('recusar')} disabled={ocupado} className={`flex-1 ${botaoPerigo} ${tamanho}`}>
            <XCircle className="w-5 h-5" aria-hidden="true" /> Recusar
          </button>
        )}
        {podeCancelar && (
          <button type="button" onClick={() => setDialogo('cancelar')} disabled={ocupado} className={`${botaoSecundario} ${tamanho}`}>
            <Ban className="w-4 h-4" aria-hidden="true" /> Cancelar
          </button>
        )}
      </div>
      {(error || erroCancelar) && <p role="alert" className="text-sm text-destructive">{error || erroCancelar}</p>}

      {dialogo && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4" role="dialog" aria-modal="true"
          aria-labelledby="dialogo-titulo">
          <div className="bg-card rounded-2xl p-5 max-w-sm w-full shadow-xl space-y-4">
            {dialogo === 'recusar' ? (
              <>
                <div>
                  <p id="dialogo-titulo" className="font-semibold text-base">Recusar o pedido de {pedido.funcionario_nome}?</p>
                  <p className="text-sm text-muted-foreground">O motorista recebe o motivo no telemóvel.</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {MOTIVOS_RAPIDOS.map(m => (
                    <button key={m} type="button" onClick={() => setMotivo(m)}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${motivo === m ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent'}`}>
                      {m}
                    </button>
                  ))}
                </div>
                <label className="block">
                  <span className="text-sm font-medium">Motivo <span className="text-muted-foreground font-normal">(opcional)</span></span>
                  <textarea value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={200} rows={2} className={`${inputCls} mt-1.5`} />
                </label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setDialogo(null)} className={`flex-1 ${botaoSecundario}`}>Voltar</button>
                  <button type="button" onClick={aoRecusar} disabled={ocupado}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-3 bg-destructive text-destructive-foreground rounded-xl text-sm font-semibold disabled:opacity-60">
                    {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />} Recusar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p id="dialogo-titulo" className="font-semibold text-base">Cancelar este pedido?</p>
                  <p className="text-sm text-muted-foreground">
                    {bombaUsada ? 'A bomba já foi usada: se ainda estiver ligada, desliga. Nada é lançado nos abastecimentos.' : 'O motorista deixa de poder abastecer com este pedido.'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setDialogo(null)} className={`flex-1 ${botaoSecundario}`}>Voltar</button>
                  <button type="button" onClick={aoCancelar} disabled={ocupado}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-3 bg-destructive text-destructive-foreground rounded-xl text-sm font-semibold disabled:opacity-60">
                    {aCancelar && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />} Cancelar pedido
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
