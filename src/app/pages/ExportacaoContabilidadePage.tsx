import { useState, useEffect, useRef } from 'react'
import {
  Download, Package, Fuel, HardHat, BarChart2, FileDown, CheckCircle2, AlertTriangle, Loader2,
  Clock, CalendarX, IdCard, Receipt, CalendarCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { exportarXlsx, exportarXlsxMultiFolha } from '@/app/lib/exportXlsx'
import { useMutation } from '@/app/lib/useMutation'
import { useObras } from '@/features/obras/hooks/useObras'
import {
  exportarMateriais, exportarCombustivel, exportarAutos, exportarPLObras,
  exportarMapaAssiduidade, exportarFaltas, exportarDadosLaborais, exportarFaturas, exportarFechoMes,
  type FiltrosExport, type ExportRow,
} from '@/features/contabilidade/contabilidadeService'
import { mesAtual, mesAnterior } from '@/features/contabilidade/lib/periodo'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hoje(): string { return new Date().toISOString().split('T')[0] }
function nomeFicheiro(prefixo: string, filtros: FiltrosExport): string {
  const de  = filtros.dataInicio ?? 'inicio'
  const ate = filtros.dataFim    ?? hoje()
  return `${prefixo}_${de}_ate_${ate}`
}

// ─── Estado por card ──────────────────────────────────────────────────────────

type CardStatus = 'idle' | 'loading' | 'done' | 'error'

function StatusBadge({ status }: { status: CardStatus }) {
  if (status === 'loading') return <Loader2 className="w-4 h-4 animate-spin text-primary" />
  if (status === 'done')    return <CheckCircle2 className="w-4 h-4 text-success" />
  if (status === 'error')   return <AlertTriangle className="w-4 h-4 text-destructive" />
  return null
}

// ─── Definições dos exports ───────────────────────────────────────────────────

const EXPORTS = [
  {
    id:          'assiduidade' as const,
    icon:        Clock,
    title:       'Assiduidade e horas (salários)',
    description: 'Por colaborador: dias trabalhados, horas normais e extra por escalão, subsídio de alimentação e faltas.',
    prefixo:     'assiduidade',
    nota:        'Filtro de data aplicado (só admin/gestor)',
    filtraData:  true,
    filtraObra:  false,
  },
  {
    id:          'faltas' as const,
    icon:        CalendarX,
    title:       'Faltas',
    description: 'Detalhe das faltas por colaborador, tipo e estado, só em dias úteis do período.',
    prefixo:     'faltas',
    nota:        'Filtro de data aplicado (só admin/gestor)',
    filtraData:  true,
    filtraObra:  false,
  },
  {
    id:          'laborais' as const,
    icon:        IdCard,
    title:       'Dados laborais',
    description: 'NIF, NISS, IBAN, admissão e contrato de cada colaborador. Dados pessoais: não reencaminhar.',
    prefixo:     'dados_laborais',
    nota:        'Estado atual (sem filtro de data)',
    filtraData:  false,
    filtraObra:  false,
  },
  {
    id:          'faturas' as const,
    icon:        Receipt,
    title:       'Faturas de fornecedor',
    description: 'NIF do fornecedor, base tributável, IVA e total de cada fatura.',
    prefixo:     'faturas_fornecedor',
    nota:        'Filtro de data da fatura (ou de receção) e obra',
    filtraData:  true,
    filtraObra:  true,
  },
  {
    id:          'materiais' as const,
    icon:        Package,
    title:       'Saídas de Materiais',
    description: 'Produtos saídos do armazém com custo unitário e total, organizados por data e obra.',
    prefixo:     'materiais_saidas',
    nota:        'Filtro de data e obra aplicado',
    filtraData:  true,
    filtraObra:  true,
  },
  {
    id:          'combustivel' as const,
    icon:        Fuel,
    title:       'Abastecimentos de Combustível',
    description: 'Registos de abastecimento com custo por litro, viatura e obra associada.',
    prefixo:     'combustivel',
    nota:        'Filtro de data e obra aplicado',
    filtraData:  true,
    filtraObra:  true,
  },
  {
    id:          'autos' as const,
    icon:        HardHat,
    title:       'Autos de Medição Validados',
    description: 'Todos os autos com estado validado: valor bruto, retenção, valor líquido e estado de pagamento.',
    prefixo:     'autos_medicao_validados',
    nota:        'Apenas autos validados; filtro de data e obra aplicado',
    filtraData:  true,
    filtraObra:  true,
  },
  {
    id:          'pl' as const,
    icon:        BarChart2,
    title:       'P&L Resumo por Obra',
    description: 'Uma linha por obra com orçamento, custos por categoria, margem total e percentagem.',
    prefixo:     'pl_obras',
    nota:        'Histórico acumulado de todas as obras (sem filtro de data)',
    filtraData:  false,
    filtraObra:  false,
  },
] as const

type ExportId = typeof EXPORTS[number]['id']

const ESTADO_INICIAL: Record<ExportId, CardStatus> = {
  assiduidade: 'idle', faltas: 'idle', laborais: 'idle', faturas: 'idle',
  materiais: 'idle', combustivel: 'idle', autos: 'idle', pl: 'idle',
}
const ERROS_INICIAIS: Record<ExportId, string | null> = {
  assiduidade: null, faltas: null, laborais: null, faturas: null,
  materiais: null, combustivel: null, autos: null, pl: null,
}

function buscarLinhas(id: ExportId, f: FiltrosExport): Promise<ExportRow[]> {
  switch (id) {
    case 'assiduidade': return exportarMapaAssiduidade(f)
    case 'faltas':      return exportarFaltas(f)
    case 'laborais':    return exportarDadosLaborais()
    case 'faturas':     return exportarFaturas(f)
    case 'materiais':   return exportarMateriais(f)
    case 'combustivel': return exportarCombustivel(f)
    case 'autos':       return exportarAutos(f)
    case 'pl':          return exportarPLObras()
  }
}

// ─── Componente principal ──────────────────────────────────────────────────────

export function ExportacaoContabilidadePage() {
  const { obras, loading: obrasLoading } = useObras(false)

  const [dataInicio, setDataInicio] = useState(() => mesAtual().dataInicio)
  const [dataFim,    setDataFim]    = useState(hoje)
  const [obraId,     setObraId]     = useState('')

  const [status,  setStatus]  = useState<Record<ExportId, CardStatus>>(ESTADO_INICIAL)
  const [errors,  setErrors]  = useState<Record<ExportId, string | null>>(ERROS_INICIAIS)
  const [exportandoTudo, setExportandoTudo] = useState(false)

  const usarPeriodo = (p: { dataInicio: string; dataFim: string }) => {
    setDataInicio(p.dataInicio)
    setDataFim(p.dataFim)
  }

  // Reset status when filters change
  useEffect(() => {
    setStatus(ESTADO_INICIAL)
    setErrors(ERROS_INICIAIS)
  }, [dataInicio, dataFim, obraId])

  const filtros: FiltrosExport = {
    dataInicio: dataInicio || undefined,
    dataFim:    dataFim    || undefined,
    obraId:     obraId     || undefined,
  }

  const idEmCurso = useRef<ExportId | null>(null)
  const { mutate: gerarCard, error: erroCard } = useMutation(async (id: ExportId): Promise<'ok' | 'vazio'> => {
    const def = EXPORTS.find(x => x.id === id)!
    const filtrosCard: FiltrosExport = {
      dataInicio: def.filtraData ? filtros.dataInicio : undefined,
      dataFim:    def.filtraData ? filtros.dataFim    : undefined,
      obraId:     def.filtraObra ? filtros.obraId     : undefined,
    }
    const rows = await buscarLinhas(id, filtrosCard)
    if (!rows || rows.length === 0) return 'vazio'
    await exportarXlsx(rows, nomeFicheiro(def.prefixo, filtros), def.title)
    return 'ok'
  }, 'Erro ao exportar')

  // O erro específico (ex.: "Sem permissão…") vem do useMutation; mostra-se no card e em toast
  useEffect(() => {
    if (!erroCard) return
    toast.error(erroCard)
    const id = idEmCurso.current
    if (id) setErrors(e => ({ ...e, [id]: erroCard }))
  }, [erroCard])

  const exportarUm = async (id: ExportId) => {
    idEmCurso.current = id
    setStatus(s => ({ ...s, [id]: 'loading' }))
    setErrors(e => ({ ...e, [id]: null }))
    const r = await gerarCard(id)
    if (r === 'ok') {
      setStatus(s => ({ ...s, [id]: 'done' }))
    } else if (r === 'vazio') {
      toast.info('Sem dados no período')
      setStatus(s => ({ ...s, [id]: 'idle' }))
    } else {
      setErrors(e => ({ ...e, [id]: e[id] ?? 'Não foi possível exportar. Tente novamente.' }))
      setStatus(s => ({ ...s, [id]: 'error' }))
    }
  }

  const { mutate: gerarFecho, loading: aGerarFecho, error: erroFecho } = useMutation(async (): Promise<'ok' | 'vazio'> => {
    const folhas = await exportarFechoMes(filtros)
    if (!folhas || folhas.every(f => f.linhas.length === 0)) return 'vazio'
    await exportarXlsxMultiFolha(folhas, `fecho_mes_${filtros.dataInicio ?? 'inicio'}_ate_${filtros.dataFim ?? hoje()}`)
    return 'ok'
  }, 'Erro ao gerar o fecho do mês')

  useEffect(() => { if (erroFecho) toast.error(erroFecho) }, [erroFecho])

  const fecharMes = async () => {
    const r = await gerarFecho()
    if (r === 'vazio') toast.info('Sem dados no período')
    else if (r === 'ok') toast.success('Fecho do mês gerado')
    // r === null: o erro já foi mostrado pelo efeito acima
  }

  const exportarTudo = async () => {
    setExportandoTudo(true)
    for (const def of EXPORTS) {
      await exportarUm(def.id)
      // Pequena pausa entre downloads para o browser processar
      await new Promise(r => setTimeout(r, 300))
    }
    setExportandoTudo(false)
  }

  const algumLoading = Object.values(status).some(s => s === 'loading')
  const todosFeitos  = EXPORTS.every(x => status[x.id] === 'done')

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold">Exportação para Contabilidade</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Descarregue ficheiros Excel prontos a enviar ao contabilista.
          Os valores monetários são numéricos (formatados em € no Excel) para poderem ser somados e importados.
        </p>
      </div>

      {/* Fecho do mês */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-card rounded-2xl border border-border p-5">
        <div className="flex-1">
          <p className="font-semibold text-sm">Fecho do mês</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Um único Excel com todas as folhas (assiduidade, faltas, dados laborais, faturas, materiais,
            combustível, autos, P&L e notas) para o período escolhido.
          </p>
        </div>
        <button
          onClick={fecharMes}
          disabled={aGerarFecho || exportandoTudo}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {aGerarFecho
            ? <><Loader2 className="w-4 h-4 animate-spin" /> A gerar…</>
            : <><CalendarCheck className="w-4 h-4" /> Fecho do mês (Excel)</>
          }
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Filtros</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => usarPeriodo(mesAtual())}
              className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-accent transition-colors">
              Mês atual
            </button>
            <button type="button" onClick={() => usarPeriodo(mesAnterior())}
              className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-accent transition-colors">
              Mês anterior
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="exp-de" className="block text-xs font-medium text-muted-foreground mb-1.5">De</label>
            <input
              id="exp-de"
              type="date"
              value={dataInicio}
              max={dataFim || undefined}
              onChange={e => setDataInicio(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label htmlFor="exp-ate" className="block text-xs font-medium text-muted-foreground mb-1.5">Até</label>
            <input
              id="exp-ate"
              type="date"
              value={dataFim}
              min={dataInicio || undefined}
              onChange={e => setDataFim(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label htmlFor="exp-obra" className="block text-xs font-medium text-muted-foreground mb-1.5">Obra</label>
            <select
              id="exp-obra"
              value={obraId}
              onChange={e => setObraId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Todas as obras</option>
              {obrasLoading
                ? <option disabled>A carregar…</option>
                : obras.map(o => <option key={o.id} value={o.id}>{o.name}</option>)
              }
            </select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          O P&L por Obra e os Dados laborais não usam filtro de data (são sempre o estado atual/acumulado).
          Com uma obra escolhida, a Assiduidade, as Faltas, os Dados laborais e o P&L continuam a ser da empresa toda.
        </p>
      </div>

      {/* Cards de export */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {EXPORTS.map(def => {
          const Icon = def.icon
          const s    = status[def.id]
          const err  = errors[def.id]
          const isLoading = s === 'loading'
          return (
            <div key={def.id} className={`bg-card rounded-2xl border p-5 flex flex-col gap-3 transition-colors ${
              s === 'done' ? 'border-success/40 bg-success/5'
                : s === 'error' ? 'border-destructive/30'
                : 'border-border'
            }`}>
              <div className="flex items-start gap-3">
                <span className="p-2.5 rounded-xl bg-muted text-foreground shrink-0">
                  <Icon className="w-5 h-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">{def.title}</p>
                    <StatusBadge status={s} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{def.description}</p>
                </div>
              </div>

              {err && (
                <div className="flex items-start gap-2 bg-destructive/10 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">{err}</p>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 mt-auto">
                <span className="text-[11px] text-muted-foreground">{def.nota}</span>
                <button
                  onClick={() => exportarUm(def.id)}
                  aria-label={`Descarregar ${def.title}`}
                  disabled={isLoading || exportandoTudo}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  {isLoading
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> A exportar…</>
                    : <><Download className="w-3.5 h-3.5" /> Descarregar Excel</>
                  }
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Exportar Tudo */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-card rounded-2xl border border-border p-5">
        <div className="flex-1">
          <p className="font-semibold text-sm">Exportar Tudo</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Descarrega os {EXPORTS.length} ficheiros em sequência (um por card). Para um único ficheiro, use o Fecho do mês.
          </p>
        </div>
        <button
          onClick={exportarTudo}
          disabled={algumLoading || exportandoTudo || aGerarFecho}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {exportandoTudo
            ? <><Loader2 className="w-4 h-4 animate-spin" /> A exportar…</>
            : todosFeitos
              ? <><CheckCircle2 className="w-4 h-4" /> Exportado</>
              : <><FileDown className="w-4 h-4" /> Exportar {EXPORTS.length} Ficheiros</>
          }
        </button>
      </div>

      {/* Legenda de colunas */}
      <details className="bg-card rounded-2xl border border-border">
        <summary className="px-5 py-3.5 text-sm font-semibold cursor-pointer select-none hover:bg-accent/40 rounded-2xl transition-colors">
          Estrutura dos ficheiros exportados
        </summary>
        <div className="px-5 pb-5 pt-2 grid grid-cols-1 sm:grid-cols-2 gap-5">
          {EXPORTS.map(def => (
            <div key={def.id}>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{def.title}</p>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {COLS[def.id].map(c => <li key={c} className="font-mono">{c}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}

// ─── Colunas de cada export (para a legenda) ──────────────────────────────────

const COLS: Record<ExportId, string[]> = {
  assiduidade: [
    'Nº Mecanográfico', 'Nome', 'NIF', 'NISS', 'Cargo', 'Dias Trabalhados', 'Horas Normais',
    'Extra Dia Útil +25% (h)', 'Extra Dia Útil +37,5% (h)', 'Extra Descanso/Feriado +50% (h)',
    'Total Horas Extra', 'Dias Subsídio Alimentação', 'Faltas Justificadas (dias)',
    'Faltas Injustificadas (dias)', 'Faltas Descontáveis (dias)',
  ],
  faltas: ['Nº Mecanográfico', 'Nome', 'Tipo de Falta', 'Estado', 'Dias'],
  laborais: [
    'Nº Mecanográfico', 'Nome', 'NIF', 'NISS', 'IBAN', 'Cargo', 'Categoria Profissional',
    'Data Admissão', 'Tipo Contrato', 'Fim Contrato', 'Ativo',
  ],
  faturas: [
    'Nº Fatura', 'Fornecedor', 'NIF Fornecedor', 'Data Fatura', 'Data Receção',
    'Base Tributável (€)', 'IVA (€)', 'Total (€)', 'Obra', 'Estado', 'Lançada Em',
  ],
  materiais: [
    'Data', 'Produto', 'Código', 'Quantidade', 'Unidade',
    'Custo Unitário (€)', 'Custo Total (€)', 'Responsável', 'Obra',
  ],
  combustivel: [
    'Data', 'Viatura', 'Código Viatura', 'Litros', 'Custo/Litro (€)',
    'Custo Total (€)', 'Responsável', 'Obra', 'Local', 'Observações',
  ],
  autos: [
    'Nº Auto', 'Data Medição', 'Subempreiteiro', 'Obra',
    'Valor Bruto (€)', 'Retenção (%)', 'Valor Retido (€)', 'Valor Líquido (€)',
    'Estado Pagamento', 'Data Pagamento', 'Ref. Pagamento', 'Validado Em',
  ],
  pl: [
    'Obra', 'Cliente', 'Local', 'Estado', 'Orçamento (€)',
    'Materiais (€)', 'Subempreiteiros (€)', 'Combustível (€)',
    'Custo Total (€)', 'Margem (€)', 'Margem (%)',
  ],
}
