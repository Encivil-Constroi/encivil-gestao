import { Link } from 'react-router'
import { fmtEuro } from '@/app/lib/format'
import type { SubResumoRow } from '../../db'

const cores = { ok: 'bg-success/10 text-success', atencao: 'bg-warning/10 text-warning', critico: 'bg-destructive/10 text-destructive' }
const nomes = { ok: 'Em dia', atencao: 'Atenção', critico: 'Crítico' }

export function SubResumoLista({ subs }: { subs: SubResumoRow[] }) {
  if (!subs.length) return <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Ainda não há subempreitadas nesta obra.</p>
  return <div className="grid gap-3 md:grid-cols-2">{subs.map(sub => <Link key={sub.sub_id} to={`/obras/subempreitada/${sub.sub_id}`} className="rounded-2xl border border-border bg-card p-4 space-y-3 hover:border-primary/40">
    <div className="flex justify-between items-start gap-3"><div><h3 className="font-semibold">{sub.nome}</h3><p className="text-xs text-muted-foreground">{sub.obra_nome} · {sub.especialidade || 'Sem especialidade'}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${cores[sub.saude]}`}>{nomes[sub.saude]}</span></div>
    <div className="grid grid-cols-2 gap-2 text-sm"><span>Contrato <strong>{fmtEuro(sub.valor_contrato)}</strong></span><span>Executado <strong>{fmtEuro(sub.executado)}</strong></span><span>Progresso <strong>{sub.executado_pct}%</strong></span><span>Ocorrências abertas <strong>{sub.ocorrencias_abertas}</strong></span></div>
    <div className="h-2 rounded-full bg-muted overflow-hidden" role="progressbar" aria-label={`Execução de ${sub.nome}`} aria-valuenow={sub.executado_pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, sub.executado_pct))}%` }} /></div>
    <p className="text-xs text-muted-foreground">{sub.atraso_dias_total} dias de atraso · {sub.tem_contrato ? 'Contrato anexado' : 'Sem contrato anexado'}{sub.data_fim_prevista && ` · Fim previsto ${sub.data_fim_prevista}`}</p>
    {sub.motivos.length > 0 && <p className="text-xs text-warning">{sub.motivos.join(' · ')}</p>}
  </Link>)}</div>
}
