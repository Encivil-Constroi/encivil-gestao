import { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ChevronLeft, Archive, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { useObra, useCriarObra, useAtualizarObra } from '@/features/obras/hooks/useObras';
import type { ObraStatus } from '../types';

// Carregamento lazy do mapa para não impactar o bundle principal
const GeofenceConfig = lazy(() =>
  import('@/features/obras/components/GeofenceConfig').then(m => ({ default: m.GeofenceConfig }))
);

const inputCls = 'w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-base';

// Centro de Lisboa como fallback quando não há localização definida
const DEFAULT_LAT = 38.7223;
const DEFAULT_LON = -9.1399;
const DEFAULT_RAIO = 200;

export function ObraFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const { obra, loading: obraLoading } = useObra(id);
  const { criar, loading: creating } = useCriarObra();
  const { atualizar, loading: updating } = useAtualizarObra();
  const saving = creating || updating;

  const [form, setForm] = useState({
    name: '',
    client: '',
    location: '',
    status: 'ativa' as ObraStatus,
    budget: '',
    notes: '',
  });

  // F5 — Geofence
  const [geofenceAtiva, setGeofenceAtiva] = useState(false);
  const [geofenceLat, setGeofenceLat] = useState(DEFAULT_LAT);
  const [geofenceLon, setGeofenceLon] = useState(DEFAULT_LON);
  const [geofenceRaio, setGeofenceRaio] = useState(DEFAULT_RAIO);

  useEffect(() => {
    if (!isEdit || !obra) return;
    setForm({
      name: obra.name,
      client: obra.client ?? '',
      location: obra.location ?? '',
      status: obra.status,
      budget: obra.budget != null ? String(obra.budget) : '',
      notes: obra.notes ?? '',
    });
    if (obra.geofenceTipo) {
      setGeofenceAtiva(true);
      setGeofenceLat(obra.geofenceCentroLat ?? DEFAULT_LAT);
      setGeofenceLon(obra.geofenceCentroLon ?? DEFAULT_LON);
      setGeofenceRaio(obra.geofenceRaioM ?? DEFAULT_RAIO);
    }
  }, [isEdit, obra]);

  const set = (patch: Partial<typeof form>) => setForm(prev => ({ ...prev, ...patch }));

  // Tenta usar a localização do dispositivo como centro inicial do geofence
  function handleActivateGeofence(on: boolean) {
    setGeofenceAtiva(on);
    if (on && !isEdit && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => { setGeofenceLat(pos.coords.latitude); setGeofenceLon(pos.coords.longitude); },
        () => { /* fallback para Lisboa */ }
      );
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Indique o nome da obra.'); return; }
    const payload = {
      name: form.name.trim(),
      client: form.client,
      location: form.location,
      status: form.status,
      budget: form.budget ? parseFloat(form.budget) : undefined,
      notes: form.notes,
      // Geofence
      geofenceTipo: geofenceAtiva ? ('RAIO' as const) : null,
      geofenceCentroLat: geofenceAtiva ? geofenceLat : undefined,
      geofenceCentroLon: geofenceAtiva ? geofenceLon : undefined,
      geofenceRaioM: geofenceAtiva ? geofenceRaio : undefined,
    };
    const result = isEdit ? await atualizar(id!, payload) : await criar(payload);
    if (result) {
      toast.success(isEdit ? 'Obra atualizada.' : 'Obra criada.');
      navigate('/obras');
    } else {
      toast.error('Não foi possível guardar a obra.');
    }
  };

  const handleArchive = async () => {
    if (!id) return;
    const ok = await atualizar(id, { active: false });
    if (ok) { toast.success('Obra arquivada.'); navigate('/obras'); }
    else toast.error('Não foi possível arquivar.');
  };

  if (isEdit && obraLoading) {
    return <div className="max-w-2xl mx-auto p-8 text-center text-sm text-muted-foreground">A carregar…</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-28">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-accent rounded-lg transition-colors shrink-0">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">{isEdit ? 'Editar Obra' : 'Nova Obra'}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Cadastro de obra da empresa</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Nome da Obra <span className="text-destructive">*</span></label>
            <input type="text" value={form.name} onChange={e => set({ name: e.target.value })} className={inputCls} placeholder="Ex: Moradia em Cascais" required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Cliente <span className="text-muted-foreground font-normal text-xs">(opcional)</span></label>
              <input type="text" value={form.client} onChange={e => set({ client: e.target.value })} className={inputCls} placeholder="Dono da obra" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Estado</label>
              <select value={form.status} onChange={e => set({ status: e.target.value as ObraStatus })} className={inputCls}>
                <option value="ativa">Ativa</option>
                <option value="concluida">Concluída</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Localização <span className="text-muted-foreground font-normal text-xs">(opcional)</span></label>
              <input type="text" value={form.location} onChange={e => set({ location: e.target.value })} className={inputCls} placeholder="Morada / zona" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Orçamento (€) <span className="text-muted-foreground font-normal text-xs">(valor com o cliente)</span></label>
              <input type="number" inputMode="decimal" min="0" step="0.01" value={form.budget} onChange={e => set({ budget: e.target.value })} className={inputCls} placeholder="0.00" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Observações <span className="text-muted-foreground font-normal text-xs">(opcional)</span></label>
            <textarea value={form.notes} onChange={e => set({ notes: e.target.value })} className={`${inputCls} resize-none`} rows={3} />
          </div>
        </div>

        {/* Geofence */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              <span className="font-medium text-sm">Geofence (validação por localização)</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={geofenceAtiva}
              onClick={() => handleActivateGeofence(!geofenceAtiva)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                geofenceAtiva ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${geofenceAtiva ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {geofenceAtiva && (
            <Suspense fallback={
              <div className="h-[280px] rounded-xl bg-muted/50 flex items-center justify-center text-sm text-muted-foreground">
                A carregar mapa…
              </div>
            }>
              <GeofenceConfig
                lat={geofenceLat}
                lon={geofenceLon}
                raioM={geofenceRaio}
                onCentroChange={(lat, lon) => { setGeofenceLat(lat); setGeofenceLon(lon); }}
                onRaioChange={setGeofenceRaio}
              />
            </Suspense>
          )}

          {!geofenceAtiva && (
            <p className="text-xs text-muted-foreground">
              Quando ativo, colaboradores dentro do raio configurado com GPS preciso são automaticamente autorizados ao picar.
            </p>
          )}
        </div>

        <div className="sticky bottom-20 md:bottom-0 py-3 bg-background/80 backdrop-blur-sm md:bg-transparent flex gap-3">
          <button type="submit" disabled={saving} className="flex-1 py-4 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60">
            {saving ? 'A guardar…' : isEdit ? 'Guardar Alterações' : 'Criar Obra'}
          </button>
          {isEdit && (
            <button type="button" onClick={handleArchive} disabled={saving} className="px-4 py-4 bg-secondary/20 text-foreground rounded-xl font-medium hover:bg-secondary/30 transition-all flex items-center gap-2">
              <Archive className="w-4 h-4" /> <span className="hidden sm:inline">Arquivar</span>
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
