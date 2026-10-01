import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ChevronLeft, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { FotoInput } from '@/app/components/FotoInput'
import { SignaturePad } from '@/app/components/SignaturePad'
import { useRole } from '@/features/auth/useRole'
import { useFerramenta } from '@/features/ferramentas/hooks/useFerramentas'
import { useEmprestimos, useRegistarDevolucao } from '@/features/ferramentas/hooks/useEmprestimos'
import { emAtraso, fmtData, fmtPrevista } from '@/features/ferramentas/lib/estadoFerramenta'
import {
  Campo, Carregando, FotoProva, inputCls, useExigePermissaoFerramentas,
} from '@/features/ferramentas/components/ui'
import type { ReturnCondition } from '@/app/types'

const CONDICOES: [ReturnCondition, string][] = [
  ['bom_estado', 'Bom estado'],
  ['danificada', 'Danificada'],
  ['perdida', 'Perdida / extraviada'],
]

export function DevolucaoPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const permitido = useExigePermissaoFerramentas()
  const { nome } = useRole()

  const { tool, loading: aCarregarTool } = useFerramenta(id)
  const filtros = useMemo(() => ({ ferramentaId: id, estado: 'ativo' as const }), [id])
  const { loans, loading: aCarregarLoans } = useEmprestimos(filtros)
  const { devolver, loading: aDevolver, error: erroServidor } = useRegistarDevolucao()
  const loan = loans[0]

  const [condicao, setCondicao] = useState<ReturnCondition>('bom_estado')
  const [recebido, setRecebido] = useState(nome)
  const [observacoes, setObservacoes] = useState('')
  const [foto, setFoto] = useState<string | null>(null)
  const [assFuncionario, setAssFuncionario] = useState<string | null>(null)
  const [assResponsavel, setAssResponsavel] = useState<string | null>(null)

  useEffect(() => {
    if (nome) setRecebido(p => p || nome)
  }, [nome])

  if (!permitido || aCarregarTool || aCarregarLoans) return <Carregando />
  if (!tool || !loan) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold">Não há empréstimo ativo para devolver</h2>
        <button onClick={() => navigate('/armazem/ferramentas')} className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl">Voltar</button>
      </div>
    )
  }

  const perdida = condicao === 'perdida'
  const precisaFoto = !perdida
  const pronto = (!precisaFoto || !!foto) && !!assFuncionario && !!assResponsavel && !!recebido.trim()
  const atraso = emAtraso(loan)

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault()
    if (precisaFoto && !foto) { toast.error('Tire a foto do estado em que a ferramenta voltou.'); return }
    if (!assFuncionario) { toast.error('A assinatura do funcionário é obrigatória.'); return }
    if (!assResponsavel) { toast.error('A assinatura de quem recebe é obrigatória.'); return }
    const r = await devolver({
      loanId: loan.id,
      returnCondition: condicao,
      receivedBy: recebido.trim(),
      signature: assFuncionario,
      responsibleSignature: assResponsavel,
      returnNotes: observacoes.trim() || undefined,
      fotoDevolucaoPath: perdida ? null : foto,
    })
    if (r) {
      toast.success('Devolução registada.')
      navigate(`/armazem/ferramenta/${tool.id}`, { replace: true, state: { termLoan: r } })
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-28">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="Voltar" className="p-2 hover:bg-accent rounded-lg shrink-0">
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">Registar devolução</h2>
          <p className="text-sm text-muted-foreground truncate">{tool.code} · {tool.name}</p>
        </div>
      </div>

      <section className="bg-warning/10 border border-warning/30 rounded-2xl p-4 flex gap-4 flex-wrap" aria-label="Empréstimo em curso">
        <div className="flex-1 min-w-52 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Emprestada a</p>
          <p className="text-base font-semibold">{loan.employeeName}</p>
          <p className="text-sm text-muted-foreground">
            {loan.destination ? <>{loan.destination} · </> : null}desde {fmtData(loan.loanDate)}
            {loan.expectedReturnDate && <> · prevista {fmtPrevista(loan.expectedReturnDate)}</>}
          </p>
          {loan.deliveryCondition && <p className="text-xs text-muted-foreground">Entregue: {loan.deliveryCondition}</p>}
          {atraso && (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
              <AlertTriangle className="w-4 h-4" aria-hidden="true" /> Em atraso
            </p>
          )}
        </div>
        <div className="w-40 shrink-0"><FotoProva caminho={loan.fotoEntregaPath} rotulo="Foto da entrega" /></div>
      </section>

      <form onSubmit={submeter} className="space-y-4" noValidate>
        <section className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <Campo rotulo="Estado na devolução" htmlFor="dev-cond"
            ajuda={condicao === 'danificada'
              ? <p className="text-xs text-warning mt-1.5">A ferramenta passa para "Manutenção".</p>
              : perdida ? <p className="text-xs text-destructive mt-1.5">A ferramenta será marcada como "Inativa". Não é preciso foto.</p> : null}>
            <select id="dev-cond" className={inputCls} value={condicao} onChange={e => setCondicao(e.target.value as ReturnCondition)}>
              {CONDICOES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Campo>

          {precisaFoto && (
            <FotoInput soCamera obrigatoria rotulo="Foto do estado na devolução"
              dono={{ tipo: 'ferramentas', id: tool.id, prefixo: 'devolucao_' }} valor={foto} onChange={setFoto} />
          )}

          <Campo rotulo="Recebido por" htmlFor="dev-rec">
            <input id="dev-rec" className={inputCls} value={recebido} onChange={e => setRecebido(e.target.value)} required />
          </Campo>
          <Campo rotulo="Observações" opcional htmlFor="dev-obs">
            <textarea id="dev-obs" rows={3} className={`${inputCls} resize-none`} value={observacoes} onChange={e => setObservacoes(e.target.value)}
              placeholder="Detalhes sobre o estado, danos, etc." />
          </Campo>
        </section>

        <section className="bg-card rounded-2xl border border-border p-4 space-y-4" aria-label="Assinaturas">
          <SignaturePad label="Assinatura do funcionário (confirma a devolução)" value={assFuncionario} onChange={setAssFuncionario} />
          <SignaturePad label="Assinatura de quem recebe" value={assResponsavel} onChange={setAssResponsavel} />
        </section>

        {erroServidor && <p role="alert" className="text-sm text-destructive font-medium">{erroServidor}</p>}

        <div className="sticky bottom-20 md:bottom-0 py-3 bg-background/80 backdrop-blur-sm">
          <div className="flex gap-3">
            <button type="submit" disabled={aDevolver || !pronto}
              className="flex-1 py-3.5 bg-success text-success-foreground rounded-xl font-bold active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md">
              {aDevolver ? 'A registar…' : 'Confirmar devolução'}
            </button>
            <button type="button" onClick={() => navigate(-1)} disabled={aDevolver}
              className="px-5 py-3.5 bg-secondary text-secondary-foreground rounded-xl font-medium">Cancelar</button>
          </div>
          {precisaFoto && !foto && <p className="text-xs text-muted-foreground mt-1.5 text-center">Falta a foto do estado da ferramenta.</p>}
        </div>
      </form>
    </div>
  )
}
