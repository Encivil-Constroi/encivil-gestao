import { useState, useEffect } from 'react';
import { Plus, Search, Package as PackageIcon, ChevronRight, RotateCcw, Archive } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { StockBadge } from '../components/StockBadge';
import { EmptyState } from '../components/EmptyState';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { getCategoryLabel, getUnitLabel } from '../data/mockData';
import { supabase } from '@/integrations/supabase/client';
import {
  useProdutos,
  useProdutosArquivados,
  useCriarProduto,
  useRestaurarProduto,
} from '@/features/produtos/hooks/useProdutos';
import { useRole } from '@/features/auth/useRole';
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll';
import type { ProductCategory, Unit, StockStatus } from '../types';

type StatusFilter = 'todos' | StockStatus;
type Tab = 'ativos' | 'arquivados';

const statusFilters: { value: StatusFilter; label: string; cls: string }[] = [
  { value: 'todos',     label: 'Todos',       cls: 'bg-accent text-foreground hover:bg-accent/80' },
  { value: 'normal',    label: '✓ Normal',    cls: 'bg-success/10 text-success hover:bg-success/20 border-success/30' },
  { value: 'baixo',     label: '⚠ Baixo',     cls: 'bg-warning/10 text-warning hover:bg-warning/20 border-warning/30' },
  { value: 'sem-stock', label: '✕ Sem Stock', cls: 'bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/30' },
];

export function ProductsPage() {
  const navigate = useNavigate();
  const [tab,          setTab]          = useState<Tab>('ativos');
  const [searchTerm,   setSearchTerm]   = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
  const [showAddModal, setShowAddModal] = useState(false);
  const [restoreId,    setRestoreId]    = useState<string | null>(null);

  const { products,  loading,         reload  } = useProdutos();
  // Arquivados só carregam quando o utilizador abre a tab correspondente
  const { products: archived, loading: loadingArchived, reload: reloadArchived } = useProdutosArquivados(tab === 'arquivados');
  const { podeArmazem } = useRole();
  const { restaurar, loading: restoring } = useRestaurarProduto();

  const filteredActive = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'todos' || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const filteredArchived = archived.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const counts = {
    normal:      products.filter(p => p.status === 'normal').length,
    baixo:       products.filter(p => p.status === 'baixo').length,
    'sem-stock': products.filter(p => p.status === 'sem-stock').length,
  };

  const handleRestore = async () => {
    if (!restoreId) return;
    const name = archived.find(p => p.id === restoreId)?.name;
    const ok = await restaurar(restoreId);
    if (ok) {
      toast.success(`"${name}" restaurado com sucesso.`);
      setRestoreId(null);
      reloadArchived();
      reload();
    } else {
      toast.error('Erro ao restaurar produto.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Produtos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tab === 'ativos'
              ? (loading ? 'A carregar…' : `${products.length} produto${products.length !== 1 ? 's' : ''} no armazém`)
              : (loadingArchived ? 'A carregar…' : `${archived.length} produto${archived.length !== 1 ? 's' : ''} arquivado${archived.length !== 1 ? 's' : ''}`)}
          </p>
        </div>
        {podeArmazem && tab === 'ativos' && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 active:scale-95 transition-all text-sm font-semibold shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Novo Produto</span>
            <span className="sm:hidden">Novo</span>
          </button>
        )}
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">

        {/* Tabs — Ativos / Arquivados (admin only) */}
        {podeArmazem && (
          <div className="flex border-b border-border px-4 pt-3">
            <button
              onClick={() => setTab('ativos')}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-colors border-b-2 -mb-px ${
                tab === 'ativos'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <PackageIcon className="w-4 h-4" />
              Ativos
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${tab === 'ativos' ? 'bg-primary/10' : 'bg-muted'}`}>
                {products.length}
              </span>
            </button>
            <button
              onClick={() => setTab('arquivados')}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-colors border-b-2 -mb-px ${
                tab === 'arquivados'
                  ? 'border-warning text-warning'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Archive className="w-4 h-4" />
              Arquivados
              {archived.length > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${tab === 'arquivados' ? 'bg-warning/10' : 'bg-muted'}`}>
                  {archived.length}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Pesquisa + filtros (apenas na tab ativos) */}
        <div className="p-4 border-b border-border space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder={tab === 'ativos' ? 'Pesquisar por nome ou código…' : 'Pesquisar nos arquivados…'}
              className="w-full pl-10 pr-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            />
          </div>

          {tab === 'ativos' && (
            <div className="flex items-center gap-2 flex-wrap">
              {statusFilters.map(f => {
                const count   = f.value !== 'todos' ? counts[f.value as StockStatus] : products.length;
                const isActive = statusFilter === f.value;
                return (
                  <button
                    key={f.value}
                    onClick={() => setStatusFilter(f.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                      isActive ? `${f.cls} border-current ring-2 ring-current/20` : `${f.cls} border-transparent`
                    }`}
                  >
                    {f.label}
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${isActive ? 'bg-current/20' : 'bg-muted/50 text-muted-foreground'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Tab: Ativos */}
        {tab === 'ativos' && (
          loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">A carregar produtos…</div>
          ) : filteredActive.length === 0 ? (
            <EmptyState
              icon={PackageIcon}
              title="Nenhum produto encontrado"
              description={searchTerm || statusFilter !== 'todos' ? 'Tente alterar a pesquisa ou o filtro.' : 'Adicione o primeiro produto ao armazém.'}
            />
          ) : (
            <>
              <div className="md:hidden divide-y divide-border">
                {filteredActive.map(p => (
                  <div key={p.id} onClick={() => navigate(`/produtos/${p.id}`)}
                    className="p-4 flex items-center gap-3 active:bg-accent/50 transition-colors cursor-pointer">
                    <div className={`rounded-xl p-2.5 shrink-0 ${p.status === 'sem-stock' ? 'bg-destructive/10' : p.status === 'baixo' ? 'bg-warning/10' : 'bg-accent'}`}>
                      <PackageIcon className={`w-5 h-5 ${p.status === 'sem-stock' ? 'text-destructive' : p.status === 'baixo' ? 'text-warning' : 'text-muted-foreground'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.code} · {getCategoryLabel(p.category)}</p>
                      <p className="text-xs mt-1">
                        <span className="font-semibold">{p.currentStock} {getUnitLabel(p.unit)}</span>
                        <span className="text-muted-foreground"> · mín: {p.minStock}</span>
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <StockBadge status={p.status} />
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      {['Código','Produto','Categoria','Unidade','Stock Atual','Mínimo','Estado',''].map(h => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredActive.map(p => (
                      <tr key={p.id} onClick={() => navigate(`/produtos/${p.id}`)} className="hover:bg-accent/40 transition-colors cursor-pointer">
                        <td className="px-5 py-4 whitespace-nowrap text-sm font-mono font-medium text-muted-foreground">{p.code}</td>
                        <td className="px-5 py-4 text-sm font-medium">{p.name}</td>
                        <td className="px-5 py-4 whitespace-nowrap text-sm text-muted-foreground">{getCategoryLabel(p.category)}</td>
                        <td className="px-5 py-4 whitespace-nowrap text-sm text-muted-foreground">{getUnitLabel(p.unit)}</td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span className={`text-sm font-bold ${p.status === 'sem-stock' ? 'text-destructive' : p.status === 'baixo' ? 'text-warning' : 'text-foreground'}`}>{p.currentStock}</span>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-sm text-muted-foreground">{p.minStock}</td>
                        <td className="px-5 py-4 whitespace-nowrap"><StockBadge status={p.status} /></td>
                        <td className="px-5 py-4 whitespace-nowrap"><ChevronRight className="w-4 h-4 text-muted-foreground" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}

        {/* Tab: Arquivados */}
        {tab === 'arquivados' && (
          loadingArchived ? (
            <div className="p-8 text-center text-sm text-muted-foreground">A carregar produtos arquivados…</div>
          ) : filteredArchived.length === 0 ? (
            <EmptyState icon={Archive} title="Nenhum produto arquivado" description="Produtos arquivados aparecem aqui." />
          ) : (
            <>
              <div className="md:hidden divide-y divide-border">
                {filteredArchived.map(p => (
                  <div key={p.id} className="p-4 flex items-center gap-3">
                    <div className="rounded-xl p-2.5 shrink-0 bg-muted">
                      <PackageIcon className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate text-muted-foreground">{p.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.code} · {getCategoryLabel(p.category)}</p>
                    </div>
                    <button
                      onClick={() => setRestoreId(p.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors shrink-0"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Restaurar
                    </button>
                  </div>
                ))}
              </div>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      {['Código','Produto','Categoria','Unidade','Arquivado em',''].map(h => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredArchived.map(p => (
                      <tr key={p.id} className="opacity-70">
                        <td className="px-5 py-4 whitespace-nowrap text-sm font-mono text-muted-foreground">{p.code}</td>
                        <td className="px-5 py-4 text-sm font-medium line-through text-muted-foreground">{p.name}</td>
                        <td className="px-5 py-4 whitespace-nowrap text-sm text-muted-foreground">{getCategoryLabel(p.category)}</td>
                        <td className="px-5 py-4 whitespace-nowrap text-sm text-muted-foreground">{getUnitLabel(p.unit)}</td>
                        <td className="px-5 py-4 whitespace-nowrap text-sm text-muted-foreground">{p.updatedAt.toLocaleDateString('pt-PT')}</td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <button
                            onClick={() => setRestoreId(p.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Restaurar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}
      </div>

      {/* Modal: novo produto */}
      {showAddModal && podeArmazem && (
        <AddProductModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); reload(); }}
        />
      )}

      {/* Dialog: restaurar */}
      {restoreId && (
        <ConfirmDialog
          title={`Restaurar "${archived.find(p => p.id === restoreId)?.name}"?`}
          description="O produto voltará a aparecer na lista de produtos ativos."
          confirmLabel="Restaurar Produto"
          variant="warning"
          loading={restoring}
          onConfirm={handleRestore}
          onCancel={() => setRestoreId(null)}
        />
      )}
    </div>
  );
}

/* ── Modal novo produto ──────────────────────────────────────────── */

function AddProductModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  useLockBodyScroll(true);
  const { criar, loading } = useCriarProduto();
  const [formData, setFormData] = useState({
    name: '', category: 'outro' as ProductCategory, unit: 'unidade' as Unit,
    initialStock: '', minStock: '', unitCost: '', notes: '',
  });
  const [codigoPreview, setCodigoPreview] = useState('');
  const [gerandoCodigo, setGerandoCodigo] = useState(true);

  // Pré-visualização apenas — não consome a sequência. O código real é
  // atribuído pela coluna DEFAULT da DB só quando o produto é criado.
  useEffect(() => {
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('gerar_codigo_produto');
        if (data && !error) setCodigoPreview(data as string);
      } finally {
        setGerandoCodigo(false);
      }
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await criar({
      name:         formData.name,
      category:     formData.category,
      unit:         formData.unit,
      currentStock: parseFloat(formData.initialStock) || 0,
      minStock:     parseFloat(formData.minStock) || 0,
      unitCost:     parseFloat(formData.unitCost) || 0,
      notes:        formData.notes || undefined,
    });
    if (result) {
      toast.success('Produto criado com sucesso!');
      onSuccess();
    } else {
      toast.error('Erro ao criar produto. O código já existe ou há um erro de ligação.');
    }
  };

  const inputCls = 'w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-base';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 enc-fade-in">
      <div className="bg-card rounded-t-2xl sm:rounded-2xl border border-border w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto enc-scale-in" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="p-5 border-b border-border sticky top-0 bg-card rounded-t-2xl z-10">
          <h2 className="text-lg font-bold">Novo Produto</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Adicionar novo produto ao armazém</p>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Código <span className="text-muted-foreground font-normal text-xs">(gerado automaticamente)</span></label>
              <input
                type="text"
                value={gerandoCodigo ? 'A gerar…' : codigoPreview}
                readOnly
                disabled
                className={`${inputCls} bg-muted text-muted-foreground cursor-not-allowed`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Nome do Produto</label>
              <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className={inputCls} placeholder="Ex: Cimento Portland 25kg" required />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Categoria</label>
              <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value as ProductCategory })} className={inputCls}>
                {[['cimento','Cimento'],['areia-brita','Areia e Brita'],['tijolo-bloco','Tijolo e Bloco'],['tinta','Tinta'],['tubagem','Tubagem'],['ferragem','Ferragem'],['ferramenta','Ferramentas'],['madeira','Madeira'],['outro','Outro']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Unidade</label>
              <select value={formData.unit} onChange={e => setFormData({ ...formData, unit: e.target.value as Unit })} className={inputCls}>
                {[['saco','Saco'],['unidade','Unidade'],['kg','Quilograma (kg)'],['litro','Litro'],['caixa','Caixa'],['metro','Metro linear'],['m2','Metro quadrado (m²)'],['m3','Metro cúbico (m³)']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Stock Inicial</label>
              <input type="number" value={formData.initialStock} onChange={e => setFormData({ ...formData, initialStock: e.target.value })} className={inputCls} placeholder="0" min="0" step="0.01" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Stock Mínimo <span className="text-muted-foreground font-normal text-xs ml-1">(para alertas)</span></label>
              <input type="number" value={formData.minStock} onChange={e => setFormData({ ...formData, minStock: e.target.value })} className={inputCls} placeholder="0" min="0" step="0.01" required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Custo Unitário (€) <span className="text-muted-foreground font-normal text-xs ml-1">(para custo por obra)</span></label>
            <input type="number" value={formData.unitCost} onChange={e => setFormData({ ...formData, unitCost: e.target.value })} className={inputCls} placeholder="0.00" min="0" step="0.0001" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Observações <span className="text-muted-foreground font-normal">(opcional)</span></label>
            <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} className={`${inputCls} resize-none`} rows={2} placeholder="Localização no armazém, fornecedor habitual, etc." />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading || gerandoCodigo} className="flex-1 py-3.5 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60">
              {loading ? 'A guardar…' : 'Criar Produto'}
            </button>
            <button type="button" onClick={onClose} disabled={loading} className="flex-1 py-3.5 bg-secondary/20 text-foreground rounded-xl font-medium hover:bg-secondary/30 active:scale-[0.98] transition-all">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
