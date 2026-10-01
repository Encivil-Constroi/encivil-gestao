import { Link } from 'react-router'
import { MapPin, Users, Truck, Wrench, HardHat, AlertTriangle, CalendarClock, ClipboardList } from 'lucide-react'
import { fmtEuro, fmtData } from '@/app/lib/format'
import type { ObraResumoRow } from '../db'
import { ROTULO_FONTE, textoDesvio, textoPrazo, estadoPrazo, percentagemOrcamento, estadoOrcamento, textoUltimoRelatorio } from '../lib/progresso'
import { SaudeBadge, EstadoBadge, ProgressoAnel, Barra } from './ui'

const COR_ORCAMENTO = { ok: 'bg-primary', perto: 'bg-warning', excedido: 'bg-destructive', sem_orcamento: 'bg-muted' } as const
const COR_PRAZO = { folga: 'text-muted-foreground', curto: 'text-warning', vencido: 'text-destructive', sem_prazo: 'text-muted-foreground' } as const

function Contagem({ Icone, valor, rotulo }: { Icone: typeof Users; valor: number; rotulo: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={rotulo}>
      <Icone className="w-3.5 h-3.5" aria-hidden="true" />
      <span className="font-semibold text-foreground">{valor}</span>
      <span className="sr-only">{rotulo}</span>
    </span>
  )
}

export function ObraCard({ obra: o }: { obra: ObraResumoRow }) {
  const desvio = textoDesvio(o.progresso_pct, o.progresso_esperado_pct)
  const pOrc = percentagemOrcamento(Number(o.custo_total), o.orcamento)
  const estOrc = estadoOrcamento(Number(o.custo_total), o.orcamento)
  const prazo = estadoPrazo(o.data_prevista_fim)

  return (
    <Link to={`/obras/${o.obra_id}`} aria-label={`Abrir obra ${o.nome}`}
      className="bg-card rounded-2xl border border-border p-4 flex flex-col gap-3 hover:border-primary/40 hover:shadow-sm active:scale-[0.99] transition-all">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate">{o.nome}</p>
          {(o.cliente || o.localizacao || o.morada) && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 min-w-0">
              <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{[o.cliente, o.localizacao ?? o.morada].filter(Boolean).join(' · ')}</span>
            </p>
          )}
        </div>
        <SaudeBadge saude={o.saude} />
      </div>

      <div className="flex items-center gap-4">
        <ProgressoAnel pct={o.progresso_pct} esperado={o.progresso_esperado_pct} saude={o.saude} />
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <p className="text-xs text-muted-foreground">
            {o.progresso_esperado_pct != null ? `Previsto: ${Math.round(o.progresso_esperado_pct)}%` : 'Sem previsto (falta data de início ou fim)'}
          </p>
          {desvio && <p className="text-xs font-medium">{desvio}</p>}
          <p className="text-[11px] text-muted-foreground">{ROTULO_FONTE[o.progresso_fonte]}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className={`flex items-center gap-1 font-medium ${COR_PRAZO[prazo]}`}>
            <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" /> {textoPrazo(o.data_prevista_fim)}
          </span>
          {o.data_prevista_fim && <span className="text-muted-foreground">até {fmtData(o.data_prevista_fim)}</span>}
        </div>
        <Barra pct={pOrc} cor={COR_ORCAMENTO[estOrc]} rotulo={pOrc == null ? 'Sem orçamento' : `Orçamento gasto: ${pOrc} por cento`} />
        <p className="text-xs text-muted-foreground">
          {o.orcamento != null && o.orcamento > 0
            ? <>Custo <span className="font-semibold text-foreground">{fmtEuro(Number(o.custo_total))}</span> de {fmtEuro(o.orcamento)} ({pOrc}%)</>
            : <>Custo <span className="font-semibold text-foreground">{fmtEuro(Number(o.custo_total))}</span> · sem orçamento definido</>}
        </p>
      </div>

      {o.motivos.length > 0 && (
        <ul className="text-xs space-y-0.5">
          {o.motivos.slice(0, 2).map(m => (
            <li key={m} className="flex items-start gap-1.5 text-muted-foreground">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" /> {m}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-border">
        <Contagem Icone={Users} valor={o.equipa_n} rotulo="Pessoas na equipa" />
        <Contagem Icone={Truck} valor={o.viaturas_n} rotulo="Viaturas e máquinas" />
        <Contagem Icone={Wrench} valor={o.ferramentas_n} rotulo="Ferramentas emprestadas" />
        <Contagem Icone={HardHat} valor={o.subs_n} rotulo="Subempreitadas" />
        <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
          <ClipboardList className="w-3 h-3" aria-hidden="true" /> {textoUltimoRelatorio(o.dias_sem_relatorio, o.ultimo_relatorio)}
        </span>
      </div>
      {o.ocorrencias_abertas > 0 && (
        <p className="text-xs font-semibold text-warning flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
          {o.ocorrencias_abertas} ocorrência{o.ocorrencias_abertas > 1 ? 's' : ''} aberta{o.ocorrencias_abertas > 1 ? 's' : ''}
        </p>
      )}
    </Link>
  )
}

export function ObraLinha({ obra: o }: { obra: ObraResumoRow }) {
  return (
    <Link to={`/obras/${o.obra_id}`}
      className="bg-card rounded-xl border border-border px-4 py-3 flex items-center gap-3 hover:border-primary/40 transition-colors">
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{o.nome}</p>
        <p className="text-xs text-muted-foreground truncate">{[o.cliente, o.localizacao ?? o.morada].filter(Boolean).join(' · ') || 'Sem cliente nem localização'}</p>
      </div>
      <EstadoBadge estado={o.estado} />
    </Link>
  )
}
