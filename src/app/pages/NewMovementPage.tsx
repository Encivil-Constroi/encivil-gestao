import { useState, useEffect } from 'react';
import { useFormGuard } from '../lib/useFormGuard';
import { useNavigate, useLocation } from 'react-router';
import {
  ArrowDownCircle, ArrowUpCircle, AlertTriangle,
  ChevronLeft, ClipboardEdit, ArrowRight, Plus, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { getUnitLabel } from '../data/mockData';
import { ProductCombobox } from '../components/ProductCombobox';
import type { MovementType } from '../types';
import { useProdutos } from '@/features/produtos/hooks/useProdutos';
import { useRegistarMovimento } from '@/features/movimentos/hooks/useMovimentos';
import { useObras } from '@/features/obras/hooks/useObras';
import { useRole } from '@/features/auth/useRole';

type Linha = { id: string; productId: string; quantity: string };

function novaLinha(productId = ''): Linha {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { id, productId, quantity: '' };
}

export function NewMovementPage() {
  const navigate   = useNavigate();
  const location   = useLocation();
  const { nome }   = useRole();
  const { products, loading: productsLoading } = useProdutos();
  const { registar, loading: saving } = useRegistarMovimento();

  /* Pré-preenchimento via URL params  (/novo-movimento?produto=ID&tipo=saida) */
  const params     = new URLSearchParams(location.search);
  const paramProd  = params.get('produto') ?? '';
  const rawTipo    = params.get('tipo') ?? 'saida';
  const validTypes: MovementType[] = ['entrada', 'saida', 'ajuste'];
  const paramTipo  = validTypes.includes(rawTipo as MovementType)
    ? rawTipo as MovementType
    : 'saida';

  const { obras } = useObras(true);
  const [showAjuste, setShowAjuste] = useState(paramTipo === 'ajuste');
  const [formData, setFormData] = useState({
    type:        paramTipo,
    quantity:    '',
    responsible: nome,
    destination: '',
    obraId:      '',
    notes:       '',
  });
  // Saída: por defeito escolhe-se uma obra do cadastro (liga o custo à obra).
  // "Outro destino" permite texto livre para destinos sem obra formal.
  const [outroDestino, setOutroDestino] = useState(false);
  const [linhas, setLinhas] = useState<Linha[]>([novaLinha(paramProd)]);

  // Sync responsible field once the profile is loaded (nome may arrive after first render)
  useEffect(() => {
    if (nome) setFormData(prev => ({ ...prev, responsible: prev.responsible || nome }));
  }, [nome]);

  const set = (patch: Partial<typeof formData>) =>
    setFormData(prev => ({ ...prev, ...patch }));

  /* ── Modo Ajuste (correção de inventário) — sempre um único produto ── */
  const ajusteProduct = products.find(p => p.id === linhas[0]?.productId);
  const ajusteNew   = formData.type === 'ajuste' && formData.quantity !== ''
    ? parseFloat(formData.quantity)
    : null;
  const ajusteDelta = ajusteNew !== null && ajusteProduct
    ? ajusteNew - ajusteProduct.currentStock
    : null;

  const setLinhaProduto = (id: string, productId: string) =>
    setLinhas(prev => prev.map(l => l.id === id ? { ...l, productId } : l));
  const setLinhaQuantidade = (id: string, quantity: string) =>
    setLinhas(prev => prev.map(l => l.id === id ? { ...l, quantity } : l));
  const adicionarLinha = () => setLinhas(prev => [...prev, novaLinha()]);
  const removerLinha = (id: string) => setLinhas(prev => prev.length > 1 ? prev.filter(l => l.id !== id) : prev);

  const handleSubmit = useFormGuard(async (e: React.FormEvent) => {
    e.preventDefault();

    /* ── Submissão: correção de inventário (sempre 1 produto) ── */
    if (formData.type === 'ajuste') {
      const produtoId = linhas[0]?.productId;
      if (!produtoId) { toast.error('Selecione um produto.'); return; }
      if (!formData.notes.trim()) { toast.error('Indique o motivo da correção de inventário.'); return; }

      const result = await registar({
        produtoId,
        tipo: 'ajuste',
        quantidade: parseFloat(formData.quantity),
        responsavel: formData.responsible,
        observacoes: formData.notes || undefined,
      });

      if (result.status === 'ok') {
        toast.success('Correção registada com sucesso!');
        setTimeout(() => navigate(-1), 1000);
      } else if (result.status === 'queued') {
        toast.success('Sem ligação — correção guardada e será enviada automaticamente.');
        setTimeout(() => navigate(-1), 1000);
      } else {
        toast.error(result.message);
      }
      return;
    }

    /* ── Submissão: entrada/saída — um ou vários produtos ── */
    const validas = linhas.filter(l => l.productId && parseFloat(l.quantity || '0') > 0);
    if (validas.length === 0) { toast.error('Adicione pelo menos um produto com quantidade.'); return; }

    // Resolve destino/obra: na saída, ou é uma obra do cadastro (liga o custo)
    // ou texto livre ("outro destino"). Na entrada, é o fornecedor (texto).
    const obraSel = obras.find(o => o.id === formData.obraId);
    const usaObra = formData.type === 'saida' && !outroDestino;
    const destinoFinal = usaObra ? (obraSel?.name ?? '') : formData.destination;
    const obraIdFinal = usaObra ? (formData.obraId || undefined) : undefined;

    if (formData.type === 'saida' && !destinoFinal.trim()) {
      toast.error(usaObra ? 'Selecione a obra de destino.' : 'Indique o destino.');
      return;
    }

    if (formData.type === 'saida') {
      for (const l of validas) {
        const p = products.find(pp => pp.id === l.productId);
        const qtd = parseFloat(l.quantity);
        if (p && qtd > p.currentStock) {
          toast.error(`Stock insuficiente para "${p.name}". Disponível: ${p.currentStock} ${getUnitLabel(p.unit)}`);
          return;
        }
      }
    }

    let okCount = 0;
    let queuedCount = 0;
    const falhas: Linha[] = [];

    for (const l of validas) {
      const result = await registar({
        produtoId:    l.productId,
        tipo:         formData.type as MovementType,
        quantidade:   parseFloat(l.quantity),
        responsavel:  formData.responsible,
        destinoObra:  destinoFinal || undefined,
        obraId:       obraIdFinal,
        observacoes:  formData.notes || undefined,
      });
      if (result.status === 'ok') okCount++;
      else if (result.status === 'queued') queuedCount++;
      else {
        toast.error(`${products.find(p => p.id === l.productId)?.name ?? 'Produto'}: ${result.message}`);
        falhas.push(l);
      }
    }

    if (falhas.length === 0) {
      const partes: string[] = [];
      if (okCount > 0) partes.push(`${okCount} movimento${okCount !== 1 ? 's' : ''} registado${okCount !== 1 ? 's' : ''}`);
      if (queuedCount > 0) partes.push(`${queuedCount} guardado${queuedCount !== 1 ? 's' : ''} sem ligação (será${queuedCount !== 1 ? 'ão' : ''} enviado${queuedCount !== 1 ? 's' : ''} automaticamente)`);
      toast.success(partes.join(' · ') + '.');
      setTimeout(() => navigate(-1), 1000);
    } else {
      // Mantém apenas as linhas que falharam, para o utilizador corrigir e tentar de novo
      setLinhas(falhas);
    }
  })

  const inputCls = 'w-full px-4 py-3.5 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-base';

  /* Cor do botão de submissão */
  const submitCls =
    formData.type === 'saida'   ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' :
    formData.type === 'entrada' ? 'bg-success text-success-foreground hover:bg-success/90' :
                                  'bg-warning text-white hover:bg-warning/90';

  const usadosIds = linhas.map(l => l.productId);

  const algumaInsuficiente = formData.type === 'saida' && linhas.some(l => {
    const p = products.find(pp => pp.id === l.productId);
    return p && parseFloat(l.quantity || '0') > p.currentStock;
  });

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-28">

      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-accent rounded-lg transition-colors shrink-0">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Novo Movimento</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Registar entrada ou saída de material</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* ── Seletor de tipo ─────────────────────── */}
        {!showAjuste ? (
          <div>
            <p className="text-sm font-semibold mb-3 px-0.5">O que vai registar?</p>
            <div className="grid grid-cols-2 gap-3">
              {/* Saída */}
              <button
                type="button"
                onClick={() => set({ type: 'saida' })}
                className={`rounded-2xl border-2 p-5 flex flex-col items-center gap-3 transition-all active:scale-95 ${
                  formData.type === 'saida'
                    ? 'border-destructive bg-destructive/8'
                    : 'border-border hover:border-destructive/40 hover:bg-destructive/5'
                }`}
              >
                <div className={`p-3 rounded-2xl ${formData.type === 'saida' ? 'bg-destructive/15' : 'bg-muted'}`}>
                  <ArrowUpCircle className={`w-7 h-7 ${formData.type === 'saida' ? 'text-destructive' : 'text-muted-foreground'}`} />
                </div>
                <div className="text-center">
                  <p className={`font-bold text-base ${formData.type === 'saida' ? 'text-destructive' : 'text-foreground'}`}>
                    Saída
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">Material para obra<br/>ou destino</p>
                </div>
              </button>

              {/* Entrada */}
              <button
                type="button"
                onClick={() => set({ type: 'entrada' })}
                className={`rounded-2xl border-2 p-5 flex flex-col items-center gap-3 transition-all active:scale-95 ${
                  formData.type === 'entrada'
                    ? 'border-success bg-success/8'
                    : 'border-border hover:border-success/40 hover:bg-success/5'
                }`}
              >
                <div className={`p-3 rounded-2xl ${formData.type === 'entrada' ? 'bg-success/15' : 'bg-muted'}`}>
                  <ArrowDownCircle className={`w-7 h-7 ${formData.type === 'entrada' ? 'text-success' : 'text-muted-foreground'}`} />
                </div>
                <div className="text-center">
                  <p className={`font-bold text-base ${formData.type === 'entrada' ? 'text-success' : 'text-foreground'}`}>
                    Entrada
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">Receção de material<br/>de fornecedor</p>
                </div>
              </button>
            </div>

            {/* Link discreto para correção de inventário */}
            <button
              type="button"
              onClick={() => { setShowAjuste(true); set({ type: 'ajuste', destination: '' }); setLinhas([novaLinha(linhas[0]?.productId)]); }}
              className="mt-3 w-full text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 py-2.5 rounded-xl hover:bg-accent transition-colors border border-dashed border-border"
            >
              <ClipboardEdit className="w-3.5 h-3.5" />
              Fazer uma correção de inventário
            </button>
          </div>
        ) : (
          /* ── Modo Ajuste / Correção ─────────────── */
          <div>
            <div className="flex items-center gap-2 mb-3">
              <button
                type="button"
                onClick={() => { setShowAjuste(false); set({ type: 'saida' }); }}
                className="p-1.5 hover:bg-accent rounded-lg transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <p className="text-sm font-semibold">Correção de Inventário</p>
            </div>
            <div className="bg-warning/10 border border-warning/30 rounded-2xl p-4 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-foreground">O stock é definido directamente</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Use apenas após contar fisicamente o armazém. O valor que introduzir
                  <strong> substitui</strong> o stock actual — não é somado nem subtraído.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Modo Ajuste: produto + novo stock (sempre 1 produto) ── */}
        {formData.type === 'ajuste' && (
          <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Produto</label>
              <ProductCombobox
                products={products}
                value={linhas[0]?.productId ?? ''}
                onChange={id => setLinhaProduto(linhas[0].id, id)}
                loading={productsLoading}
              />
            </div>

            {ajusteProduct && (
              <div className="grid grid-cols-3 gap-2 p-3 bg-accent/50 rounded-xl text-center">
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Stock Atual</p>
                  <p className={`text-xl font-bold mt-0.5 ${
                    ajusteProduct.status === 'sem-stock' ? 'text-destructive' :
                    ajusteProduct.status === 'baixo'     ? 'text-warning'     : 'text-foreground'
                  }`}>
                    {ajusteProduct.currentStock}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{getUnitLabel(ajusteProduct.unit)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Mínimo</p>
                  <p className="text-xl font-bold mt-0.5 text-warning">{ajusteProduct.minStock}</p>
                  <p className="text-[10px] text-muted-foreground">{getUnitLabel(ajusteProduct.unit)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Unidade</p>
                  <p className="text-lg font-bold mt-1">{getUnitLabel(ajusteProduct.unit)}</p>
                </div>
              </div>
            )}

            <div>
              <div className="flex items-baseline justify-between mb-2">
                <label className="text-sm font-medium">Novo Stock Real</label>
                {ajusteProduct && (
                  <span className="text-xs text-muted-foreground">
                    Actual: <strong>{ajusteProduct.currentStock} {getUnitLabel(ajusteProduct.unit)}</strong>
                  </span>
                )}
              </div>

              <input
                type="number"
                value={formData.quantity}
                onChange={e => set({ quantity: e.target.value })}
                className={`${inputCls} text-2xl font-bold text-center`}
                placeholder="0"
                min="0"
                step="0.01"
                required
                inputMode="decimal"
              />

              {ajusteNew !== null && ajusteProduct && (
                <div className={`mt-2 p-3 rounded-xl border flex items-center justify-center gap-2.5 ${
                  ajusteDelta === 0
                    ? 'bg-muted/30 border-border'
                    : ajusteDelta! > 0
                    ? 'bg-success/10 border-success/20'
                    : 'bg-destructive/10 border-destructive/20'
                }`}>
                  <span className="text-base font-semibold text-muted-foreground">
                    {ajusteProduct.currentStock}
                  </span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className={`text-base font-bold ${
                    ajusteDelta === 0 ? 'text-foreground' :
                    ajusteDelta! > 0 ? 'text-success' : 'text-destructive'
                  }`}>
                    {ajusteNew}
                  </span>
                  <span className="text-xs text-muted-foreground">{getUnitLabel(ajusteProduct.unit)}</span>
                  {ajusteDelta !== 0 && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      ajusteDelta! > 0 ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'
                    }`}>
                      {ajusteDelta! > 0 ? '+' : ''}{ajusteDelta}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Modo Entrada/Saída: lista de produtos ──────── */}
        {formData.type !== 'ajuste' && (
          <div className="space-y-3">
            {linhas.map((linha, idx) => {
              const produto = products.find(p => p.id === linha.productId);
              const qtd = parseFloat(linha.quantity || '0');
              const insuficiente = formData.type === 'saida' && produto && qtd > produto.currentStock;

              return (
                <div key={linha.id} className="bg-card rounded-2xl border border-border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium">Produto {linhas.length > 1 ? `#${idx + 1}` : ''}</label>
                    {linhas.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removerLinha(linha.id)}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                        aria-label="Remover produto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <ProductCombobox
                    products={products}
                    value={linha.productId}
                    onChange={id => setLinhaProduto(linha.id, id)}
                    excludeIds={usadosIds}
                    loading={productsLoading}
                  />

                  {produto && (
                    <div className="grid grid-cols-3 gap-2 p-3 bg-accent/50 rounded-xl text-center">
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Stock Atual</p>
                        <p className={`text-xl font-bold mt-0.5 ${
                          produto.status === 'sem-stock' ? 'text-destructive' :
                          produto.status === 'baixo'     ? 'text-warning'     : 'text-foreground'
                        }`}>
                          {produto.currentStock}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{getUnitLabel(produto.unit)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Mínimo</p>
                        <p className="text-xl font-bold mt-0.5 text-warning">{produto.minStock}</p>
                        <p className="text-[10px] text-muted-foreground">{getUnitLabel(produto.unit)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Unidade</p>
                        <p className="text-lg font-bold mt-1">{getUnitLabel(produto.unit)}</p>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium mb-2">Quantidade</label>
                    <input
                      type="number"
                      value={linha.quantity}
                      onChange={e => setLinhaQuantidade(linha.id, e.target.value)}
                      className={`${inputCls} text-2xl font-bold text-center`}
                      placeholder="0"
                      min="0"
                      step="0.01"
                      required
                      inputMode="decimal"
                    />
                    {insuficiente && (
                      <div className="mt-2 p-3 bg-destructive/10 border border-destructive/20 rounded-xl flex items-start gap-2">
                        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                        <p className="text-sm text-destructive">
                          Stock insuficiente! Disponível: {produto?.currentStock} {produto && getUnitLabel(produto.unit)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={adicionarLinha}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Plus className="w-4 h-4" />
              Adicionar outro produto
            </button>
          </div>
        )}

        {/* ── Campos adicionais ───────────────────── */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Responsável</label>
            <input
              type="text"
              value={formData.responsible}
              onChange={e => set({ responsible: e.target.value })}
              className={inputCls}
              required
            />
          </div>

          {/* Fornecedor (entrada) — texto livre */}
          {formData.type === 'entrada' && (
            <div>
              <label className="block text-sm font-medium mb-2">Fornecedor</label>
              <input
                type="text"
                value={formData.destination}
                onChange={e => set({ destination: e.target.value })}
                className={inputCls}
                placeholder="Nome do fornecedor (opcional)"
              />
            </div>
          )}

          {/* Obra de destino (saída) — liga o custo do material à obra */}
          {formData.type === 'saida' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium">
                  Obra de Destino <span className="text-destructive ml-1">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setOutroDestino(v => !v)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {outroDestino ? 'Escolher obra' : 'Outro destino'}
                </button>
              </div>
              {outroDestino ? (
                <input
                  type="text"
                  value={formData.destination}
                  onChange={e => set({ destination: e.target.value })}
                  className={inputCls}
                  placeholder="Destino sem obra formal (ex: sede, cliente)"
                />
              ) : (
                <select
                  value={formData.obraId}
                  onChange={e => set({ obraId: e.target.value })}
                  className={inputCls}
                >
                  <option value="">Selecione a obra</option>
                  {obras.filter(o => o.status === 'ativa').map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              )}
              {!outroDestino && obras.length === 0 && (
                <p className="text-xs text-warning mt-1.5">Ainda não há obras. Crie uma obra ou use "Outro destino".</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">
              {formData.type === 'ajuste' ? (
                <>Motivo da Correção <span className="text-destructive">*</span></>
              ) : (
                <>Observações <span className="text-muted-foreground font-normal">(opcional)</span></>
              )}
            </label>
            <textarea
              value={formData.notes}
              onChange={e => set({ notes: e.target.value })}
              className={`${inputCls} resize-none`}
              rows={3}
              placeholder={
                formData.type === 'ajuste'
                  ? 'Ex: Contagem física realizada. Diferença detectada por quebra/perda.'
                  : 'Notas adicionais sobre este movimento…'
              }
              required={formData.type === 'ajuste'}
            />
          </div>
        </div>

        {/* ── Botões de ação ──────────────────────── */}
        <div className="sticky bottom-20 md:bottom-0 py-3 bg-background/80 backdrop-blur-sm md:bg-transparent md:backdrop-blur-none">
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving || algumaInsuficiente}
              className={`flex-1 py-4 rounded-xl font-bold text-base active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md ${submitCls}`}
            >
              {saving
                ? 'A guardar…'
                : formData.type === 'ajuste'
                ? 'Confirmar Correção'
                : `Guardar ${formData.type === 'entrada' ? 'Entrada' : 'Saída'}${linhas.length > 1 ? 's' : ''}`}
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              disabled={saving}
              className="px-5 py-4 bg-secondary text-secondary-foreground rounded-xl font-medium hover:bg-secondary/90 active:scale-[0.98] transition-all"
            >
              Cancelar
            </button>
          </div>
        </div>

      </form>
    </div>
  );
}
