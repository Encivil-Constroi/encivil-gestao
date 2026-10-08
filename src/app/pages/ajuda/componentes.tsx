import { useId, useState } from 'react'
import { Link } from 'react-router'
import { ChevronDown, ArrowRight, CheckCircle2, Download, Smartphone, Monitor } from 'lucide-react'
import { textoComNegrito, type SecaoGuia, type PerguntaFaq } from './conteudo'
import { PASSOS_INSTALACAO, ROTULOS_PLATAFORMA, type Plataforma } from './instalacao'

type PlataformaPassos = Exclude<Plataforma, 'instalada'>

export function TextoPasso({ texto }: { texto: string }) {
  const partes = textoComNegrito(texto).filter(p => p.texto !== '')
  return (
    <>
      {partes.map((p, i) => p.negrito
        ? <strong key={i} className="font-semibold text-foreground">{p.texto}</strong>
        : <span key={i}>{p.texto}</span>)}
    </>
  )
}

export function ListaPassos({ passos }: { passos: string[] }) {
  return (
    <ol className="space-y-3">
      {passos.map((passo, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold mt-0.5">
            {i + 1}
          </span>
          <p className="flex-1 text-sm text-foreground leading-snug"><TextoPasso texto={passo} /></p>
        </li>
      ))}
    </ol>
  )
}

export function TituloSecao({ id, children, extra }: { id: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3 px-1">
      <h2 id={id} className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{children}</h2>
      {extra}
    </div>
  )
}

export function CartaoGuia({ secao, abertoInicial = false }: { secao: SecaoGuia; abertoInicial?: boolean }) {
  const [aberto, setAberto] = useState(abertoInicial)
  const idCorpo = useId()
  const idResumo = useId()
  return (
    <div className="bg-card text-card-foreground rounded-xl border border-border shadow-sm overflow-hidden">
      {/* O botão estica-se (after:inset-0) por todo o cabeçalho: o resumo também abre o cartão */}
      <div className="relative p-4 flex items-center gap-3 hover:bg-accent/40 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground text-sm md:text-base">
            <button
              type="button"
              onClick={() => setAberto(a => !a)}
              aria-expanded={aberto}
              aria-controls={idCorpo}
              aria-describedby={idResumo}
              className="text-left after:absolute after:inset-0 focus-visible:outline-none"
            >
              {secao.titulo}
            </button>
          </h3>
          <p id={idResumo} className="text-xs text-muted-foreground mt-0.5 leading-snug">{secao.resumo}</p>
        </div>
        <ChevronDown aria-hidden="true" className={`w-5 h-5 text-muted-foreground shrink-0 transition-transform duration-200 motion-reduce:transition-none ${aberto ? 'rotate-180' : ''}`} />
      </div>
      {aberto && (
        <div id={idCorpo} className="px-4 pb-4 space-y-4">
          <ListaPassos passos={secao.passos} />
          {secao.rota && (
            <Link
              to={secao.rota}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Abrir este ecrã <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

export function ListaFaq({ perguntas }: { perguntas: PerguntaFaq[] }) {
  return (
    <div className="bg-card text-card-foreground rounded-xl border border-border shadow-sm divide-y divide-border">
      {perguntas.map(f => (
        <details key={f.pergunta} className="group p-4">
          <summary className="flex items-center gap-3 cursor-pointer list-none text-sm font-medium text-foreground">
            <span className="flex-1">{f.pergunta}</span>
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
          </summary>
          <p className="text-sm text-muted-foreground mt-2 leading-snug">{f.resposta}</p>
        </details>
      ))}
    </div>
  )
}

const ORDEM_PLATAFORMAS: PlataformaPassos[] = ['ios', 'android', 'desktop']

export function Instalacao({ plataforma, podeInstalar, instalar }: {
  plataforma: Plataforma
  podeInstalar: boolean
  instalar: () => Promise<void>
}) {
  if (plataforma === 'instalada') {
    return (
      <div className="bg-success/10 border border-success/30 rounded-xl p-4 flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
        <p className="text-sm text-foreground">A app já está instalada neste aparelho.</p>
      </div>
    )
  }
  const Icone = plataforma === 'desktop' ? Monitor : Smartphone
  const outras = ORDEM_PLATAFORMAS.filter(p => p !== plataforma)
  return (
    <div className="bg-card text-card-foreground rounded-xl border border-border shadow-sm p-4 space-y-4">
      <p className="text-sm text-muted-foreground leading-snug">
        Instalada, a app abre num toque, em ecrã inteiro, e recebe notificações. Não precisa de loja de apps.
      </p>
      {podeInstalar && (
        <button
          type="button"
          onClick={() => { void instalar() }}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 bg-primary text-primary-foreground rounded-lg font-semibold text-sm hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Download className="w-4 h-4" /> Instalar app
        </button>
      )}
      <section aria-label={`Passos para ${ROTULOS_PLATAFORMA[plataforma]}`} className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icone className="w-4 h-4 text-primary" />
          {ROTULOS_PLATAFORMA[plataforma]} <span className="text-xs font-normal text-muted-foreground">(o seu aparelho)</span>
        </p>
        <ListaPassos passos={PASSOS_INSTALACAO[plataforma]} />
      </section>
      <details className="group border-t border-border pt-3">
        <summary className="flex items-center gap-2 cursor-pointer list-none text-sm font-medium text-foreground">
          <span className="flex-1">Noutro aparelho</span>
          <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <div className="mt-3 space-y-4">
          {outras.map(p => (
            <div key={p} className="space-y-2">
              <p className="text-sm font-semibold text-foreground">{ROTULOS_PLATAFORMA[p]}</p>
              <ListaPassos passos={PASSOS_INSTALACAO[p]} />
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}
