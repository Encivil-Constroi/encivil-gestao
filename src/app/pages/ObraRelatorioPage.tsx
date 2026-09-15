import { useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ChevronLeft, Printer } from 'lucide-react';
import { fmtEuro, fmtNumber } from '@/app/lib/format';
import { useObra } from '@/features/obras/hooks/useObras';
import { useSubempreiteirosComExecutado } from '@/features/subempreiteiros/hooks/useSubempreiteiros';
import { useCustoObra } from '@/features/custos/useCustoObra';
import { useMovimentos } from '@/features/movimentos/hooks/useMovimentos';
import { useAbastecimentos } from '@/features/combustivel/hooks/useCombustivel';
import { getUnitLabel } from '@/app/data/mockData';

const PT = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmt = (d?: Date | null) => (d ? PT.format(d) : '—');
const pct = (v: number, t: number) => (t > 0 ? Math.min(Math.round((v / t) * 100), 100) : 0);
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

function gaugeColor(consumido: number): { bar: string; text: string } {
  if (consumido >= 100) return { bar: '#dc2626', text: '#dc2626' };
  if (consumido >= 90)  return { bar: '#b45309', text: '#b45309' };
  if (consumido >= 70)  return { bar: '#f59e0b', text: '#b45309' };
  return { bar: '#16a34a', text: '#16a34a' };
}

export function ObraRelatorioPage() {
  const { id }     = useParams();
  const navigate   = useNavigate();

  const { obra,    loading: loadObra }  = useObra(id);
  const { subs,    loading: loadSubs }  = useSubempreiteirosComExecutado(id);
  const { custo,   loading: loadCusto } = useCustoObra(id, obra?.budget);
  const { movements, loading: loadMovs } = useMovimentos(id ? { tipo: 'saida', obraId: id } : {});
  const { entries: fuel, loading: loadFuel } = useAbastecimentos(id ? { obraId: id } : {});

  const loading = loadObra || loadSubs || loadCusto || loadMovs || loadFuel;

  // Agrupa materiais por produto (soma quantidades)
  const topMateriais = useMemo(() => {
    const map = new Map<string, { nome: string; qtd: number; unit: string }>()
    movements.forEach(m => {
      const e = map.get(m.productName) ?? { nome: m.productName, qtd: 0, unit: m.unit }
      e.qtd += m.quantity
      map.set(m.productName, e)
    })
    return Array.from(map.values()).sort((a, b) => b.qtd - a.qtd).slice(0, 15)
  }, [movements])

  // Agrupa combustível por viatura
  const topViaturas = useMemo(() => {
    const map = new Map<string, { nome: string; litros: number; custo: number }>()
    fuel.forEach(e => {
      const key  = e.vehicleName ?? 'Sem viatura'
      const entry = map.get(key) ?? { nome: key, litros: 0, custo: 0 }
      entry.litros += e.liters
      entry.custo  += e.totalCost
      map.set(key, entry)
    })
    return Array.from(map.values()).sort((a, b) => b.custo - a.custo)
  }, [fuel])

  useEffect(() => {
    if (obra) document.title = `Relatório · ${obra.name}`
    return () => { document.title = 'ENCIVIL Gestão' }
  }, [obra])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!obra) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-muted-foreground">Obra não encontrada.</p>
        <button onClick={() => navigate(-1)} className="text-sm text-primary underline">Voltar</button>
      </div>
    )
  }

  const consumoPct    = custo && obra.budget ? pct(custo.total, obra.budget) : null
  const margemPct     = custo?.margem != null && obra.budget ? (custo.margem / obra.budget) * 100 : null
  const gc            = consumoPct != null ? gaugeColor(consumoPct) : null

  const totalContratado = subs.reduce((s, x) => s + x.agreedValue, 0)
  const totalExecutado  = subs.reduce((s, x) => s + x.executed,    0)

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 14mm 18mm; }
          html, body { margin: 0; background: white !important; }
          .no-print  { display: none !important; }
          .pdf-page  { box-shadow: none !important; border: none !important; padding: 0 !important; }
          table      { page-break-inside: auto; }
          tr         { page-break-inside: avoid; page-break-after: auto; }
          .no-break  { page-break-inside: avoid; }
        }
      `}</style>

      {/* ── Barra de acções (ecrã) ── */}
      <div className="no-print fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-b border-border flex items-center gap-3 px-5 py-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>
        <span className="flex-1 text-center text-sm font-medium truncate">{obra.name} — Relatório Financeiro</span>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Printer className="w-4 h-4" /> Imprimir / Guardar PDF
        </button>
      </div>

      {/* ── Fundo ecrã ── */}
      <div className="no-print bg-muted min-h-screen pt-16 pb-10 px-4">
        <DocContent
          obra={obra} custo={custo} subs={subs} topMateriais={topMateriais} topViaturas={topViaturas}
          consumoPct={consumoPct} margemPct={margemPct} gc={gc}
          totalContratado={totalContratado} totalExecutado={totalExecutado}
        />
      </div>

      {/* ── Impressão ── */}
      <div className="hidden print:block">
        <DocContent
          obra={obra} custo={custo} subs={subs} topMateriais={topMateriais} topViaturas={topViaturas}
          consumoPct={consumoPct} margemPct={margemPct} gc={gc}
          totalContratado={totalContratado} totalExecutado={totalExecutado}
        />
      </div>
    </>
  )
}

// ── Tipagem ────────────────────────────────────────────────────────────────────
type DocProps = {
  obra: NonNullable<ReturnType<typeof useObra>['obra']>
  custo: ReturnType<typeof useCustoObra>['custo']
  subs: ReturnType<typeof useSubempreiteirosComExecutado>['subs']
  topMateriais: { nome: string; qtd: number; unit: string }[]
  topViaturas:  { nome: string; litros: number; custo: number }[]
  consumoPct:   number | null
  margemPct:    number | null
  gc: { bar: string; text: string } | null
  totalContratado: number
  totalExecutado:  number
}

// ── Documento ─────────────────────────────────────────────────────────────────
function DocContent({ obra, custo, subs, topMateriais, topViaturas, consumoPct, margemPct, gc, totalContratado, totalExecutado }: DocProps) {
  return (
    <div className="pdf-page bg-white mx-auto max-w-[794px] min-h-[1123px] p-[28px] print:p-0 font-sans">

      {/* ━━━ Cabeçalho ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="flex items-start justify-between mb-6 pb-5 border-b-2 border-gray-900">
        <div className="flex items-center gap-4">
          <img src="/icone_oficial.png" alt="ENCIVIL" className="w-16 h-16 object-contain" />
          <div>
            <p className="text-xl font-black tracking-wide text-gray-900 leading-none">ENCIVIL</p>
            <p className="text-xs text-gray-500 mt-0.5">Empresa de Construção Civil</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Relatório Financeiro</p>
          <p className="text-[22px] font-black text-gray-900 leading-tight max-w-[280px] text-right">{obra.name}</p>
          <div className="flex items-center justify-end gap-2 mt-1">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              obra.status === 'concluida' ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'
            }`}>
              {obra.status === 'concluida' ? 'Concluída' : 'Ativa'}
            </span>
          </div>
          <p className="text-[10px] text-gray-400 mt-1">Gerado em {fmt(new Date())}</p>
        </div>
      </div>

      {/* ━━━ Info da obra ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {(obra.client || obra.location) && (
        <div className="grid grid-cols-2 gap-3 mb-5">
          {obra.client && (
            <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Cliente</p>
              <p className="text-sm font-semibold text-gray-900">{obra.client}</p>
            </div>
          )}
          {obra.location && (
            <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Local</p>
              <p className="text-sm font-semibold text-gray-900">{obra.location}</p>
            </div>
          )}
        </div>
      )}

      {/* ━━━ P&L summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="mb-5 no-break">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">Resumo Financeiro</p>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {/* Orçamento */}
          <div className="border border-gray-200 rounded-lg p-4 text-center bg-gray-50">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Orçamento</p>
            <p className="text-xl font-black text-gray-900">{obra.budget != null ? fmtEuro(obra.budget) : '—'}</p>
          </div>
          {/* Custo Real */}
          <div className="border border-gray-200 rounded-lg p-4 text-center bg-gray-50">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Custo Real</p>
            <p className="text-xl font-black text-red-600">{custo ? fmtEuro(custo.total) : '—'}</p>
            {consumoPct != null && (
              <p className="text-[10px] font-semibold mt-0.5" style={{ color: gc?.text }}>{consumoPct}% do orçamento</p>
            )}
          </div>
          {/* Margem */}
          <div className={`border rounded-lg p-4 text-center ${
            custo?.margem == null ? 'border-gray-200 bg-gray-50'
              : custo.margem >= 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
          }`}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Margem</p>
            <p className={`text-xl font-black ${
              custo?.margem == null ? 'text-gray-400'
                : custo.margem >= 0 ? 'text-green-700' : 'text-red-600'
            }`}>
              {custo?.margem != null ? fmtEuro(custo.margem) : '—'}
            </p>
            {margemPct != null && (
              <p className={`text-[10px] font-semibold mt-0.5 ${margemPct >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {fmtPct(margemPct)} da receita
              </p>
            )}
          </div>
        </div>

        {/* Gauge de consumo do orçamento */}
        {consumoPct != null && gc && (
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-700">Consumo do orçamento</p>
              <p className="text-xs font-bold" style={{ color: gc.text }}>{consumoPct}%</p>
            </div>
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${consumoPct}%`, backgroundColor: gc.bar }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>€0</span>
              <span>{fmtEuro(obra.budget!)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ━━━ Repartição do custo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {custo && (
        <div className="mb-5 no-break">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">Repartição do Custo</p>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-900 text-white">
                <th className="text-left px-3 py-2 font-semibold text-xs uppercase tracking-wide">Centro de Custo</th>
                <th className="text-right px-3 py-2 font-semibold text-xs uppercase tracking-wide w-32">Valor</th>
                <th className="text-right px-3 py-2 font-semibold text-xs uppercase tracking-wide w-20">% Total</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Materiais de Armazém', value: custo.materiais },
                { label: 'Subempreiteiros',      value: custo.subempreiteiros },
                { label: 'Combustível',          value: custo.combustivel },
              ].map((row, i) => (
                <tr key={row.label} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2.5 border-b border-gray-100">{row.label}</td>
                  <td className="px-3 py-2.5 border-b border-gray-100 text-right font-semibold tabular-nums">{fmtEuro(row.value)}</td>
                  <td className="px-3 py-2.5 border-b border-gray-100 text-right tabular-nums text-gray-600">
                    {custo.total > 0 ? `${pct(row.value, custo.total)}%` : '—'}
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-900 text-white font-bold">
                <td className="px-3 py-2.5">Total</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtEuro(custo.total)}</td>
                <td className="px-3 py-2.5 text-right">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ━━━ Subempreiteiros ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {subs.length > 0 && (
        <div className="mb-5 no-break">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Subempreiteiros</p>
            <p className="text-[10px] text-gray-500">
              Contratado {fmtEuro(totalContratado)} · Executado {fmtEuro(totalExecutado)} · Falta {fmtEuro(totalContratado - totalExecutado)}
            </p>
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-900 text-white">
                <th className="text-left px-3 py-2 font-semibold text-xs uppercase tracking-wide">Subempreiteiro</th>
                <th className="text-left px-3 py-2 font-semibold text-xs uppercase tracking-wide">Tipo</th>
                <th className="text-right px-3 py-2 font-semibold text-xs uppercase tracking-wide w-28">Contratado</th>
                <th className="text-right px-3 py-2 font-semibold text-xs uppercase tracking-wide w-28">Executado</th>
                <th className="text-right px-3 py-2 font-semibold text-xs uppercase tracking-wide w-28">Falta</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s, i) => (
                <tr key={s.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2.5 border-b border-gray-100 font-medium">{s.name}</td>
                  <td className="px-3 py-2.5 border-b border-gray-100 text-gray-600">
                    {s.type === 'global' ? 'Global' : 'Unitário'}
                    {s.status === 'validado' && (
                      <span className="ml-1 text-[10px] font-semibold text-green-700">✓</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 border-b border-gray-100 text-right tabular-nums">{fmtEuro(s.agreedValue)}</td>
                  <td className="px-3 py-2.5 border-b border-gray-100 text-right tabular-nums text-green-700 font-semibold">{fmtEuro(s.executed)}</td>
                  <td className="px-3 py-2.5 border-b border-gray-100 text-right tabular-nums font-bold">{fmtEuro(s.agreedValue - s.executed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ━━━ Materiais ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {topMateriais.length > 0 && (
        <div className="mb-5 no-break">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">
            Materiais enviados ({topMateriais.length > 14 ? 'top 15' : topMateriais.length + ' referências'})
          </p>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-800 text-white">
                <th className="text-left px-3 py-2 font-semibold text-xs uppercase tracking-wide">Produto</th>
                <th className="text-right px-3 py-2 font-semibold text-xs uppercase tracking-wide w-24">Quantidade</th>
              </tr>
            </thead>
            <tbody>
              {topMateriais.map((m, i) => (
                <tr key={m.nome} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2 border-b border-gray-100">{m.nome}</td>
                  <td className="px-3 py-2 border-b border-gray-100 text-right tabular-nums font-semibold">
                    {fmtNumber(m.qtd)} {getUnitLabel(m.unit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ━━━ Combustível por viatura ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {topViaturas.length > 0 && (
        <div className="mb-8 no-break">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">Combustível por viatura</p>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-800 text-white">
                <th className="text-left px-3 py-2 font-semibold text-xs uppercase tracking-wide">Viatura</th>
                <th className="text-right px-3 py-2 font-semibold text-xs uppercase tracking-wide w-24">Litros</th>
                <th className="text-right px-3 py-2 font-semibold text-xs uppercase tracking-wide w-28">Custo</th>
              </tr>
            </thead>
            <tbody>
              {topViaturas.map((v, i) => (
                <tr key={v.nome} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2 border-b border-gray-100">{v.nome}</td>
                  <td className="px-3 py-2 border-b border-gray-100 text-right tabular-nums">{fmtNumber(v.litros)} L</td>
                  <td className="px-3 py-2 border-b border-gray-100 text-right tabular-nums font-semibold">{fmtEuro(v.custo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ━━━ Rodapé ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="pt-4 border-t border-gray-200 flex items-center justify-between">
        <p className="text-[10px] text-gray-400">ENCIVIL Gestão — Documento gerado em {fmt(new Date())}</p>
        <p className="text-[10px] text-gray-400">Relatório Financeiro · {obra.name}</p>
      </div>
    </div>
  )
}
