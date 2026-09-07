import { useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { HardHat, Plus, CheckCircle2, FileEdit, Phone } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { SkeletonList } from '../components/Skeletons';
import { fmtEuro } from '../lib/format';
import { useSubempreiteiros } from '@/features/subempreiteiros/hooks/useSubempreiteiros';
import { useObras } from '@/features/obras/hooks/useObras';
import { useRole } from '@/features/auth/useRole';

export function SubempreiteirosPage() {
  const navigate = useNavigate();
  const { obras } = useObras(true);
  const { podeSubempreitadas } = useRole();
  const [searchParams] = useSearchParams();
  const [obraFilter, setObraFilter] = useState<string>(searchParams.get('obra') ?? '');
  const { subs, loading } = useSubempreiteiros(obraFilter || undefined);

  const totalAcordado = useMemo(() => subs.reduce((s, x) => s + x.agreedValue, 0), [subs]);

  const selectCls = 'px-3 py-2.5 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Subempreiteiros</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? 'A carregar…' : `${subs.length} contrataç${subs.length !== 1 ? 'ões' : 'ão'} · ${fmtEuro(totalAcordado)} acordado`}
          </p>
        </div>
        {podeSubempreitadas && (
          <button
            onClick={() => navigate('/subempreiteiros/novo')}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 active:scale-[0.98] transition-all shrink-0"
          >
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nova Contratação</span>
          </button>
        )}
      </div>

      <div className="bg-card rounded-2xl border border-border p-4">
        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Filtrar por obra</label>
        <select value={obraFilter} onChange={e => setObraFilter(e.target.value)} className={`${selectCls} w-full sm:w-auto min-w-[220px]`}>
          <option value="">Todas as obras</option>
          {obras.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>

      {loading ? (
        <SkeletonList rows={5} cols={4} />
      ) : subs.length === 0 ? (
        <EmptyState
          icon={HardHat}
          title="Ainda não há contratações"
          description="Registe a contratação de um subempreiteiro para uma obra, com o valor acordado."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {subs.map(s => (
            <Link
              key={s.id}
              to={`/subempreiteiros/${s.id}`}
              className="bg-card rounded-2xl border border-border p-4 hover:border-primary/40 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.obraName ?? '—'}</p>
                </div>
                {s.status === 'validado' ? (
                  <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-success/10 text-success shrink-0">
                    <CheckCircle2 className="w-3 h-3" /> Validado
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-warning/10 text-warning shrink-0">
                    <FileEdit className="w-3 h-3" /> Rascunho
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground flex items-center gap-3">
                  <span className="px-1.5 py-0.5 rounded bg-muted font-medium">
                    {s.type === 'global' ? 'Preço fechado' : 'Preços unitários'}
                  </span>
                  {s.contact && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {s.contact}</span>}
                </div>
                <span className="font-bold text-sm">{fmtEuro(s.agreedValue)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
