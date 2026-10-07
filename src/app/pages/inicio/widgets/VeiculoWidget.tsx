import { useMemo } from 'react'
import { Link } from 'react-router'
import { Car } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { fmtEuro, fmtNumber, fmtDataCurta } from '@/app/lib/format'
import { useAbastecimentosVeiculo, usePedidos } from '@/features/combustivel/hooks/usePedidos'
import { consumoL100, isoDia, periodoDoPreset, totais } from '@/features/combustivel/lib/analise'
import { BadgeEstado } from '@/features/combustivel/components/pedidos/ui'
import type { ContextoRow } from '@/features/combustivel/db'
import { Secao, Esqueleto, ErroSecao, Numero, Vazio } from './ui'

const DIAS_CONSUMO = 90
const DIA_MS = 86_400_000

// O carro de quem o conduz: onde está, quanto gasta e o que pediu. Só leituras já permitidas pela RLS.
export function VeiculoWidget({ contexto, loading, error, reload, podePedir }: {
  contexto: ContextoRow | null; loading: boolean; error: string | null; reload: () => void; podePedir: boolean
}) {
  const { user } = useAuth()
  const veiculoId = contexto?.veiculo_id ?? null

  const { hoje, desde } = useMemo(() => {
    const agora = new Date()
    return { hoje: isoDia(agora), desde: isoDia(new Date(agora.getTime() - (DIAS_CONSUMO - 1) * DIA_MS)) }
  }, [])
  const { abastecimentos, loading: aCarregar, error: erroConsumo, reload: recarregarConsumo } = useAbastecimentosVeiculo(veiculoId, desde)
  const { pedidos } = usePedidos({ solicitanteId: user?.id, limite: 4 }, !!veiculoId && !!user)

  const doMes = useMemo(() => {
    const inicio = periodoDoPreset('mes', hoje).inicio
    return totais(abastecimentos.filter(a => a.data >= inicio))
  }, [abastecimentos, hoje])
  const l100 = useMemo(() => consumoL100(abastecimentos), [abastecimentos])
  const unidade = abastecimentos[0]?.comb_veiculos?.unidade_contador === 'horas' ? 'h' : 'km'

  return (
    <Secao titulo="O meu veículo" icone={Car}>
      {loading ? <Esqueleto /> : error ? <ErroSecao mensagem={error} onRetry={reload} /> : !veiculoId ? (
        <Vazio>Sem viatura atribuída. A atribuição é feita na Frota, em &quot;Entregar viatura&quot;.</Vazio>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <p className="font-semibold truncate">{contexto?.veiculo_nome}</p>
              {contexto?.veiculo_identificacao && <p className="text-sm text-muted-foreground">{contexto.veiculo_identificacao}</p>}
            </div>
            {contexto?.km_atual != null && (
              <p className="text-sm text-muted-foreground">{fmtNumber(contexto.km_atual)} {unidade} no contador</p>
            )}
          </div>

          {contexto?.pedido_aberto_id && (
            <Link to={`/abastecimento/pedido/${contexto.pedido_aberto_id}`}
              className="flex items-center justify-between gap-3 p-3 rounded-xl bg-warning/10 border border-warning/30 text-sm font-medium hover:bg-warning/15">
              <span>Tem um pedido de combustível em curso</span><span className="text-primary">Ver pedido</span>
            </Link>
          )}

          {aCarregar ? <Esqueleto linhas={1} /> : erroConsumo ? <ErroSecao mensagem={erroConsumo} onRetry={recarregarConsumo} /> : (
            <div className="grid grid-cols-3 gap-2">
              <Numero valor={`${fmtNumber(Math.round(doMes.litros * 10) / 10)} L`} rotulo="Litros este mês" />
              <Numero valor={fmtEuro(doMes.custo)} rotulo="Gasto este mês" />
              <Numero valor={l100 == null ? '—' : `${l100.toFixed(1).replace('.', ',')}`} rotulo={`L/100 ${unidade} (90 dias)`} />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-sm font-medium">Os meus pedidos</h3>
              {podePedir && <Link to="/abastecimento" className="text-xs text-primary hover:underline">Ver todos</Link>}
            </div>
            {pedidos.length === 0 ? <Vazio>Ainda não fez pedidos de combustível.</Vazio> : (
              <ul className="divide-y divide-border">
                {pedidos.map(p => (
                  <li key={p.id}>
                    <Link to={`/abastecimento/pedido/${p.id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:bg-accent/40 rounded-lg px-1">
                      <span className="text-muted-foreground">{fmtDataCurta(p.criado_em)}</span>
                      <span className="flex-1 min-w-0 truncate">{p.litros != null ? `${fmtNumber(p.litros)} L` : p.veiculo_nome}</span>
                      <BadgeEstado estado={p.estado} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Secao>
  )
}
