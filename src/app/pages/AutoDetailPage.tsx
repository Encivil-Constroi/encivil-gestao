import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ChevronLeft, Pencil, Trash2, CheckCircle2, FileEdit, ShieldCheck, Lock, Calendar,
  Banknote, TrendingDown, TriangleAlert, Clock, CreditCard,
} from 'lucide-react';
import { toast } from 'sonner';
import { fmtEuro, fmtNumber } from '../lib/format';
import { useRole } from '@/features/auth/useRole';
import {
  useAuto, useValidarAuto, useEliminarAuto,
  useMarcarAutoPago, useMarcarAutoEmAtraso,
} from '@/features/autos/hooks/useAutos';

function BadgePagamento({ estado }: { estado: 'por_pagar' | 'pago' | 'em_atraso' }) {
  if (estado === 'pago')
    return (
      <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-success/10 text-success">
        <CheckCircle2 className="w-3 h-3" /> Pago
      </span>
    );
  if (estado === 'em_atraso')
    return (
      <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-destructive/10 text-destructive">
        <TriangleAlert className="w-3 h-3" /> Em Atraso
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
      <Clock className="w-3 h-3" /> Por Pagar
    </span>
  );
}

export function AutoDetailPage() {
  const navigate = useNavigate();
  const { autoId } = useParams();
  const { isAdmin, podeSubempreitadas } = useRole();
  const { auto, loading, reload }         = useAuto(autoId);
  const { validar, loading: validating }  = useValidarAuto();
  const { eliminar, loading: deleting }   = useEliminarAuto();
  const { marcar: marcarPago, loading: marcandoPago }     = useMarcarAutoPago();
  const { marcar: marcarAtraso, loading: marcandoAtraso } = useMarcarAutoEmAtraso();

  const [confirmValidate,  setConfirmValidate]  = useState(false);
  const [confirmDelete,    setConfirmDelete]    = useState(false);
  const [showPagoForm,     setShowPagoForm]     = useState(false);
  const [confirmAtraso,    setConfirmAtraso]    = useState(false);
  const [referencia,       setReferencia]       = useState('');

  if (loading) return <div className="max-w-2xl mx-auto p-8 text-center text-sm text-muted-foreground">A carregar…</div>;
  if (!auto)   return <div className="max-w-2xl mx-auto p-8 text-center text-sm text-muted-foreground">Auto não encontrado.</div>;

  const isValidado    = auto.status === 'validado';
  const temRetencao   = auto.retencaoPercentagem > 0;
  const baseLines     = (auto.lines ?? []).filter(l => !l.isExtra);
  const extraLines    = (auto.lines ?? []).filter(l => l.isExtra);

  const handleValidate = async () => {
    const result = await validar(auto.id);
    if (result) {
      toast.success('Auto validado. Fica agora bloqueado e conta para o executado.');
      setConfirmValidate(false);
      reload();
    } else {
      toast.error('Não foi possível validar. Confirme que é administrador e que o auto tem valor.');
    }
  };

  const handleDelete = async () => {
    const ok = await eliminar(auto.id);
    if (ok) {
      toast.success('Auto eliminado.');
      navigate(`/subempreiteiros/${auto.subcontractorId}`);
    } else {
      toast.error('Não foi possível eliminar.');
    }
  };

  const handleMarcarPago = async () => {
    const ok = await marcarPago(auto.id, referencia || undefined);
    if (ok) {
      toast.success('Auto marcado como pago.');
      setShowPagoForm(false);
      setReferencia('');
      reload();
    } else {
      toast.error('Não foi possível marcar como pago.');
    }
  };

  const handleMarcarAtraso = async () => {
    const ok = await marcarAtraso(auto.id);
    if (ok) {
      toast.success('Auto marcado em atraso de pagamento.');
      setConfirmAtraso(false);
      reload();
    } else {
      toast.error('Não foi possível marcar em atraso.');
    }
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
          <h1 className="text-xl md:text-2xl font-semibold">Auto Nº {auto.number}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 shrink-0" /> {auto.date.toLocaleDateString('pt-PT')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {isValidado ? (
            <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-success/10 text-success">
              <CheckCircle2 className="w-3.5 h-3.5" /> Validado
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-warning/10 text-warning">
              <FileEdit className="w-3.5 h-3.5" /> Rascunho
            </span>
          )}
          {isValidado && <BadgePagamento estado={auto.estadoPagamento} />}
        </div>
      </div>

      {isValidado && (
        <div className="bg-success/5 border border-success/20 rounded-2xl p-3 flex items-center gap-2.5 text-sm">
          <Lock className="w-4 h-4 text-success shrink-0" />
          <span className="text-muted-foreground">
            Auto validado{auto.validatedAt ? ` em ${auto.validatedAt.toLocaleDateString('pt-PT')}` : ''} — bloqueado para edição.
          </span>
        </div>
      )}

      {/* Valor do auto — bruto + retenção + líquido */}
      {isValidado && temRetencao ? (
        <div className="bg-card rounded-2xl border border-border divide-y divide-border">
          <div className="px-5 py-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Valor bruto</span>
            <span className="text-sm font-semibold">{fmtEuro(auto.periodValue)}</span>
          </div>
          <div className="px-5 py-4 flex items-center justify-between bg-warning/3">
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5 text-warning" />
              Retenção de garantia ({fmtNumber(auto.retencaoPercentagem)}%)
            </span>
            <span className="text-sm font-semibold text-warning">− {fmtEuro(auto.valorRetido)}</span>
          </div>
          <div className="px-5 py-4 flex items-center justify-between bg-primary/3">
            <span className="text-sm font-bold">Valor líquido a pagar</span>
            <span className="text-2xl font-bold text-primary">{fmtEuro(auto.valorLiquido)}</span>
          </div>
        </div>
      ) : (
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex items-center justify-between">
          <span className="text-sm font-medium">Valor deste auto</span>
          <span className="text-2xl font-bold text-primary">{fmtEuro(auto.periodValue)}</span>
        </div>
      )}

      {/* Info de pagamento quando pago */}
      {isValidado && auto.estadoPagamento === 'pago' && (
        <div className="bg-success/5 border border-success/20 rounded-2xl p-4 space-y-2">
          <p className="text-sm font-semibold text-success flex items-center gap-2">
            <CreditCard className="w-4 h-4" /> Pagamento registado
          </p>
          {auto.dataPagamento && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Data</span>
              <span className="font-medium">{auto.dataPagamento.toLocaleDateString('pt-PT')}</span>
            </div>
          )}
          {auto.referenciaPagamento && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Referência</span>
              <span className="font-medium font-mono">{auto.referenciaPagamento}</span>
            </div>
          )}
        </div>
      )}

      {/* Aviso em atraso */}
      {isValidado && auto.estadoPagamento === 'em_atraso' && (
        <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-3 flex items-center gap-2.5 text-sm">
          <TriangleAlert className="w-4 h-4 text-destructive shrink-0" />
          <span className="text-muted-foreground">Este auto está marcado como <strong className="text-destructive">em atraso de pagamento</strong>.</span>
        </div>
      )}

      {/* Acções de pagamento (só para admin/gestor em autos validados por pagar/em atraso) */}
      {isValidado && auto.estadoPagamento !== 'pago' && (isAdmin || podeSubempreitadas) && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border bg-muted/30">
            <h2 className="font-semibold text-sm flex items-center gap-2"><Banknote className="w-4 h-4" /> Gestão de Pagamento</h2>
          </div>
          <div className="p-4 space-y-3">
            {/* Marcar como Pago */}
            {showPagoForm ? (
              <div className="bg-success/5 border border-success/20 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-success">Marcar como Pago</p>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Referência do pagamento (opcional)</label>
                  <input
                    type="text"
                    value={referencia}
                    onChange={e => setReferencia(e.target.value)}
                    placeholder="Ex: Transf. MB 2026-09-02, Cheque Nº 12345…"
                    className={inputCls}
                    autoFocus
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleMarcarPago}
                    disabled={marcandoPago}
                    className="flex-1 py-2.5 bg-success text-success-foreground rounded-xl font-bold text-sm hover:bg-success/90 transition-all disabled:opacity-60"
                  >
                    {marcandoPago ? 'A registar…' : 'Confirmar Pagamento'}
                  </button>
                  <button
                    onClick={() => { setShowPagoForm(false); setReferencia(''); }}
                    className="px-4 py-2.5 bg-secondary/20 rounded-xl text-sm font-medium hover:bg-secondary/30 transition-all"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setShowPagoForm(true); setConfirmAtraso(false); }}
                className="w-full py-3 bg-success text-success-foreground rounded-xl font-semibold text-sm hover:bg-success/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" /> Marcar como Pago
              </button>
            )}

            {/* Marcar em Atraso (só se ainda for por_pagar) */}
            {auto.estadoPagamento === 'por_pagar' && !showPagoForm && (
              confirmAtraso ? (
                <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-medium">Marcar este auto como <strong>em atraso</strong> de pagamento?</p>
                  <div className="flex gap-3">
                    <button
                      onClick={handleMarcarAtraso}
                      disabled={marcandoAtraso}
                      className="flex-1 py-2.5 bg-destructive text-destructive-foreground rounded-xl font-bold text-sm hover:bg-destructive/90 transition-all disabled:opacity-60"
                    >
                      {marcandoAtraso ? 'A marcar…' : 'Sim, marcar em atraso'}
                    </button>
                    <button
                      onClick={() => setConfirmAtraso(false)}
                      className="px-4 py-2.5 bg-secondary/20 rounded-xl text-sm font-medium hover:bg-secondary/30 transition-all"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmAtraso(true)}
                  className="w-full py-2.5 text-destructive border border-destructive/30 rounded-xl font-medium text-sm hover:bg-destructive/5 transition-all flex items-center justify-center gap-2"
                >
                  <TriangleAlert className="w-4 h-4" /> Marcar em Atraso
                </button>
              )
            )}
          </div>
        </div>
      )}

      {auto.periodPercentage != null && (
        <div className="bg-card rounded-2xl border border-border px-5 py-3.5 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Percentagem executada no período</span>
          <span className="text-sm font-semibold">{fmtNumber(auto.periodPercentage)}%</span>
        </div>
      )}

      {/* Medições */}
      {baseLines.length > 0 && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border bg-muted/30">
            <h2 className="font-semibold text-sm">Medições</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  {['Descrição', 'Un.', 'Qtd', 'Preço', 'Valor'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {baseLines.map(l => (
                  <tr key={l.id}>
                    <td className="px-3 py-2.5">{l.description}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{l.unit}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{fmtNumber(l.quantity)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{fmtEuro(l.unitPrice)}</td>
                    <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{fmtEuro(l.unitPrice * l.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trabalhos a mais */}
      {extraLines.length > 0 && (
        <div className="bg-card rounded-2xl border border-warning/30 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-warning/30 bg-warning/5">
            <h2 className="font-semibold text-sm text-warning">Trabalhos a mais</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  {['Descrição', 'Un.', 'Qtd', 'Preço', 'Valor'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {extraLines.map(l => (
                  <tr key={l.id}>
                    <td className="px-3 py-2.5">{l.description}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{l.unit}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{fmtNumber(l.quantity)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{fmtEuro(l.unitPrice)}</td>
                    <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{fmtEuro(l.unitPrice * l.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {auto.notes && (
        <div className="bg-card rounded-2xl border border-border p-4">
          <h2 className="font-semibold text-sm mb-2">Observações</h2>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{auto.notes}</p>
        </div>
      )}

      {/* Ações de validação/eliminação — só para rascunho */}
      {!isValidado && (
        <div className="flex flex-col gap-3">
          {isAdmin && (
            confirmValidate ? (
              <div className="bg-success/5 border border-success/30 rounded-2xl p-4 space-y-3">
                <p className="text-sm font-medium">Validar este auto? Depois de validado, conta para o executado e não pode ser alterado.</p>
                <div className="flex gap-3">
                  <button onClick={handleValidate} disabled={validating} className="flex-1 py-3 bg-success text-success-foreground rounded-xl font-bold hover:bg-success/90 transition-all disabled:opacity-60">
                    {validating ? 'A validar…' : 'Sim, validar'}
                  </button>
                  <button onClick={() => setConfirmValidate(false)} disabled={validating} className="px-4 py-3 bg-secondary/20 rounded-xl font-medium hover:bg-secondary/30 transition-all">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmValidate(true)} className="w-full py-3.5 bg-success text-success-foreground rounded-xl font-bold hover:bg-success/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                <ShieldCheck className="w-5 h-5" /> Validar Auto
              </button>
            )
          )}
          {podeSubempreitadas && (
            <div className="flex gap-3">
              <button onClick={() => navigate(`/autos/${auto.id}/editar`)} className="flex-1 py-3 bg-secondary/20 text-foreground rounded-xl font-medium hover:bg-secondary/30 transition-all flex items-center justify-center gap-2">
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
            <p className="text-xs text-muted-foreground text-center">A validação do auto é feita por um administrador.</p>
          )}
        </div>
      )}
    </div>
  );
}
