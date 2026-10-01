import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Building2, ExternalLink, Wrench } from 'lucide-react'
import { getUnitLabel } from '@/app/data/mockData'
import { fmtData, fmtEuro, fmtNumber } from '@/app/lib/format'
import { EmptyState } from '@/app/components/EmptyState'
import { SkeletonCard } from '@/app/components/Skeletons'
import { useRole } from '@/features/auth/useRole'
import { useObras } from '@/features/obras/hooks/useObras'
import { useEmprestimosAtivos, useMateriaisPorObra } from '@/features/movimentos/hooks/useArmazem'
import { agruparPorObra, diasEmAtraso, type ObraComArmazem } from '@/features/movimentos/armazemRegras'
import { MiniFoto } from '@/features/movimentos/components/MiniFoto'

const MAX_MATERIAIS = 6

function CartaoObra({ g, podeArmazem }: { g: ObraComArmazem; podeArmazem: boolean }) {
  const [todos, setTodos] = useState(false)
  const { obra } = g
  const visiveis = todos ? g.materiais : g.materiais.slice(0, MAX_MATERIAIS)
  const botao = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold active:scale-[0.98] transition-all'

  return (
    <article className="bg-card rounded-2xl border border-border overflow-hidden" data-testid="cartao-obra" aria-label={obra.name}>
      <header className="p-4 flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold truncate">{obra.name}</h3>
            {obra.status !== 'ativa' && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Concluída</span>}
          </div>
          {(obra.client || obra.location) && <p className="text-xs text-muted-foreground mt-0.5 truncate">{[obra.client, obra.location].filter(Boolean).join(' · ')}</p>}
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Material na obra</p>
          <p className="text-xl font-bold tabular-nums" data-testid="valor-obra">{fmtEuro(g.valorMateriais)}</p>
        </div>
      </header>

      <div className="px-4 pb-4 grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Materiais ({g.materiais.length})</h4>
          {g.materiais.length === 0 ? <p className="text-sm text-muted-foreground">Sem material enviado.</p> : (
            <ul className="space-y-2">
              {visiveis.map(m => (
                <li key={m.produtoId} className="flex items-center gap-2.5" data-testid="material-obra">
                  <MiniFoto caminho={m.fotoPath} alt="" tamanho="sm" />
                  <div className="flex-1 min-w-0">
                    <Link to={`/armazem/produto/${m.produtoId}`} className="text-sm font-medium hover:underline block truncate">{m.produtoNome}</Link>
                    <p className="text-xs text-muted-foreground">Enviado {fmtNumber(m.enviado)} · devolvido {fmtNumber(m.devolvido)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold tabular-nums">{fmtNumber(m.liquido)} {getUnitLabel(m.unidade)}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{fmtEuro(m.valor)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {g.materiais.length > MAX_MATERIAIS && (
            <button type="button" onClick={() => setTodos(t => !t)} className="mt-2 text-xs font-semibold text-primary hover:underline">
              {todos ? 'Ver menos' : `Ver todos (${g.materiais.length})`}
            </button>
          )}
        </div>

        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Ferramentas emprestadas ({g.ferramentas.length})</h4>
          {g.ferramentas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma ferramenta nesta obra.</p> : (
            <ul className="space-y-2">
              {g.ferramentas.map(e => {
                const atraso = diasEmAtraso(e.previstaDevolucao)
                return (
                  <li key={e.id} className="flex items-center gap-2.5" data-testid="ferramenta-obra">
                    <MiniFoto caminho={e.fotoPath} alt="" tamanho="sm" Icone={Wrench} />
                    <div className="flex-1 min-w-0">
                      <Link to={`/armazem/ferramenta/${e.ferramentaId}`} className="text-sm font-medium hover:underline block truncate">{e.ferramentaNome}</Link>
                      <p className="text-xs text-muted-foreground truncate">{e.funcionario} · desde {fmtData(e.desde)}</p>
                    </div>
                    {atraso > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive shrink-0">
                        <AlertTriangle className="w-3 h-3" aria-hidden="true" />{atraso} {atraso === 1 ? 'dia' : 'dias'} em atraso
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      <footer className="px-4 py-3 border-t border-border bg-muted/30 flex flex-wrap gap-2">
        {podeArmazem && obra.status === 'ativa' && (
          <Link to={`/armazem/movimento/saida?obra=${obra.id}`} className={`${botao} bg-primary text-primary-foreground hover:bg-primary/90`}>
            <ArrowUpCircle className="w-4 h-4" aria-hidden="true" />Enviar material
          </Link>
        )}
        {podeArmazem && (
          <Link to={`/armazem/movimento/entrada?tipo=DEVOLUCAO_OBRA&obra=${obra.id}`} className={`${botao} bg-success text-success-foreground hover:bg-success/90`}>
            <ArrowDownCircle className="w-4 h-4" aria-hidden="true" />Receber devolução
          </Link>
        )}
        <Link to={`/obras/${obra.id}`} className={`${botao} border border-border hover:bg-accent ml-auto`}>
          Ficha da obra<ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </footer>
    </article>
  )
}

export function ObrasArmazemPage() {
  const { podeArmazem } = useRole()
  const [concluidas, setConcluidas] = useState(false)
  const { obras, loading: aCarregarObras } = useObras(true)
  const { materiais, loading: aCarregarMat, error: erroMat } = useMateriaisPorObra()
  const { emprestimos, loading: aCarregarEmp, error: erroEmp } = useEmprestimosAtivos()

  const grupos = useMemo(() => {
    const visiveis = obras.filter(o => concluidas || o.status === 'ativa')
    return agruparPorObra(visiveis, materiais, emprestimos)
  }, [obras, materiais, emprestimos, concluidas])

  const aCarregar = aCarregarObras || aCarregarMat || aCarregarEmp
  const erro = erroMat ?? erroEmp

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Wrench className="w-4 h-4" aria-hidden="true" />O que está em cada obra: material (enviado − devolvido) e ferramentas emprestadas.
        </p>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={concluidas} onChange={e => setConcluidas(e.target.checked)} className="w-4 h-4 accent-primary" />
          Mostrar obras concluídas
        </label>
      </div>

      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}

      {aCarregar && grupos.length === 0 ? <SkeletonCard lines={5} />
        : grupos.length === 0 ? (
          <EmptyState icon={Building2} title="Sem obras em execução" description="Quando houver obras em execução, vê aqui o material e as ferramentas de cada uma." />
        ) : (
          <div className="grid gap-4">{grupos.map(g => <CartaoObra key={g.obra.id} g={g} podeArmazem={podeArmazem} />)}</div>
        )}
    </div>
  )
}
