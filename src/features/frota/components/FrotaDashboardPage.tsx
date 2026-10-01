import { useMemo } from 'react'
import { Link } from 'react-router'
import { ChevronRight, RefreshCw, ShieldAlert, AlertTriangle, KeyRound, Undo2, Wrench, User, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { useRole } from '@/features/auth/useRole'
import { formatarData, diasAte, textoFaltamDias } from '@/app/lib/prazoFrota'
import { useResumoFrota, useAvaliarFrota, useUltimasEntregas, useUltimasManutencoes } from '../hooks/useFrota'
import { contarPorEstado, documentosEmRisco, rotuloViatura, marcaModelo } from '../lib/viaturas'
import { Seccao, Vazio, botaoSecundario } from './ui'

const LIMITE_ALERTAS = 6
const LIMITE_EM_USO = 8

function Contador({ para, valor, rotulo, cor }: { para: string; valor: number; rotulo: string; cor: string }) {
  return (
    <Link to={para} className="bg-card rounded-2xl border border-border p-4 hover:bg-accent/40 active:scale-[0.98] transition-all">
      <p className={`text-3xl font-bold ${cor}`}>{valor}</p>
      <p className="text-sm text-muted-foreground mt-0.5">{rotulo}</p>
    </Link>
  )
}

const linha = 'flex items-center gap-3 py-2.5 first:pt-0 last:pb-0'

export function FrotaDashboardPage() {
  const { viaturas, loading, error, reload } = useResumoFrota()
  const { entregas } = useUltimasEntregas(4)
  const { manutencoes } = useUltimasManutencoes(4)
  const { podeFrota } = useRole()
  const { avaliar, loading: aAvaliar } = useAvaliarFrota()

  const n = useMemo(() => contarPorEstado(viaturas), [viaturas])
  const emUso = useMemo(() => viaturas.filter(v => v.estado_operacional === 'EM_USO'), [viaturas])
  const comPrazos = useMemo(() => viaturas.filter(v => v.alertas_urgentes + v.alertas_atencao > 0)
    .sort((a, b) => b.alertas_urgentes - a.alertas_urgentes), [viaturas])
  const documentos = useMemo(() => documentosEmRisco(viaturas), [viaturas])
  const totalAlertas = comPrazos.length + documentos.length

  const avaliarAgora = async () => {
    const r = await avaliar()
    if (r !== null) toast.success(r === 0 ? 'Prazos avaliados — nada a vencer.' : `Prazos avaliados — ${r} alerta${r > 1 ? 's' : ''} ativo${r > 1 ? 's' : ''}.`)
  }

  if (loading && viaturas.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">A carregar…</p>
  if (error) return (
    <div className="py-8 text-center space-y-3">
      <p className="text-sm text-destructive">{error}</p>
      <button onClick={reload} className={botaoSecundario}>Tentar de novo</button>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Contador para="/frota/viaturas" valor={n.TODOS} rotulo="Total" cor="text-foreground" />
        <Contador para="/frota/viaturas?estado=LIVRE" valor={n.LIVRE} rotulo="Livres" cor="text-success" />
        <Contador para="/frota/viaturas?estado=EM_USO" valor={n.EM_USO} rotulo="Em uso" cor="text-warning" />
        <Contador para="/frota/viaturas?estado=OFICINA" valor={n.OFICINA} rotulo="Na oficina" cor="text-destructive" />
      </div>

      <Seccao titulo="Alertas" icone={<ShieldAlert className="w-4 h-4 text-primary" aria-hidden="true" />}
        acao={podeFrota ? (
          <button onClick={avaliarAgora} disabled={aAvaliar} className="inline-flex items-center gap-1.5 text-sm text-primary font-medium disabled:opacity-60">
            <RefreshCw className={`w-3.5 h-3.5 ${aAvaliar ? 'animate-spin' : ''}`} aria-hidden="true" /> Avaliar prazos
          </button>
        ) : undefined}>
        {totalAlertas === 0 ? <Vazio>Tudo em dia: sem prazos urgentes nem seguros ou IPO a vencer.</Vazio> : (
          <ul className="divide-y divide-border">
            {comPrazos.slice(0, LIMITE_ALERTAS).map(v => (
              <li key={`p-${v.id}`}>
                <Link to={`/frota/viatura/${v.id}`} className={`${linha} hover:text-primary`}>
                  {v.alertas_urgentes > 0
                    ? <ShieldAlert className="w-4 h-4 text-destructive shrink-0" aria-hidden="true" />
                    : <AlertTriangle className="w-4 h-4 text-warning shrink-0" aria-hidden="true" />}
                  <span className="flex-1 min-w-0 text-sm">
                    <strong>{rotuloViatura(v)}</strong>
                    <span className="text-muted-foreground">
                      {' '}· {v.alertas_urgentes > 0 && `${v.alertas_urgentes} prazo${v.alertas_urgentes > 1 ? 's' : ''} urgente${v.alertas_urgentes > 1 ? 's' : ''}`}
                      {v.alertas_urgentes > 0 && v.alertas_atencao > 0 && ', '}
                      {v.alertas_atencao > 0 && `${v.alertas_atencao} a vencer`}
                    </span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                </Link>
              </li>
            ))}
            {documentos.slice(0, LIMITE_ALERTAS).map(d => (
              <li key={`d-${d.viatura.id}-${d.documento}`}>
                <Link to={`/frota/viatura/${d.viatura.id}`} className={`${linha} hover:text-primary`}>
                  {d.nivel === 'EXPIRADO'
                    ? <ShieldAlert className="w-4 h-4 text-destructive shrink-0" aria-hidden="true" />
                    : <AlertTriangle className="w-4 h-4 text-warning shrink-0" aria-hidden="true" />}
                  <span className="flex-1 min-w-0 text-sm">
                    <strong>{rotuloViatura(d.viatura)}</strong>
                    <span className="text-muted-foreground"> · {d.documento} {formatarData(d.data)} ({textoFaltamDias(diasAte(d.data))})</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Seccao>

      <Seccao titulo="Quem tem o quê" icone={<User className="w-4 h-4 text-primary" aria-hidden="true" />}
        acao={emUso.length > LIMITE_EM_USO
          ? <Link to="/frota/viaturas?estado=EM_USO" className="text-sm text-primary font-medium">Ver todas ({emUso.length})</Link> : undefined}>
        {emUso.length === 0 ? <Vazio>Nenhuma viatura em uso neste momento.</Vazio> : (
          <ul className="divide-y divide-border">
            {emUso.slice(0, LIMITE_EM_USO).map(v => (
              <li key={v.id}>
                <Link to={`/frota/viatura/${v.id}`} className={`${linha} hover:text-primary`}>
                  <span className="flex-1 min-w-0 text-sm">
                    <strong>{rotuloViatura(v)}</strong> <span className="text-muted-foreground">{marcaModelo(v)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {v.condutor_nome ?? 'Sem colaborador'}
                      {v.obra_nome && <span className="inline-flex items-center gap-1 ml-2"><MapPin className="w-3 h-3" aria-hidden="true" />{v.obra_nome}</span>}
                    </span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Seccao>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Seccao titulo="Últimas entregas e devoluções" icone={<KeyRound className="w-4 h-4 text-primary" aria-hidden="true" />}
          acao={<Link to="/frota/entregas" className="text-sm text-primary font-medium">Ver todas</Link>}>
          {entregas.length === 0 ? <Vazio>Ainda sem entregas.</Vazio> : (
            <ul className="divide-y divide-border">
              {entregas.map(e => (
                <li key={e.id} className={linha}>
                  {e.tipo === 'ENTREGA'
                    ? <KeyRound className="w-4 h-4 text-warning shrink-0" aria-hidden="true" />
                    : <Undo2 className="w-4 h-4 text-success shrink-0" aria-hidden="true" />}
                  <span className="flex-1 min-w-0 text-sm">
                    <strong>{e.identificacao ?? e.veiculo_nome}</strong>
                    <span className="block text-xs text-muted-foreground truncate">
                      {e.tipo === 'ENTREGA' ? 'Entregue a' : 'Devolvida por'} {e.colaborador_nome} · {formatarData(e.data)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Seccao>

        <Seccao titulo="Últimas manutenções" icone={<Wrench className="w-4 h-4 text-primary" aria-hidden="true" />}
          acao={<Link to="/frota/manutencao" className="text-sm text-primary font-medium">Ver todas</Link>}>
          {manutencoes.length === 0 ? <Vazio>Ainda sem manutenções.</Vazio> : (
            <ul className="divide-y divide-border">
              {manutencoes.map(m => (
                <li key={m.id} className={linha}>
                  <Wrench className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                  <span className="flex-1 min-w-0 text-sm">
                    <strong>{m.identificacao ?? m.veiculo_nome}</strong>
                    <span className="block text-xs text-muted-foreground truncate">
                      {m.item_rotulo ?? m.descricao} · {formatarData(m.data)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Seccao>
      </div>
    </div>
  )
}
