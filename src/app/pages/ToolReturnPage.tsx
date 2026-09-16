import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { SignaturePad } from '../components/SignaturePad';
import { useFerramenta } from '@/features/ferramentas/hooks/useFerramentas';
import { useEmprestimos, useRegistarDevolucao } from '@/features/ferramentas/hooks/useEmprestimos';
import { useRole } from '@/features/auth/useRole';
import type { ReturnCondition } from '../types';

const returnConditionOpts: [ReturnCondition, string][] = [
  ['bom_estado', 'Bom Estado'],
  ['danificada', 'Danificada'],
  ['perdida', 'Perdida / Extraviada'],
];

const inputCls = 'w-full px-4 py-3.5 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-base';

export function ToolReturnPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { nome } = useRole();

  const { tool, loading: loadingTool } = useFerramenta(id);
  const loanFiltros = useMemo(() => ({ ferramentaId: id, estado: 'ativo' as const }), [id]);
  const { loans, loading: loadingLoans } = useEmprestimos(loanFiltros);
  const { devolver, loading } = useRegistarDevolucao();
  const loan = loans[0];

  const [formData, setFormData] = useState({
    returnCondition: 'bom_estado' as ReturnCondition,
    receivedBy: nome,
    notes: '',
  });
  const [signature, setSignature] = useState<string | null>(null);
  const [responsibleSignature, setResponsibleSignature] = useState<string | null>(null);

  useEffect(() => {
    if (nome) setFormData(prev => ({ ...prev, receivedBy: prev.receivedBy || nome }));
  }, [nome]);

  if (loadingTool || loadingLoans) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!tool || !loan) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold">Não há empréstimo ativo para devolver</h2>
        <button onClick={() => navigate('/ferramentas')} className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl">
          Voltar
        </button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signature) { toast.error('A assinatura do funcionário é obrigatória.'); return; }
    if (!responsibleSignature) { toast.error('A assinatura de quem está a receber é obrigatória.'); return; }
    const result = await devolver({
      loanId: loan.id,
      returnCondition: formData.returnCondition,
      receivedBy: formData.receivedBy,
      signature,
      responsibleSignature,
      returnNotes: formData.notes || undefined,
    });
    if (result) {
      toast.success('Devolução registada com sucesso!');
      navigate(`/ferramentas/${tool.id}`, { replace: true, state: { termLoan: result } });
    } else {
      toast.error('Erro ao registar devolução.');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-28">

      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="Voltar" className="p-2 hover:bg-accent rounded-lg transition-colors shrink-0">
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Registar Devolução</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loan.toolCode} · {loan.toolName} — emprestada a {loan.employeeName}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Estado na Devolução</label>
            <select value={formData.returnCondition} onChange={e => setFormData({ ...formData, returnCondition: e.target.value as ReturnCondition })} className={inputCls}>
              {returnConditionOpts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {formData.returnCondition === 'danificada' && (
              <p className="text-xs text-warning mt-1.5">A ferramenta passará para o estado "Em Manutenção".</p>
            )}
            {formData.returnCondition === 'perdida' && (
              <p className="text-xs text-destructive mt-1.5">A ferramenta será marcada como "Inativa".</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Recebido por</label>
            <input type="text" value={formData.receivedBy} onChange={e => setFormData({ ...formData, receivedBy: e.target.value })} className={inputCls} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Observações <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            <textarea
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              className={`${inputCls} resize-none`}
              rows={3}
              placeholder="Detalhes sobre o estado, danos, etc."
            />
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <SignaturePad
            label="Assinatura do Funcionário (confirma a devolução da ferramenta)"
            value={signature}
            onChange={setSignature}
          />
          <SignaturePad
            label="Assinatura de Quem Recebe (operador do sistema)"
            value={responsibleSignature}
            onChange={setResponsibleSignature}
          />
        </div>

        <div className="sticky bottom-20 md:bottom-0 py-3 bg-background/80 backdrop-blur-sm md:bg-transparent md:backdrop-blur-none">
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading || !signature || !responsibleSignature}
              className="flex-1 py-4 bg-success text-success-foreground rounded-xl font-bold text-base active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              {loading ? 'A registar…' : 'Confirmar Devolução'}
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              disabled={loading}
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
