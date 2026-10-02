import { Check, CircleAlert } from 'lucide-react'
import { fmtEuro } from '@/app/lib/format'
import type { WorkflowAuto } from '../../../db'
import type { PapelAprovacao } from '../../../lib/medicao'

export type PassoAuto = 'rascunho' | 'submetido' | 'verificado' | 'aprovado' | 'faturado' | 'pago'

export const PASSOS: { id: PassoAuto; rotulo: string }[] = [
  { id: 'rascunho', rotulo: 'Rascunho' },
  { id: 'submetido', rotulo: 'Submetido' },
  { id: 'verificado', rotulo: 'Verificado' },
  { id: 'aprovado', rotulo: 'Aprovado' },
  { id: 'faturado', rotulo: 'Faturado' },
  { id: 'pago', rotulo: 'Pago' },
]

export function passoAtual(workflow: WorkflowAuto, temFatura: boolean, pago: boolean): PassoAuto {
  if (workflow !== 'validado') return workflow
  if (pago) return 'pago'
  return temFatura ? 'faturado' : 'aprovado'
}

export type ContextoPassos = {
  workflow: WorkflowAuto
  temFatura: boolean
  pago: boolean
  exigirFatura: boolean
  role: string | null
  errosSubmissao: string[]
  verificacaoIniciada: boolean
  itensPendentes: number
  evidenciasValidas: number
  minFotos: number
  certificado: number
  alcada: PapelAprovacao
  alcadaLimite: number
  docsEmFalta: string | null
  bloqueiosPagamento: string[]
}

export type ProximoPasso = { acao: string | null; bloqueios: string[]; notas: string[] }

const MEDE = ['admin', 'gestor', 'medicoes']
const GERE = ['admin', 'gestor']

/** O que falta para o auto avançar, em texto para quem está na obra; o servidor confirma tudo. */
export function proximoPasso(c: ContextoPassos): ProximoPasso {
  const mede = c.role != null && MEDE.includes(c.role)
  const gere = c.role != null && GERE.includes(c.role)
  const admin = c.role === 'admin'

  if (c.workflow === 'rascunho') {
    const bloqueios = [...c.errosSubmissao]
    if (!mede) bloqueios.push('Só a equipa de medições, um gestor ou o administrador submete o auto.')
    return { acao: 'Submeter para verificação', bloqueios, notas: ['Depois de submetido, o auto deixa de poder ser editado (só devolvido ao rascunho, com motivo).'] }
  }

  if (c.workflow === 'submetido') {
    const bloqueios: string[] = []
    if (!c.verificacaoIniciada) bloqueios.push('Falta iniciar a ficha de verificação.')
    else if (c.itensPendentes > 0) bloqueios.push(`Faltam ${c.itensPendentes} ${c.itensPendentes === 1 ? 'item' : 'itens'} da ficha de verificação.`)
    if (c.evidenciasValidas < c.minFotos) {
      bloqueios.push(`São precisas pelo menos ${c.minFotos} fotografias válidas tiradas na obra (há ${c.evidenciasValidas}). Só o administrador pode avançar sem elas, com motivo.`)
    }
    if (!mede) bloqueios.push('Só a equipa de medições, um gestor ou o administrador verifica o auto.')
    return { acao: 'Concluir a verificação', bloqueios, notas: [] }
  }

  if (c.workflow === 'verificado') {
    const bloqueios: string[] = []
    if (!(c.certificado > 0)) bloqueios.push('O valor certificado tem de ser superior a 0 €.')
    if (!gere) bloqueios.push('A aprovação é feita por um gestor ou pelo administrador.')
    else if (c.alcada === 'admin' && !admin) {
      bloqueios.push(`Com trabalhos a mais ou acima de ${fmtEuro(c.alcadaLimite)} certificados, só o administrador aprova.`)
    }
    if (c.docsEmFalta) bloqueios.push(`${c.docsEmFalta} Só o administrador pode aprovar com exceção, indicando o motivo.`)
    return { acao: 'Aprovar', bloqueios, notas: ['Quem criou o auto não o pode aprovar (exceto o administrador).'] }
  }

  if (c.pago) return { acao: null, bloqueios: [], notas: ['Auto pago. Fica imutável.'] }

  if (!c.temFatura && c.exigirFatura) {
    const bloqueios = ['Falta guardar a fatura emitida pelo subempreiteiro (o ERP não emite faturas, só as guarda).']
    if (!gere) bloqueios.push('Só um gestor ou o administrador guarda a fatura.')
    return { acao: 'Guardar a fatura', bloqueios, notas: [] }
  }

  const bloqueios = [...c.bloqueiosPagamento]
  if (!gere) bloqueios.push('Só um gestor ou o administrador regista o pagamento.')
  const notas = c.bloqueiosPagamento.length > 0 ? ['O administrador pode pagar com exceção, indicando o motivo (fica registado).'] : []
  return { acao: 'Pagar', bloqueios, notas }
}

type Props = { passo: PassoAuto; proximo: ProximoPasso }

export function AutoPassos({ passo, proximo }: Props) {
  const indice = PASSOS.findIndex(p => p.id === passo)
  return (
    <section aria-labelledby="passos-auto" className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <h2 id="passos-auto" className="font-semibold text-sm">Estado do auto</h2>
      <ol className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {PASSOS.map((p, i) => {
          const feito = i < indice
          const atual = i === indice
          return (
            <li key={p.id} aria-current={atual ? 'step' : undefined}
              className={`flex items-center gap-1.5 rounded-xl border px-2 py-1.5 text-xs font-medium ${
                atual ? 'border-primary bg-primary/10 text-primary' : feito ? 'border-success/40 bg-success/5 text-success' : 'border-border text-muted-foreground'}`}>
              <span aria-hidden="true" className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-current text-[10px]">
                {feito ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              {p.rotulo}
              {feito && <span className="sr-only"> (concluído)</span>}
            </li>
          )
        })}
      </ol>
      {proximo.acao && (
        <div className="text-sm space-y-1.5">
          <p className="font-medium">Próximo passo: {proximo.acao}</p>
          {proximo.bloqueios.length > 0 ? (
            <ul aria-label="O que falta" className="space-y-1">
              {proximo.bloqueios.map(b => (
                <li key={b} className="flex items-start gap-1.5 text-destructive">
                  <CircleAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" /> {b}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-success">Pronto para avançar.</p>
          )}
        </div>
      )}
      {proximo.notas.map(n => <p key={n} className="text-xs text-muted-foreground">{n}</p>)}
    </section>
  )
}
