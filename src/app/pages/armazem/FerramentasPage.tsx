import { useMemo, useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router'
import { toast } from 'sonner'
import {
  Plus, Search, Wrench, ArrowUpRight, Undo2, AlertTriangle, CheckCircle2, Clock, Hammer,
  Archive, History, FileText, RotateCcw,
} from 'lucide-react'
import { SkeletonList } from '@/app/components/Skeletons'
import { EmptyState } from '@/app/components/EmptyState'
import { ConfirmDialog } from '@/app/components/ConfirmDialog'
import { FiltroChips } from '@/app/components/FiltroChips'
import { Button } from '@/app/components/ui/button'
import { ToolLoanTermPrint } from '@/app/components/ToolLoanTermPrint'
import { useRole } from '@/features/auth/useRole'
import { useConfiguracoes } from '@/features/configuracoes/hooks/useConfiguracoes'
import {
  useFerramentas, useFerramentasArquivadas, useRestaurarFerramenta,
} from '@/features/ferramentas/hooks/useFerramentas'
import { useEmprestimos, useEmprestimosPaginados } from '@/features/ferramentas/hooks/useEmprestimos'
import type { Ferramenta } from '@/features/ferramentas/services/ferramentasService'
import type { Emprestimo } from '@/features/ferramentas/services/emprestimosService'
import {
  emAtraso, estadoGarantia, fmtData, fmtPrevista,
} from '@/features/ferramentas/lib/estadoFerramenta'
import { EstadoFerramenta, FotoFerramenta, SeloGarantia } from '@/features/ferramentas/components/ui'
import type { ToolStatus } from '@/app/types'

type Vista = 'ferramentas' | 'emprestimos' | 'arquivadas'
type Filtro = 'todas' | ToolStatus | 'atraso' | 'garantia'

const ATIVOS = { estado: 'ativo' as const }

export function FerramentasPage() {
  const location = useLocation()
  const { podeFerramentas } = useRole()
  const [vista, setVista] = useState<Vista>('ferramentas')
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [pesquisa, setPesquisa] = useState('')
  const [termLoan, setTermLoan] = useState<Emprestimo | null>(
    (location.state as { termLoan?: Emprestimo } | null)?.termLoan ?? null,
  )

  const { tools, loading, error, reload } = useFerramentas()
  const { loans: ativos } = useEmprestimos(ATIVOS)
  const { config } = useConfiguracoes()

  // Limpa o state da navegação para o termo não reabrir num "voltar" do browser
  useEffect(() => {
    if (location.state) window.history.replaceState({}, '')
  }, [location.state])

  const loanPorFerramenta = useMemo(() => new Map(ativos.map(l => [l.toolId, l])), [ativos])

  const contagem = useMemo(() => ({
    disponivel: tools.filter(t => t.status === 'disponivel').length,
    emprestada: tools.filter(t => t.status === 'emprestada').length,
    atraso: ativos.filter(l => emAtraso(l)).length,
    manutencao: tools.filter(t => t.status === 'manutencao').length,
    garantia: tools.filter(t => estadoGarantia(t.garantiaAte).tipo === 'a_terminar').length,
  }), [tools, ativos])

  const visiveis = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    return tools.filter(t => {
      if (q && ![t.name, t.code, t.serialNumber, t.marca, t.modelo].some(v => v?.toLowerCase().includes(q))) return false
      if (filtro === 'todas') return true
      if (filtro === 'atraso') { const l = loanPorFerramenta.get(t.id); return !!l && emAtraso(l) }
      if (filtro === 'garantia') return estadoGarantia(t.garantiaAte).tipo === 'a_terminar'
      return t.status === filtro
    })
  }, [tools, pesquisa, filtro, loanPorFerramenta])

  const cartoes: { f: Filtro; rotulo: string; valor: number; Icone: typeof Wrench; cor: string }[] = [
    { f: 'disponivel', rotulo: 'Disponíveis', valor: contagem.disponivel, Icone: CheckCircle2, cor: 'text-success' },
    { f: 'emprestada', rotulo: 'Emprestadas', valor: contagem.emprestada, Icone: Clock, cor: 'text-warning' },
    { f: 'atraso', rotulo: 'Em atraso', valor: contagem.atraso, Icone: AlertTriangle, cor: 'text-destructive' },
    { f: 'manutencao', rotulo: 'Manutenção', valor: contagem.manutencao, Icone: Hammer, cor: 'text-muted-foreground' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <FiltroChips ariaLabel="Vista das ferramentas" valor={vista} onChange={setVista}
          opcoes={[
            { valor: 'ferramentas', rotulo: 'Ferramentas' },
            { valor: 'emprestimos', rotulo: 'Empréstimos' },
            ...(podeFerramentas ? [{ valor: 'arquivadas' as const, rotulo: 'Arquivadas' }] : []),
          ]} />
        <div className="flex-1" />
        {podeFerramentas && (
          <Button asChild>
            <Link to="/armazem/ferramenta/nova"><Plus aria-hidden="true" /> Nova ferramenta</Link>
          </Button>
        )}
      </div>

      {vista === 'ferramentas' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {cartoes.map(c => (
              <button key={c.f} onClick={() => setFiltro(filtro === c.f ? 'todas' : c.f)} aria-pressed={filtro === c.f}
                data-testid={`contador-${c.f}`}
                className={`text-left bg-card border rounded-2xl p-3.5 transition-all hover:border-primary/40 ${
                  filtro === c.f ? 'border-primary ring-2 ring-primary/20' : 'border-border'}`}>
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <c.Icone className={`w-4 h-4 ${c.cor}`} aria-hidden="true" /> {c.rotulo}
                </div>
                <p className={`text-2xl font-bold mt-1 tabular-nums ${c.f === 'atraso' && c.valor > 0 ? 'text-destructive' : ''}`}>{c.valor}</p>
              </button>
            ))}
          </div>

          <div className="space-y-2.5">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <input type="search" value={pesquisa} onChange={e => setPesquisa(e.target.value)}
                placeholder="Pesquisar por nome, código ou n.º de série…" aria-label="Pesquisar ferramentas"
                className="w-full pl-10 pr-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
            </div>
            <FiltroChips ariaLabel="Filtrar por estado" valor={filtro} onChange={setFiltro}
              opcoes={[
                { valor: 'todas', rotulo: 'Todas', contagem: tools.length },
                { valor: 'disponivel', rotulo: 'Disponíveis', contagem: contagem.disponivel },
                { valor: 'emprestada', rotulo: 'Emprestadas', contagem: contagem.emprestada },
                { valor: 'atraso', rotulo: 'Em atraso', contagem: contagem.atraso },
                { valor: 'manutencao', rotulo: 'Manutenção', contagem: contagem.manutencao },
                { valor: 'inativa', rotulo: 'Inativas', contagem: tools.filter(t => t.status === 'inativa').length },
                { valor: 'garantia', rotulo: 'Garantia a terminar', contagem: contagem.garantia },
              ]} />
          </div>

          {loading ? (
            <SkeletonList rows={6} cols={3} />
          ) : error ? (
            <div className="p-6 text-center bg-card border border-border rounded-2xl">
              <p className="text-sm text-destructive font-medium mb-2">{error}</p>
              <button onClick={reload} className="text-sm text-primary font-semibold hover:underline">Tentar novamente</button>
            </div>
          ) : visiveis.length === 0 ? (
            <EmptyState icon={Wrench} title="Nenhuma ferramenta encontrada"
              description={pesquisa || filtro !== 'todas' ? 'Tente alterar a pesquisa ou o filtro.' : 'Adicione a primeira ferramenta.'} />
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {visiveis.map(t => (
                <CartaoFerramenta key={t.id} t={t} loan={loanPorFerramenta.get(t.id)} podeOperar={podeFerramentas} />
              ))}
            </ul>
          )}
        </>
      )}

      {vista === 'emprestimos' && <HistoricoEmprestimos podeOperar={podeFerramentas} onTermo={setTermLoan} />}
      {vista === 'arquivadas' && podeFerramentas && <Arquivadas onRestaurada={reload} />}

      {termLoan && (
        <ToolLoanTermPrint loan={termLoan} tool={tools.find(t => t.id === termLoan.toolId) ?? null}
          config={config} onClose={() => setTermLoan(null)} />
      )}
    </div>
  )
}

function CartaoFerramenta({ t, loan, podeOperar }: { t: Ferramenta; loan?: Emprestimo; podeOperar: boolean }) {
  const atraso = loan ? emAtraso(loan) : false
  const marcaModelo = [t.marca, t.modelo].filter(Boolean).join(' ')

  return (
    <li data-testid={`ferramenta-${t.id}`}
      className={`bg-card border rounded-2xl overflow-hidden flex flex-col ${atraso ? 'border-destructive/50' : 'border-border'}`}>
      <Link to={`/armazem/ferramenta/${t.id}`} className="flex gap-3 p-3 hover:bg-accent/40 transition-colors">
        <FotoFerramenta caminho={t.fotoPath} alt={t.name} className="w-20 h-20 rounded-xl shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="font-semibold text-sm leading-snug flex-1 min-w-0 line-clamp-2">{t.name}</p>
            <ArrowUpRight className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">{t.code}</p>
          {marcaModelo && <p className="text-xs text-muted-foreground truncate">{marcaModelo}</p>}
          {t.serialNumber && <p className="text-xs text-muted-foreground truncate">N.º série {t.serialNumber}</p>}
        </div>
      </Link>

      <div className="px-3 pb-3 space-y-2 flex-1 flex flex-col">
        <div className="flex items-center gap-1.5 flex-wrap">
          <EstadoFerramenta estado={t.status} />
          <SeloGarantia garantiaAte={t.garantiaAte} compacto />
        </div>

        {t.status === 'emprestada' && loan && (
          <div className={`rounded-xl px-3 py-2 text-xs ${atraso ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-foreground'}`}>
            <p>
              com <strong>{loan.employeeName}</strong>
              {loan.destination && <> · {loan.destination}</>} · desde {fmtData(loan.loanDate)}
            </p>
            {atraso && (
              <p className="font-semibold mt-0.5 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" /> Em atraso — devolução prevista {fmtPrevista(loan.expectedReturnDate)}
              </p>
            )}
          </div>
        )}

        {podeOperar && (t.status === 'disponivel' || (t.status === 'emprestada' && loan)) && (
          <div className="mt-auto pt-1">
            {t.status === 'disponivel' ? (
              <Button variant="outline" asChild className="w-full">
                <Link to={`/armazem/ferramenta/emprestimo?ferramenta=${t.id}`}>
                  <Wrench aria-hidden="true" /> Emprestar
                </Link>
              </Button>
            ) : (
              <Button asChild className="w-full bg-success text-success-foreground hover:bg-success/90">
                <Link to={`/armazem/ferramenta/${t.id}/devolucao`}>
                  <Undo2 aria-hidden="true" /> Devolver
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

function HistoricoEmprestimos({ podeOperar, onTermo }: { podeOperar: boolean; onTermo: (l: Emprestimo) => void }) {
  const [estado, setEstado] = useState<'todos' | 'ativo' | 'devolvido'>('ativo')
  const [funcionario, setFuncionario] = useState('')
  const filtros = useMemo(() => ({
    ...(estado === 'todos' ? {} : { estado }),
    ...(funcionario.trim() ? { funcionario: funcionario.trim() } : {}),
  }), [estado, funcionario])
  const { loans, count, page, totalPages, loading, setPage } = useEmprestimosPaginados(filtros)

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <input type="search" value={funcionario} onChange={e => setFuncionario(e.target.value)} placeholder="Pesquisar por funcionário…"
            aria-label="Pesquisar por funcionário"
            className="w-full pl-10 pr-4 py-2.5 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
        </div>
        <FiltroChips ariaLabel="Estado do empréstimo" valor={estado} onChange={setEstado}
          opcoes={[{ valor: 'ativo', rotulo: 'Em curso' }, { valor: 'devolvido', rotulo: 'Devolvidos' }, { valor: 'todos', rotulo: 'Todos' }]} />
      </div>

      {loading ? <SkeletonList rows={5} cols={3} /> : loans.length === 0 ? (
        <EmptyState icon={History} title="Nenhum empréstimo encontrado" description="Tente alterar os filtros." />
      ) : (
        <ul className="bg-card border border-border rounded-2xl divide-y divide-border">
          {loans.map(l => {
            const atraso = emAtraso(l)
            return (
              <li key={l.id} className="p-3.5 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <Link to={`/armazem/ferramenta/${l.toolId}`} className="text-sm font-semibold hover:underline">
                    {l.toolName} <span className="font-mono font-normal text-muted-foreground">{l.toolCode}</span>
                  </Link>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {l.employeeName}{l.destination && <> · {l.destination}</>} · {fmtData(l.loanDate)}
                    {l.returnDate ? <> → {fmtData(l.returnDate)}</> : l.expectedReturnDate && <> · prevista {fmtPrevista(l.expectedReturnDate)}</>}
                  </p>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  l.status === 'devolvido' ? 'bg-success/10 text-success' : atraso ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}`}>
                  {l.status === 'devolvido' ? 'Devolvido' : atraso ? 'Em atraso' : 'Em curso'}
                </span>
                {podeOperar && l.status === 'ativo' && (
                  <Link to={`/armazem/ferramenta/${l.toolId}/devolucao`} className="inline-flex items-center gap-1 text-xs font-semibold text-success hover:underline">
                    <Undo2 className="w-3.5 h-3.5" aria-hidden="true" /> Devolver
                  </Link>
                )}
                <button onClick={() => onTermo(l)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                  <FileText className="w-3.5 h-3.5" aria-hidden="true" /> Termo
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{count} empréstimos</span>
          <div className="flex gap-2">
            <button disabled={page === 0} onClick={() => setPage(page - 1)} className="px-3 py-1.5 border border-border rounded-lg disabled:opacity-40">Anterior</button>
            <span className="px-2 py-1.5 tabular-nums">{page + 1}/{totalPages}</span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="px-3 py-1.5 border border-border rounded-lg disabled:opacity-40">Seguinte</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Arquivadas({ onRestaurada }: { onRestaurada: () => void }) {
  const { tools, loading, error, reload } = useFerramentasArquivadas()
  const { restaurar, loading: aRestaurar } = useRestaurarFerramenta()
  const [restaurarId, setRestaurarId] = useState<string | null>(null)
  const alvo = tools.find(t => t.id === restaurarId)

  const confirmar = async () => {
    if (!restaurarId) return
    if (await restaurar(restaurarId)) {
      toast.success(`"${alvo?.name}" restaurada.`)
      setRestaurarId(null)
      reload()
      onRestaurada()
    } else {
      toast.error('Erro ao restaurar ferramenta.')
    }
  }

  if (loading) return <SkeletonList rows={4} cols={3} />
  if (error) return (
    <div className="p-6 text-center bg-card border border-border rounded-2xl">
      <p className="text-sm text-destructive font-medium mb-2">Erro ao carregar ferramentas arquivadas.</p>
      <button onClick={reload} className="text-sm text-primary font-semibold hover:underline">Tentar novamente</button>
    </div>
  )
  if (tools.length === 0) return <EmptyState icon={Archive} title="Nenhuma ferramenta arquivada" description="As ferramentas arquivadas aparecem aqui." />

  return (
    <>
      <ul className="bg-card border border-border rounded-2xl divide-y divide-border">
        {tools.map(t => (
          <li key={t.id} className="p-3 flex items-center gap-3">
            <FotoFerramenta caminho={t.fotoPath} alt={t.name} className="w-12 h-12 rounded-lg shrink-0 opacity-70" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate text-muted-foreground">{t.name}</p>
              <p className="text-xs text-muted-foreground font-mono">{t.code}{t.serialNumber && <> · {t.serialNumber}</>}</p>
            </div>
            <button onClick={() => setRestaurarId(t.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary bg-primary/10 rounded-lg hover:bg-primary/20">
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Restaurar
            </button>
          </li>
        ))}
      </ul>
      {restaurarId && (
        <ConfirmDialog title={`Restaurar "${alvo?.name}"?`} description="A ferramenta volta a aparecer na lista."
          confirmLabel="Restaurar" variant="warning" loading={aRestaurar}
          onConfirm={confirmar} onCancel={() => setRestaurarId(null)} />
      )}
    </>
  )
}
