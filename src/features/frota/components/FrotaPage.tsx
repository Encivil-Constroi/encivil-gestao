import { Link } from 'react-router'
import { Truck, ListChecks, BellRing, RefreshCw, ChevronRight, User, Gauge } from 'lucide-react'
import { toast } from 'sonner'
import { useRole } from '@/features/auth/useRole'
import { formatarData } from '@/app/lib/prazoFrota'
import { useResumoFrota, useAvaliarFrota } from '../hooks/useFrota'
import { BadgeEstado, botaoSecundario, formatarKm } from './ui'
import type { ResumoViaturaRow } from '../db'

function CartaoViatura({ v }: { v: ResumoViaturaRow }) {
  const semAlertas = v.alertas_urgentes === 0 && v.alertas_atencao === 0
  return (
    <Link to={`/frota/viatura/${v.id}`}
      className={`block bg-card rounded-2xl border p-4 hover:bg-accent/40 transition-colors ${
        v.alertas_urgentes > 0 ? 'border-destructive/40' : 'border-border'}`}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Truck className="w-5 h-5 text-primary" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold truncate">{v.nome}</p>
            <span className="text-xs text-muted-foreground">{v.identificacao ?? v.codigo}</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><User className="w-3.5 h-3.5" aria-hidden="true" />
              {v.condutor_nome ?? 'Sem condutor atribuído'}</span>
            <span className="inline-flex items-center gap-1"><Gauge className="w-3.5 h-3.5" aria-hidden="true" />
              {formatarKm(v.km_atual)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {v.alertas_urgentes > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-destructive/10 text-destructive">
                {v.alertas_urgentes} urgente{v.alertas_urgentes > 1 ? 's' : ''}
              </span>
            )}
            {v.alertas_atencao > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-warning/15 text-warning">
                {v.alertas_atencao} a vencer
              </span>
            )}
            {semAlertas && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">Prazos em dia</span>}
            {v.ultimo_checklist_data && v.ultimo_checklist_estado ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                Checklist {formatarData(v.ultimo_checklist_data)} <BadgeEstado estado={v.ultimo_checklist_estado} />
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Sem checklist</span>
            )}
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 self-center" aria-hidden="true" />
      </div>
    </Link>
  )
}

export function FrotaPage() {
  const { viaturas, loading, error, reload } = useResumoFrota()
  const { podeFrota, isAdmin } = useRole()
  const { avaliar, loading: aAvaliar } = useAvaliarFrota()

  const urgentes = viaturas.reduce((n, v) => n + v.alertas_urgentes, 0)
  const atencao  = viaturas.reduce((n, v) => n + v.alertas_atencao, 0)

  const avaliarAgora = async () => {
    const n = await avaliar()
    if (n !== null) toast.success(n === 0 ? 'Prazos avaliados — nada a vencer.' : `Prazos avaliados — ${n} alerta${n > 1 ? 's' : ''} ativo${n > 1 ? 's' : ''}.`)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-24">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold">Frota</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manutenção, checklists e prazos das viaturas</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {podeFrota && (
            <>
              <button onClick={avaliarAgora} disabled={aAvaliar} className={botaoSecundario}>
                <RefreshCw className={`w-4 h-4 ${aAvaliar ? 'animate-spin' : ''}`} aria-hidden="true" /> Avaliar prazos
              </button>
              <Link to="/frota/catalogo" className={botaoSecundario}>
                <ListChecks className="w-4 h-4" aria-hidden="true" /> Catálogo
              </Link>
            </>
          )}
          {isAdmin && (
            <Link to="/frota/notificacoes" className={botaoSecundario}>
              <BellRing className="w-4 h-4" aria-hidden="true" /> Notificações
            </Link>
          )}
        </div>
      </div>

      {(urgentes > 0 || atencao > 0) && (
        <div className={`rounded-2xl p-4 text-sm font-medium ${urgentes > 0 ? 'bg-destructive/10 text-destructive' : 'bg-warning/15 text-warning'}`}>
          {urgentes > 0 && `${urgentes} prazo${urgentes > 1 ? 's' : ''} urgente${urgentes > 1 ? 's' : ''}`}
          {urgentes > 0 && atencao > 0 && ' · '}
          {atencao > 0 && `${atencao} a vencer em breve`}
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 text-destructive rounded-2xl p-4 text-sm flex items-center justify-between gap-3">
          {error}
          <button onClick={reload} className="underline font-medium">Tentar de novo</button>
        </div>
      )}

      {loading && viaturas.length === 0 ? (
        <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />)}</div>
      ) : viaturas.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground text-center py-10">
          Sem viaturas ativas. As viaturas criam-se em Combustível → Viaturas.
        </p>
      ) : (
        <div className="space-y-3">{viaturas.map(v => <CartaoViatura key={v.id} v={v} />)}</div>
      )}
    </div>
  )
}
