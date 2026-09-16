import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { ToolCombobox } from '../components/ToolCombobox';
import { SignaturePad } from '../components/SignaturePad';
import { useFerramentas } from '@/features/ferramentas/hooks/useFerramentas';
import { useRegistarEmprestimo } from '@/features/ferramentas/hooks/useEmprestimos';
import { useObras } from '@/features/obras/hooks/useObras';
import { useRole } from '@/features/auth/useRole';

const inputCls = 'w-full px-4 py-3.5 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-base';

export function ToolLoanPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { nome } = useRole();
  const { tools, loading: loadingTools } = useFerramentas();
  const { obras } = useObras(true);
  const { registar, loading } = useRegistarEmprestimo();

  const presetToolId = new URLSearchParams(location.search).get('ferramenta') ?? '';

  const [formData, setFormData] = useState({
    toolId: presetToolId,
    employeeName: '',
    employeeDocument: '',
    destination: '',
    obraId: '',
    expectedReturnDate: '',
    deliveryCondition: 'Bom estado',
    deliveredBy: nome,
    notes: '',
  });
  const [outroDestino, setOutroDestino] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [responsibleSignature, setResponsibleSignature] = useState<string | null>(null);

  useEffect(() => {
    if (nome) setFormData(prev => ({ ...prev, deliveredBy: prev.deliveredBy || nome }));
  }, [nome]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.toolId) { toast.error('Selecione uma ferramenta.'); return; }
    if (!signature) { toast.error('A assinatura do funcionário é obrigatória.'); return; }
    if (!responsibleSignature) { toast.error('A assinatura de quem está a entregar é obrigatória.'); return; }

    const obraSel = obras.find(o => o.id === formData.obraId);
    const usaObra = !outroDestino;
    const destinoFinal = usaObra ? obraSel?.name : (formData.destination || undefined);
    const obraIdFinal = usaObra ? (formData.obraId || undefined) : undefined;

    const result = await registar({
      toolId: formData.toolId,
      employeeName: formData.employeeName,
      deliveredBy: formData.deliveredBy,
      signature,
      responsibleSignature,
      employeeDocument: formData.employeeDocument || undefined,
      destination: destinoFinal,
      obraId: obraIdFinal,
      expectedReturnDate: formData.expectedReturnDate || undefined,
      deliveryCondition: formData.deliveryCondition || undefined,
      notes: formData.notes || undefined,
    });
    if (result) {
      toast.success('Empréstimo registado com sucesso!');
      navigate(`/ferramentas/${result.toolId}`, { replace: true, state: { termLoan: result } });
    } else {
      toast.error('Erro ao registar empréstimo. A ferramenta pode já não estar disponível.');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-28">

      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="Voltar" className="p-2 hover:bg-accent rounded-lg transition-colors shrink-0">
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Registar Empréstimo</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Entregar ferramenta a um funcionário</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Ferramenta</label>
            <ToolCombobox
              tools={tools}
              value={formData.toolId}
              onChange={id => setFormData({ ...formData, toolId: id })}
              disabled={!!presetToolId}
              loading={loadingTools}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Nome do Funcionário</label>
            <input type="text" value={formData.employeeName} onChange={e => setFormData({ ...formData, employeeName: e.target.value })} className={inputCls} placeholder="Nome completo" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              CC / NIF <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
            </label>
            <input type="text" value={formData.employeeDocument} onChange={e => setFormData({ ...formData, employeeDocument: e.target.value })} className={inputCls} placeholder="Documento de identificação" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">
                Obra de Destino <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
              </label>
              <button type="button" onClick={() => setOutroDestino(v => !v)} className="text-xs font-medium text-primary hover:underline">
                {outroDestino ? 'Escolher obra' : 'Outro destino'}
              </button>
            </div>
            {outroDestino ? (
              <input type="text" value={formData.destination} onChange={e => setFormData({ ...formData, destination: e.target.value })} className={inputCls} placeholder="Destino sem obra formal" />
            ) : (
              <select value={formData.obraId} onChange={e => setFormData({ ...formData, obraId: e.target.value })} className={inputCls}>
                <option value="">Sem obra associada</option>
                {obras.filter(o => o.status === 'ativa').map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Devolução Prevista <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
            </label>
            <input type="date" value={formData.expectedReturnDate} onChange={e => setFormData({ ...formData, expectedReturnDate: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Responsável pela Entrega</label>
            <input type="text" value={formData.deliveredBy} onChange={e => setFormData({ ...formData, deliveredBy: e.target.value })} className={inputCls} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Observações <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} className={`${inputCls} resize-none`} rows={3} />
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <SignaturePad
            label="Assinatura do Funcionário (confirma a receção da ferramenta)"
            value={signature}
            onChange={setSignature}
          />
          <SignaturePad
            label="Assinatura de Quem Entrega (operador do sistema)"
            value={responsibleSignature}
            onChange={setResponsibleSignature}
          />
        </div>

        <div className="sticky bottom-20 md:bottom-0 py-3 bg-background/80 backdrop-blur-sm md:bg-transparent md:backdrop-blur-none">
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading || !signature || !responsibleSignature}
              className="flex-1 py-4 bg-warning text-white rounded-xl font-bold text-base active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              {loading ? 'A registar…' : 'Confirmar Empréstimo'}
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
