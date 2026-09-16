import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ChevronLeft, Plus, Trash2, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { fmtEuro, fmtNumber, UNIDADES_OBRA } from '../lib/format';
import { useSubempreiteiro } from '@/features/subempreiteiros/hooks/useSubempreiteiros';
import { useAutos, useAuto, useGuardarAuto } from '@/features/autos/hooks/useAutos';
import type { LinhaInput } from '@/features/autos/services/autosService';

type ExtraLinha = { id: string; description: string; unit: string; unitPrice: string; quantity: string };

function novaExtra(): ExtraLinha {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { id, description: '', unit: 'un', unitPrice: '', quantity: '' };
}

const inputCls = 'w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-base';
const smallInput = 'w-full px-2 py-2 bg-input-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary';

export function AutoFormPage() {
  const navigate = useNavigate();
  const params = useParams();
  const autoId = params.autoId;
  const isEdit = !!autoId;

  const { auto, loading: autoLoading } = useAuto(autoId);
  const subId = isEdit ? auto?.subcontractorId : params.subId;
  const { sub, loading: subLoading } = useSubempreiteiro(subId);
  const { autos } = useAutos(subId);
  const { criar, atualizar, loading: saving } = useGuardarAuto();

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [percentagem, setPercentagem] = useState('');
  const [notes, setNotes] = useState('');
  // quantidades por artigo (tipo unitário): artigoId -> quantidade string
  const [qtds, setQtds] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<ExtraLinha[]>([]);

  // Já medido antes (autos validados anteriores), por artigo — ajuda a não medir a mais.
  const jaMedido = useMemo(() => {
    const map: Record<string, number> = {};
    autos
      .filter(a => a.status === 'validado' && a.id !== autoId)
      .forEach(a => (a.lines ?? []).forEach(l => {
        if (l.itemId) map[l.itemId] = (map[l.itemId] ?? 0) + l.quantity;
      }));
    return map;
  }, [autos, autoId]);

  // Preenche ao editar
  useEffect(() => {
    if (!isEdit || !auto) return;
    if (auto.status === 'validado') {
      toast.error('Este auto está validado e não pode ser editado.');
      navigate(`/autos/${auto.id}`);
      return;
    }
    setDate(auto.date.toISOString().split('T')[0]);
    setPercentagem(auto.periodPercentage != null ? String(auto.periodPercentage) : '');
    setNotes(auto.notes ?? '');
    const q: Record<string, string> = {};
    const ex: ExtraLinha[] = [];
    (auto.lines ?? []).forEach(l => {
      if (l.isExtra) ex.push({ id: l.id, description: l.description, unit: l.unit, unitPrice: String(l.unitPrice), quantity: String(l.quantity) });
      else if (l.itemId) q[l.itemId] = String(l.quantity);
    });
    setQtds(q);
    if (ex.length) setExtras(ex);
  }, [isEdit, auto, navigate]);

  const isGlobal = sub?.type === 'global';

  const baseValue = useMemo(() => {
    if (!sub) return 0;
    if (sub.type === 'global') {
      const pct = parseFloat(percentagem || '0') || 0;
      return (pct / 100) * sub.agreedValue;
    }
    return (sub.items ?? []).reduce((total, it) => {
      const q = parseFloat(qtds[it.id] || '0') || 0;
      return total + q * it.unitPrice;
    }, 0);
  }, [sub, percentagem, qtds]);

  const extrasValue = useMemo(() =>
    extras.reduce((t, e) => t + (parseFloat(e.unitPrice || '0') || 0) * (parseFloat(e.quantity || '0') || 0), 0),
  [extras]);

  const periodValue = baseValue + extrasValue;

  const setExtra = (id: string, patch: Partial<ExtraLinha>) =>
    setExtras(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sub) return;
    if (sub.type === 'global' && (!percentagem || parseFloat(percentagem) <= 0)) {
      toast.error('Indique a percentagem executada no período.'); return;
    }

    const lines: LinhaInput[] = [];
    if (sub.type === 'unitario') {
      (sub.items ?? []).forEach(it => {
        const q = parseFloat(qtds[it.id] || '0') || 0;
        if (q > 0) lines.push({ itemId: it.id, description: it.description, unit: it.unit, unitPrice: it.unitPrice, quantity: q });
      });
    }
    extras.forEach(ex => {
      const q = parseFloat(ex.quantity || '0') || 0;
      const p = parseFloat(ex.unitPrice || '0') || 0;
      if (ex.description.trim() && q > 0) lines.push({ description: ex.description.trim(), unit: ex.unit, unitPrice: p, quantity: q, isExtra: true });
    });

    if (periodValue <= 0) { toast.error('O auto está a zero. Preencha as medições.'); return; }

    const payload = {
      date,
      periodPercentage: sub.type === 'global' ? (parseFloat(percentagem || '0') || 0) : undefined,
      periodValue,
      notes: notes || undefined,
      lines,
    };

    const result = isEdit
      ? await atualizar(autoId!, payload)
      : await criar({ subcontractorId: sub.id, ...payload });

    if (result) {
      toast.success(isEdit ? 'Auto atualizado.' : 'Auto criado como rascunho.');
      navigate(`/autos/${result.id}`);
    } else {
      toast.error('Não foi possível guardar o auto.');
    }
  };

  if ((isEdit && autoLoading) || subLoading) {
    return <div className="max-w-2xl mx-auto p-8 text-center text-sm text-muted-foreground">A carregar…</div>;
  }
  if (!sub) {
    return <div className="max-w-2xl mx-auto p-8 text-center text-sm text-muted-foreground">Contratação não encontrada.</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-28">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="Voltar" className="p-2 hover:bg-accent rounded-lg transition-colors shrink-0">
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold">{isEdit ? 'Editar Auto' : 'Novo Auto de Medição'}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 truncate">{sub.name} · {sub.obraName}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-card rounded-2xl border border-border p-4">
          <label className="block text-sm font-medium mb-2">Data da Medição</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} required />
        </div>

        {/* Medição — global */}
        {isGlobal ? (
          <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium">Percentagem executada neste período (%)</label>
            </div>
            <input type="number" inputMode="decimal" min="0" max="100" step="0.01" value={percentagem} onChange={e => setPercentagem(e.target.value)} className={`${inputCls} text-2xl font-bold text-center`} placeholder="0" />
            <div className="text-sm text-muted-foreground text-center">
              Valor acordado: <strong>{fmtEuro(sub.agreedValue)}</strong> · Este período: <strong className="text-primary">{fmtEuro(baseValue)}</strong>
            </div>
          </div>
        ) : (
          /* Medição — unitário: quantidades por artigo */
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <h2 className="font-semibold text-sm">Quantidades executadas neste período</h2>
            </div>
            <div className="divide-y divide-border">
              {(sub.items ?? []).filter(it => !it.isExtra).map(it => {
                const medido = jaMedido[it.id] ?? 0;
                const resta = it.plannedQuantity - medido;
                const q = parseFloat(qtds[it.id] || '0') || 0;
                return (
                  <div key={it.id} className="p-3">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <p className="text-sm font-medium">{it.description}</p>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtEuro(it.unitPrice)}/{it.unit}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" inputMode="decimal" min="0" step="0.001"
                        value={qtds[it.id] ?? ''}
                        onChange={e => setQtds(prev => ({ ...prev, [it.id]: e.target.value }))}
                        className={`${smallInput} max-w-[130px]`}
                        placeholder={`Qtd (${it.unit})`}
                      />
                      <span className="text-xs text-muted-foreground">
                        prev. {fmtNumber(it.plannedQuantity)} · medido {fmtNumber(medido)} · resta <strong className={resta - q < 0 ? 'text-destructive' : 'text-foreground'}>{fmtNumber(resta)}</strong>
                      </span>
                      <span className="ml-auto text-sm font-semibold">{fmtEuro(q * it.unitPrice)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Trabalhos a mais */}
        <div className="bg-card rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-sm">Trabalhos a mais</h2>
              <p className="text-xs text-muted-foreground">Extras fora do contrato original (opcional)</p>
            </div>
            {extrasValue > 0 && <span className="text-sm font-bold text-warning">{fmtEuro(extrasValue)}</span>}
          </div>
          <div className="space-y-3">
            {extras.map((ex, idx) => (
              <div key={ex.id} className="rounded-xl border border-warning/30 bg-warning/5 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-warning">Extra {idx + 1}</span>
                  <button type="button" onClick={() => setExtras(prev => prev.filter(e => e.id !== ex.id))} className="p-1 text-muted-foreground hover:text-destructive rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <input type="text" value={ex.description} onChange={e => setExtra(ex.id, { description: e.target.value })} className={smallInput} placeholder="Descrição do trabalho a mais" />
                <div className="grid grid-cols-3 gap-2">
                  <select value={ex.unit} onChange={e => setExtra(ex.id, { unit: e.target.value })} className={smallInput}>
                    {UNIDADES_OBRA.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <input type="number" inputMode="decimal" min="0" step="0.0001" value={ex.unitPrice} onChange={e => setExtra(ex.id, { unitPrice: e.target.value })} className={smallInput} placeholder="€/un" />
                  <input type="number" inputMode="decimal" min="0" step="0.001" value={ex.quantity} onChange={e => setExtra(ex.id, { quantity: e.target.value })} className={smallInput} placeholder="Qtd" />
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setExtras(prev => [...prev, novaExtra()])} className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <Plus className="w-4 h-4" /> Adicionar trabalho a mais
          </button>
        </div>

        <div className="bg-card rounded-2xl border border-border p-4">
          <label className="block text-sm font-medium mb-2">Observações <span className="text-muted-foreground font-normal text-xs">(opcional)</span></label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} className={`${inputCls} resize-none`} rows={2} />
        </div>

        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">Valor deste auto</span>
          </div>
          <span className="text-xl font-bold text-primary">{fmtEuro(periodValue)}</span>
        </div>

        <div className="sticky bottom-20 md:bottom-0 py-3 bg-background/80 backdrop-blur-sm md:bg-transparent flex gap-3">
          <button type="submit" disabled={saving} className="flex-1 py-4 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60">
            {saving ? 'A guardar…' : isEdit ? 'Guardar Alterações' : 'Criar Auto'}
          </button>
          <button type="button" onClick={() => navigate(-1)} disabled={saving} className="px-5 py-4 bg-secondary/20 text-foreground rounded-xl font-medium hover:bg-secondary/30 transition-all">
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
