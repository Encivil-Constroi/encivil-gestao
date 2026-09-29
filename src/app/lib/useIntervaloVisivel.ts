import { useEffect, useRef } from 'react'

/**
 * setInterval que só corre com a página visível: pausa com o separador oculto ou
 * o ecrã bloqueado (sem pedidos à rede nem bateria gasta) e, ao voltar, corre
 * logo `fn` para mostrar o estado atual sem esperar pelo próximo intervalo.
 * `fn` pode mudar a cada render sem reiniciar o intervalo.
 */
export function useIntervaloVisivel(fn: () => void, ms: number, ativo = true): void {
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    if (!ativo) return
    let id: ReturnType<typeof setInterval> | null = null
    const iniciar = () => { id = setInterval(() => fnRef.current(), ms) }
    const parar = () => {
      if (id !== null) { clearInterval(id); id = null }
    }
    const aoMudar = () => {
      if (document.hidden) { parar(); return }
      if (id !== null) return
      fnRef.current()
      iniciar()
    }

    if (!document.hidden) iniciar()
    document.addEventListener('visibilitychange', aoMudar)
    return () => {
      parar()
      document.removeEventListener('visibilitychange', aoMudar)
    }
  }, [ms, ativo])
}
