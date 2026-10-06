import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Pencil, Archive, Undo2, Wrench, FileText, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/app/components/ConfirmDialog'
import { ToolLoanTermPrint } from '@/app/components/ToolLoanTermPrint'
import { getToolCategoryLabel, getReturnConditionLabel } from '@/app/data/mockData'
import { useRole } from '@/features/auth/useRole'
import { useConfiguracoes } from '@/features/configuracoes/hooks/useConfiguracoes'
import { useFerramenta, useArquivarFerramenta } from '@/features/ferramentas/hooks/useFerramentas'
import { useEmprestimos } from '@/features/ferramentas/hooks/useEmprestimos'
import type { Emprestimo } from '@/features/ferramentas/services/emprestimosService'
import { emAtraso, fmtData, fmtDia, fmtPrevista } from '@/features/ferramentas/lib/estadoFerramenta'
import {
  Carregando, EstadoFerramenta, FotoFerramenta, FotoProva, SeloGarantia,
} from '@/features/ferramentas/components/ui'

export function FerramentaDetalhePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { podeFerramentas } = useRole()
  const { config } = useConfiguracoes()

  const { tool, loading } = useFerramenta(id)
  const filtros = useMemo(() => ({ ferramentaId: id, limit: 30 }), [id])
  const { loans, loading: aCarregarLoans, error: erroLoans, reload: recarregarLoans } = useEmprestimos(filtros)
  const { arquivar, loading: aArquivar } = useArquivarFerramenta()

  const [arquivarAberto, setArquivarAberto] = useState(false)
  const [termLoan, setTermLoan] = useState<Emprestimo | null>(
    (location.state as { termLoan?: Emprestimo } | null)?.termLoan ?? null,
  )

  // Limpa o state da navegação para o termo não reabrir num "voltar" do browser
  useEffect(() => {
    if (location.state) window.history.replaceState({}, '')
  }, [location.state])

  const ativo = loans.find(l => l.status === 'ativo')

  if (loading) return <Carregando />
  if (!tool) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold">Ferramenta não encontrada</h2>
        <button onClick={() => navigate('/armazem/ferramentas')} className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl">Voltar</button>
      </div>
    )
  }

  const confirmarArquivo = async () => {
    if (await arquivar(tool.id)) {
      toast.success(`"${tool.name}" arquivada.`)
      navigate('/armazem/ferramentas')
    } else {
      toast.error('Não foi possível arquivar a ferramenta.')
    }
    setArquivarAberto(false)
  }

  const atraso = ativo ? emAtraso(ativo) : false
  const marcaModelo = [tool.marca, tool.modelo].filter(Boolean).join(' ')
  const botao = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold active:scale-[0.98] transition-all'
  const linhas: [string, React.ReactNode][] = [
    ['Categoria', getToolCategoryLabel(tool.category)],
    ['Marca / modelo', marcaModelo || '—'],
    ['N.º de série', tool.serialNumber || '—'],
    ['Valor estimado', tool.estimatedValue != null ? `${tool.estimatedValue.toFixed(2)} €` : '—'],
    ['Data de compra', tool.nova ? fmtDia(tool.dataCompra) : 'Usada'],
    ['Garantia', tool.garantiaAte ? <SeloGarantia garantiaAte={tool.garantiaAte} /> : '—'],
  ]

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-28">
      <div className="flex items-center gap-2">
        <Link to="/armazem/ferramentas" aria-label="Voltar às ferramentas" className="p-2 hover:bg-accent rounded-lg shrink-0">
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </Link>
        <h2 className="text-xl font-semibold truncate flex-1">{tool.name}</h2>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden md:flex">
        <FotoFerramenta caminho={tool.fotoPath} alt={tool.name} className="w-full md:w-64 aspect-[4/3] md:aspect-square shrink-0" />
        <div className="p-4 md:p-5 flex-1 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <EstadoFerramenta estado={tool.status} grande />
            <span className="font-mono text-sm text-muted-foreground">{tool.code}</span>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
            {linhas.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{k}</dt>
                <dd className="text-sm font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          {tool.notes && <p className="text-sm text-muted-foreground leading-relaxed">{tool.notes}</p>}

          {podeFerramentas && (
            <div className="flex gap-2 flex-wrap pt-1">
              {tool.status === 'disponivel' && (
                <Link to={`/armazem/ferramenta/emprestimo?ferramenta=${tool.id}`} className={`${botao} bg-warning text-warning-foreground hover:bg-warning/90`}>
                  <Wrench className="w-4 h-4" aria-hidden="true" /> Emprestar
                </Link>
              )}
              {tool.status === 'emprestada' && ativo && (
                <Link to={`/armazem/ferramenta/${tool.id}/devolucao`} className={`${botao} bg-success text-success-foreground hover:bg-success/90`}>
                  <Undo2 className="w-4 h-4" aria-hidden="true" /> Devolver
                </Link>
              )}
              <Link to={`/armazem/ferramenta/${tool.id}/editar`} className={`${botao} border border-border hover:bg-accent`}>
                <Pencil className="w-4 h-4" aria-hidden="true" /> Editar
              </Link>
              <button onClick={() => setArquivarAberto(true)} disabled={tool.status === 'emprestada'}
                title={tool.status === 'emprestada' ? 'Registe a devolução antes de arquivar' : undefined}
                className={`${botao} border border-border text-warning hover:bg-warning/10 disabled:opacity-40 disabled:cursor-not-allowed`}>
                <Archive className="w-4 h-4" aria-hidden="true" /> Arquivar
              </button>
            </div>
          )}
        </div>
      </div>

      {tool.status === 'emprestada' && erroLoans && (
        <div className="flex items-center justify-between gap-3 py-3 px-4 bg-destructive/10 border border-destructive/30 rounded-xl text-sm">
          <span className="text-destructive font-medium">Erro ao carregar o empréstimo ativo.</span>
          <button onClick={recarregarLoans} className="text-primary font-semibold hover:underline">Tentar novamente</button>
        </div>
      )}

      {ativo && (
        <section aria-label="Empréstimo ativo" data-testid="emprestimo-ativo"
          className={`rounded-2xl border p-4 flex gap-4 flex-wrap ${atraso ? 'bg-destructive/5 border-destructive/40' : 'bg-warning/10 border-warning/30'}`}>
          <div className="flex-1 min-w-56 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Neste momento</p>
            <p className="text-base font-semibold">com {ativo.employeeName}</p>
            <p className="text-sm text-muted-foreground">
              {ativo.destination ? <>Obra: {ativo.destination} · </> : null}desde {fmtData(ativo.loanDate)}
              {ativo.expectedReturnDate && <> · prevista {fmtPrevista(ativo.expectedReturnDate)}</>}
            </p>
            {atraso && (
              <p className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
                <AlertTriangle className="w-4 h-4" aria-hidden="true" /> Em atraso
              </p>
            )}
            <button onClick={() => setTermLoan(ativo)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline pt-1">
              <FileText className="w-3.5 h-3.5" aria-hidden="true" /> Ver termo
            </button>
          </div>
          <div className="w-40 shrink-0"><FotoProva caminho={ativo.fotoEntregaPath} rotulo="Foto da entrega" /></div>
        </section>
      )}

      <section className="bg-card border border-border rounded-2xl overflow-hidden" aria-label="Histórico de empréstimos">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold">Histórico de empréstimos</h3>
          <p className="text-xs text-muted-foreground mt-0.5">A foto da entrega e da devolução provam o estado da ferramenta.</p>
        </div>
        {aCarregarLoans ? (
          <p className="p-8 text-center text-sm text-muted-foreground">A carregar…</p>
        ) : loans.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">Ainda não existem empréstimos desta ferramenta.</p>
        ) : (
          <ul className="divide-y divide-border">
            {loans.map(l => (
              <li key={l.id} className="p-4 space-y-3" data-testid={`historico-${l.id}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold">{l.employeeName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {fmtData(l.loanDate)}{l.returnDate ? <> → {fmtData(l.returnDate)}</> : ' · em curso'}
                      {l.destination && <> · {l.destination}</>}
                    </p>
                    {l.returnCondition && (
                      <p className={`text-xs font-medium mt-1 ${l.returnCondition === 'bom_estado' ? 'text-success' : 'text-destructive'}`}>
                        Devolvida: {getReturnConditionLabel(l.returnCondition)}
                      </p>
                    )}
                  </div>
                  <button onClick={() => setTermLoan(l)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                    <FileText className="w-3.5 h-3.5" aria-hidden="true" /> Termo
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 max-w-md">
                  <FotoProva caminho={l.fotoEntregaPath} rotulo="Entrega" />
                  {l.status === 'devolvido'
                    ? <FotoProva caminho={l.fotoDevolucaoPath} rotulo="Devolução" />
                    : <div className="rounded-xl border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground aspect-[4/3] self-end">Ainda não devolvida</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {termLoan && <ToolLoanTermPrint loan={termLoan} tool={tool} config={config} onClose={() => setTermLoan(null)} />}
      {arquivarAberto && (
        <ConfirmDialog title={`Arquivar "${tool.name}"?`}
          description="A ferramenta deixa de aparecer na lista ativa. Pode ser restaurada a qualquer momento."
          confirmLabel="Arquivar" variant="warning" loading={aArquivar}
          onConfirm={confirmarArquivo} onCancel={() => setArquivarAberto(false)} />
      )}
    </div>
  )
}
