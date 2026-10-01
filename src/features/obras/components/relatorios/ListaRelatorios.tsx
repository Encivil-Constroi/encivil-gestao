import { Link } from 'react-router'
import { AlertTriangle, Camera, Users } from 'lucide-react'
import type { RelatorioListaRow } from '../../db'
import { rotuloClima } from '../../lib/clima'

export function ListaRelatorios({ relatorios }: { relatorios: RelatorioListaRow[] }) {
  if (relatorios.length === 0) return <p className="text-sm text-muted-foreground py-8 text-center">Sem relatórios para os filtros escolhidos.</p>
  return <div className="space-y-3">{relatorios.map(r => <Link key={r.id} to={`/obras/relatorio-diario/${r.id}`}
    className="block rounded-2xl border border-border bg-card p-4 hover:border-primary/40 transition-colors">
    <div className="flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <strong className="text-sm">{new Date(`${r.data}T12:00:00`).toLocaleDateString('pt-PT')}</strong>
          <span className="text-sm text-muted-foreground">{r.obra_nome}</span>
          <span className={`text-xs rounded-full px-2 py-0.5 ${r.estado === 'submetido' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
            {r.estado === 'submetido' ? 'Submetido' : 'Rascunho'}
          </span>
        </div>
        <p className="text-sm mt-1 line-clamp-2">{r.trabalhos || 'Sem trabalhos descritos'}</p>
        <p className="text-xs text-muted-foreground mt-2">{r.autor_nome || 'Autor desconhecido'} · {rotuloClima(r.clima)}</p>
      </div>
      {r.houve_ocorrencias && <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive" title="Com ocorrências"><AlertTriangle className="w-4 h-4" /> Ocorrências</span>}
    </div>
    <div className="flex gap-4 mt-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" />{r.n_equipa} presentes</span><span className="inline-flex items-center gap-1"><Camera className="w-3.5 h-3.5" />{r.n_fotos} fotos</span></div>
  </Link>)}</div>
}
