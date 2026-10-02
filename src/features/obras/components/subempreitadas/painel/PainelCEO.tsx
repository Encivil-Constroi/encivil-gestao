import { FileWarning, Wallet } from 'lucide-react'
import { fmtEuro } from '@/app/lib/format'
import { useFluxoCaixaSubs, usePainelCeo } from '../../../hooks/useSubsControlo'
import { Seccao } from '../../ui'
import { AlertasSubs } from './AlertasSubs'
import { FluxoCaixaSubs } from './FluxoCaixaSubs'
import { KpisSubs } from './KpisSubs'
import { TabelaSubs } from './TabelaSubs'

export function PainelCEO({ obraId = null }: { obraId?: string | null }) {
  const { painel, loading, error, reload } = usePainelCeo(obraId)
  const fluxoHook = useFluxoCaixaSubs(obraId, 12)

  if (loading && !painel) return <p role="status" className="text-sm text-muted-foreground">A carregar o painel de subempreitadas…</p>
  if (error) return <p role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">{error} <button type="button" onClick={reload} className="underline">Tentar de novo</button></p>
  if (!painel) return null

  const { totais, por_sub, passivo_documental: passivo, alertas } = painel
  return (
    <div className="space-y-4" aria-label="Painel de controlo das subempreitadas">
      <KpisSubs totais={totais} />
      {passivo.subs_com_pendencia > 0 && (
        <div role="note" className="flex items-start gap-2 rounded-2xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <p>
            <strong>Passivo documental:</strong> {passivo.subs_com_pendencia} {passivo.subs_com_pendencia === 1 ? 'subempreiteiro com documentos em falta ou expirados' : 'subempreiteiros com documentos em falta ou expirados'},
            com {fmtEuro(passivo.valor_por_pagar_em_risco)} por pagar em risco.
          </p>
        </div>
      )}
      <Seccao titulo="Alertas"><AlertasSubs alertas={alertas} /></Seccao>
      <Seccao titulo="Por subempreiteiro"><TabelaSubs subs={por_sub} /></Seccao>
      <Seccao titulo="Fluxo de caixa · 12 semanas" icone={<Wallet className="h-4 w-4" aria-hidden="true" />}>
        {fluxoHook.loading && !fluxoHook.fluxo.length ? <p role="status" className="text-sm text-muted-foreground">A carregar o fluxo de caixa…</p>
          : fluxoHook.error ? <p role="alert" className="text-sm">{fluxoHook.error} <button type="button" onClick={fluxoHook.reload} className="underline">Tentar de novo</button></p>
          : <FluxoCaixaSubs fluxo={fluxoHook.fluxo} />}
      </Seccao>
    </div>
  )
}
