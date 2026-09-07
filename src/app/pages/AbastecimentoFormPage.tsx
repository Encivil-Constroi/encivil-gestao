import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ChevronLeft, Trash2, Droplet } from 'lucide-react';
import { toast } from 'sonner';
import { fmtEuro } from '../lib/format';
import { useRole } from '@/features/auth/useRole';
import { useObras } from '@/features/obras/hooks/useObras';
import { useVeiculos, useAbastecimento, useGuardarAbastecimento, useEliminarAbastecimento } from '@/features/combustivel/hooks/useCombustivel';

const inputCls = 'w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-base';

export function AbastecimentoFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const { nome } = useRole();

  const { vehicles, loading: vLoading } = useVeiculos(true);
  const { obras } = useObras(true);
  const { entry, loading: eLoading } = useAbastecimento(id);
  const { criar, atualizar, loading: saving } = useGuardarAbastecimento();
  const { eliminar, loading: deleting } = useEliminarAbastecimento();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [form, setForm] = useState({
    vehicleId: '',
    obraId: '',
    date: new Date().toISOString().split('T')[0],
    liters: '',
    totalCost: '',
    counter: '',
    location: '',
    responsible: nome,
    notes: '',
  });

  useEffect(() => { if (nome) setForm(p => ({ ...p, responsible: p.responsible || nome })); }, [nome]);

  useEffect(() => {
    if (!isEdit || !entry) return;
    setForm({
      vehicleId: entry.vehicleId,
      obraId: entry.obraId ?? '',
      date: entry.date.toISOString().split('T')[0],
      liters: String(entry.liters),
      totalCost: String(entry.totalCost),
      counter: entry.counter != null ? String(entry.counter) : '',
      location: entry.location ?? '',
      responsible: entry.responsible,
      notes: entry.notes ?? '',
    });
  }, [isEdit, entry]);

  const set = (patch: Partial<typeof form>) => setForm(prev => ({ ...prev, ...patch }));

  const selectedVehicle = vehicles.find(v => v.id === form.vehicleId);
  const pricePerLiter = useMemo(() => {
    const l = parseFloat(form.liters || '0');
    const c = parseFloat(form.totalCost || '0');
    return l > 0 ? c / l : 0;
  }, [form.liters, form.totalCost]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vehicleId) { toast.error('Selecione a viatura/máquina.'); return; }
    const liters = parseFloat(form.liters || '0');
    const cost = parseFloat(form.totalCost || '0');
    if (!(liters > 0))  { toast.error('Indique os litros abastecidos.'); return; }
    if (liters > 9999)  { toast.error('Quantidade de litros demasiado elevada (máx 9 999 L).'); return; }
    if (!(cost >= 0) || form.totalCost === '') { toast.error('Indique o custo total.'); return; }
    if (cost > 99999)   { toast.error('Custo total demasiado elevado (máx 99 999 €).'); return; }

    const payload = {
      vehicleId: form.vehicleId,
      obraId: form.obraId || undefined,
      date: form.date,
      liters,
      totalCost: cost,
      counter: form.counter ? parseFloat(form.counter) : undefined,
      location: form.location || undefined,
      responsible: form.responsible,
      notes: form.notes || undefined,
    };
    const result = isEdit ? await atualizar(id!, payload) : await criar(payload);
    if (result) { toast.success(isEdit ? 'Abastecimento atualizado.' : 'Abastecimento registado.'); navigate('/combustivel'); }
    else toast.error('Não foi possível guardar o abastecimento.');
  };

  const handleDelete = async () => {
    if (!id) return;
    const ok = await eliminar(id);
    if (ok) { toast.success('Abastecimento eliminado.'); navigate('/combustivel'); }
    else toast.error('Não foi possível eliminar.');
  };

  if (isEdit && eLoading) return <div className="max-w-2xl mx-auto p-8 text-center text-sm text-muted-foreground">A carregar…</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-28">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-accent rounded-lg transition-colors shrink-0"><ChevronLeft className="w-5 h-5" /></button>
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">{isEdit ? 'Editar Abastecimento' : 'Novo Abastecimento'}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Registo de combustível</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Viatura / Máquina <span className="text-destructive">*</span></label>
            <select value={form.vehicleId} onChange={e => set({ vehicleId: e.target.value })} className={inputCls} required disabled={vLoading}>
              <option value="">{vLoading ? 'A carregar…' : 'Selecione'}</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.name} ({v.code})</option>)}
            </select>
            {!vLoading && vehicles.length === 0 && <p className="text-xs text-warning mt-1.5">Ainda não há viaturas. Crie uma viatura primeiro.</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Obra <span className="text-muted-foreground font-normal text-xs">(opcional — para imputar o custo)</span></label>
            <select value={form.obraId} onChange={e => set({ obraId: e.target.value })} className={inputCls}>
              <option value="">Sem obra associada</option>
              {obras.filter(o => o.status === 'ativa' || o.id === form.obraId).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Data</label>
              <input type="date" value={form.date} onChange={e => set({ date: e.target.value })} className={inputCls} required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Contador {selectedVehicle ? `(${selectedVehicle.counterUnit})` : ''} <span className="text-muted-foreground font-normal text-xs">(opcional)</span></label>
              <input type="number" inputMode="decimal" min="0" step="0.1" value={form.counter} onChange={e => set({ counter: e.target.value })} className={inputCls} placeholder="Leitura" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Litros <span className="text-destructive">*</span></label>
              <input type="number" inputMode="decimal" min="0" max="9999" step="0.001" value={form.liters} onChange={e => set({ liters: e.target.value })} className={`${inputCls} text-lg font-bold`} placeholder="0" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Custo Total (€) <span className="text-destructive">*</span></label>
              <input type="number" inputMode="decimal" min="0" max="99999" step="0.01" value={form.totalCost} onChange={e => set({ totalCost: e.target.value })} className={`${inputCls} text-lg font-bold`} placeholder="0.00" required />
            </div>
          </div>

          {pricePerLiter > 0 && (
            <div className="flex items-center justify-center gap-2 p-2.5 bg-accent/50 rounded-xl text-sm">
              <Droplet className="w-4 h-4 text-primary" />
              <span className="text-muted-foreground">Preço por litro:</span>
              <strong>{fmtEuro(pricePerLiter)}/L</strong>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Posto <span className="text-muted-foreground font-normal text-xs">(opcional)</span></label>
              <input type="text" value={form.location} onChange={e => set({ location: e.target.value })} className={inputCls} placeholder="Ex: Galp / BP" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Responsável</label>
              <input type="text" value={form.responsible} onChange={e => set({ responsible: e.target.value })} className={inputCls} required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Observações <span className="text-muted-foreground font-normal text-xs">(opcional)</span></label>
            <textarea value={form.notes} onChange={e => set({ notes: e.target.value })} className={`${inputCls} resize-none`} rows={2} />
          </div>
        </div>

        <div className="sticky bottom-20 md:bottom-0 py-3 bg-background/80 backdrop-blur-sm md:bg-transparent flex gap-3">
          <button type="submit" disabled={saving} className="flex-1 py-4 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60">
            {saving ? 'A guardar…' : isEdit ? 'Guardar Alterações' : 'Registar Abastecimento'}
          </button>
          {isEdit && (
            confirmDelete ? (
              <button type="button" onClick={handleDelete} disabled={deleting} className="px-4 py-4 bg-destructive text-destructive-foreground rounded-xl font-medium hover:bg-destructive/90 transition-all flex items-center gap-2 disabled:opacity-60">
                <Trash2 className="w-4 h-4" /> {deleting ? '…' : 'Confirmar'}
              </button>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="px-4 py-4 text-destructive hover:bg-destructive/10 rounded-xl font-medium transition-all flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
              </button>
            )
          )}
        </div>
      </form>
    </div>
  );
}
