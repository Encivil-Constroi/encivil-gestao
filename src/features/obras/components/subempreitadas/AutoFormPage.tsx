import { useProtegerFormulario } from '@/app/lib/protegerSaida'
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ChevronLeft, CircleAlert, Plus, Trash2, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { fmtEuro, fmtNumber, UNIDADES_OBRA } from '@/app/lib/format';
import { useSubempreiteiro } from '../../legacy/useSubempreiteiros';
import { useAutos, useAuto, useGuardarAuto } from '../../legacy/useAutos';
import type { ClimaObra, FotoObra } from '../../db';
import { CLIMAS } from '../../lib/clima';
import { saldoArtigo, validarLinhasAuto, type LinhaAutoEntrada } from '../../lib/medicao';
import { FotoCapture } from '../FotoCapture';
import { validarEvidencias } from './subData';
import { useEvidenciasAuto, useGuardarEvidencias } from './useSubData';
import {
  acumuladoOutrosAutos, useGuardarLinhasAuto, useLinhasMedicao, WORKFLOW_CONTA_ACUMULADO, type LinhaGravar,
} from '../../lib/autoDados';

type ExtraLinha = { id: string; description: string; unit: string; unitPrice: string; quantity: string; justificacao: string };

function novaExtra(): ExtraLinha {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { id, description: '', unit: 'un', unitPrice: '', quantity: '', justificacao: '' };
}

const inputCls = 'w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-base';
const smallInput = 'w-full px-2 py-2 bg-input-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary';
const hojeLisboa = (): string => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const num = (s: string | undefined): number => parseFloat((s ?? '').replace(',', '.')) || 0;
const numOuNull = (s: string | undefined): number | null => (s ?? '').trim() === '' ? null : num(s);

export function AutoFormPage() {
  const navigate = useNavigate()
  const refForm = useProtegerFormulario();
  const params = useParams();
  const autoId = params.autoId;
  const isEdit = !!autoId;

  const { auto, loading: autoLoading } = useAuto(autoId);
  const subId = isEdit ? auto?.subcontractorId : params.subId;
  const { sub, loading: subLoading } = useSubempreiteiro(subId);
  const { autos } = useAutos(subId);
  const { linhas: linhasMedicao, loading: linhasLoading } = useLinhasMedicao(autoId);
  const { criar, atualizar, loading: saving } = useGuardarAuto();
  const { guardar: guardarLinhas, loading: savingLinhas, error: erroLinhas } = useGuardarLinhasAuto();
  const { evidencias } = useEvidenciasAuto(autoId);
  const { guardar: guardarEvidencias, loading: savingEvidencias } = useGuardarEvidencias();

  const [date, setDate] = useState(hojeLisboa);
  const [percentagem, setPercentagem] = useState('');
  const [notes, setNotes] = useState('');
  const [qtds, setQtds] = useState<Record<string, string>>({});
  const [pedidas, setPedidas] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<ExtraLinha[]>([]);
  const [preenchido, setPreenchido] = useState(false);
  const [fotos, setFotos] = useState<FotoObra[]>([]);
  const [anotacoes, setAnotacoes] = useState('');
  const [problemas, setProblemas] = useState('');
  const [atraso, setAtraso] = useState('0');
  const [clima, setClima] = useState<ClimaObra | ''>('');
  const [climaDescricao, setClimaDescricao] = useState('');
  const [progressoFisico, setProgressoFisico] = useState('');

  useEffect(() => {
    if (!evidencias) return;
    setFotos(evidencias.fotos ?? []); setAnotacoes(evidencias.anotacoes ?? ''); setProblemas(evidencias.problemas ?? '');
    setAtraso(String(evidencias.atraso_dias ?? 0)); setClima(evidencias.clima ?? ''); setClimaDescricao(evidencias.clima_descricao ?? '');
    setProgressoFisico(evidencias.progresso_fisico_pct == null ? '' : String(evidencias.progresso_fisico_pct));
  }, [evidencias]);

  // Só os autos que já saíram do rascunho contam para o acumulado (como em auto_submeter)
  const acumOutros = useMemo(() => acumuladoOutrosAutos(autos, autoId), [autos, autoId]);

  useEffect(() => {
    if (!isEdit || !auto || preenchido) return;
    if (auto.workflow !== 'rascunho') {
      toast.error('Este auto já foi submetido e não pode ser editado.');
      navigate(`/obras/auto/${auto.id}`);
      return;
    }
    if (linhasLoading) return;
    const porId = new Map(linhasMedicao.map(l => [l.id, l]));
    setDate(auto.date.toISOString().split('T')[0]);
    setPercentagem(auto.periodPercentage != null ? String(auto.periodPercentage) : '');
    setNotes(auto.notes ?? '');
    const q: Record<string, string> = {};
    const p: Record<string, string> = {};
    const ex: ExtraLinha[] = [];
    (auto.lines ?? []).forEach(l => {
      const db = porId.get(l.id);
      if (l.isExtra) {
        ex.push({ id: l.id, description: l.description, unit: l.unit, unitPrice: String(l.unitPrice), quantity: String(l.quantity), justificacao: db?.justificacao ?? '' });
      } else if (l.itemId) {
        q[l.itemId] = String(l.quantity);
        if (db?.qtd_pedida != null) p[l.itemId] = String(db.qtd_pedida);
      }
    });
    setQtds(q); setPedidas(p); setExtras(ex);
    setPreenchido(true);
  }, [isEdit, auto, navigate, linhasMedicao, linhasLoading, preenchido]);

  const isGlobal = sub?.type === 'global';
  const artigos = useMemo(() => (sub?.items ?? []).filter(it => !it.isExtra), [sub]);

  const linhas: LinhaGravar[] = useMemo(() => {
    const out: LinhaGravar[] = [];
    if (sub?.type === 'unitario') {
      artigos.forEach(it => {
        const q = num(qtds[it.id]);
        if (q > 0) out.push({ artigoId: it.id, descricao: it.description, unidade: it.unit, precoUnitario: it.unitPrice, quantidade: q, qtdPedida: numOuNull(pedidas[it.id]), isExtra: false, justificacao: null });
      });
    }
    extras.forEach(ex => {
      const q = num(ex.quantity);
      if (ex.description.trim() && q > 0) {
        out.push({ artigoId: null, descricao: ex.description.trim(), unidade: ex.unit, precoUnitario: num(ex.unitPrice), quantidade: q, qtdPedida: null, isExtra: true, justificacao: ex.justificacao.trim() || null });
      }
    });
    return out;
  }, [sub, artigos, qtds, pedidas, extras]);

  const baseValue = useMemo(() => {
    if (!sub) return 0;
    if (sub.type === 'global') return (num(percentagem) / 100) * sub.agreedValue;
    return linhas.filter(l => !l.isExtra).reduce((t, l) => t + l.quantidade * l.precoUnitario, 0);
  }, [sub, percentagem, linhas]);

  const extrasValue = useMemo(() => linhas.filter(l => l.isExtra).reduce((t, l) => t + l.quantidade * l.precoUnitario, 0), [linhas]);
  const periodValue = baseValue + extrasValue;

  const avisosSubmissao = useMemo(() => {
    if (!sub) return [];
    const entrada: LinhaAutoEntrada[] = linhas.map(l => {
      const item = l.artigoId ? artigos.find(a => a.id === l.artigoId) : undefined;
      return {
        descricao: l.descricao, artigoId: l.artigoId, isExtra: l.isExtra, precoUnitario: l.precoUnitario,
        precoContrato: item?.unitPrice ?? null, quantidade: l.quantidade, qtdPedida: l.qtdPedida, justificacao: l.justificacao,
        quantidadePrevista: item?.plannedQuantity ?? null, acumuladoOutrosAutos: l.artigoId ? acumOutros[l.artigoId] ?? 0 : 0,
      };
    });
    return validarLinhasAuto({
      tipoContrato: sub.type, dataMedicao: date, hoje: hojeLisboa(), valorPeriodo: Math.round(periodValue * 100) / 100,
      percentagemPeriodo: sub.type === 'global' ? num(percentagem) : null,
      valorGlobal: sub.type === 'global' ? sub.agreedValue : null,
      acumuladoPctOutrosAutos: autos
        .filter(a => a.id !== autoId && WORKFLOW_CONTA_ACUMULADO.includes(a.workflow))
        .reduce((s, a) => s + (a.periodPercentage ?? 0), 0),
      linhas: entrada,
    });
  }, [sub, linhas, artigos, acumOutros, date, periodValue, percentagem, autos, autoId]);

  const setExtra = (id: string, patch: Partial<ExtraLinha>) =>
    setExtras(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const progresso = progressoFisico === '' ? null : Number(progressoFisico);
    const erroEvidencias = validarEvidencias({ progresso, atraso: Number(atraso) });
    if (erroEvidencias) { toast.error(erroEvidencias); return; }
    if (!sub) return;
    if (sub.type === 'global' && !(num(percentagem) > 0)) {
      toast.error('Indique a percentagem executada no período.'); return;
    }
    if (periodValue <= 0) { toast.error('O auto está a zero. Preencha as medições.'); return; }

    const payload = {
      date,
      periodPercentage: sub.type === 'global' ? num(percentagem) : undefined,
      periodValue,
      notes: notes || undefined,
    };

    const result = isEdit
      ? await atualizar(autoId!, payload)
      : await criar({ subcontractorId: sub.id, ...payload });
    if (!result) { toast.error('Não foi possível guardar o auto.'); return; }

    if (!(await guardarLinhas(result.id, linhas))) {
      toast.error('O auto foi guardado, mas as linhas não. Abra-o e tente outra vez.');
      navigate(`/obras/auto/${result.id}`);
      return;
    }
    const ok = await guardarEvidencias(result.id, { fotos, anotacoes: anotacoes.trim() || null, problemas: problemas.trim() || null, atraso_dias: Number(atraso), clima: clima || null, clima_descricao: climaDescricao.trim() || null, progresso_fisico_pct: progresso });
    if (ok === null) { toast.error('Auto guardado, mas as evidências não foram guardadas.'); navigate(`/obras/auto/${result.id}`); return; }
    toast.success(isEdit ? 'Auto atualizado.' : 'Auto criado como rascunho.');
    navigate(`/obras/auto/${result.id}`);
  };

  if ((isEdit && autoLoading) || subLoading) {
    return <div className="max-w-2xl mx-auto p-8 text-center text-sm text-muted-foreground">A carregar…</div>;
  }
  if (!sub) {
    return <div className="max-w-2xl mx-auto p-8 text-center text-sm text-muted-foreground">Contratação não encontrada.</div>;
  }

  const aGuardar = saving || savingLinhas || savingEvidencias;

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

      <form ref={refForm} onSubmit={handleSubmit} className="space-y-4">
        <section className="rounded-2xl border border-border bg-card p-4 space-y-3"><h2 className="font-semibold">Evidências da medição</h2><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Progresso físico (%)<input className={inputCls} type="number" min="0" max="100" step="0.01" value={progressoFisico} onChange={e => setProgressoFisico(e.target.value)} /></label><label className="text-sm">Dias de atraso<input className={inputCls} type="number" min="0" step="1" value={atraso} onChange={e => setAtraso(e.target.value)} /></label><label className="text-sm">Clima<select className={inputCls} value={clima} onChange={e => setClima(e.target.value as ClimaObra | '')}><option value="">Não registado</option>{CLIMAS.map(c => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}</select></label><label className="text-sm">Descrição do clima<input className={inputCls} value={climaDescricao} onChange={e => setClimaDescricao(e.target.value)} /></label><label className="text-sm sm:col-span-2">Anotações<textarea className={inputCls} value={anotacoes} onChange={e => setAnotacoes(e.target.value)} /></label><label className="text-sm sm:col-span-2">Problemas<textarea className={inputCls} value={problemas} onChange={e => setProblemas(e.target.value)} /></label></div><FotoCapture obraId={sub.obraId} pasta="autos" valor={fotos} onChange={setFotos} /><p className="text-xs text-muted-foreground">As fotografias de prova com localização (que contam para a verificação) tiram-se no auto, depois de guardado.</p></section>
        <div className="bg-card rounded-2xl border border-border p-4">
          <label className="block text-sm font-medium mb-2" htmlFor="auto-data">Data da Medição</label>
          <input id="auto-data" type="date" value={date} max={hojeLisboa()} onChange={e => setDate(e.target.value)} className={inputCls} required />
        </div>

        {isGlobal ? (
          <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
            <label className="block text-sm font-medium" htmlFor="auto-pct">Percentagem executada neste período (%)</label>
            <input id="auto-pct" type="number" inputMode="decimal" min="0" max="100" step="0.01" value={percentagem} onChange={e => setPercentagem(e.target.value)} className={`${inputCls} text-2xl font-bold text-center`} placeholder="0" />
            <div className="text-sm text-muted-foreground text-center">
              Valor acordado: <strong>{fmtEuro(sub.agreedValue)}</strong> · Este período: <strong className="text-primary">{fmtEuro(baseValue)}</strong>
            </div>
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <h2 className="font-semibold text-sm">Quantidades deste período</h2>
              <p className="text-xs text-muted-foreground">Pedida = o que o subempreiteiro reclama · Verificada = o que a equipa confirmou em obra (nunca mais do que a pedida).</p>
            </div>
            <div className="divide-y divide-border">
              {artigos.map(it => {
                const q = num(qtds[it.id]);
                const pedida = numOuNull(pedidas[it.id]);
                const acumulada = (acumOutros[it.id] ?? 0) + q;
                const saldo = saldoArtigo(it.plannedQuantity, acumulada);
                const excedePedida = pedida != null && q > pedida;
                return (
                  <div key={it.id} className="p-3 space-y-2" data-testid={`artigo-${it.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{it.description}</p>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtEuro(it.unitPrice)}/{it.unit}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                      <label className="text-xs text-muted-foreground">Pedida ({it.unit})
                        <input type="number" inputMode="decimal" min="0" step="0.001" value={pedidas[it.id] ?? ''}
                          onChange={e => setPedidas(prev => ({ ...prev, [it.id]: e.target.value }))} className={`${smallInput} mt-1`} />
                      </label>
                      <label className="text-xs text-muted-foreground">Verificada ({it.unit})
                        <input type="number" inputMode="decimal" min="0" step="0.001" value={qtds[it.id] ?? ''} aria-invalid={excedePedida}
                          onChange={e => setQtds(prev => ({ ...prev, [it.id]: e.target.value }))} className={`${smallInput} mt-1 ${excedePedida ? 'border-destructive' : ''}`} />
                      </label>
                      <p className="text-xs"><span className="block text-muted-foreground">Acumulada</span><strong>{fmtNumber(acumulada)}</strong> de {fmtNumber(it.plannedQuantity)}</p>
                      <p className="text-xs"><span className="block text-muted-foreground">Saldo</span><strong className={saldo < 0 ? 'text-destructive' : ''}>{fmtNumber(saldo)}</strong></p>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-destructive">
                        {excedePedida ? 'A verificada excede a pedida. ' : ''}{saldo < 0 ? 'Excede a quantidade contratada.' : ''}
                      </span>
                      <span className="text-sm font-semibold">{fmtEuro(q * it.unitPrice)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-card rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-sm">Trabalhos a mais</h2>
              <p className="text-xs text-muted-foreground">Fora do contrato: exigem justificação e só o administrador os aprova.</p>
            </div>
            {extrasValue > 0 && <span className="text-sm font-bold text-warning">{fmtEuro(extrasValue)}</span>}
          </div>
          <div className="space-y-3">
            {extras.map((ex, idx) => (
              <div key={ex.id} className="rounded-xl border border-warning/30 bg-warning/5 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-warning">Extra {idx + 1}</span>
                  <button type="button" aria-label={`Remover extra ${idx + 1}`} onClick={() => setExtras(prev => prev.filter(e => e.id !== ex.id))} className="p-1 text-muted-foreground hover:text-destructive rounded-lg">
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
                <input type="text" value={ex.description} onChange={e => setExtra(ex.id, { description: e.target.value })} className={smallInput} placeholder="Descrição do trabalho a mais" aria-label={`Descrição do extra ${idx + 1}`} />
                <div className="grid grid-cols-3 gap-2">
                  <select value={ex.unit} onChange={e => setExtra(ex.id, { unit: e.target.value })} className={smallInput} aria-label={`Unidade do extra ${idx + 1}`}>
                    {UNIDADES_OBRA.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <input type="number" inputMode="decimal" min="0" step="0.0001" value={ex.unitPrice} onChange={e => setExtra(ex.id, { unitPrice: e.target.value })} className={smallInput} placeholder="€/un" aria-label={`Preço do extra ${idx + 1}`} />
                  <input type="number" inputMode="decimal" min="0" step="0.001" value={ex.quantity} onChange={e => setExtra(ex.id, { quantity: e.target.value })} className={smallInput} placeholder="Qtd" aria-label={`Quantidade do extra ${idx + 1}`} />
                </div>
                <textarea value={ex.justificacao} onChange={e => setExtra(ex.id, { justificacao: e.target.value })} rows={2} className={smallInput}
                  placeholder="Justificação (obrigatória para submeter)" aria-label={`Justificação do extra ${idx + 1}`} />
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setExtras(prev => [...prev, novaExtra()])} className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <Plus className="w-4 h-4" aria-hidden="true" /> Adicionar trabalho a mais
          </button>
        </div>

        <div className="bg-card rounded-2xl border border-border p-4">
          <label className="block text-sm font-medium mb-2" htmlFor="auto-obs">Observações <span className="text-muted-foreground font-normal text-xs">(opcional)</span></label>
          <textarea id="auto-obs" value={notes} onChange={e => setNotes(e.target.value)} className={`${inputCls} resize-none`} rows={2} />
        </div>

        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" aria-hidden="true" />
            <span className="text-sm font-medium">Valor deste auto</span>
          </div>
          <span className="text-xl font-bold text-primary">{fmtEuro(periodValue)}</span>
        </div>

        {avisosSubmissao.length > 0 && (
          <div className="rounded-2xl border border-warning/40 bg-warning/5 p-4 space-y-1.5">
            <p className="text-sm font-medium">Pode guardar o rascunho, mas para o submeter tem de corrigir:</p>
            <ul aria-label="Correções antes de submeter" className="space-y-1">
              {avisosSubmissao.map(a => (
                <li key={a} className="flex items-start gap-1.5 text-sm text-destructive"><CircleAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" /> {a}</li>
              ))}
            </ul>
          </div>
        )}
        {erroLinhas && <p role="alert" className="text-sm text-destructive">{erroLinhas}</p>}

        <div className="sticky bottom-20 md:bottom-0 py-3 bg-background/80 backdrop-blur-sm md:bg-transparent flex gap-3">
          <button type="submit" disabled={aGuardar} className="flex-1 py-4 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60">
            {aGuardar ? 'A guardar…' : isEdit ? 'Guardar Alterações' : 'Criar Auto'}
          </button>
          <button type="button" onClick={() => navigate(-1)} disabled={aGuardar} className="px-5 py-4 bg-secondary/20 text-foreground rounded-xl font-medium hover:bg-secondary/30 transition-all">
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
