import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Fuel, Building2, ChevronLeft, ChevronRight, Calendar, Download, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState } from '@/app/components/EmptyState'
import { SkeletonList } from '@/app/components/Skeletons'
import { fmtEuro, fmtNumber } from '@/app/lib/format'
import { exportarXlsx } from '@/app/lib/exportXlsx'
import { useRole } from '@/features/auth/useRole'
import { useAbastecimentos, useVeiculos } from '../../hooks/useCombustivel'
import type { FuelEntry } from '@/app/types'

type PeriodoTipo = 'mes' | 'tudo'

function mesLabel(d: Date) {
  return d.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })
}

function primeiroDiaMes(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function ultimoDiaMes(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

function toISO(d: Date) {
  return d.toISOString().split('T')[0]
}

function diaLabel(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  const hoje = toISO(new Date())
  const ontem = toISO(new Date(Date.now() - 86_400_000))
  if (dateStr === hoje) return 'Hoje'
  if (dateStr === ontem) return 'Ontem'
  return d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'short' })
}

// Registos com pedido abrem o pedido (é lá que vive o histórico de decisões);
// os manuais só o administrador pode corrigir.
function destinoDoRegisto(e: FuelEntry, isAdmin: boolean): string | null {
  if (e.pedidoId) return `/abastecimento/pedido/${e.pedidoId}`
  if (isAdmin) return `/abastecimento/registo/${e.id}`
  return null
}

const linhaCls = 'flex items-center justify-between gap-3 px-4 py-3'

function LinhaRegisto({ e, isAdmin }: { e: FuelEntry; isAdmin: boolean }) {
  const destino = destinoDoRegisto(e, isAdmin)
  const conteudo: ReactNode = (
    <>
      <div className="min-w-0 flex items-center gap-3">
        {e.photoUrl ? (
          <img src={e.photoUrl} alt="Foto do abastecimento" loading="lazy"
            className="w-10 h-10 rounded-lg object-cover border border-border shrink-0 bg-muted" />
        ) : (
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
            <Fuel className="w-4 h-4 text-primary" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">
            {e.vehicleName ?? '—'}
            {e.vehicleCode && <span className="text-xs font-normal text-muted-foreground ml-1">{e.vehicleCode}</span>}
          </p>
          <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
            <span>{fmtNumber(e.liters)} L · {fmtEuro(e.pricePerLiter)}/L</span>
            {e.obraName && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" aria-hidden="true" />{e.obraName}</span>}
            {e.location && <span>{e.location}</span>}
            {!e.pedidoId && <span className="italic">registo manual</span>}
          </p>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-bold">{fmtEuro(e.totalCost)}</p>
        {e.responsible && <p className="text-xs text-muted-foreground">{e.responsible}</p>}
      </div>
    </>
  )
  if (!destino) return <div className={linhaCls} data-testid="registo-abastecimento">{conteudo}</div>
  return (
    <Link to={destino} data-testid="registo-abastecimento"
      className={`${linhaCls} hover:bg-accent/40 active:bg-accent/60 transition-colors`}>
      {conteudo}
    </Link>
  )
}

export function HistoricoAbastecimentos() {
  const { isAdmin } = useRole()
  const [periodoTipo, setPeriodoTipo] = useState<PeriodoTipo>('mes')
  const [mesRef, setMesRef] = useState(() => primeiroDiaMes(new Date()))
  const [veiculoFiltro, setVeiculoFiltro] = useState('')
  const [exporting, setExporting] = useState(false)

  const filtros = useMemo(() => ({
    veiculoId: veiculoFiltro || undefined,
    dataInicio: periodoTipo === 'mes' ? toISO(primeiroDiaMes(mesRef)) : undefined,
    dataFim: periodoTipo === 'mes' ? toISO(ultimoDiaMes(mesRef)) : undefined,
  }), [periodoTipo, mesRef, veiculoFiltro])

  const { entries, loading } = useAbastecimentos(filtros)
  const { vehicles } = useVeiculos(true)

  const totalGasto = useMemo(() => entries.reduce((s, e) => s + e.totalCost, 0), [entries])
  const totalLitros = useMemo(() => entries.reduce((s, e) => s + e.liters, 0), [entries])

  const porDia = useMemo(() => {
    const map = new Map<string, FuelEntry[]>()
    for (const e of entries) {
      const k = toISO(e.date)
      const lista = map.get(k)
      if (lista) lista.push(e)
      else map.set(k, [e])
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a))
  }, [entries])

  async function exportar() {
    if (entries.length === 0) return
    setExporting(true)
    try {
      const rows = entries.map(e => ({
        Data: e.date.toLocaleDateString('pt-PT'),
        Viatura: e.vehicleName ?? '',
        Matrícula: e.vehicleCode ?? '',
        Litros: e.liters,
        'Custo Total (€)': e.totalCost,
        'Preço/L (€)': e.pricePerLiter,
        Contador: e.counter ?? '',
        Local: e.location ?? '',
        Responsável: e.responsible ?? '',
        Obra: e.obraName ?? '',
        Origem: e.pedidoId ? 'Pedido' : 'Registo manual',
        Observações: e.notes ?? '',
        Foto: e.photoUrl ?? '',
      }))
      await exportarXlsx(rows, 'combustivel', 'Combustível')
      toast.success(`${rows.length} abastecimento${rows.length !== 1 ? 's' : ''} exportados`)
    } catch {
      toast.error('Erro ao exportar')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1 flex-1 min-w-0">
          <button onClick={() => setPeriodoTipo('tudo')} aria-pressed={periodoTipo === 'tudo'}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors shrink-0 ${
              periodoTipo === 'tudo' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}>
            <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
            Tudo
          </button>
          <div className={`flex items-center gap-1 flex-1 min-w-0 transition-opacity ${periodoTipo !== 'mes' ? 'opacity-40' : ''}`}>
            <button aria-label="Mês anterior"
              onClick={() => { setPeriodoTipo('mes'); setMesRef(d => new Date(d.getFullYear(), d.getMonth() - 1, 1)) }}
              className="p-1.5 hover:bg-accent rounded-lg transition-colors">
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <button onClick={() => setPeriodoTipo('mes')} aria-pressed={periodoTipo === 'mes'}
              className={`flex-1 min-w-0 text-center text-sm font-semibold capitalize truncate px-1 py-2 rounded-lg transition-colors ${
                periodoTipo === 'mes' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>
              {mesLabel(mesRef)}
            </button>
            <button aria-label="Mês seguinte"
              onClick={() => { setPeriodoTipo('mes'); setMesRef(d => new Date(d.getFullYear(), d.getMonth() + 1, 1)) }}
              disabled={mesRef >= primeiroDiaMes(new Date())}
              className="p-1.5 hover:bg-accent rounded-lg transition-colors disabled:opacity-30">
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <select value={veiculoFiltro} onChange={e => setVeiculoFiltro(e.target.value)} aria-label="Viatura"
          className="bg-card border border-border rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 sm:w-48">
          <option value="">Todas as viaturas</option>
          {vehicles.map(v => (
            <option key={v.id} value={v.id}>{v.name} {v.code ? `(${v.code})` : ''}</option>
          ))}
        </select>

        <button onClick={exportar} disabled={exporting || loading || entries.length === 0} title="Exportar para Excel"
          className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border rounded-xl text-sm font-medium hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
          <Download className="w-4 h-4" aria-hidden="true" />
          <span className="hidden sm:inline">{exporting ? 'A exportar…' : 'Excel'}</span>
        </button>
      </div>

      {!loading && entries.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-xs text-muted-foreground mb-0.5">Abastecimentos</p>
            <p className="text-lg font-bold">{entries.length}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-xs text-muted-foreground mb-0.5">Total litros</p>
            <p className="text-lg font-bold">{fmtNumber(totalLitros)} L</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-xs text-muted-foreground mb-0.5">Custo total</p>
            <p className="text-lg font-bold">{fmtEuro(totalGasto)}</p>
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonList rows={5} cols={4} />
      ) : entries.length === 0 ? (
        <EmptyState icon={Fuel} title="Sem abastecimentos"
          description={periodoTipo === 'mes' ? `Nenhum abastecimento em ${mesLabel(mesRef)}.` : 'Nenhum abastecimento registado.'} />
      ) : (
        <div className="space-y-4">
          {porDia.map(([dia, doDia]) => (
            <section key={dia} aria-label={diaLabel(dia)}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1 capitalize">
                {diaLabel(dia)}
                <span className="ml-2 font-normal normal-case">
                  · {fmtEuro(doDia.reduce((s, e) => s + e.totalCost, 0))}
                  {' '}· {fmtNumber(doDia.reduce((s, e) => s + e.liters, 0))} L
                </span>
              </p>
              <div className="bg-card rounded-2xl border border-border divide-y divide-border overflow-hidden">
                {doDia.map(e => <LinhaRegisto key={e.id} e={e} isAdmin={isAdmin} />)}
              </div>
            </section>
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="flex justify-end pt-1">
          <Link to="/abastecimento/registo/novo"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Lançar registo manual
          </Link>
        </div>
      )}
    </div>
  )
}
