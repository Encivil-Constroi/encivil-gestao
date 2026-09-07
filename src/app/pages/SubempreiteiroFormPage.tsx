import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ChevronLeft, Plus, Trash2, Package } from 'lucide-react';
import { toast } from 'sonner';
import { fmtEuro, UNIDADES_OBRA } from '../lib/format';
import { useObras } from '@/features/obras/hooks/useObras';
import { useSubempreiteiro, useGuardarSubempreiteiro } from '@/features/subempreiteiros/hooks/useSubempreiteiros';
import type { ContractType } from '../types';

type LinhaArtigo = { id: string; description: string; unit: string; unitPrice: string; plannedQuantity: string };

function novaLinha(): LinhaArtigo {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { id, description: '', unit: 'm²', unitPrice: '', plannedQuantity: '' };
}

const inputCls = 'w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-base';

export function SubempreiteiroFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const { obras, loading: obrasLoading } = useObras(true);
  const { sub, loading: subLoading } = useSubempreiteiro(id);
  const { criar, atualizar, loading: saving } = useGuardarSubempreiteiro();

  const [form, setForm] = useState({
    obraId: '',
    name: '',
    contact: '',
    type: 'global' as ContractType,
    globalValue: '',
    retencaoPercentagem: '5',
    conditions: '',
  });
  const [linhas, setLinhas] = useState<LinhaArtigo[]>([novaLinha()]);

  // Preenche o formulário ao editar (quando os dados chegam).
  useEffect(() => {
    if (!isEdit || !sub) return;
    if (sub.status === 'validado') {
      toast.error('Esta contratação está validada e não pode ser editada.');
      navigate(`/subempreiteiros/${sub.id}`);
      return;
    }
    setForm({
      obraId: sub.obraId,
      name: sub.name,
      contact: sub.contact ?? '',
      type: sub.type,
      globalValue: sub.globalValue != null ? String(sub.globalValue) : '',
      retencaoPercentagem: String(sub.retencaoPercentagem ?? 5),
      conditions: sub.conditions ?? '',
    });
    if (sub.type === 'unitario' && sub.items?.length) {
      setLinhas(sub.items.map(i => ({
        id: i.id,
        description: i.description,
        unit: i.unit,
        unitPrice: String(i.unitPrice),
        plannedQuantity: String(i.plannedQuantity),
      })));
    }
  }, [isEdit, sub, navigate]);

  const set = (patch: Partial<typeof form>) => setForm(prev => ({ ...prev, ...patch }));

  const setLinha = (lid: string, patch: Partial<LinhaArtigo>) =>
    setLinhas(prev => prev.map(l => l.id === lid ? { ...l, ...patch } : l));
  const addLinha = () => setLinhas(prev => [...prev, novaLinha()]);
  const removeLinha = (lid: string) => setLinhas(prev => prev.length > 1 ? prev.filter(l => l.id !== lid) : prev);

  const totalUnitario = linhas.reduce((sum, l) => {
    const p = parseFloat(l.unitPrice || '0');
    const q = parseFloat(l.plannedQuantity || '0');
    return sum + (isNaN(p) || isNaN(q) ? 0 : p * q);
  }, 0);

  const valorAcordado = form.type === 'global'
    ? parseFloat(form.globalValue || '0') || 0
    : totalUnitario;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.obraId) { toast.error('Selecione a obra.'); return; }
    if (!form.name.trim()) { toast.error('Indique o nome do subempreiteiro.'); return; }

    let items;
    if (form.type === 'unitario') {
      const validas = linhas.filter(l => l.description.trim() && parseFloat(l.unitPrice || '0') >= 0 && parseFloat(l.plannedQuantity || '0') > 0);
      if (validas.length === 0) { toast.error('Adicione pelo menos um artigo com descrição, preço e quantidade.'); return; }
      items = validas.map(l => ({
        description: l.description.trim(),
        unit: l.unit,
        unitPrice: parseFloat(l.unitPrice || '0'),
        plannedQuantity: parseFloat(l.plannedQuantity),
      }));
    }

    const payload = {
      obraId: form.obraId,
      name: form.name.trim(),
      contact: form.contact || undefined,
      type: form.type,
      globalValue: form.type === 'global' ? (parseFloat(form.globalValue || '0') || 0) : undefined,
      retencaoPercentagem: Math.min(100, Math.max(0, parseFloat(form.retencaoPercentagem || '0') || 0)),
      conditions: form.conditions || undefined,
      items,
    };

    const result = isEdit ? await atualizar(id!, payload) : await criar(payload);
    if (result) {
      toast.success(isEdit ? 'Contratação atualizada.' : 'Contratação criada como rascunho.');
      navigate(`/subempreiteiros/${result.id}`);
    } else {
      toast.error('Não foi possível guardar. Tente novamente.');
    }
  };

  if (isEdit && subLoading) {
    return <div className="max-w-2xl mx-auto p-8 text-center text-sm text-muted-foreground">A carregar…</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-28">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-accent rounded-lg transition-colors shrink-0">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">{isEdit ? 'Editar Contratação' : 'Nova Contratação'}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Subempreiteiro para uma obra</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Obra <span className="text-destructive">*</span></label>
            <select value={form.obraId} onChange={e => set({ obraId: e.target.value })} className={inputCls} required disabled={obrasLoading}>
              <option value="">{obrasLoading ? 'A carregar…' : 'Selecione a obra'}</option>
              {obras.filter(o => o.status === 'ativa' || o.id === form.obraId).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            {!obrasLoading && obras.length === 0 && (
              <p className="text-xs text-warning mt-1.5">Ainda não há obras. Crie uma obra primeiro.</p>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Nome do Subempreiteiro <span className="text-destructive">*</span></label>
              <input type="text" value={form.name} onChange={e => set({ name: e.target.value })} className={inputCls} placeholder="Empresa ou pessoa" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Contacto do Responsável</label>
              <input type="tel" value={form.contact} onChange={e => set({ contact: e.target.value })} className={inputCls} placeholder="Telemóvel" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Retenção de Garantia <span className="text-muted-foreground font-normal">(% retida de cada auto)</span>
            </label>
            <p className="text-xs text-muted-foreground mb-2">Percentagem standard em construção civil: 5–10%. Libertada no final da obra e período de defeitos.</p>
            <div className="flex items-center gap-3">
              <input
                type="number" inputMode="decimal" min="0" max="100" step="0.5"
                value={form.retencaoPercentagem}
                onChange={e => set({ retencaoPercentagem: e.target.value })}
                className={`${inputCls} w-32`}
                placeholder="5"
              />
              <span className="text-sm font-semibold text-muted-foreground">%</span>
              {parseFloat(form.retencaoPercentagem) > 0 && valorAcordado > 0 && (
                <span className="text-xs text-muted-foreground">
                  ≈ {fmtEuro(valorAcordado * parseFloat(form.retencaoPercentagem) / 100)} sobre o total acordado
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tipo de valor acordado */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <div>
            <p className="text-sm font-semibold mb-3">Como foi acordado o valor?</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => set({ type: 'global' })}
                className={`rounded-xl border-2 p-3 text-left transition-all ${form.type === 'global' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
              >
                <p className={`font-bold text-sm ${form.type === 'global' ? 'text-primary' : ''}`}>Preço fechado</p>
                <p className="text-xs text-muted-foreground mt-0.5">Um valor total pela obra toda</p>
              </button>
              <button
                type="button"
                onClick={() => set({ type: 'unitario' })}
                className={`rounded-xl border-2 p-3 text-left transition-all ${form.type === 'unitario' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
              >
                <p className={`font-bold text-sm ${form.type === 'unitario' ? 'text-primary' : ''}`}>Preços unitários</p>
                <p className="text-xs text-muted-foreground mt-0.5">Preço por unidade (m², un…)</p>
              </button>
            </div>
          </div>

          {form.type === 'global' ? (
            <div>
              <label className="block text-sm font-medium mb-2">Valor Acordado (€) <span className="text-destructive">*</span></label>
              <input
                type="number" inputMode="decimal" min="0" step="0.01"
                value={form.globalValue}
                onChange={e => set({ globalValue: e.target.value })}
                className={`${inputCls} text-xl font-bold`}
                placeholder="0.00"
              />
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium">Artigos</label>
                <span className="text-sm font-bold">{fmtEuro(totalUnitario)}</span>
              </div>
              <div className="space-y-3">
                {linhas.map((l, idx) => {
                  const subtotal = (parseFloat(l.unitPrice || '0') || 0) * (parseFloat(l.plannedQuantity || '0') || 0);
                  return (
                    <div key={l.id} className="rounded-xl border border-border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground">Artigo {idx + 1}</span>
                        {linhas.length > 1 && (
                          <button type="button" onClick={() => removeLinha(l.id)} className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <input
                        type="text" value={l.description} onChange={e => setLinha(l.id, { description: e.target.value })}
                        className="w-full px-3 py-2 bg-input-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Descrição (ex: Reboco de paredes exteriores)"
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <select value={l.unit} onChange={e => setLinha(l.id, { unit: e.target.value })} className="px-2 py-2 bg-input-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                          {UNIDADES_OBRA.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                        <input type="number" inputMode="decimal" min="0" step="0.0001" value={l.unitPrice} onChange={e => setLinha(l.id, { unitPrice: e.target.value })}
                          className="px-2 py-2 bg-input-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="€/un" />
                        <input type="number" inputMode="decimal" min="0" step="0.001" value={l.plannedQuantity} onChange={e => setLinha(l.id, { plannedQuantity: e.target.value })}
                          className="px-2 py-2 bg-input-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Qtd" />
                      </div>
                      {subtotal > 0 && <p className="text-xs text-right text-muted-foreground">Subtotal: <strong className="text-foreground">{fmtEuro(subtotal)}</strong></p>}
                    </div>
                  );
                })}
              </div>
              <button type="button" onClick={addLinha} className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                <Plus className="w-4 h-4" /> Adicionar artigo
              </button>
            </div>
          )}
        </div>

        <div className="bg-card rounded-2xl border border-border p-4">
          <label className="block text-sm font-medium mb-2">Condições Acordadas / Observações</label>
          <textarea value={form.conditions} onChange={e => set({ conditions: e.target.value })} className={`${inputCls} resize-none`} rows={4}
            placeholder="Prazo, forma de pagamento, o que está incluído, garantias…" />
        </div>

        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">Valor acordado total</span>
          </div>
          <span className="text-xl font-bold text-primary">{fmtEuro(valorAcordado)}</span>
        </div>

        <div className="sticky bottom-20 md:bottom-0 py-3 bg-background/80 backdrop-blur-sm md:bg-transparent flex gap-3">
          <button type="submit" disabled={saving} className="flex-1 py-4 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60">
            {saving ? 'A guardar…' : isEdit ? 'Guardar Alterações' : 'Criar Contratação'}
          </button>
          <button type="button" onClick={() => navigate(-1)} disabled={saving} className="px-5 py-4 bg-secondary/20 text-foreground rounded-xl font-medium hover:bg-secondary/30 transition-all">
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
