import { useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts'
import {
  AlertOctagon, AlertTriangle, ArrowDownRight, ArrowUpRight, Brain, CheckCircle2, Download, Info, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { exportarXlsx } from '@/app/lib/exportXlsx'
import {
  ROTULO_FONTE_ANALISE, ROTULO_PRESET, analisar, consumoL100, granularidadeAuto, isoDia, metricasAprovacao,
  periodoAnterior, periodoDoPreset, porFonte, porMotorista, porPeriodo, porViatura, totais,
  type Granularidade, type Insight, type NivelInsight, type Preset,
} from '../../lib/analise'
import { formatarEuros, formatarNumero, textoDuracao } from '../../lib/pedido'
import { useDadosAnalise } from '../../hooks/usePedidos'
import { Aviso, Cabecalho } from '../pedidos/ui'

type Medida = 'custo' | 'litros'
const PRESETS: Preset[] = ['semana', 'mes', '30d', '90d', 'ano']
const ROTULO_GRAN: Record<Granularidade, string> = { dia: 'Dia', semana: 'Semana', mes: 'Mês' }

const fmtMedida = (m: Medida, v: number) => (m === 'custo' ? formatarEuros(v) : `${formatarNumero(v, 0)} L`)
const compacto = (m: Medida, v: number) =>
  m === 'custo'
    ? v >= 1000 ? `${formatarNumero(v / 1000, 1)} mil €` : `${formatarNumero(v, 0)} €`
    : v >= 1000 ? `${formatarNumero(v / 1000, 1)} mil L` : `${formatarNumero(v, 0)} L`

export function RelatorioCombustivelPage({ embutido = false }: { embutido?: boolean } = {}) {
  const [preset, setPreset] = useState<Preset>('mes')
  // A viatura vive na URL: a ficha da Frota liga para aqui já filtrada (?viatura=) e o link pode ser partilhado
  const [searchParams, setSearchParams] = useSearchParams()
  const viatura = searchParams.get('viatura') ?? ''
  const setViatura = (id: string) => setSearchParams(prev => {
    const p = new URLSearchParams(prev)
    if (id) p.set('viatura', id)
    else p.delete('viatura')
    return p
  }, { replace: true })
  const [medida, setMedida] = useState<Medida>('custo')
  const [granEscolhida, setGranEscolhida] = useState<Granularidade | null>(null)

  const hoje = isoDia(new Date())
  const periodo = useMemo(() => periodoDoPreset(preset, hoje), [preset, hoje])
  const anterior = useMemo(() => periodoAnterior(periodo), [periodo])
  const gran = granEscolhida ?? granularidadeAuto(periodo)

  const dados = useDadosAnalise(periodo.inicio, periodo.fim, anterior.inicio, anterior.fim)
  const todasViaturas = useMemo(() => porViatura(dados.abastecimentos ?? []), [dados.abastecimentos])

  // O filtro de viatura aplica-se a tudo o que está abaixo (números sempre coerentes)
  const rows = useMemo(() => (dados.abastecimentos ?? []).filter(r => !viatura || r.veiculo_id === viatura), [dados.abastecimentos, viatura])
  const rowsAnt = useMemo(() => dados.anteriores.filter(r => !viatura || r.veiculo_id === viatura), [dados.anteriores, viatura])
  const pedidos = useMemo(() => dados.pedidos.filter(p => !viatura || p.veiculo_id === viatura), [dados.pedidos, viatura])

  const t = useMemo(() => totais(rows), [rows])
  const ta = useMemo(() => totais(rowsAnt), [rowsAnt])
  const serie = useMemo(() => porPeriodo(rows, periodo, gran), [rows, periodo, gran])
  const viaturas = useMemo(() => porViatura(rows), [rows])
  const motoristas = useMemo(() => porMotorista(rows), [rows])
  const fontes = useMemo(() => porFonte(rows), [rows])
  const aprov = useMemo(() => metricasAprovacao(pedidos), [pedidos])
  const insights = useMemo(() => analisar(rows, rowsAnt, pedidos), [rows, rowsAnt, pedidos])
  // Consumo médio da frota: média das viaturas com consumo calculável
  const consumoFrota = useMemo(() => {
    const v = viaturas.map(x => x.l100).filter((x): x is number => x != null)
    return viatura ? consumoL100(rows) : v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
  }, [viaturas, rows, viatura])

  const [aExportar, setAExportar] = useState(false)
  const exportar = async () => {
    setAExportar(true)
    try {
      await exportarXlsx(rows.map(r => ({
        Data: r.data.split('-').reverse().join('/'), Viatura: r.comb_veiculos?.nome ?? '', Motorista: r.responsavel ?? '',
        Origem: ROTULO_FONTE_ANALISE[r.tipo_fonte ?? 'MANUAL'], Combustível: r.tipo_combustivel ?? '',
        Litros: r.litros, 'Custo (€)': r.custo_total, Km: r.contador ?? '',
      })), `combustivel-${periodo.inicio}-${periodo.fim}`, 'Abastecimentos')
    } catch { toast.error('Erro ao exportar') }
    setAExportar(false)
  }

  const aCarregar = dados.loading && dados.abastecimentos != null

  return (
    <div className={embutido ? 'viz-root space-y-5' : 'viz-root max-w-6xl mx-auto space-y-5 pb-24'}>
      {!embutido && (
        <Cabecalho titulo="Relatório de combustível" voltar={false}
          subtitulo="O analista de dados da frota: custos, consumos, viaturas e motoristas." />
      )}

      {/* Filtros: uma linha, acima de tudo o que filtram */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Período">
          {PRESETS.map(p => (
            <button key={p} type="button" role="tab" aria-selected={preset === p} onClick={() => { setPreset(p); setGranEscolhida(null) }}
              className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap border transition-colors ${
                preset === p ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border hover:bg-accent'}`}>
              {ROTULO_PRESET[p]}
            </button>
          ))}
        </div>
        <select value={viatura} onChange={e => setViatura(e.target.value)} aria-label="Viatura"
          className="bg-card border border-border rounded-lg px-3 py-2 text-sm">
          <option value="">Todas as viaturas</option>
          {todasViaturas.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
          {/* Viatura vinda da URL sem abastecimentos no período: sem esta opção o select mostraria 'Todas' a filtrar uma */}
          {viatura && dados.abastecimentos != null && !todasViaturas.some(v => v.id === viatura) && (
            <option value={viatura}>Viatura sem abastecimentos no período</option>
          )}
        </select>
        <button type="button" onClick={exportar} disabled={aExportar || rows.length === 0}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 bg-card border border-border rounded-lg text-sm font-medium hover:bg-accent disabled:opacity-40">
          <Download className="w-4 h-4" aria-hidden="true" /> Excel
        </button>
      </div>
      <p className="text-xs text-muted-foreground -mt-3">
        {periodo.inicio.split('-').reverse().join('/')} a {periodo.fim.split('-').reverse().join('/')} · comparado com os {Math.round((new Date(periodo.fim).getTime() - new Date(periodo.inicio).getTime()) / 86_400_000) + 1} dias anteriores
      </p>

      {dados.error && <Aviso tipo="erro">{dados.error}</Aviso>}

      {dados.abastecimentos == null ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" aria-label="A carregar" /></div>
      ) : (
        // Ao mudar de filtro mantém o que está no ecrã, esbatido, até chegarem os dados novos
        <div className={`space-y-5 transition-opacity ${aCarregar ? 'opacity-50' : ''}`} aria-busy={aCarregar}>
          <section aria-label="Indicadores" className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <Tile rotulo="Custo" valor={formatarEuros(t.custo)} delta={variacao(t.custo, ta.custo)} subirEBom={false} destaque />
            <Tile rotulo="Litros" valor={`${formatarNumero(t.litros, 0)} L`} delta={variacao(t.litros, ta.litros)} subirEBom={false} />
            <Tile rotulo="Abastecimentos" valor={String(t.n)} delta={variacao(t.n, ta.n)} subirEBom={false} />
            <Tile rotulo="Preço médio" valor={t.precoMedio != null ? `${formatarEuros(t.precoMedio)}/L` : '—'}
              delta={t.precoMedio != null && ta.precoMedio != null ? variacao(t.precoMedio, ta.precoMedio) : null} subirEBom={false} />
            <Tile rotulo="Consumo médio" valor={consumoFrota != null ? `${formatarNumero(consumoFrota, 1)} L/100` : '—'}
              nota={consumoFrota == null ? 'precisa de 2 leituras de km' : undefined} />
            <Tile rotulo="Resposta aos pedidos" valor={aprov.medianaMin != null ? textoDuracao(Math.round(aprov.medianaMin)) : '—'}
              nota={aprov.decididos ? `${aprov.decididos} decididos · ${aprov.recusados} recusados` : 'sem pedidos'} />
          </section>

          <Analista insights={insights} />

          <Painel titulo={medida === 'custo' ? 'Custo ao longo do tempo' : 'Litros ao longo do tempo'}
            acoes={<>
              <Alternar valor={medida} opcoes={[['custo', 'Custo'], ['litros', 'Litros']]} onChange={setMedida} rotulo="Medida" />
              <Alternar valor={gran} opcoes={(['dia', 'semana', 'mes'] as const).map(g => [g, ROTULO_GRAN[g]])} onChange={setGranEscolhida} rotulo="Agrupar por" />
            </>}>
            <div className="h-64" role="img" aria-label={`${medida === 'custo' ? 'Custo' : 'Litros'} por ${ROTULO_GRAN[gran].toLowerCase()}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: 'var(--chart-text)' }} tickLine={false}
                    axisLine={{ stroke: 'var(--chart-grid)' }} interval="preserveStartEnd" minTickGap={12} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--chart-text)' }} tickLine={false} axisLine={false} width={64}
                    tickFormatter={v => compacto(medida, Number(v))} allowDecimals={false} />
                  <Tooltip cursor={{ fill: 'var(--chart-grid)', opacity: 0.5 }}
                    content={<Dica formatar={v => fmtMedida(medida, v)} extra={p => `${p.n} abastecimento${p.n === 1 ? '' : 's'}`} />} />
                  <Bar dataKey={medida} fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Painel>

          <div className="grid lg:grid-cols-2 gap-5">
            <Ranking titulo="Por viatura" subtitulo="Custo no período (as 8 maiores)"
              dados={viaturas.slice(0, 8).map(v => ({ nome: v.nome, valor: v.custo, extra: `${formatarNumero(v.litros, 0)} L · ${v.n} abast.${v.l100 != null ? ` · ${formatarNumero(v.l100, 1)} L/100` : ''}` }))} />
            <Ranking titulo="Por motorista" subtitulo="Custo no período (os 8 maiores)"
              dados={motoristas.slice(0, 8).map(m => ({ nome: m.nome, valor: m.custo, extra: `${formatarNumero(m.litros, 0)} L · ${m.n} abast. · ${m.viaturas} viatura${m.viaturas === 1 ? '' : 's'}` }))} />
          </div>

          <OrigemCombustivel fontes={fontes} total={t.litros} />

          <Painel titulo="Viaturas — tabela completa">
            <Tabela cabecalho={['Viatura', 'Abast.', 'Litros', 'Custo', '€/L', 'Km', 'L/100 km']}
              linhas={viaturas.map(v => [
                v.nome, String(v.n), `${formatarNumero(v.litros)} L`, formatarEuros(v.custo),
                v.litros > 0 && v.custo > 0 ? formatarEuros(v.custo / v.litros) : '—',
                v.km != null ? formatarNumero(v.km, 0) : '—', v.l100 != null ? formatarNumero(v.l100, 1) : '—',
              ])} />
          </Painel>

          <Painel titulo="Motoristas — tabela completa">
            <Tabela cabecalho={['Motorista', 'Abast.', 'Litros', 'Custo', 'Viaturas']}
              linhas={motoristas.map(m => [m.nome, String(m.n), `${formatarNumero(m.litros)} L`, formatarEuros(m.custo), String(m.viaturas)])} />
          </Painel>
        </div>
      )}
    </div>
  )
}

function variacao(atual: number, antes: number): number | null {
  return antes > 0 ? (atual - antes) / antes : null
}

function Tile({ rotulo, valor, delta, subirEBom = true, nota, destaque = false }: {
  rotulo: string; valor: string; delta?: number | null; subirEBom?: boolean; nota?: string; destaque?: boolean
}) {
  const temDelta = delta != null && Number.isFinite(delta)
  const bom = temDelta && (delta! > 0) === subirEBom
  const Seta = temDelta && delta! > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <div className={`bg-card border rounded-2xl p-3.5 ${destaque ? 'border-primary/40 col-span-2 lg:col-span-1' : 'border-border'}`}>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={`font-semibold mt-0.5 ${destaque ? 'text-2xl' : 'text-lg'}`}>{valor}</p>
      {temDelta && Math.abs(delta!) >= 0.005 ? (
        <p className={`text-xs font-medium flex items-center gap-0.5 mt-0.5 ${bom ? 'text-success' : 'text-destructive'}`}>
          <Seta className="w-3.5 h-3.5" aria-hidden="true" />
          {delta! > 0 ? '+' : ''}{Math.round(delta! * 100)}% <span className="text-muted-foreground font-normal ml-1">vs anterior</span>
        </p>
      ) : nota ? <p className="text-xs text-muted-foreground mt-0.5">{nota}</p> : temDelta ? (
        <p className="text-xs text-muted-foreground mt-0.5">igual ao anterior</p>
      ) : null}
    </div>
  )
}

const ICONE_NIVEL: Record<NivelInsight, { Icone: typeof Info; cls: string; rotulo: string }> = {
  critico: { Icone: AlertOctagon,  cls: 'text-destructive', rotulo: 'Crítico' },
  atencao: { Icone: AlertTriangle, cls: 'text-warning',     rotulo: 'Atenção' },
  info:    { Icone: Info,          cls: 'text-info',        rotulo: 'Nota' },
  bom:     { Icone: CheckCircle2,  cls: 'text-success',     rotulo: 'Bom' },
}

function Analista({ insights }: { insights: Insight[] }) {
  return (
    <section className="bg-card border border-border rounded-2xl p-4 space-y-3" aria-labelledby="analista-titulo">
      <h2 id="analista-titulo" className="text-sm font-semibold flex items-center gap-2">
        <Brain className="w-4 h-4 text-primary" aria-hidden="true" /> O que os números dizem
      </h2>
      <ul className="divide-y divide-border">
        {insights.map(i => {
          const { Icone, cls, rotulo } = ICONE_NIVEL[i.nivel]
          return (
            <li key={i.id} className="flex items-start gap-3 py-2.5">
              <Icone className={`w-5 h-5 shrink-0 mt-0.5 ${cls}`} aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-medium"><span className="sr-only">{rotulo}: </span>{i.titulo}</p>
                <p className="text-sm text-muted-foreground">{i.detalhe}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Painel({ titulo, acoes, children }: { titulo: string; acoes?: ReactNode; children: ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-sm font-semibold flex-1">{titulo}</h2>
        {acoes}
      </div>
      {children}
    </section>
  )
}

function Alternar<T extends string>({ valor, opcoes, onChange, rotulo }: {
  valor: T; opcoes: readonly (readonly [T, string])[]; onChange: (v: T) => void; rotulo: string
}) {
  return (
    <div className="inline-flex rounded-lg border border-border p-0.5" role="radiogroup" aria-label={rotulo}>
      {opcoes.map(([v, r]) => (
        <button key={v} type="button" role="radio" aria-checked={valor === v} onClick={() => onChange(v)}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${valor === v ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>
          {r}
        </button>
      ))}
    </div>
  )
}

// Tooltip: o valor primeiro (forte), o rótulo a seguir
function Dica<P extends { rotulo: string; n: number }>({ active, payload, formatar, extra }: TooltipProps<number, string> & {
  formatar: (v: number) => string; extra?: (p: P) => string
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload as P
  return (
    <div className="bg-card border border-border rounded-lg shadow-md px-3 py-2 text-xs">
      <p className="text-sm font-semibold text-foreground">{formatar(Number(payload[0].value))}</p>
      <p className="text-muted-foreground">{p.rotulo}{extra ? ` · ${extra(p)}` : ''}</p>
    </div>
  )
}

// Barras horizontais de uma só série (um tom): rótulo à esquerda, valor na ponta
function Ranking({ titulo, subtitulo, dados }: { titulo: string; subtitulo: string; dados: { nome: string; valor: number; extra: string }[] }) {
  const max = Math.max(1, ...dados.map(d => d.valor))
  return (
    <Painel titulo={titulo}>
      <p className="text-xs text-muted-foreground -mt-2">{subtitulo}</p>
      {dados.length === 0 ? <p className="text-sm text-muted-foreground py-4">Sem dados.</p> : (
        <ul className="space-y-2.5">
          {dados.map((d, n) => (
            <li key={n} className="group" title={`${d.nome}: ${formatarEuros(d.valor)} · ${d.extra}`}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-medium">{d.nome}</span>
                <span className="font-semibold tabular-nums shrink-0">{formatarEuros(d.valor)}</span>
              </div>
              <div className="h-2.5 mt-1 rounded-r bg-transparent">
                <div className="h-full rounded-r-[4px] transition-opacity group-hover:opacity-80"
                  style={{ width: `${Math.max(1, (d.valor / max) * 100)}%`, background: 'var(--chart-1)' }} />
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{d.extra}</p>
            </li>
          ))}
        </ul>
      )}
    </Painel>
  )
}

const COR_FONTE = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-5)']

// Parte de um todo: uma barra empilhada (2 px de intervalo entre partes) + legenda com valores
function OrigemCombustivel({ fontes, total }: { fontes: ReturnType<typeof porFonte>; total: number }) {
  if (!fontes.length || total <= 0) return null
  const ordem = ['POLO2', 'CARRINHA', 'POSTO_RUA', 'MANUAL']
  return (
    <Painel titulo="De onde vem o combustível">
      <div className="flex h-4 gap-[2px]" role="img"
        aria-label={fontes.map(f => `${ROTULO_FONTE_ANALISE[f.fonte]} ${Math.round(f.litros / total * 100)}%`).join(', ')}>
        {fontes.map((f, i) => (
          <div key={f.fonte} title={`${ROTULO_FONTE_ANALISE[f.fonte]}: ${formatarNumero(f.litros, 0)} L`}
            className={`h-full ${i === 0 ? 'rounded-l-[4px]' : ''} ${i === fontes.length - 1 ? 'rounded-r-[4px]' : ''}`}
            style={{ width: `${(f.litros / total) * 100}%`, background: COR_FONTE[ordem.indexOf(f.fonte)] }} />
        ))}
      </div>
      <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {fontes.map(f => (
          <li key={f.fonte} className="flex items-start gap-2">
            <span className="w-3 h-3 rounded-[3px] mt-1 shrink-0" style={{ background: COR_FONTE[ordem.indexOf(f.fonte)] }} aria-hidden="true" />
            <span className="text-sm">
              <span className="block font-medium">{ROTULO_FONTE_ANALISE[f.fonte]}</span>
              <span className="block text-muted-foreground text-xs">
                {Math.round(f.litros / total * 100)}% · {formatarNumero(f.litros, 0)} L · {formatarEuros(f.custo)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Painel>
  )
}

function Tabela({ cabecalho, linhas }: { cabecalho: string[]; linhas: string[][] }) {
  if (!linhas.length) return <p className="text-sm text-muted-foreground">Sem dados.</p>
  return (
    <div className="overflow-x-auto -mx-4">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>{cabecalho.map((h, i) => (
            <th key={h} scope="col" className={`px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap ${i ? 'text-right' : 'text-left'}`}>{h}</th>
          ))}</tr>
        </thead>
        <tbody className="divide-y divide-border">
          {linhas.map((l, n) => (
            <tr key={n} className="hover:bg-accent/40">
              {l.map((c, i) => <td key={i} className={`px-4 py-2.5 whitespace-nowrap ${i ? 'text-right tabular-nums' : 'font-medium'}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
