import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ChevronLeft, Archive, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { VEHICLE_TYPES, FUEL_TYPES, COUNTER_UNITS } from '@/features/combustivel/labels';
import { useVeiculo, useGuardarVeiculo } from '@/features/combustivel/hooks/useCombustivel';
import { gerarCodigoVeiculoPreview } from '@/features/combustivel/services/veiculosService';
import type { VehicleType, FuelType, CounterUnit } from '../types';

const inputCls = 'w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-base';

export function VeiculoFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const { vehicle, loading } = useVeiculo(id);
  const { criar, atualizar, loading: saving } = useGuardarVeiculo();
  const [codigoPreview, setCodigoPreview] = useState<string>('');

  const [form, setForm] = useState({
    name: '',
    type: 'viatura' as VehicleType,
    identification: '',
    fuelType: 'gasoleo' as FuelType,
    counterUnit: 'km' as CounterUnit,
    notes: '',
    // manutenção preventiva
    proximaRevisaoKm: '',
    proximaRevisaoData: '',
    intervaloRevisaoKm: '',
    intervaloRevisaoMeses: '',
    dataFimSeguro: '',
    dataProximaIpo: '',
  });

  useEffect(() => {
    if (isEdit) return;
    gerarCodigoVeiculoPreview().then(setCodigoPreview).catch(() => {});
  }, [isEdit]);

  useEffect(() => {
    if (!isEdit || !vehicle) return;
    const toDateStr = (d?: Date) => d ? d.toISOString().split('T')[0] : '';
    setForm({
      name: vehicle.name,
      type: vehicle.type,
      identification: vehicle.identification ?? '',
      fuelType: vehicle.fuelType,
      counterUnit: vehicle.counterUnit,
      notes: vehicle.notes ?? '',
      proximaRevisaoKm: vehicle.proximaRevisaoKm?.toString() ?? '',
      proximaRevisaoData: toDateStr(vehicle.proximaRevisaoData),
      intervaloRevisaoKm: vehicle.intervaloRevisaoKm?.toString() ?? '',
      intervaloRevisaoMeses: vehicle.intervaloRevisaoMeses?.toString() ?? '',
      dataFimSeguro: toDateStr(vehicle.dataFimSeguro),
      dataProximaIpo: toDateStr(vehicle.dataProximaIpo),
    });
  }, [isEdit, vehicle]);

  const set = (patch: Partial<typeof form>) => setForm(prev => ({ ...prev, ...patch }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Indique o nome da viatura/máquina.'); return; }
    const payload = {
      name: form.name.trim(),
      type: form.type,
      identification: form.identification || undefined,
      fuelType: form.fuelType,
      counterUnit: form.counterUnit,
      notes: form.notes || undefined,
      proximaRevisaoKm: form.proximaRevisaoKm ? Number(form.proximaRevisaoKm) : undefined,
      proximaRevisaoData: form.proximaRevisaoData || undefined,
      intervaloRevisaoKm: form.intervaloRevisaoKm ? Number(form.intervaloRevisaoKm) : undefined,
      intervaloRevisaoMeses: form.intervaloRevisaoMeses ? Number(form.intervaloRevisaoMeses) : undefined,
      dataFimSeguro: form.dataFimSeguro || undefined,
      dataProximaIpo: form.dataProximaIpo || undefined,
    };
    const result = isEdit ? await atualizar(id!, payload) : await criar(payload);
    if (result) { toast.success(isEdit ? 'Viatura atualizada.' : 'Viatura criada.'); navigate('/combustivel'); }
    else toast.error('Não foi possível guardar.');
  };

  const handleArchive = async () => {
    if (!id) return;
    const ok = await atualizar(id, { active: false });
    if (ok) { toast.success('Viatura arquivada.'); navigate('/combustivel'); }
    else toast.error('Não foi possível arquivar.');
  };

  if (isEdit && loading) return <div className="max-w-2xl mx-auto p-8 text-center text-sm text-muted-foreground">A carregar…</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-28">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-accent rounded-lg transition-colors shrink-0"><ChevronLeft className="w-5 h-5" /></button>
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">{isEdit ? 'Editar Viatura' : 'Nova Viatura / Máquina'}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{isEdit ? vehicle?.code : (codigoPreview ? `Código: ${codigoPreview}` : 'Registo de equipamento')}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Nome <span className="text-destructive">*</span></label>
            <input type="text" value={form.name} onChange={e => set({ name: e.target.value })} className={inputCls} placeholder="Ex: Camião Volvo / Giratória CAT" required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Tipo</label>
              <select value={form.type} onChange={e => set({ type: e.target.value as VehicleType })} className={inputCls}>
                {VEHICLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Matrícula / Nº série <span className="text-muted-foreground font-normal text-xs">(opcional)</span></label>
              <input type="text" value={form.identification} onChange={e => set({ identification: e.target.value })} className={inputCls} placeholder="00-AA-00" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Combustível</label>
              <select value={form.fuelType} onChange={e => set({ fuelType: e.target.value as FuelType })} className={inputCls}>
                {FUEL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Contador</label>
              <select value={form.counterUnit} onChange={e => set({ counterUnit: e.target.value as CounterUnit })} className={inputCls}>
                {COUNTER_UNITS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Observações <span className="text-muted-foreground font-normal text-xs">(opcional)</span></label>
            <textarea value={form.notes} onChange={e => set({ notes: e.target.value })} className={`${inputCls} resize-none`} rows={2} />
          </div>
        </div>

        {/* ── Manutenção Preventiva ─────────────────────────────── */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Wrench className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">Manutenção Preventiva</h2>
            <span className="text-xs text-muted-foreground">(opcional — alimenta o motor de alertas)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Próxima revisão — km alvo</label>
              <input
                type="number" min="0" step="100"
                value={form.proximaRevisaoKm}
                onChange={e => set({ proximaRevisaoKm: e.target.value })}
                className={inputCls} placeholder="Ex: 250000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Próxima revisão — data</label>
              <input
                type="date"
                value={form.proximaRevisaoData}
                onChange={e => set({ proximaRevisaoData: e.target.value })}
                className={inputCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Intervalo revisão (km)</label>
              <input
                type="number" min="0" step="100"
                value={form.intervaloRevisaoKm}
                onChange={e => set({ intervaloRevisaoKm: e.target.value })}
                className={inputCls} placeholder="Ex: 15000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Intervalo revisão (meses)</label>
              <input
                type="number" min="0" max="60"
                value={form.intervaloRevisaoMeses}
                onChange={e => set({ intervaloRevisaoMeses: e.target.value })}
                className={inputCls} placeholder="Ex: 12"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Validade do Seguro</label>
              <input
                type="date"
                value={form.dataFimSeguro}
                onChange={e => set({ dataFimSeguro: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Próxima IPO</label>
              <input
                type="date"
                value={form.dataProximaIpo}
                onChange={e => set({ dataProximaIpo: e.target.value })}
                className={inputCls}
              />
            </div>
          </div>
        </div>

        <div className="sticky bottom-20 md:bottom-0 py-3 bg-background/80 backdrop-blur-sm md:bg-transparent flex gap-3">
          <button type="submit" disabled={saving} className="flex-1 py-4 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60">
            {saving ? 'A guardar…' : isEdit ? 'Guardar Alterações' : 'Criar Viatura'}
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
