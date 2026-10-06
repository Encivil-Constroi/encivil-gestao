import { useContext, useEffect, useId, useSyncExternalStore } from 'react'
import { useBlocker, UNSAFE_DataRouterContext } from 'react-router'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/app/components/ui/alert-dialog'

// Registo global: qualquer ecrã com trabalho por guardar marca-se aqui e um único
// <ProtecaoSaida /> no layout pergunta antes de sair (menu, voltar, fechar o separador)
const ativos = new Map<string, string>()
const ouvintes = new Set<() => void>()
let versao = 0

function notificar() { versao++; ouvintes.forEach(f => f()) }
function subscrever(f: () => void) { ouvintes.add(f); return () => { ouvintes.delete(f) } }
const versaoAtual = () => versao

export function useProtegerSaida(ativo: boolean, mensagem = 'Tem trabalho por guardar. Se sair agora, perde-o.') {
  const id = useId()
  useEffect(() => {
    if (!ativo) return
    ativos.set(id, mensagem)
    notificar()
    return () => { ativos.delete(id); notificar() }
  }, [ativo, id, mensagem])
}

// Trabalho já guardado: chamar mesmo antes de navegar, o efeito do hook chegaria tarde
export function libertarSaida() { ativos.clear(); notificar() }

// useBlocker só existe num data router (createBrowserRouter); com MemoryRouter (testes) não monta
export function ProtecaoSaida() {
  return useContext(UNSAFE_DataRouterContext) ? <GuardaSaida /> : null
}

function GuardaSaida() {
  useSyncExternalStore(subscrever, versaoAtual)
  const ha = ativos.size > 0
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    ativos.size > 0 && currentLocation.pathname + currentLocation.search !== nextLocation.pathname + nextLocation.search)

  useEffect(() => {
    if (!ha) return
    const aoFechar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', aoFechar)
    return () => window.removeEventListener('beforeunload', aoFechar)
  }, [ha])

  return (
    <AlertDialog open={blocker.state === 'blocked'}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sair sem guardar?</AlertDialogTitle>
          <AlertDialogDescription>{[...ativos.values()][0] ?? ''}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => blocker.reset?.()}>Ficar aqui</AlertDialogCancel>
          <AlertDialogAction onClick={() => blocker.proceed?.()}>Sair e perder</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
