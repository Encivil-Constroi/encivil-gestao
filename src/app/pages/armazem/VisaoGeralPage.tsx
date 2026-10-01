import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, ArrowDownCircle, Package, ShieldAlert, Wrench, Euro } from 'lucide-react'
import { getUnitLabel } from '@/app/data/mockData'
import { fmtData, fmtEuro, fmtNumber } from '@/app/lib/format'
import { useRole } from '@/features/auth/useRole'
import {
  useArtigosArmazem, useEmprestimosAtivos, useGarantiasFerramentas, useMateriaisPorObra, useMovimentosArmazem,
} from '@/features/movimentos/hooks/useArmazem'
import {
  diasAte, diasEmAtraso, obrasComMaisMaterial, resumirArmazem, rotuloMovimento,
} from '@/features/movimentos/armazemRegras'
import { visualMovimento } from '@/features/movimentos/components/movimentoVisual'
import { MiniFoto } from '@/features/movimentos/components/MiniFoto'

const SEM_FILTROS = {}
const MAX = 5

function Kpi({ rotulo, valor, Icone, tom = 'normal', nota }: {
  rotulo: string; valor: string; Icone: typeof Package; tom?: 'normal' | 'alerta' | 'perigo'; nota?: string
}) {
  const cor = tom === 'perigo' ? 'text-destructive' : tom === 'alerta' ? 'text-warning' : 'text-foreground'
  return (
    <div className="bg-card rounded-2xl border border-border p-4" data-testid={`kpi-${rotulo}`}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icone className="w-4 h-4" aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-wide">{rotulo}</span>
      </div>
      <p className={`text-2xl font-bold tabular-nums mt-1.5 ${cor}`} data-testid="kpi-valor">{valor}</p>
      {nota && <p className="text-xs text-muted-foreground mt-0.5">{nota}</p>}
    </div>
  )
}

function Cartao({ titulo, para, vazio, children }: { titulo: string; para?: string; vazio: string; children: ReactNode[] | null }) {
  const vazioAgora = !children || children.length === 0
  return (
    <section className="bg-card rounded-2xl border border-border p-4" aria-label={titulo}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">{titulo}</h3>
        {para && <Link to={para} className="text-xs font-semibold text-primary hover:underline">Ver todos</Link>}
      </div>
      {vazioAgora ? <p className="text-sm text-muted-foreground py-2">{vazio}</p> : <ul className="divide-y divide-border">{children}</ul>}
    </section>
  )
}

export function VisaoGeralPage() {
  const { podeArmazem } = useRole()
  const { artigos } = useArtigosArmazem()
  const { emprestimos } = useEmprestimosAtivos()
  const { garantias } = useGarantiasFerramentas()
  const { materiais } = useMateriaisPorObra()
  const { movimentos } = useMovimentosArmazem(SEM_FILTROS, 0, 8)

  const r = useMemo(() => resumirArmazem(artigos, emprestimos, garantias), [artigos, emprestimos, garantias])
  const topObras = useMemo(() => obrasComMaisMaterial(materiais), [materiais])
  const garantiasAviso = [...r.garantiasExpiradas, ...r.garantiasATerminar].sort((a, b) => a.garantiaAte.localeCompare(b.garantiaAte))

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi rotulo="Artigos" valor={fmtNumber(r.artigos)} Icone={Package} />
        <Kpi rotulo="Valor em stock" valor={fmtEuro(r.valorStock)} Icone={Euro} />
        <Kpi rotulo="Stock baixo" valor={fmtNumber(r.stockBaixo.length)} Icone={AlertTriangle}
          tom={r.semStock > 0 ? 'perigo' : r.stockBaixo.length > 0 ? 'alerta' : 'normal'}
          nota={r.semStock > 0 ? `${r.semStock} sem stock` : undefined} />
        <Kpi rotulo="Ferramentas emprestadas" valor={fmtNumber(r.emprestadas)} Icone={Wrench}
          tom={r.emAtraso.length > 0 ? 'alerta' : 'normal'}
          nota={r.emAtraso.length > 0 ? `${r.emAtraso.length} em atraso` : undefined} />
      </div>

      {(r.garantiasATerminar.length > 0 || r.garantiasExpiradas.length > 0) && (
        <p className="text-sm flex items-center gap-2 bg-warning/10 border border-warning/30 rounded-xl px-3 py-2" data-testid="aviso-garantias">
          <ShieldAlert className="w-4 h-4 text-warning shrink-0" aria-hidden="true" />
          {r.garantiasATerminar.length > 0 && <span>{r.garantiasATerminar.length} garantia{r.garantiasATerminar.length !== 1 ? 's' : ''} a terminar em 30 dias</span>}
          {r.garantiasATerminar.length > 0 && r.garantiasExpiradas.length > 0 && <span aria-hidden="true">·</span>}
          {r.garantiasExpiradas.length > 0 && <span>{r.garantiasExpiradas.length} expirada{r.garantiasExpiradas.length !== 1 ? 's' : ''}</span>}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Stock baixo" para="/armazem/inventario" vazio="Nenhum artigo com stock baixo.">
          {r.stockBaixo.slice(0, MAX).map(a => (
            <li key={a.id} className="flex items-center gap-3 py-2" data-testid="item-stock-baixo">
              <MiniFoto caminho={a.fotoPath} alt="" tamanho="sm" />
              <div className="flex-1 min-w-0">
                <Link to={`/armazem/produto/${a.id}`} className="text-sm font-medium hover:underline block truncate">{a.nome}</Link>
                <p className={`text-xs ${a.stockAtual <= 0 ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                  {a.stockAtual <= 0 ? 'Sem stock' : `${fmtNumber(a.stockAtual)} ${getUnitLabel(a.unidade)}`} · mínimo {fmtNumber(a.stockMinimo)}
                </p>
              </div>
              {podeArmazem && (
                <Link to={`/armazem/movimento/entrada?produto=${a.id}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-success/10 text-success hover:bg-success/20">
                  <ArrowDownCircle className="w-3.5 h-3.5" aria-hidden="true" />Entrada
                </Link>
              )}
            </li>
          ))}
        </Cartao>

        <Cartao titulo="Ferramentas em atraso" para="/armazem/ferramentas" vazio="Nenhuma ferramenta em atraso.">
          {r.emAtraso.slice(0, MAX).map(e => (
            <li key={e.id} className="flex items-center gap-3 py-2" data-testid="item-atraso">
              <MiniFoto caminho={e.fotoPath} alt="" tamanho="sm" Icone={Wrench} />
              <div className="flex-1 min-w-0">
                <Link to={`/armazem/ferramenta/${e.ferramentaId}`} className="text-sm font-medium hover:underline block truncate">{e.ferramentaNome}</Link>
                <p className="text-xs text-muted-foreground truncate">{e.funcionario}</p>
              </div>
              <span className="text-xs font-semibold text-destructive shrink-0">{diasEmAtraso(e.previstaDevolucao)} d em atraso</span>
            </li>
          ))}
        </Cartao>

        <Cartao titulo="Garantias a terminar" para="/armazem/ferramentas" vazio="Nenhuma garantia a terminar.">
          {garantiasAviso.slice(0, MAX).map(g => {
            const dias = diasAte(g.garantiaAte)
            return (
              <li key={g.id} className="flex items-center gap-3 py-2" data-testid="item-garantia">
                <MiniFoto caminho={g.fotoPath} alt="" tamanho="sm" Icone={Wrench} />
                <div className="flex-1 min-w-0">
                  <Link to={`/armazem/ferramenta/${g.id}`} className="text-sm font-medium hover:underline block truncate">{g.nome}</Link>
                  <p className="text-xs text-muted-foreground">até {fmtData(g.garantiaAte)}</p>
                </div>
                <span className={`text-xs font-semibold shrink-0 ${dias < 0 ? 'text-destructive' : 'text-warning'}`}>
                  {dias < 0 ? 'Expirada' : dias === 0 ? 'Termina hoje' : `${dias} ${dias === 1 ? 'dia' : 'dias'}`}
                </span>
              </li>
            )
          })}
        </Cartao>

        <Cartao titulo="Obras com mais material" para="/armazem/obras" vazio="Ainda não há material enviado para obras.">
          {topObras.map(o => (
            <li key={o.obraId} className="flex items-center gap-3 py-2" data-testid="item-obra-top">
              <div className="flex-1 min-w-0">
                <Link to={`/obras/${o.obraId}`} className="text-sm font-medium hover:underline block truncate">{o.obraNome}</Link>
                <p className="text-xs text-muted-foreground">{o.artigos} artigo{o.artigos !== 1 ? 's' : ''}</p>
              </div>
              <span className="text-sm font-bold tabular-nums shrink-0">{fmtEuro(o.valor)}</span>
            </li>
          ))}
        </Cartao>
      </div>

      <Cartao titulo="Últimos movimentos" para="/armazem/movimentos" vazio="Ainda não há movimentos.">
        {movimentos.map(m => {
          const v = visualMovimento(m.tipo, m.subtipo)
          const sinal = m.tipo === 'entrada' ? '+' : m.tipo === 'saida' ? '−' : ''
          return (
            <li key={m.id} className="flex items-center gap-3 py-2" data-testid="item-movimento">
              <span className={`p-1.5 rounded-lg ${v.fundo} ${v.cor}`}><v.Icone className="w-4 h-4" aria-hidden="true" /></span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{m.produtoNome}</p>
                <p className="text-xs text-muted-foreground truncate">{rotuloMovimento(m.tipo, m.subtipo)} · {fmtData(m.data)}{m.obraNome ? ` · ${m.obraNome}` : ''}</p>
              </div>
              <span className={`text-sm font-bold tabular-nums ${v.cor}`}>{sinal}{fmtNumber(m.quantidade)} {getUnitLabel(m.unidade)}</span>
            </li>
          )
        })}
      </Cartao>
    </div>
  )
}
