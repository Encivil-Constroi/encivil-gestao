import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ChevronLeft, Pencil, Trash2, Calendar, FileDown, Send, Undo2, ShieldCheck, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';
import { fmtEuro, fmtNumber } from '@/app/lib/format';
import { useRole } from '@/features/auth/useRole';
import { AutoEvidenciasView } from './AutoEvidenciasView';
import { usePainelSub } from './useSubData';
import { useAuto, useAutos, useEliminarAuto } from '../../legacy/useAutos';
import { useSubempreiteiro } from '../../legacy/useSubempreiteiros';
import {
  useAprovarAuto, useConfigSubs, useDevolverAuto, useEstadoDocsSub, useEvidenciasAutoLista,
  useSubmeterAuto, useVerificacoesAuto,
} from '../../hooks/useSubsControlo';
import { alcadaNecessaria, bloqueiosPagamento, saldoArtigo, validarLinhasAuto } from '../../lib/medicao';
import { mensagemDocsEmFalta, tiposEmFaltaOuExpirados } from '../../lib/compliance';
import type { SubsConfigRow, WorkflowAuto } from '../../db';
import { AutoPassos, passoAtual, proximoPasso } from './auto/AutoPassos';
import { EvidenciaCapture } from './auto/EvidenciaCapture';
import { AutoVerificacao } from './auto/AutoVerificacao';
import { AutoGlosas } from './auto/AutoGlosas';
import { AutoFaturaPagamento } from './auto/AutoFaturaPagamento';
import { acumuladoOutrosAutos, useLinhasMedicao, WORKFLOW_CONTA_ACUMULADO } from '../../lib/autoDados';

type CfgAuto = Pick<SubsConfigRow, 'alcada_gestor_ate' | 'min_fotos_verificacao' | 'foto_idade_max_min' | 'exigir_fatura_para_pagar' | 'bloquear_pagamento_sem_docs'>;

// Valores por omissão do desenho, usados só enquanto a configuração não chega
const CFG_PADRAO: CfgAuto = {
  alcada_gestor_ate: 10000, min_fotos_verificacao: 2, foto_idade_max_min: 120,
  exigir_fatura_para_pagar: true, bloquear_pagamento_sem_docs: true,
};

const ROTULO_WORKFLOW: Record<WorkflowAuto, string> = {
  rascunho: 'Rascunho', submetido: 'Submetido', verificado: 'Verificado', validado: 'Aprovado',
};

const hojeLisboa = (): string => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const inputCls = 'w-full px-3 py-2.5 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm';
const th = 'px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap';
const td = 'px-3 py-2.5 whitespace-nowrap';

export function AutoDetailPage() {
  const navigate = useNavigate();
  const { autoId } = useParams();
  const { role, isAdmin, isGestor, podeSubempreitadas } = useRole();
  const { auto, loading } = useAuto(autoId);
  const subId = auto?.subcontractorId;
  const { sub } = useSubempreiteiro(subId);
  const { autos } = useAutos(subId);
  const { linhas: linhasMedicao } = useLinhasMedicao(autoId);
  const { config } = useConfigSubs();
  const { evidencias } = useEvidenciasAutoLista(autoId);
  const { itens: verificacoes } = useVerificacoesAuto(autoId);
  const { estados: docs } = useEstadoDocsSub(subId);
  const { painel } = usePainelSub(subId);
  const { submeter, loading: aSubmeter, error: erroSubmeter } = useSubmeterAuto();
  const { devolver, loading: aDevolver, error: erroDevolver } = useDevolverAuto();
  const { aprovar, loading: aAprovar, error: erroAprovar } = useAprovarAuto();
  const { eliminar, loading: aEliminar } = useEliminarAuto();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [devolvendo, setDevolvendo] = useState(false);
  const [motivoDevolver, setMotivoDevolver] = useState('');
  const [motivoDocs, setMotivoDocs] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);

  if (loading) return <div className="max-w-2xl mx-auto p-8 text-center text-sm text-muted-foreground">A carregar…</div>;
  if (!auto) return <div className="max-w-2xl mx-auto p-8 text-center text-sm text-muted-foreground">Auto não encontrado.</div>;

  const cfg: CfgAuto = config ?? CFG_PADRAO;
  const workflow = auto.workflow;
  const pago = auto.estadoPagamento === 'pago';
  const linhas = auto.lines ?? [];
  const baseLines = linhas.filter(l => !l.isExtra);
  const extraLines = linhas.filter(l => l.isExtra);
  const linhaDbPorId = new Map(linhasMedicao.map(l => [l.id, l]));
  const itensContrato = new Map((sub?.items ?? []).map(i => [i.id, i]));
  const acumOutros = acumuladoOutrosAutos(autos, auto.id);
  const hoje = hojeLisboa();

  const errosSubmissao = sub ? validarLinhasAuto({
    tipoContrato: sub.type,
    dataMedicao: auto.date.toISOString().slice(0, 10),
    hoje,
    valorPeriodo: auto.periodValue,
    percentagemPeriodo: auto.periodPercentage ?? null,
    valorGlobal: sub.type === 'global' ? sub.agreedValue : null,
    acumuladoPctOutrosAutos: autos
      .filter(a => a.id !== auto.id && WORKFLOW_CONTA_ACUMULADO.includes(a.workflow))
      .reduce((s, a) => s + (a.periodPercentage ?? 0), 0),
    linhas: linhas.map(l => {
      const item = l.itemId ? itensContrato.get(l.itemId) : undefined;
      const extra = linhaDbPorId.get(l.id);
      return {
        descricao: l.description, artigoId: l.itemId ?? null, isExtra: l.isExtra,
        precoUnitario: l.unitPrice, precoContrato: item?.unitPrice ?? null, quantidade: l.quantity,
        qtdPedida: extra?.qtd_pedida ?? null, justificacao: extra?.justificacao ?? null,
        quantidadePrevista: item?.plannedQuantity ?? null, acumuladoOutrosAutos: l.itemId ? acumOutros[l.itemId] ?? 0 : 0,
      };
    }),
  }) : [];

  const temFatura = !!auto.fatura?.path;
  const alcada = alcadaNecessaria({ certificado: auto.valorCertificado, temExtras: extraLines.length > 0 }, cfg);
  const docsEmFalta = mensagemDocsEmFalta(tiposEmFaltaOuExpirados(docs));
  const pagamento = bloqueiosPagamento({
    fatura: auto.fatura ? { numero: auto.fatura.numero, path: auto.fatura.path ?? null, valor: auto.fatura.valor ?? null } : null,
    valorAprovado: auto.valorCertificado,
    docs,
    ocorrenciasAltas: painel?.ocorrencias_bloqueantes ?? 0,
  }, cfg);
  const proximo = proximoPasso({
    workflow, temFatura, pago, exigirFatura: cfg.exigir_fatura_para_pagar, role,
    errosSubmissao, verificacaoIniciada: verificacoes.length > 0,
    itensPendentes: verificacoes.filter(v => v.resultado === 'pendente').length,
    evidenciasValidas: evidencias.filter(e => e.valida).length, minFotos: cfg.min_fotos_verificacao,
    certificado: auto.valorCertificado, alcada, alcadaLimite: cfg.alcada_gestor_ate,
    docsEmFalta, bloqueiosPagamento: pagamento.bloqueios,
  });

  const podeMedir = podeSubempreitadas;
  const podeGerir = isAdmin || isGestor;
  const podeAprovar = podeGerir && (alcada === 'gestor' || isAdmin);

  const handleSubmeter = async () => {
    if (await submeter(auto.id)) toast.success('Auto submetido para verificação.');
  };

  const handleDevolver = async () => {
    if (motivoDevolver.trim().length < 5) { setAviso('O motivo da devolução tem de ter pelo menos 5 caracteres.'); return; }
    setAviso(null);
    if (await devolver(auto.id, motivoDevolver.trim())) {
      toast.success('Auto devolvido ao rascunho.');
      setDevolvendo(false); setMotivoDevolver('');
    }
  };

  const handleAprovar = async () => {
    const comExcecao = !!docsEmFalta && isAdmin;
    if (comExcecao && motivoDocs.trim().length < 10) { setAviso('O motivo da exceção aos documentos tem de ter pelo menos 10 caracteres.'); return; }
    setAviso(null);
    if (await aprovar(auto.id, comExcecao ? motivoDocs.trim() : null)) toast.success('Auto aprovado. Fica imutável e conta para o executado.');
  };

  const handleDelete = async () => {
    if (await eliminar(auto.id)) {
      toast.success('Auto eliminado.');
      navigate(`/obras/subempreitada/${auto.subcontractorId}`);
    } else {
      toast.error('Não foi possível eliminar.');
    }
  };

  const erroAcao = aviso ?? erroSubmeter ?? erroDevolver ?? erroAprovar;

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-28">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="Voltar" className="p-2 hover:bg-accent rounded-lg transition-colors shrink-0">
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold">Auto Nº {auto.number}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> {auto.date.toLocaleDateString('pt-PT')}
            {sub && <span className="truncate"> · {sub.name}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">{pago ? 'Pago' : ROTULO_WORKFLOW[workflow]}</span>
          {workflow === 'validado' && (
            <button onClick={() => window.open(`/obras/auto/${auto.id}/pdf`, '_blank')}
              className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border border-border hover:bg-accent text-muted-foreground" title="Exportar PDF">
              <FileDown className="w-3.5 h-3.5" aria-hidden="true" /> PDF
            </button>
          )}
        </div>
      </div>

      <AutoPassos passo={passoAtual(workflow, temFatura, pago)} proximo={proximo} />

      <section aria-label="Valores do auto" className="bg-card rounded-2xl border border-border divide-y divide-border">
        <div className="px-5 py-3 flex justify-between text-sm"><span className="text-muted-foreground">Valor medido</span><span className="font-semibold">{fmtEuro(auto.periodValue)}</span></div>
        {auto.valorGlosado > 0 && (
          <div className="px-5 py-3 flex justify-between text-sm"><span className="text-muted-foreground">Glosas</span><span className="font-semibold text-destructive">− {fmtEuro(auto.valorGlosado)}</span></div>
        )}
        <div className="px-5 py-3 flex justify-between text-sm"><span className="font-medium">Valor certificado</span><span className="font-bold">{fmtEuro(auto.valorCertificado)}</span></div>
        {auto.retencaoPercentagem > 0 && (
          <div className="px-5 py-3 flex justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5"><TrendingDown className="w-3.5 h-3.5 text-warning" aria-hidden="true" /> Retenção de garantia ({fmtNumber(auto.retencaoPercentagem)}%)</span>
            <span className="font-semibold text-warning">− {fmtEuro(auto.valorRetido)}</span>
          </div>
        )}
        <div className="px-5 py-3 flex justify-between items-center"><span className="text-sm font-bold">A pagar</span><span className="text-xl font-bold text-primary">{fmtEuro(auto.valorLiquido)}</span></div>
        {auto.periodPercentage != null && (
          <div className="px-5 py-3 flex justify-between text-sm"><span className="text-muted-foreground">Percentagem do período</span><span>{fmtNumber(auto.periodPercentage)}%</span></div>
        )}
      </section>

      <section aria-label="Ações" className="space-y-3">
        {workflow === 'rascunho' && podeMedir && (
          <>
            <button onClick={() => void handleSubmeter()} disabled={aSubmeter || errosSubmissao.length > 0}
              className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-60">
              <Send className="w-4 h-4" aria-hidden="true" /> {aSubmeter ? 'A submeter…' : 'Submeter para verificação'}
            </button>
            <div className="flex gap-3">
              <button onClick={() => navigate(`/obras/auto/${auto.id}/editar`)} className="flex-1 py-3 bg-secondary/20 rounded-xl font-medium flex items-center justify-center gap-2">
                <Pencil className="w-4 h-4" aria-hidden="true" /> Editar
              </button>
              {confirmDelete ? (
                <button onClick={() => void handleDelete()} disabled={aEliminar} className="flex-1 py-3 bg-destructive text-destructive-foreground rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-60">
                  <Trash2 className="w-4 h-4" aria-hidden="true" /> {aEliminar ? 'A eliminar…' : 'Confirmar eliminação'}
                </button>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="px-4 py-3 text-destructive hover:bg-destructive/10 rounded-xl font-medium flex items-center gap-2">
                  <Trash2 className="w-4 h-4" aria-hidden="true" /> Eliminar
                </button>
              )}
            </div>
          </>
        )}

        {workflow === 'verificado' && podeGerir && (
          <div className="rounded-2xl border border-success/30 bg-success/5 p-4 space-y-3">
            {docsEmFalta && isAdmin && (
              <label className="block text-sm">Motivo para aprovar sem os documentos em dia (fica registado)
                <textarea value={motivoDocs} onChange={e => setMotivoDocs(e.target.value)} rows={2} className={`${inputCls} mt-1`} />
              </label>
            )}
            <button onClick={() => void handleAprovar()} disabled={aAprovar || !podeAprovar || (!!docsEmFalta && !isAdmin)}
              className="w-full py-3.5 bg-success text-success-foreground rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-60">
              <ShieldCheck className="w-5 h-5" aria-hidden="true" /> {aAprovar ? 'A aprovar…' : docsEmFalta && isAdmin ? 'Aprovar com exceção' : 'Aprovar auto'}
            </button>
            {!podeAprovar && <p className="text-xs text-muted-foreground">Este auto precisa da aprovação do administrador.</p>}
          </div>
        )}

        {(workflow === 'submetido' || workflow === 'verificado') && podeMedir && (
          devolvendo ? (
            <div className="rounded-2xl border border-border p-4 space-y-2">
              <label className="block text-sm">Motivo da devolução
                <textarea value={motivoDevolver} onChange={e => setMotivoDevolver(e.target.value)} rows={2} className={`${inputCls} mt-1`} />
              </label>
              <div className="flex gap-2">
                <button onClick={() => void handleDevolver()} disabled={aDevolver} className="flex-1 py-2.5 rounded-xl bg-warning text-warning-foreground font-semibold text-sm disabled:opacity-60">
                  {aDevolver ? 'A devolver…' : 'Devolver ao rascunho'}
                </button>
                <button onClick={() => setDevolvendo(false)} className="px-4 py-2.5 rounded-xl border border-border text-sm">Cancelar</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setDevolvendo(true)} className="w-full py-2.5 rounded-xl border border-border text-sm font-medium flex items-center justify-center gap-2 hover:bg-accent">
              <Undo2 className="w-4 h-4" aria-hidden="true" /> Devolver ao rascunho
            </button>
          )
        )}
        {erroAcao && <p role="alert" className="text-sm text-destructive">{erroAcao}</p>}
      </section>

      {baseLines.length > 0 && (
        <section aria-label="Medições" className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border bg-muted/30"><h2 className="font-semibold text-sm">Medições</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>{['Descrição', 'Pedida', 'Verificada', 'Acumulada', 'Saldo', 'Preço', 'Valor'].map(h => <th key={h} className={th}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {baseLines.map(l => {
                  const item = l.itemId ? itensContrato.get(l.itemId) : undefined;
                  const acumulada = (l.itemId ? acumOutros[l.itemId] ?? 0 : 0) + l.quantity;
                  const saldo = item ? saldoArtigo(item.plannedQuantity, acumulada) : null;
                  const pedida = linhaDbPorId.get(l.id)?.qtd_pedida ?? null;
                  return (
                    <tr key={l.id}>
                      <td className="px-3 py-2.5 min-w-40">{l.description} <span className="text-muted-foreground">({l.unit})</span></td>
                      <td className={td}>{pedida != null ? fmtNumber(pedida) : '—'}</td>
                      <td className={`${td} ${pedida != null && l.quantity > pedida ? 'text-destructive font-semibold' : ''}`}>{fmtNumber(l.quantity)}</td>
                      <td className={td}>{fmtNumber(acumulada)}</td>
                      <td className={`${td} ${saldo != null && saldo < 0 ? 'text-destructive font-semibold' : ''}`}>{saldo != null ? fmtNumber(saldo) : '—'}</td>
                      <td className={td}>{fmtEuro(l.unitPrice)}</td>
                      <td className={`${td} font-semibold`}>{fmtEuro(l.unitPrice * l.quantity)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {extraLines.length > 0 && (
        <section aria-label="Trabalhos a mais" className="bg-card rounded-2xl border border-warning/30 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-warning/30 bg-warning/5">
            <h2 className="font-semibold text-sm text-warning">Trabalhos a mais</h2>
            <p className="text-xs text-muted-foreground">Só o administrador aprova autos com trabalhos a mais.</p>
          </div>
          <ul className="divide-y divide-border">
            {extraLines.map(l => (
              <li key={l.id} className="px-4 py-3 text-sm space-y-1">
                <div className="flex justify-between gap-2"><span>{l.description}</span><span className="font-semibold">{fmtEuro(l.unitPrice * l.quantity)}</span></div>
                <p className="text-xs text-muted-foreground">{fmtNumber(l.quantity)} {l.unit} × {fmtEuro(l.unitPrice)}</p>
                <p className={`text-xs ${linhaDbPorId.get(l.id)?.justificacao ? 'text-muted-foreground' : 'text-destructive'}`}>
                  Justificação: {linhaDbPorId.get(l.id)?.justificacao || 'em falta'}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sub && (
        <EvidenciaCapture autoId={auto.id} obraId={sub.obraId}
          podeAdicionar={podeMedir && (workflow === 'rascunho' || workflow === 'submetido')}
          podeApagar={podeMedir && workflow === 'rascunho'}
          idadeMaxMin={cfg.foto_idade_max_min} minFotos={cfg.min_fotos_verificacao} />
      )}

      <AutoVerificacao autoId={auto.id} workflow={workflow} podeMedir={podeMedir} isAdmin={isAdmin} />

      <AutoGlosas autoId={auto.id} workflow={workflow} valorPeriodo={auto.periodValue} podeMedir={podeMedir} podeGerir={podeGerir} />

      <AutoFaturaPagamento
        autoId={auto.id} subId={auto.subcontractorId} workflow={workflow}
        certificado={auto.valorCertificado} aPagar={auto.valorLiquido} fatura={auto.fatura}
        estadoPagamento={auto.estadoPagamento} dataPagamento={auto.dataPagamento} referenciaPagamento={auto.referenciaPagamento}
        dataVencimento={auto.dataVencimento} bloqueios={pagamento.bloqueios} avisos={pagamento.avisos}
        isAdmin={isAdmin} podeGerir={podeGerir} hoje={hoje} />

      <AutoEvidenciasView autoId={auto.id} />

      {auto.notes && (
        <div className="bg-card rounded-2xl border border-border p-4">
          <h2 className="font-semibold text-sm mb-2">Observações</h2>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{auto.notes}</p>
        </div>
      )}
    </div>
  );
}
