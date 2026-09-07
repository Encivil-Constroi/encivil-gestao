import { useNavigate, Link } from 'react-router';
import { Building2, Plus, Pencil, MapPin, User } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { useObras } from '@/features/obras/hooks/useObras';
import { useRole } from '@/features/auth/useRole';

export function ObrasPage() {
  const navigate = useNavigate();
  const { obras, loading } = useObras(true);
  const { podeObras } = useRole();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Obras</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? 'A carregar…' : `${obras.length} obra${obras.length !== 1 ? 's' : ''} ativa${obras.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        {podeObras && (
          <button
            onClick={() => navigate('/obras/nova')}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 active:scale-[0.98] transition-all shrink-0"
          >
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nova Obra</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-card rounded-2xl border border-border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="skeleton h-8 w-8 rounded-lg shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-3.5 w-36" />
                  <div className="skeleton h-3 w-24" />
                </div>
                <div className="skeleton h-5 w-14 rounded-full" />
              </div>
              <div className="skeleton h-3 w-28" />
            </div>
          ))}
        </div>
      ) : obras.length === 0 ? (
        <EmptyState icon={Building2} title="Ainda não há obras" description="Crie a primeira obra para organizar subempreiteiros, medições, stock e ferramentas." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {obras.map(o => (
            <div key={o.id} className="bg-card rounded-2xl border border-border p-4 flex flex-col gap-2 hover:border-primary/40 hover:shadow-sm transition-all">
              <div className="flex items-start justify-between gap-2">
                <Link to={`/obras/${o.id}`} className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="bg-primary/10 rounded-lg p-2 shrink-0"><Building2 className="w-4 h-4 text-primary" /></div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{o.name}</p>
                    <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
                      o.status === 'concluida' ? 'bg-muted text-muted-foreground' : 'bg-success/10 text-success'
                    }`}>
                      {o.status === 'concluida' ? 'Concluída' : 'Ativa'}
                    </span>
                  </div>
                </Link>
                {podeObras && (
                  <button onClick={() => navigate(`/obras/${o.id}/editar`)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors shrink-0">
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
              </div>
              <Link to={`/obras/${o.id}`} className="flex flex-col gap-2">
                {o.client && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5"><User className="w-3.5 h-3.5 shrink-0" /> {o.client}</p>
                )}
                {o.location && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 shrink-0" /> {o.location}</p>
                )}
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
