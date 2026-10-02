import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ChevronLeft, Printer } from 'lucide-react';
import { fmtEuro, fmtNumber } from '@/app/lib/format';
import { useAuto, useAprovadoresAuto } from '../../legacy/useAutos';
import { useSubempreiteiro } from '../../legacy/useSubempreiteiros';
import { useGlosasAuto, useEvidenciasAutoLista } from '../../hooks/useSubsControlo';
import type { AutoGlosaRow, WorkflowAuto } from '../../db';
import { AutoEvidenciasView } from './AutoEvidenciasView';

const PT = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmt = (d?: Date | null) => d ? PT.format(d) : '—';

const ROTULO_WORKFLOW: Record<WorkflowAuto, string> = {
  rascunho:   'Rascunho',
  submetido:  'Submetido',
  verificado: 'Verificado',
  validado:   '✓ Aprovado',
};

const ROTULO_GLOSA: Record<AutoGlosaRow['motivo'], string> = {
  QUALIDADE:                 'Qualidade',
  QUANTIDADE_NAO_CONFIRMADA: 'Quantidade não confirmada',
  ATRASO:                    'Atraso',
  SEGURANCA:                 'Segurança',
  DOCUMENTACAO:              'Documentação',
  OUTRO:                     'Outro',
};

const ESTADO_PAGAMENTO: Record<string, string> = {
  por_pagar: 'Por Pagar',
  pago:      'Pago',
  em_atraso: 'Em Atraso',
};

export function AutoPdfPage() {
  const { autoId } = useParams();
  const navigate   = useNavigate();
  const { auto,  loading: loadAuto } = useAuto(autoId);
  const { sub,   loading: loadSub  } = useSubempreiteiro(auto?.subcontractorId);

  const { glosas }       = useGlosasAuto(autoId);
  const { evidencias }   = useEvidenciasAutoLista(autoId);
  const { aprovadores }  = useAprovadoresAuto(auto ?? undefined);

  const loading = loadAuto || loadSub;
  const glosasAplicadas = glosas.filter(g => g.estado === 'aplicada');
  const evidenciasValidas = evidencias.filter(e => e.valida).length;

  // Título do separador
  useEffect(() => {
    if (auto && sub) {
      document.title = `Auto Nº ${auto.number} — ${sub.name}`;
    }
    return () => { document.title = 'ENCIVIL Gestão'; };
  }, [auto, sub]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!auto || !sub) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-muted-foreground">Auto não encontrado.</p>
        <button onClick={() => navigate(-1)} className="text-sm text-primary underline">Voltar</button>
      </div>
    );
  }

  const baseLines  = (auto.lines ?? []).filter(l => !l.isExtra);
  const extraLines = (auto.lines ?? []).filter(l => l.isExtra);
  const temRetencao = auto.retencaoPercentagem > 0;

  return (
    <>
      {/* ── CSS de impressão — injetado inline para não depender de ficheiros externos ── */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 14mm 18mm;
          }
          html, body { margin: 0; background: white !important; }
          .no-print  { display: none !important; }
          .pdf-page  { box-shadow: none !important; border: none !important; padding: 0 !important; }
          table      { page-break-inside: auto; }
          tr         { page-break-inside: avoid; page-break-after: auto; }
          .page-break-avoid { page-break-inside: avoid; }
        }
        @media screen {
          .pdf-page {
            box-shadow: 0 4px 32px rgba(0,0,0,.12);
          }
        }
      `}</style>

      {/* ── Barra de ações (só ecrã) ── */}
      <div className="no-print fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-b border-border flex items-center gap-3 px-5 py-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>
        <span className="flex-1 text-center text-sm font-medium text-foreground">
          Auto de Medição Nº {auto.number} — {sub.name}
        </span>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Printer className="w-4 h-4" />
          Imprimir / Guardar PDF
        </button>
      </div>

      {/* ── Área de fundo (só ecrã) ── */}
      <div className="no-print bg-muted min-h-screen pt-16 pb-10 px-4">
        <Document auto={auto} sub={sub} baseLines={baseLines} extraLines={extraLines} temRetencao={temRetencao} fmt={fmt}
          glosas={glosasAplicadas} aprovadores={aprovadores} evidenciasValidas={evidenciasValidas} evidenciasTotal={evidencias.length} />
      </div>

      {/* ── Documento imprimível (só impressão — versão sem wrapper de fundo) ── */}
      <div className="hidden print:block">
        <Document auto={auto} sub={sub} baseLines={baseLines} extraLines={extraLines} temRetencao={temRetencao} fmt={fmt}
          glosas={glosasAplicadas} aprovadores={aprovadores} evidenciasValidas={evidenciasValidas} evidenciasTotal={evidencias.length} />
      </div>
    </>
  );
}

// ── Componente do documento ────────────────────────────────────────────────────
type DocProps = {
  auto: ReturnType<typeof useAuto>['auto'] & {};
  glosas: AutoGlosaRow[];
  aprovadores: ReturnType<typeof useAprovadoresAuto>['aprovadores'];
  evidenciasValidas: number;
  evidenciasTotal: number;
  sub:  ReturnType<typeof useSubempreiteiro>['sub'] & {};
  baseLines:  { id: string; description: string; unit: string; quantity: number; unitPrice: number }[];
  extraLines: { id: string; description: string; unit: string; quantity: number; unitPrice: number }[];
  temRetencao: boolean;
  fmt: (d?: Date | null) => string;
};

function Document({ auto, sub, baseLines, extraLines, temRetencao, fmt, glosas, aprovadores, evidenciasValidas, evidenciasTotal }: DocProps) {
  return (
    <div className="pdf-page bg-white mx-auto max-w-[794px] min-h-[1123px] p-[28px] print:p-0 font-sans">

      {/* ━━━ Cabeçalho ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="flex items-start justify-between mb-6 pb-5 border-b-2 border-gray-900">
        {/* Logo + identidade */}
        <div className="flex items-center gap-4">
          <img src="/icone_oficial.png" alt="ENCIVIL" className="w-16 h-16 object-contain" />
          <div>
            <p className="text-xl font-black tracking-wide text-gray-900 leading-none">ENCIVIL</p>
            <p className="text-xs text-gray-500 mt-0.5">Empresa de Construção Civil</p>
          </div>
        </div>

        {/* Título do documento */}
        <div className="text-right">
          <p className="text-[22px] font-black uppercase tracking-wide text-gray-900">Auto de Medição</p>
          <p className="text-3xl font-black text-primary leading-none">Nº {auto.number}</p>
          <div className="flex items-center justify-end gap-1.5 mt-1">
            <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              auto.workflow === 'validado'
                ? 'bg-green-100 text-green-700'
                : 'bg-amber-100 text-amber-700'
            }`}>
              {ROTULO_WORKFLOW[auto.workflow]}
            </span>
            {auto.estadoPagamento && (
              <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                auto.estadoPagamento === 'pago'
                  ? 'bg-green-100 text-green-700'
                  : auto.estadoPagamento === 'em_atraso'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {ESTADO_PAGAMENTO[auto.estadoPagamento] ?? auto.estadoPagamento}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ━━━ Informações principais ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        {/* Subempreiteiro */}
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Subempreiteiro</p>
          <p className="font-bold text-gray-900">{sub.name}</p>
          {sub.contact && <p className="text-sm text-gray-600 mt-1">{sub.contact}</p>}
        </div>

        {/* Obra + Datas */}
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Obra</p>
          <p className="font-bold text-gray-900">{sub.obraName ?? '—'}</p>
          <div className="mt-2 space-y-0.5">
            <p className="text-sm text-gray-600">
              <span className="text-gray-400">Data da medição: </span>{fmt(auto.date)}
            </p>
            {auto.validatedAt && (
              <p className="text-sm text-gray-600">
                <span className="text-gray-400">Aprovado em: </span>{fmt(auto.validatedAt)}
              </p>
            )}
            {auto.dataPagamento && (
              <p className="text-sm text-gray-600">
                <span className="text-gray-400">Pago em: </span>{fmt(auto.dataPagamento)}
              </p>
            )}
            {auto.referenciaPagamento && (
              <p className="text-sm text-gray-600">
                <span className="text-gray-400">Ref. pagamento: </span>
                <span className="font-mono">{auto.referenciaPagamento}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ━━━ Percentagem de execução (contratos globais) ━━━━━━━━━━━━━━━━━━━━━━ */}
      {auto.periodPercentage != null && (
        <div className="mb-4 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          Percentagem executada no período: <strong>{fmtNumber(auto.periodPercentage)}%</strong>
        </div>
      )}

      {/* ━━━ Tabela de medições ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {baseLines.length > 0 && (
        <div className="mb-4 page-break-avoid">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Medições</p>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-900 text-white">
                <th className="text-left px-3 py-2 font-semibold text-xs uppercase tracking-wide">Descrição</th>
                <th className="text-center px-3 py-2 font-semibold text-xs uppercase tracking-wide w-12">Un.</th>
                <th className="text-right px-3 py-2 font-semibold text-xs uppercase tracking-wide w-20">Qtd.</th>
                <th className="text-right px-3 py-2 font-semibold text-xs uppercase tracking-wide w-28">Preço Unit.</th>
                <th className="text-right px-3 py-2 font-semibold text-xs uppercase tracking-wide w-28">Valor</th>
              </tr>
            </thead>
            <tbody>
              {baseLines.map((l, i) => (
                <tr key={l.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2 border-b border-gray-100">{l.description}</td>
                  <td className="px-3 py-2 border-b border-gray-100 text-center text-gray-600">{l.unit}</td>
                  <td className="px-3 py-2 border-b border-gray-100 text-right tabular-nums">{fmtNumber(l.quantity)}</td>
                  <td className="px-3 py-2 border-b border-gray-100 text-right tabular-nums">{fmtEuro(l.unitPrice)}</td>
                  <td className="px-3 py-2 border-b border-gray-100 text-right font-semibold tabular-nums">{fmtEuro(l.unitPrice * l.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ━━━ Trabalhos a mais ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {extraLines.length > 0 && (
        <div className="mb-4 page-break-avoid">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 mb-2">Trabalhos a mais</p>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-amber-700 text-white">
                <th className="text-left px-3 py-2 font-semibold text-xs uppercase tracking-wide">Descrição</th>
                <th className="text-center px-3 py-2 font-semibold text-xs uppercase tracking-wide w-12">Un.</th>
                <th className="text-right px-3 py-2 font-semibold text-xs uppercase tracking-wide w-20">Qtd.</th>
                <th className="text-right px-3 py-2 font-semibold text-xs uppercase tracking-wide w-28">Preço Unit.</th>
                <th className="text-right px-3 py-2 font-semibold text-xs uppercase tracking-wide w-28">Valor</th>
              </tr>
            </thead>
            <tbody>
              {extraLines.map((l, i) => (
                <tr key={l.id} className={i % 2 === 0 ? 'bg-white' : 'bg-amber-50'}>
                  <td className="px-3 py-2 border-b border-amber-100">{l.description}</td>
                  <td className="px-3 py-2 border-b border-amber-100 text-center text-gray-600">{l.unit}</td>
                  <td className="px-3 py-2 border-b border-amber-100 text-right tabular-nums">{fmtNumber(l.quantity)}</td>
                  <td className="px-3 py-2 border-b border-amber-100 text-right tabular-nums">{fmtEuro(l.unitPrice)}</td>
                  <td className="px-3 py-2 border-b border-amber-100 text-right font-semibold tabular-nums">{fmtEuro(l.unitPrice * l.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ━━━ Observações ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {auto.notes && (
        <div className="mb-5 p-4 border border-gray-200 rounded-lg bg-gray-50 page-break-avoid">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Observações</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{auto.notes}</p>
        </div>
      )}

      {/* ━━━ Glosas ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {glosas.length > 0 && (
        <div className="mb-4 page-break-avoid">
          <p className="text-[11px] font-bold uppercase tracking-wider text-red-600 mb-2">Glosas aplicadas</p>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-red-700 text-white">
                <th className="text-left px-3 py-2 font-semibold text-xs uppercase tracking-wide w-40">Motivo</th>
                <th className="text-left px-3 py-2 font-semibold text-xs uppercase tracking-wide">Descrição</th>
                <th className="text-right px-3 py-2 font-semibold text-xs uppercase tracking-wide w-28">Valor</th>
              </tr>
            </thead>
            <tbody>
              {glosas.map((g, i) => (
                <tr key={g.id} className={i % 2 === 0 ? 'bg-white' : 'bg-red-50'}>
                  <td className="px-3 py-2 border-b border-red-100">{ROTULO_GLOSA[g.motivo]}</td>
                  <td className="px-3 py-2 border-b border-red-100">{g.descricao}</td>
                  <td className="px-3 py-2 border-b border-red-100 text-right font-semibold tabular-nums">− {fmtEuro(g.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ━━━ Resumo de valores ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="flex justify-end mb-8 page-break-avoid">
        <div className="w-80 border border-gray-200 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
            <span className="text-sm text-gray-600">Valor bruto</span>
            <span className="text-sm font-semibold tabular-nums">{fmtEuro(auto.periodValue)}</span>
          </div>

          {auto.valorGlosado > 0 && (
            <>
              <div className="flex items-center justify-between px-4 py-2.5 bg-red-50 border-b border-red-200">
                <span className="text-sm text-red-700">Glosas</span>
                <span className="text-sm font-semibold text-red-700 tabular-nums">− {fmtEuro(auto.valorGlosado)}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                <span className="text-sm text-gray-600">Valor certificado</span>
                <span className="text-sm font-semibold tabular-nums">{fmtEuro(auto.valorCertificado)}</span>
              </div>
            </>
          )}

          {temRetencao && (
            <div className="flex items-center justify-between px-4 py-2.5 bg-amber-50 border-b border-amber-200">
              <span className="text-sm text-amber-700">
                Retenção de garantia ({fmtNumber(auto.retencaoPercentagem)}% do certificado)
              </span>
              <span className="text-sm font-semibold text-amber-700 tabular-nums">
                − {fmtEuro(auto.valorRetido)}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between px-4 py-3 bg-gray-900">
            <span className="text-sm font-bold text-white">
              {temRetencao ? 'Valor líquido a pagar' : 'Valor a pagar'}
            </span>
            <span className="text-xl font-black text-white tabular-nums">
              {fmtEuro(auto.valorLiquido)}
            </span>
          </div>
        </div>
      </div>

      {auto.fatura && (
        <div className="mb-5 p-4 border border-gray-200 rounded-lg bg-gray-50 page-break-avoid">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Fatura do subempreiteiro (guardada)</p>
          <p className="text-sm text-gray-700">
            Nº <span className="font-mono">{auto.fatura.numero}</span>
            {auto.fatura.data && <> · {fmt(new Date(auto.fatura.data))}</>}
            {auto.fatura.valor != null && <> · {fmtEuro(auto.fatura.valor)}</>}
          </p>
          {auto.fatura.valor != null && Math.abs(auto.fatura.valor - auto.valorLiquido) > 0.01 && (
            <p className="text-xs text-amber-700 mt-1">
              O valor da fatura difere do valor líquido aprovado ({fmtEuro(auto.valorLiquido)}).
            </p>
          )}
        </div>
      )}

      {aprovadores.length > 0 && (
        <div className="mb-5 p-4 border border-gray-200 rounded-lg bg-gray-50 page-break-avoid">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Circuito de aprovação</p>
          <ul className="text-sm text-gray-700 space-y-0.5">
            {aprovadores.map(a => (
              <li key={a.etapa}>
                <span className="text-gray-400">{a.etapa}: </span>
                {a.nome ?? '—'}{a.em && <> · {fmt(a.em)}</>}
              </li>
            ))}
          </ul>
          {auto.excecaoMotivo && (
            <p className="text-xs text-amber-700 mt-2">Exceção autorizada pelo administrador: {auto.excecaoMotivo}</p>
          )}
        </div>
      )}

      <p className="mb-2 text-xs text-gray-500">
        Evidências fotográficas válidas: <strong>{evidenciasValidas}</strong>
        {evidenciasTotal > evidenciasValidas && <> (de {evidenciasTotal} registadas)</>}
      </p>

      <div className="mt-6 page-break-avoid"><AutoEvidenciasView autoId={auto.id} imprimivel /></div>

      {/* ━━━ Área de assinaturas ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="grid grid-cols-2 gap-10 mt-4 page-break-avoid">
        {/* Empreiteiro */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-4">Pelo Empreiteiro (ENCIVIL)</p>
          <div className="border-b-2 border-gray-400 mb-2 h-12" />
          <p className="text-xs text-gray-500">Nome e assinatura</p>
          <div className="mt-4">
            <p className="text-xs text-gray-400 mb-1">Data: _____ / _____ / ___________</p>
          </div>
        </div>
        {/* Subempreiteiro */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-4">
            Pelo Subempreiteiro ({sub.name})
          </p>
          <div className="border-b-2 border-gray-400 mb-2 h-12" />
          <p className="text-xs text-gray-500">Nome e assinatura</p>
          <div className="mt-4">
            <p className="text-xs text-gray-400 mb-1">Data: _____ / _____ / ___________</p>
          </div>
        </div>
      </div>

      {/* ━━━ Rodapé ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="mt-10 pt-4 border-t border-gray-200 flex items-center justify-between">
        <p className="text-[10px] text-gray-400">ENCIVIL Gestão — Documento gerado em {fmt(new Date())}</p>
        <p className="text-[10px] text-gray-400">Auto Nº {auto.number} · {sub.name}</p>
      </div>

    </div>
  );
}
