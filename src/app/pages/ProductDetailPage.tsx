import { useMemo, useState, useRef, useEffect } from 'react';

const PRODUCT_DETAIL_HEADERS = ['Data/Hora','Tipo','Quantidade','Stock Anterior','Novo Stock','Responsável','Destino'] as const;
import { useParams, useNavigate, Link } from 'react-router';
import {
  ArrowLeft, ArrowDownCircle, ArrowUpCircle,
  Package as PackageIcon, Pencil, MoreVertical,
  Archive, Trash2, MessageCircle,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';
import { StockBadge } from '../components/StockBadge';
import { MovementTypeBadge } from '../components/MovementTypeBadge';
import { EditProductModal } from '../components/EditProductModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { getCategoryLabel, getUnitLabel } from '../data/mockData';
import { useProduto, useDesativarProduto, useDeletarProduto } from '@/features/produtos/hooks/useProdutos';
import { useMovimentos } from '@/features/movimentos/hooks/useMovimentos';
import { useRole } from '@/features/auth/useRole';

type Modal = 'edit' | 'archive' | 'delete' | null;

export function ProductDetailPage() {
  const { id }      = useParams();
  const navigate    = useNavigate();
  const { podeArmazem: isAdmin } = useRole();

  const { product, loading: loadingProduct, reload } = useProduto(id);
  const movFiltros = useMemo(() => ({ produtoId: id, limit: 20 }), [id]);
  const { movements, loading: loadingMovements } = useMovimentos(movFiltros);

  const { desativar, loading: archiving } = useDesativarProduto();
  const { deletar,   loading: deleting  } = useDeletarProduto();

  const [modal,      setModal]      = useState<Modal>(null);
  const [menuOpen,   setMenuOpen]   = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  /* Close kebab menu on outside click */
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const last7Days = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return { date: d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' }), Entradas: 0, Saídas: 0 };
    });
    movements.forEach(m => {
      const ds = m.date.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
      const day = days.find(d => d.date === ds);
      if (day) {
        if (m.type === 'entrada') day.Entradas += m.quantity;
        else if (m.type === 'saida') day.Saídas += m.quantity;
      }
    });
    return days;
  }, [movements]);

  const handleArchive = async () => {
    if (!id) return;
    const ok = await desativar(id);
    if (ok) {
      toast.success(`"${product?.name}" arquivado com sucesso.`);
      navigate('/produtos');
    } else {
      toast.error('Erro ao arquivar produto.');
    }
    setModal(null);
  };

  const handleDelete = async () => {
    if (!id) return;
    const ok = await deletar(id);
    if (ok) {
      toast.success(`"${product?.name}" eliminado permanentemente.`);
      navigate('/produtos');
    } else {
      toast.error('Erro ao eliminar. Verifique as permissões.');
    }
    setModal(null);
  };

  if (loadingProduct) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold">Produto não encontrado</h2>
        <button onClick={() => navigate('/produtos')}
          className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl">
          Voltar
        </button>
      </div>
    );
  }

  const hasMovements = !loadingMovements && movements.length > 0;
  const totalEntries = movements.filter(m => m.type === 'entrada').reduce((s, m) => s + m.quantity, 0);
  const totalExits   = movements.filter(m => m.type === 'saida').reduce((s, m) => s + m.quantity, 0);

  return (
    <div className="space-y-5">

      {/* Cabeçalho */}
      <div className="flex items-start gap-3">
        <button onClick={() => navigate('/produtos')}
          className="p-2 hover:bg-accent rounded-lg transition-colors mt-0.5 shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl md:text-2xl font-bold">{product.name}</h1>
            <StockBadge status={product.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {product.code} · {getCategoryLabel(product.category)}
          </p>
        </div>

        {/* Admin actions */}
        {isAdmin && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setModal('edit')}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-colors text-sm font-semibold"
            >
              <Pencil className="w-4 h-4" />
              <span className="hidden sm:inline">Editar</span>
            </button>

            {/* Kebab menu — Archive / Delete */}
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="p-2 hover:bg-accent rounded-xl transition-colors"
                aria-label="Mais ações"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden enc-slide-down">
                  <button
                    onClick={() => { setMenuOpen(false); setModal('archive'); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-accent transition-colors text-warning font-medium"
                  >
                    <Archive className="w-4 h-4" />
                    Arquivar produto
                  </button>
                  {!hasMovements && (
                    <button
                      onClick={() => { setMenuOpen(false); setModal('delete'); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-destructive/5 transition-colors text-destructive font-medium border-t border-border"
                    >
                      <Trash2 className="w-4 h-4" />
                      Eliminar permanentemente
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Botões de acção */}
      <div className={`grid gap-3 ${product.status === 'baixo' || product.status === 'sem-stock' ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <button
          onClick={() => navigate(`/novo-movimento?produto=${product.id}&tipo=entrada`)}
          className="flex items-center justify-center gap-2 py-3.5 bg-success text-success-foreground rounded-xl font-semibold text-sm hover:bg-success/90 active:scale-[0.98] transition-all shadow-sm"
        >
          <ArrowDownCircle className="w-5 h-5" />
          Registar Entrada
        </button>
        <button
          onClick={() => navigate(`/novo-movimento?produto=${product.id}&tipo=saida`)}
          className="flex items-center justify-center gap-2 py-3.5 bg-destructive text-destructive-foreground rounded-xl font-semibold text-sm hover:bg-destructive/90 active:scale-[0.98] transition-all shadow-sm"
        >
          <ArrowUpCircle className="w-5 h-5" />
          Registar Saída
        </button>
        {(product.status === 'baixo' || product.status === 'sem-stock') && (
          <button
            onClick={() => {
              const unit = getUnitLabel(product.unit)
              const diff = product.minStock - product.currentStock
              const msg = [
                `*Pedido de Reposição — ENCIVIL*`,
                ``,
                `Produto: ${product.name}${product.code ? ` (${product.code})` : ''}`,
                `Stock atual: ${product.currentStock} ${unit}`,
                `Stock mínimo: ${product.minStock} ${unit}`,
                `Em falta: ${diff > 0 ? diff : 0} ${unit}`,
                ``,
                `Por favor, repor o mais brevemente possível.`,
              ].join('\n')
              window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
            }}
            className="flex items-center justify-center gap-2 py-3.5 bg-[#25D366] text-white rounded-xl font-semibold text-sm hover:bg-[#1ebe5a] active:scale-[0.98] transition-all shadow-sm"
          >
            <MessageCircle className="w-5 h-5" />
            Repor
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: 'Stock Atual', value: product.currentStock, cls: product.status === 'sem-stock' ? 'text-destructive' : product.status === 'baixo' ? 'text-warning' : 'text-foreground' },
          { label: 'Stock Mínimo', value: product.minStock, cls: 'text-warning' },
          { label: 'Total Entrado', value: loadingMovements ? '…' : totalEntries, cls: 'text-success' },
          { label: 'Total Saído',   value: loadingMovements ? '…' : totalExits,   cls: 'text-destructive' },
        ].map(k => (
          <div key={k.label} className="bg-card rounded-2xl border border-border p-4 card-lift">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{k.label}</p>
            <p className={`text-3xl font-bold ${k.cls}`}>{k.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{getUnitLabel(product.unit)}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Gráfico 7 dias */}
        <div className="lg:col-span-2 bg-card rounded-2xl border border-border">
          <div className="p-5 border-b border-border">
            <h3 className="font-semibold">Movimentação — Últimos 7 Dias</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Quantidade por dia</p>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={last7Days} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: 12 }} cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="Entradas" fill="#16a34a" radius={[6, 6, 0, 0]} maxBarSize={32} />
                <Bar dataKey="Saídas"   fill="#dc2626" radius={[6, 6, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Info do produto */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <h3 className="font-semibold mb-4">Informações</h3>
          <div className="space-y-4">
            {[
              { label: 'Estado',    value: <StockBadge status={product.status} /> },
              { label: 'Categoria', value: getCategoryLabel(product.category) },
              { label: 'Unidade',   value: getUnitLabel(product.unit) },
              { label: 'Criado em', value: product.createdAt.toLocaleDateString('pt-PT') },
            ].map(row => (
              <div key={row.label}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{row.label}</p>
                <div className="text-sm font-medium">{row.value}</div>
              </div>
            ))}
            {product.notes && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Observações</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{product.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Histórico */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="p-5 border-b border-border flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">Últimos Movimentos</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {loadingMovements ? 'A carregar…' : `${movements.length} movimento${movements.length !== 1 ? 's' : ''} (últimos 20)`}
            </p>
          </div>
          <Link
            to={`/historico?produto=${id}`}
            className="text-xs text-primary hover:underline whitespace-nowrap mt-0.5"
          >
            Ver histórico completo →
          </Link>
        </div>

        {loadingMovements ? (
          <div className="p-8 text-center text-sm text-muted-foreground">A carregar…</div>
        ) : movements.length === 0 ? (
          <div className="p-12 text-center">
            <PackageIcon className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Ainda não existem movimentos para este produto</p>
          </div>
        ) : (
          <>
            {/* Mobile */}
            <div className="md:hidden divide-y divide-border">
              {movements.map(m => (
                <div key={m.id} className="p-4">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <MovementTypeBadge type={m.type} />
                      <span className="text-sm font-bold">{m.quantity} {getUnitLabel(m.unit)}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {m.date.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span>Stock: <strong className="text-foreground">{m.newStock}</strong> {getUnitLabel(m.unit)}</span>
                    {m.responsible && <span>{m.responsible}</span>}
                    {m.destination && <span>→ {m.destination}</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    {PRODUCT_DETAIL_HEADERS.map(h => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {movements.map(m => (
                    <tr key={m.id} className="hover:bg-accent/40 transition-colors">
                      <td className="px-5 py-3 whitespace-nowrap text-sm">
                        <div className="font-medium">{m.date.toLocaleDateString('pt-PT', { day:'2-digit', month:'2-digit', year:'numeric' })}</div>
                        <div className="text-xs text-muted-foreground">{m.date.toLocaleTimeString('pt-PT', { hour:'2-digit', minute:'2-digit' })}</div>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap"><MovementTypeBadge type={m.type} /></td>
                      <td className="px-5 py-3 whitespace-nowrap text-sm font-bold">{m.quantity} {getUnitLabel(m.unit)}</td>
                      <td className="px-5 py-3 whitespace-nowrap text-sm text-muted-foreground">{m.previousStock}</td>
                      <td className="px-5 py-3 whitespace-nowrap text-sm font-semibold">{m.newStock}</td>
                      <td className="px-5 py-3 whitespace-nowrap text-sm text-muted-foreground">{m.responsible}</td>
                      <td className="px-5 py-3 text-sm text-muted-foreground">{m.destination ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Modais */}
      {modal === 'edit' && (
        <EditProductModal
          product={product}
          hasMovements={hasMovements}
          onClose={() => setModal(null)}
          onSuccess={updated => { setModal(null); reload(); void updated; }}
        />
      )}
      {modal === 'archive' && (
        <ConfirmDialog
          title={`Arquivar "${product.name}"?`}
          description="O produto ficará oculto na lista de produtos ativos. Pode ser restaurado a qualquer momento na tab 'Arquivados'."
          confirmLabel="Arquivar Produto"
          variant="warning"
          loading={archiving}
          onConfirm={handleArchive}
          onCancel={() => setModal(null)}
        />
      )}
      {modal === 'delete' && (
        <ConfirmDialog
          title={`Eliminar "${product.name}" permanentemente?`}
          description="Esta ação é irreversível. O produto será apagado da base de dados definitivamente."
          confirmLabel="Eliminar Permanentemente"
          variant="danger"
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  );
}
