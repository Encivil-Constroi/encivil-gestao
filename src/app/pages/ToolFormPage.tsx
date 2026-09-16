import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  useFerramenta,
  useCriarFerramenta,
  useAtualizarFerramenta,
} from '@/features/ferramentas/hooks/useFerramentas';
import type { ToolCategory } from '../types';

const categoryOpts: [ToolCategory, string][] = [
  ['manual', 'Ferramenta Manual'],
  ['eletrica', 'Ferramenta Elétrica'],
  ['medicao', 'Medição'],
  ['seguranca', 'Equipamento de Segurança'],
  ['outro', 'Outro'],
];

const inputCls = 'w-full px-4 py-3.5 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-base';

export function ToolFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const { tool, loading: loadingTool } = useFerramenta(id);
  const { criar, loading: creating } = useCriarFerramenta();
  const { atualizar, loading: updating } = useAtualizarFerramenta();
  const loading = creating || updating;

  const [formData, setFormData] = useState({
    name: '',
    category: 'outro' as ToolCategory,
    serialNumber: '',
    estimatedValue: '',
    notes: '',
  });
  const [codigoPreview, setCodigoPreview] = useState('');
  const [gerandoCodigo, setGerandoCodigo] = useState(!isEdit);

  useEffect(() => {
    if (!tool) return;
    setFormData({
      name: tool.name,
      category: tool.category,
      serialNumber: tool.serialNumber ?? '',
      estimatedValue: tool.estimatedValue ? String(tool.estimatedValue) : '',
      notes: tool.notes ?? '',
    });
  }, [tool]);

  useEffect(() => {
    if (isEdit) return;
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('gerar_codigo_ferramenta');
        if (data && !error) setCodigoPreview(data as string);
      } finally {
        setGerandoCodigo(false);
      }
    })();
  }, [isEdit]);

  if (isEdit && loadingTool) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isEdit && !tool) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold">Ferramenta não encontrada</h2>
        <button onClick={() => navigate('/ferramentas')} className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl">
          Voltar
        </button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = {
      name: formData.name,
      category: formData.category,
      serialNumber: formData.serialNumber || undefined,
      estimatedValue: formData.estimatedValue ? parseFloat(formData.estimatedValue) : undefined,
      notes: formData.notes || undefined,
    };
    const result = isEdit ? await atualizar(tool!.id, input) : await criar(input);

    if (result) {
      toast.success(isEdit ? 'Ferramenta atualizada com sucesso!' : 'Ferramenta criada com sucesso!');
      navigate(`/ferramentas/${result.id}`, { replace: true });
    } else {
      toast.error(isEdit ? 'Erro ao atualizar ferramenta.' : 'Erro ao criar ferramenta.');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-28">

      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="Voltar" className="p-2 hover:bg-accent rounded-lg transition-colors shrink-0">
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">{isEdit ? 'Editar Ferramenta' : 'Nova Ferramenta'}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isEdit ? 'Atualizar dados da ferramenta' : 'Adicionar ferramenta/equipamento ao inventário'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Código <span className="text-muted-foreground font-normal text-xs">(gerado automaticamente)</span>
            </label>
            <input
              type="text"
              value={isEdit ? tool!.code : (gerandoCodigo ? 'A gerar…' : codigoPreview)}
              readOnly
              disabled
              className={`${inputCls} bg-muted text-muted-foreground cursor-not-allowed`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Nome</label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className={inputCls}
              placeholder="Ex: Berbequim Bosch GSB 13 RE"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Categoria</label>
            <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value as ToolCategory })} className={inputCls}>
              {categoryOpts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Nº de Série <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
            </label>
            <input
              type="text"
              value={formData.serialNumber}
              onChange={e => setFormData({ ...formData, serialNumber: e.target.value })}
              className={inputCls}
              placeholder="Ex: SN-48213"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Valor Estimado (€) <span className="text-muted-foreground font-normal text-xs">(opcional, referência para o termo de responsabilidade)</span>
            </label>
            <input
              type="number"
              value={formData.estimatedValue}
              onChange={e => setFormData({ ...formData, estimatedValue: e.target.value })}
              className={inputCls}
              placeholder="0.00"
              min="0"
              step="0.01"
            />
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
              placeholder="Acessórios incluídos, localização habitual, etc."
            />
          </div>
        </div>

        <div className="sticky bottom-20 md:bottom-0 py-3 bg-background/80 backdrop-blur-sm md:bg-transparent md:backdrop-blur-none">
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading || gerandoCodigo}
              className="flex-1 py-4 bg-primary text-primary-foreground rounded-xl font-bold text-base active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              {loading ? 'A guardar…' : isEdit ? 'Guardar Alterações' : 'Criar Ferramenta'}
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
