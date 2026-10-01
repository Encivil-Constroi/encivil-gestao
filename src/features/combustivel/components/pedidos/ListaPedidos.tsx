import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Fuel, ChevronRight, AlertTriangle, Loader2 } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import type { EstadoPedido, PedidoRow } from '../../db'
import {
  ROTULO_COMBUSTIVEL, ROTULO_FONTE, formatarDataHora, formatarEuros, formatarNumero, minutosDesde, nivelEspera,
} from '../../lib/pedido'
import { usePedidos, usePodeAprovar } from '../../hooks/usePedidos'
import { AcoesAprovador } from './AcoesAprovador'
import { Aviso, BadgeEspera, BadgeEstado } from './ui'

type Filtro = 'aguardam' | 'em_curso' | 'concluidos' | 'recusados' | 'todos'

const FILTROS: { valor: Filtro; rotulo: string; estados?: EstadoPedido[] }[] = [
  { valor: 'aguardam',   rotulo: 'A aguardar',  estados: ['AGUARDA_AUTORIZACAO', 'AGUARDA_APROVACAO'] },
  { valor: 'em_curso',   rotulo: 'Autorizados', estados: ['AUTORIZADO'] },
  { valor: 'concluidos', rotulo: 'Concluídos',  estados: ['CONCLUIDO'] },
  { valor: 'recusados',  rotulo: 'Recusados / cancelados', estados: ['REJEITADO', 'CANCELADO'] },
  { valor: 'todos',      rotulo: 'Todos' },
]

export function ListaPedidos({ veTodos }: { veTodos: boolean }) {
  const { user } = useAuth()
  const { podeAprovar } = usePodeAprovar()
  const [params, setParams] = useSearchParams()
  const destacado = params.get('pedido')

  const [filtro, setFiltro] = useState<Filtro>(() => {
    const doUrl = params.get('estado')
    return FILTROS.some(f => f.valor === doUrl) ? doUrl as Filtro : veTodos ? 'aguardam' : 'todos'
  })
  const estados = veTodos ? FILTROS.find(f => f.valor === filtro)?.estados : undefined
  const { pedidos, loading, error } = usePedidos({
    estados, solicitanteId: veTodos ? undefined : user?.id, limite: 200,
  }, !!user)

  // A notificação no ícone da app fica a zeros quando o aprovador abre a lista
  useEffect(() => {
    if (podeAprovar) (navigator as Navigator & { clearAppBadge?: () => Promise<void> }).clearAppBadge?.().catch(() => {})
  }, [podeAprovar])

  const ordenados = useMemo(() => {
    // A aguardar: o mais antigo primeiro (quem espera há mais tempo)
    if (veTodos && filtro === 'aguardam') return [...pedidos].sort((a, b) => a.criado_em.localeCompare(b.criado_em))
    return pedidos
  }, [pedidos, filtro, veTodos])

  const criticos = pedidos.filter(p => p.estado === 'AGUARDA_AUTORIZACAO' && nivelEspera(minutosDesde(p.criado_em)) === 'critico').length

  const mudarFiltro = (f: Filtro) => {
    setFiltro(f)
    const novo = new URLSearchParams(params)
    novo.set('estado', f)
    novo.delete('pedido')
    setParams(novo, { replace: true })
  }

  return (
    <div className="space-y-4">
      {veTodos && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Filtrar pedidos">
          {FILTROS.map(f => (
            <button key={f.valor} type="button" role="tab" aria-selected={filtro === f.valor} onClick={() => mudarFiltro(f.valor)}
              className={`px-3.5 py-2 rounded-full text-sm font-medium whitespace-nowrap border transition-colors ${
                filtro === f.valor ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border hover:bg-accent'}`}>
              {f.rotulo}
            </button>
          ))}
        </div>
      )}

      {veTodos && criticos > 0 && (
        <Aviso tipo="erro">
          <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" aria-hidden="true" />
            {criticos === 1 ? '1 motorista espera há mais de 1 hora.' : `${criticos} motoristas esperam há mais de 1 hora.`}
          </span>
        </Aviso>
      )}
      {error && <Aviso tipo="erro">{error}</Aviso>}

      {loading && pedidos.length === 0 ? (
        <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-primary" aria-label="A carregar" /></div>
      ) : ordenados.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <Fuel className="w-10 h-10 mx-auto text-muted-foreground/50" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{veTodos && filtro === 'aguardam' ? 'Nenhum pedido à espera.' : 'Sem pedidos.'}</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {ordenados.map(p => (
            <li key={p.id}>
              <CartaoPedido pedido={p} destacado={p.id === destacado} mostrarAcoes={podeAprovar && p.solicitante_id !== user?.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CartaoPedido({ pedido: p, destacado, mostrarAcoes }: { pedido: PedidoRow; destacado: boolean; mostrarAcoes: boolean }) {
  const aguarda = p.estado === 'AGUARDA_AUTORIZACAO'
  const nivel = aguarda ? nivelEspera(minutosDesde(p.criado_em)) : 'normal'
  const borda = destacado ? 'border-primary ring-2 ring-primary/30'
    : nivel === 'critico' ? 'border-destructive/50' : nivel === 'atencao' ? 'border-warning/50' : 'border-border'

  return (
    <div className={`bg-card rounded-2xl border ${borda} overflow-hidden`}>
      <Link to={`/abastecimento/pedido/${p.id}`} className="flex items-start gap-3 p-4 hover:bg-accent/40 transition-colors">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold truncate">{p.veiculo_nome}</p>
            <BadgeEstado estado={p.estado} />
            {p.km_suspeito && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning">
                <AlertTriangle className="w-3 h-3" aria-hidden="true" /> km
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{p.funcionario_nome}</span>
            {' · '}{p.tipo_fonte ? ROTULO_FONTE[p.tipo_fonte] : '—'}
            {p.tipo_combustivel ? ` · ${ROTULO_COMBUSTIVEL[p.tipo_combustivel]}` : ''}
          </p>
          <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
            <span>{formatarDataHora(p.criado_em)}</span>
            {p.contador != null && <span>· {formatarNumero(p.contador, 0)} km</span>}
            {aguarda && <BadgeEspera minutos={minutosDesde(p.criado_em)} />}
            {p.estado === 'CONCLUIDO' && p.litros != null && (
              <span className="font-semibold text-foreground">· {formatarNumero(p.litros)} L{p.custo_total ? ` · ${formatarEuros(p.custo_total)}` : ''}</span>
            )}
            {p.estado === 'REJEITADO' && p.motivo_recusa && <span>· {p.motivo_recusa}</span>}
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 mt-1" aria-hidden="true" />
      </Link>
      {mostrarAcoes && (aguarda || p.estado === 'AGUARDA_APROVACAO') && (
        <div className="px-4 pb-4"><AcoesAprovador pedido={p} compacto /></div>
      )}
    </div>
  )
}
