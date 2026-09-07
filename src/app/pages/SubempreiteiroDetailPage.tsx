import { useState, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import {
  ChevronLeft, Pencil, Trash2, CheckCircle2, FileEdit, ShieldCheck,
  Phone, Building2, Lock, Plus, Calendar, ClipboardList,
  Banknote, TrendingDown, AlertTriangle, X, TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { fmtEuro, fmtNumber } from '../lib/format';
import { useRole } from '@/features/auth/useRole';
import {
  useSubempreiteiro,
  useValidarSubempreiteiro,
  useEliminarSubempreiteiro,
} from '@/features/subempreiteiros/hooks/useSubempreiteiros';
import { useAutos } from '@/features/autos/hooks/useAutos';
import { useRetencaoTotais, useCriarLiberacao, useEliminarLiberacao } from '@/features/subempreiteiros/hooks/useRetencao';
import type { LiberacaoRetencao } from '../types';

const MOTIVO_LABEL: Record<LiberacaoRetencao['motivo'], string> = {
  conclusao_obra:  'Conclusão de obra',
  periodo_garantia: 'Fim do período de garantia',
  acordo_parcial:  'Acordo parcial',
  outro:           'Outro',
};

function BadgePagamento({ estado }: { estado: 'por_pagar' | 'pago' | 'em_atraso' }) {
  if (estado === 'pago')
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-success/10 text-success">Pago</span>;
  if (estado === 'em_atraso')
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive flex items-center gap-0.5"><TriangleAlert className="w-2.5 h-2.5" />Atraso</span>;
  return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">Por pagar</span>;
}

export function SubempreiteiroDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { isAdmin, podeSubempreitadas } = useRole();
  const { sub, loading, reload }         = useSubempreiteiro(id);
  const { autos, loading: autosLoading } = useAutos(id);
  const { validar, loading: validating } = useValidarSubempreiteiro();
  const { eliminar, loading: deleting }  = useEliminarSubempreiteiro();

  const {
    retencaoAcumulada, retencaoLibertada, retencaoEmAberto,
    liberacoes, loading: libLoading, reload: reloadLib,
  } = useRetencaoTotais(autos, id);

  const { criar: criarLib, loading: criarLibLoading } = useCriarLiberacao();
  const { eliminar: eliminarLib } = useEliminarLiberacao();

  const [confirmValidate, setConfirmValidate] = useState(false);
  const [confirmDelete,   setConfirmDelete]   = useState(false);
  const [showLibForm,     setShowLibForm]     = useState(false);
  const [libForm, setLibForm] = useState({
    valor: '', motivo: 'conclusao_obra' as LiberacaoRetencao['motivo'], observacoes: '',
  });

  const executado = useMemo(() => autos.filter(a => a.status === 'validado').reduce((s, a) => s + a.periodValue, 0), [autos]);
  const pendente  = useMemo(() => autos.filter(a => a.status === 'rascunho').reduce((s, a) => s + a.periodValue, 0), [autos]);
  const porPagar  = useMemo(() => autos.filter(a => a.status === 'validado' && a.estadoPagamento !== 'pago').reduce((s, a) => s + a.valorLiquido, 0), [autos]);

  if (loading) return <div className="max-w-2xl mx-auto p-8 text-center text-sm text-muted-foreground">A carregar…</div>;
  if (!sub)    return <div className="max-w-2xl mx-auto p-8 text-center text-sm text-muted-foreground">Contratação não encontrada.</div>;

  const isValidado = sub.status === 'validado';
  const falta = sub.agreedValue - executado;

  const handleValidate = async () => {
    const result = await validar(sub.id);
    if (result) { toast.success('Contratação validada.'); setConfirmValidate(false); reload(); }
    else toast.error('Não foi possível validar.');
  };

  const handleDelete = async () => {
    const ok = await eliminar(sub.id);
    if (ok) { toast.success('Contratação eliminada.'); navigate('/subempreiteiros'); }
    else toast.error('Não foi possível eliminar.');
  };

  const handleCriarLib = async () => {
    const valor = parseFloat(libForm.valor);
    if (!valor || valor <= 0) { toast.error('Indique um valor válido.'); return; }
    if (valor > retencaoEmAberto + 0.01) {
      toast.error(`Não pode libertar mais do que a retenção em aberto (${fmtEuro(retencaoEmAberto)}).`);
      return;
    }
    const result = await criarLib({
      subcontractorId: sub.id,
      obraId:          sub.obraId,
      valor,
      dataLiberacao:   new Date().toISOString().slice(0, 10),
      motivo:          libForm.motivo,
      observacoes:     libForm.observacoes || undefined,
    });
    if (result) {
      toast.success(`Libertação de ${fmtEuro(valor)} registada.`);
      setShowLibForm(false);
      setLibForm({ valor: '', motivo: 'conclusao_obra', observacoes: '' });
      reloadLib();
    }
  };

  const handleEliminarLib = async (libId: string) => {
    const ok = await eliminarLib(libId);
    if (ok) { toast.success('Libertação eliminada.'); reloadLib(); }
    else toast.error('Não foi possível eliminar.');
  };

  const inputCls = 'w-full px-3 py-2.5 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm';

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-28">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-accent rounded-lg transition-colors shrink-0">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold truncate">{sub.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 shrink-0" /> {sub.obraName ?? '—'}
          </p>
        </div>
        {isValidado ? (
          <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-success/10 text-success shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" /> Validado
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-warning/10 text-warning shrink-0">
            <FileEdit className="w-3.5 h-3.5" /> Rascunho
          </span>
        )}
      </div>

      {isValidado && (
        <div className="bg-success/5 border border-success/20 rounded-2xl p-3 flex items-center gap-2.5 text-sm">
          <Lock className="w-4 h-4 text-success shrink-0" />
          <span className="text-muted-foreground">
            Contratação validada{sub.validatedAt ? ` em ${sub.validatedAt.toLocaleDateString('pt-PT')}` : ''} — bloqueada para edição.
          </span>
        </div>
      )}

      {/* Alerta de pagamentos em atraso */}
      {autos.some(a => a.estadoPagamento === 'em_atraso') && (
        <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-3 flex items-center gap-2.5 text-sm">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <span className="text-muted-foreground">
            <strong className="text-destructive">
              {autos.filter(a => a.estadoPagamento === 'em_atraso').length} auto{autos.filter(a => a.estadoPagamento === 'em_atraso').length > 1 ? 's' : ''}
            </strong>{' '}marcado{autos.filter(a => a.estadoPagamento === 'em_atraso').length > 1 ? 's' : ''} em atraso de pagamento.
          </span>
        </div>
      )}

      {/* Resumo financeiro executado */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-2xl border border-border p-4 text-center">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Acordado</p>
          <p className="text-lg md:text-xl font-bold mt-1 text-primary">{fmtEuro(sub.agreedValue)}</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4 text-center">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Executado</p>
          <p className="text-lg md:text-xl font-bold mt-1 text-success">{fmtEuro(executado)}</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4 text-center">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Falta</p>
          <p className="text-lg md:text-xl font-bold mt-1">{fmtEuro(falta)}</p>
        </div>
      </div>

      {/* Resumo de pagamentos */}
      {isValidado && autos.some(a => a.status === 'validado') && (
        <div className="bg-card rounded-2xl border border-border p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Pagamentos</p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total executado (bruto)</span>
            <span className="font-semibold">{fmtEuro(executado)}</span>
          </div>
          {sub.retencaoPercentagem > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Retenção acumulada ({fmtNumber(sub.retencaoPercentagem)}%)</span>
              <span className="font-semibold text-warning">− {fmtEuro(retencaoAcumulada)}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm border-t border-border pt-2 mt-2">
            <span className="font-medium">Valor líquido executado</span>
            <span className="font-bold text-primary">{fmtEuro(executado - retencaoAcumulada)}</span>
          </div>
          {porPagar > 0 && (
            <div className="flex items-center justify-between text-sm bg-warning/5 border border-warning/20 rounded-xl px-3 py-2 mt-1">
              <span className="font-medium text-warning flex items-center gap-1.5"><Banknote className="w-3.5 h-3.5" /> Por pagar</span>
              <span className="font-bold text-warning">{fmtEuro(porPagar)}</span>
            </div>
          )}
        </div>
      )}

      {pendente > 0 && (
        <p className="text-xs text-muted-foreground text-center -mt-1">
          + {fmtEuro(pendente)} em autos por validar (ainda não contam para o executado).
        </p>
      )}

      {/* Painel de Retenção de Garantia */}
      {isValidado && sub.retencaoPercentagem > 0 && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border bg-warning/5 flex items-center justify-between">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-warning" />
              Retenção de Garantia ({fmtNumber(sub.retencaoPercentagem)}%)
            </h2>
            {(isAdmin || podeSubempreitadas) && retencaoEmAberto > 0 && (
              <button
                onClick={() => setShowLibForm(v => !v)}
                className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <Plus className="w-4 h-4" /> Libertar
              </button>
            )}
          </div>

          {/* Totais */}
          <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
            <div className="p-4 text-center">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Retido</p>
              <p className="text-base font-bold mt-1 text-warning">{libLoading ? '—' : fmtEuro(retencaoAcumulada)}</p>
            </div>
            <div className="p-4 text-center">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Libertado</p>
              <p className="text-base font-bold mt-1 text-success">{libLoading ? '—' : fmtEuro(retencaoLibertada)}</p>
            </div>
            <div className="p-4 text-center">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Em Aberto</p>
              <p className={`text-base font-bold mt-1 ${retencaoEmAberto > 0 ? 'text-destructive' : 'text-success'}`}>
                {libLoading ? '—' : fmtEuro(retencaoEmAberto)}
              </p>
            </div>
          </div>

          {/* Formulário de libertação */}
          {showLibForm && (
            <div className="p-4 bg-primary/3 border-b border-border space-y-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold">Nova Libertação de Retenção</p>
                <button onClick={() => setShowLibForm(false)} className="p-1 hover:bg-accent rounded-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Valor a libertar (€) *</label>
                  <input
                    type="number" inputMode="decimal" min="0.01" step="0.01"
                    max={retencaoEmAberto}
                    value={libForm.valor}
                    onChange={e => setLibForm(f => ({ ...f, valor: e.target.value }))}
                    placeholder={`máx. ${fmtEuro(retencaoEmAberto)}`}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Motivo *</label>
                  <select
                    value={libForm.motivo}
                    onChange={e => setLibForm(f => ({ ...f, motivo: e.target.value as LiberacaoRetencao['motivo'] }))}
                    className={inputCls}
                  >
                    {(Object.entries(MOTIVO_LABEL) as [LiberacaoRetencao['motivo'], string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Observações</label>
                <input
                  type="text"
                  value={libForm.observacoes}
                  onChange={e => setLibForm(f => ({ ...f, observacoes: e.target.value }))}
                  placeholder="Ex: Vistoria final aprovada em 01/09/2026"
                  className={inputCls}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleCriarLib}
                  disabled={criarLibLoading}
                  className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-all disabled:opacity-60"
                >
                  {criarLibLoading ? 'A registar…' : 'Confirmar Libertação'}
                </button>
                <button onClick={() => setShowLibForm(false)} className="px-4 py-2.5 bg-secondary/20 rounded-xl text-sm font-medium hover:bg-secondary/30 transition-all">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Histórico de libertações */}
          {!libLoading && liberacoes.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted-foreground text-center">
              {retencaoAcumulada > 0 ? 'Ainda não foram efectuadas libertações.' : 'Nenhum auto validado com retenção ainda.'}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {liberacoes.map(lib => (
                <div key={lib.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-success">{fmtEuro(lib.valor)}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(lib.dataLiberacao).toLocaleDateString('pt-PT')} · {MOTIVO_LABEL[lib.motivo]}
                      {lib.observacoes && ` · ${lib.observacoes}`}
                    </p>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => handleEliminarLib(lib.id)}
                      className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Autos de Medição */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border bg-muted/30 flex items-center justify-between">
          <h2 className="font-semibold text-sm flex items-center gap-2"><ClipboardList className="w-4 h-4" /> Autos de Medição</h2>
          {isValidado && podeSubempreitadas && (
            <button
              onClick={() => navigate(`/subempreiteiros/${sub.id}/autos/novo`)}
              className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <Plus className="w-4 h-4" /> Novo Auto
            </button>
          )}
        </div>
        {!isValidado ? (
          <p className="px-5 py-6 text-sm text-muted-foreground text-center">
            Valide a contratação para começar a lançar autos de medição.
          </p>
        ) : autosLoading ? (
          <p className="px-5 py-6 text-sm text-muted-foreground text-center">A carregar…</p>
        ) : autos.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground text-center">Ainda não há autos. Crie o primeiro com "Novo Auto".</p>
        ) : (
          <div className="divide-y divide-border">
            {autos.map(a => (
              <Link key={a.id} to={`/autos/${a.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-accent/40 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-semibold shrink-0">Nº {a.number}</span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> {a.date.toLocaleDateString('pt-PT')}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* Estado do auto */}
                  {a.status === 'validado' ? (
                    <span className="text-[11px] font-semibold text-success flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Validado</span>
                  ) : (
                    <span className="text-[11px] font-semibold text-warning flex items-center gap-1"><FileEdit className="w-3 h-3" /> Rascunho</span>
                  )}
                  {/* Estado de pagamento (só validados) */}
                  {a.status === 'validado' && <BadgePagamento estado={a.estadoPagamento} />}
                  {/* Valor líquido */}
                  <span className="text-sm font-bold">
                    {a.status === 'validado' && sub.retencaoPercentagem > 0 ? fmtEuro(a.valorLiquido) : fmtEuro(a.periodValue)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Dados da contratação */}
      <div className="bg-card rounded-2xl border border-border divide-y divide-border">
        <div className="px-5 py-3.5 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Tipo de contrato</span>
          <span className="text-sm font-semibold">{sub.type === 'global' ? 'Preço fechado' : 'Preços unitários'}</span>
        </div>
        <div className="px-5 py-3.5 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Retenção de garantia</span>
          <span className="text-sm font-semibold">{fmtNumber(sub.retencaoPercentagem)}%</span>
        </div>
        {sub.contact && (
          <div className="px-5 py-3.5 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Contacto</span>
            <a href={`tel:${sub.contact}`} className="text-sm font-semibold text-primary flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" /> {sub.contact}
            </a>
          </div>
        )}
      </div>

      {/* Artigos (unitário) */}
      {sub.type === 'unitario' && sub.items && sub.items.length > 0 && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border bg-muted/30">
            <h2 className="font-semibold text-sm">Artigos ({sub.items.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  {['Descrição', 'Un.', 'Qtd', 'Preço', 'Subtotal'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sub.items.map(it => (
                  <tr key={it.id}>
                    <td className="px-3 py-2.5">
                      {it.description}
                      {it.isExtra && <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-warning/10 text-warning">extra</span>}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{it.unit}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{fmtNumber(it.plannedQuantity)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{fmtEuro(it.unitPrice)}</td>
                    <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{fmtEuro(it.unitPrice * it.plannedQuantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Condições */}
      {sub.conditions && (
        <div className="bg-card rounded-2xl border border-border p-4">
          <h2 className="font-semibold text-sm mb-2">Condições Acordadas</h2>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{sub.conditions}</p>
        </div>
      )}

      {/* Ações */}
      {!isValidado && (
        <div className="flex flex-col gap-3">
          {isAdmin && (
            confirmValidate ? (
              <div className="bg-success/5 border border-success/30 rounded-2xl p-4 space-y-3">
                <p className="text-sm font-medium">Validar esta contratação? Depois de validada, ninguém poderá alterá-la.</p>
                <div className="flex gap-3">
                  <button onClick={handleValidate} disabled={validating} className="flex-1 py-3 bg-success text-success-foreground rounded-xl font-bold hover:bg-success/90 transition-all disabled:opacity-60">
                    {validating ? 'A validar…' : 'Sim, validar'}
                  </button>
                  <button onClick={() => setConfirmValidate(false)} disabled={validating} className="px-4 py-3 bg-secondary/20 rounded-xl font-medium hover:bg-secondary/30 transition-all">Cancelar</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmValidate(true)} className="w-full py-3.5 bg-success text-success-foreground rounded-xl font-bold hover:bg-success/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                <ShieldCheck className="w-5 h-5" /> Validar Contratação
              </button>
            )
          )}
          {podeSubempreitadas && (
            <div className="flex gap-3">
              <button onClick={() => navigate(`/subempreiteiros/${sub.id}/editar`)} className="flex-1 py-3 bg-secondary/20 text-foreground rounded-xl font-medium hover:bg-secondary/30 transition-all flex items-center justify-center gap-2">
                <Pencil className="w-4 h-4" /> Editar
              </button>
              {confirmDelete ? (
                <button onClick={handleDelete} disabled={deleting} className="flex-1 py-3 bg-destructive text-destructive-foreground rounded-xl font-medium hover:bg-destructive/90 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                  <Trash2 className="w-4 h-4" /> {deleting ? 'A eliminar…' : 'Confirmar'}
                </button>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="px-4 py-3 text-destructive hover:bg-destructive/10 rounded-xl font-medium transition-all flex items-center justify-center gap-2">
                  <Trash2 className="w-4 h-4" /> <span className="hidden sm:inline">Eliminar</span>
                </button>
              )}
            </div>
          )}
          {!isAdmin && (
            <p className="text-xs text-muted-foreground text-center">A validação da contratação é feita por um administrador.</p>
          )}
        </div>
      )}
    </div>
  );
}
