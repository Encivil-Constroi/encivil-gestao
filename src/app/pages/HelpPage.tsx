import { useMemo, useState } from 'react'
import { Search, CircleHelp, ChevronRight, KeyRound } from 'lucide-react'
import { useRole } from '@/features/auth/useRole'
import type { RoleUtilizador } from '@/features/auth/AuthContext'
import {
  GUIA_RAPIDO, GUIAS_POR_PAPEL, FAQ, RECUPERAR_ACESSO, ROTULOS_PAPEL, ORDEM_PAPEIS,
  filtrarSecoes, filtrarFaq, type SecaoGuia,
} from './ajuda/conteudo'
import { detetarPlataforma, PASSOS_INSTALACAO } from './ajuda/instalacao'
import { useInstalarPwa } from './ajuda/useInstalarPwa'
import { CartaoGuia, Instalacao, ListaFaq, TituloSecao } from './ajuda/componentes'

export { textoComNegrito } from './ajuda/conteudo'

// Só para a pesquisa encontrar a secção de instalação ("instalar", "iphone"…)
const SECAO_INSTALACAO: SecaoGuia = {
  id: 'instalar',
  titulo: 'Instalar no telemóvel',
  resumo: 'Instalar a app no iPhone, Android ou computador',
  passos: Object.values(PASSOS_INSTALACAO).flat(),
}

function plataformaAtual() {
  if (typeof window === 'undefined') return 'desktop' as const
  const nav = window.navigator as Navigator & { standalone?: boolean }
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true
  return detetarPlataforma(nav.userAgent, standalone, nav.maxTouchPoints ?? 0)
}

export function HelpPage() {
  const { role, isAdmin, nome } = useRole()
  const proprio: RoleUtilizador = role ?? 'leitura'
  const [papelEscolhido, setPapelEscolhido] = useState<RoleUtilizador | null>(null)
  const papel = isAdmin ? (papelEscolhido ?? proprio) : proprio
  const [termo, setTermo] = useState('')
  const plataforma = useMemo(plataformaAtual, [])
  const { podeInstalar, instalar } = useInstalarPwa()

  const rapido = filtrarSecoes(GUIA_RAPIDO, termo)
  const diaADia = filtrarSecoes(GUIAS_POR_PAPEL[papel], termo)
  const recuperar = filtrarSecoes([RECUPERAR_ACESSO], termo)
  const faq = filtrarFaq(FAQ, termo)
  const mostrarInstalacao = filtrarSecoes([SECAO_INSTALACAO], termo).length > 0
  const pesquisando = termo.trim() !== ''
  const semResultados = rapido.length + diaADia.length + recuperar.length + faq.length === 0 && !mostrarInstalacao

  const primeiroNome = nome.trim().split(/\s+/)[0] || 'utilizador'

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-6">
      <header className="bg-card text-card-foreground border border-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-4">
          <div className="bg-muted rounded-lg p-2.5 shrink-0">
            <img
              src="/icone_oficial.png"
              alt="ENCIVIL"
              className="w-10 h-10 object-contain grayscale mix-blend-multiply dark:invert dark:mix-blend-screen"
              draggable={false}
            />
          </div>
          <div className="min-w-0">
            <p className="text-muted-foreground text-sm">Olá, {primeiroNome}</p>
            <h1 className="text-xl font-bold leading-tight">Ajuda</h1>
            <p className="text-muted-foreground text-xs mt-0.5">Guias curtos para o seu trabalho na ENCIVIL Gestão</p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            value={termo}
            onChange={e => setTermo(e.target.value)}
            placeholder="Pesquisar na ajuda (ex.: saída, palavra-passe)"
            aria-label="Pesquisar na ajuda"
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-input bg-input-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {isAdmin && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <label htmlFor="ajuda-papel" className="text-sm font-medium text-foreground shrink-0">Ver o guia de</label>
            <select
              id="ajuda-papel"
              value={papel}
              onChange={e => setPapelEscolhido(e.target.value as RoleUtilizador)}
              className="w-full sm:w-auto px-3 py-2.5 rounded-lg border border-input bg-input-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {ORDEM_PAPEIS.map(p => <option key={p} value={p}>{ROTULOS_PAPEL[p]}</option>)}
            </select>
          </div>
        )}
      </header>

      {semResultados && (
        <p className="text-sm text-muted-foreground text-center py-6">
          Nada encontrado para "{termo.trim()}". Experimente outra palavra.
        </p>
      )}

      {rapido.length > 0 && (
        <section aria-labelledby="ajuda-primeiros">
          <TituloSecao id="ajuda-primeiros">Primeiros passos</TituloSecao>
          <div className="space-y-3">
            {rapido.map(s => <CartaoGuia key={`${s.id}-${pesquisando}`} secao={s} abertoInicial={pesquisando} />)}
          </div>
        </section>
      )}

      {diaADia.length > 0 && (
        <section aria-labelledby="ajuda-dia">
          <TituloSecao id="ajuda-dia">
            {papel === proprio ? 'O seu dia a dia' : `Guia: ${ROTULOS_PAPEL[papel]}`}
          </TituloSecao>
          <div className="space-y-3">
            {diaADia.map((s, i) => (
              <CartaoGuia key={`${papel}-${s.id}-${pesquisando}`} secao={s} abertoInicial={i === 0 || pesquisando} />
            ))}
          </div>
        </section>
      )}

      {mostrarInstalacao && (
        <section aria-labelledby="ajuda-instalar">
          <TituloSecao id="ajuda-instalar">Instalar no telemóvel</TituloSecao>
          <Instalacao plataforma={plataforma} podeInstalar={podeInstalar} instalar={instalar} />
        </section>
      )}

      {recuperar.length > 0 && (
        <section aria-labelledby="ajuda-recuperar">
          <TituloSecao id="ajuda-recuperar">Recuperar o acesso</TituloSecao>
          <div className="flex items-start gap-2 mb-3 px-1 text-xs text-muted-foreground">
            <KeyRound className="w-4 h-4 shrink-0" />
            <span>Para quando não consegue entrar. Mostre isto a um colega se precisar.</span>
          </div>
          <CartaoGuia key={`${RECUPERAR_ACESSO.id}-${pesquisando}`} secao={RECUPERAR_ACESSO} abertoInicial={pesquisando} />
        </section>
      )}

      {faq.length > 0 && (
        <section aria-labelledby="ajuda-faq">
          <TituloSecao id="ajuda-faq">Perguntas frequentes</TituloSecao>
          <ListaFaq perguntas={faq} />
        </section>
      )}

      <div className="bg-card text-card-foreground rounded-xl border border-border p-4 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <div className="bg-primary/10 p-2.5 rounded-lg">
            <CircleHelp className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm">Precisa de mais ajuda?</p>
            <p className="text-xs text-muted-foreground">Contacte o administrador do sistema</p>
          </div>
        </div>
        <a
          href="mailto:mickael.encivil@hotmail.com"
          className="flex items-center justify-between w-full py-3 px-4 bg-accent text-accent-foreground rounded-lg hover:bg-accent/80 transition-colors"
        >
          <span className="text-sm font-medium break-all">mickael.encivil@hotmail.com</span>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </a>
      </div>
    </div>
  )
}
