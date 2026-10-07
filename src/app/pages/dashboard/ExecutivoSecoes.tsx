import { Link } from 'react-router'
import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardCheck, Building2, ShieldAlert } from 'lucide-react'
import { fmtEuro } from '@/app/lib/format'
import type { ItemAtencao } from '@/app/lib/relatorios/atencao'
import { consumoOrcamentoPct, type Decisao } from '@/app/lib/dashboard/resumo'
import type { ObraResumoRow } from '@/features/obras/db'

const GRAV = { alta: 'bg-destructive', media: 'bg-warning', baixa: 'bg-muted-foreground' } as const
const ROTULO = { alta: 'Alta', media: 'Média', baixa: 'Baixa' } as const

function Caixa({ titulo, icone: Icone, extra, children }: { titulo: string; icone: React.ComponentType<{ className?: string }>; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-card rounded-xl border border-border enc-fade-up">
      <div className="p-4 border-b border-border flex items-center justify-between gap-2">
        <h2 className="font-semibold text-base flex items-center gap-2"><Icone className="w-4 h-4 text-primary" /> {titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  )
}

const Vazio = ({ texto }: { texto: string }) => (
  <p className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
    <CheckCircle2 className="w-4 h-4 text-success" /> {texto}
  </p>
)

export function AvisoIncompleto({ modulos, onRetry }: { modulos: string[]; onRetry: () => void }) {
  if (modulos.length === 0) return null
  return (
    <div className="rounded-xl border border-warning/40 bg-card p-4 text-sm flex items-start gap-3" role="alert">
      <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
      <p className="flex-1"><strong>Dados incompletos.</strong> Não foi possível carregar: {modulos.join(', ')}. Os valores desses módulos não estão incluídos.</p>
      <button onClick={onRetry} className="px-3 py-1.5 rounded-lg border border-border hover:bg-accent shrink-0">Tentar de novo</button>
    </div>
  )
}

export function PainelDecisoes({ itens }: { itens: Decisao[] }) {
  const total = itens.reduce((s, d) => s + d.n, 0)
  return (
    <Caixa
      titulo="Requer a sua decisão" icone={ClipboardCheck}
      extra={total > 0 ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-warning/15 text-warning">{total}</span> : undefined}
    >
      {itens.length === 0 ? <Vazio texto="Nada pendente." /> : (
        <ul className="divide-y divide-border">
          {itens.map(d => (
            <li key={d.id}>
              <Link to={d.to} className="px-4 py-3 flex items-center gap-3 text-sm hover:bg-accent/40 transition-colors">
                <span className="flex-1">{d.texto}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Caixa>
  )
}

export function PainelAtencao({ itens, limite = 8 }: { itens: ItemAtencao[]; limite?: number }) {
  const visiveis = itens.slice(0, limite)
  return (
    <Caixa
      titulo="Requer atenção" icone={ShieldAlert}
      extra={<Link to="/relatorios" className="text-sm text-primary hover:underline flex items-center gap-1">Relatórios <ChevronRight className="w-4 h-4" /></Link>}
    >
      {visiveis.length === 0 ? <Vazio texto="Nada a requerer atenção nos módulos carregados." /> : (
        <>
          <ul className="divide-y divide-border">
            {visiveis.map(i => (
              <li key={i.id}>
                <Link to={i.to} className="px-4 py-3 flex items-center gap-3 text-sm hover:bg-accent/40 transition-colors">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${GRAV[i.gravidade]}`} role="img" aria-label={`Gravidade ${ROTULO[i.gravidade]}`} />
                  <span className="text-xs font-semibold text-muted-foreground w-24 shrink-0">{i.modulo}</span>
                  <span className="flex-1 min-w-0">{i.texto}</span>
                </Link>
              </li>
            ))}
          </ul>
          {itens.length > limite && (
            <p className="px-4 py-3 border-t border-border text-xs text-muted-foreground">+{itens.length - limite} no relatório executivo</p>
          )}
        </>
      )}
    </Caixa>
  )
}

export function ObrasEmRisco({ obras }: { obras: ObraResumoRow[] }) {
  return (
    <Caixa
      titulo="Obras em risco" icone={Building2}
      extra={<Link to="/obras" className="text-sm text-primary hover:underline flex items-center gap-1">Ver obras <ChevronRight className="w-4 h-4" /></Link>}
    >
      {obras.length === 0 ? <Vazio texto="Nenhuma obra em risco." /> : (
        <ul className="divide-y divide-border">
          {obras.map(o => {
            const pct = consumoOrcamentoPct(o)
            const estouro = pct != null && pct > 100
            return (
              <li key={o.obra_id}>
                <Link to={`/obras/${o.obra_id}`} className="px-4 py-3 flex items-center gap-3 hover:bg-accent/40 transition-colors">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${o.saude === 'critico' || estouro ? 'bg-destructive' : 'bg-warning'}`} aria-hidden />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{o.nome}</p>
                    <p className="text-xs text-muted-foreground truncate">{o.motivos?.[0] ?? (estouro ? 'Custo acima do orçamento' : 'Requer atenção')}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-semibold ${estouro ? 'text-destructive' : ''}`}>{pct != null ? `${pct}%` : '—'}</p>
                    <p className="text-xs text-muted-foreground">{fmtEuro(Number(o.custo_total))}</p>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Caixa>
  )
}
