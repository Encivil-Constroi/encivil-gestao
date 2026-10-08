import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { iniciarCapturaInstalacao, obterEventoInstalacao, subscrever } from '@/app/lib/pwaInstalacao'
import { useInstalarPwa } from '@/app/pages/ajuda/useInstalarPwa'

function eventoInstalar() {
  const prompt = vi.fn(() => Promise.resolve())
  const ev = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt, userChoice: Promise.resolve({ outcome: 'accepted' as const }),
  })
  return { ev, prompt }
}

describe('captura do beforeinstallprompt no arranque', () => {
  it('guarda o evento disparado antes de a Ajuda montar e o hook mostra o botão', async () => {
    iniciarCapturaInstalacao()
    iniciarCapturaInstalacao() // idempotente: um só listener
    const aviso = vi.fn()
    const parar = subscrever(aviso)
    const { ev, prompt } = eventoInstalar()
    window.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    expect(obterEventoInstalacao()).toBe(ev)
    expect(aviso).toHaveBeenCalledTimes(1)
    parar()

    const { result } = renderHook(() => useInstalarPwa())
    expect(result.current.podeInstalar).toBe(true)
    await act(async () => { await result.current.instalar() })
    expect(prompt).toHaveBeenCalledTimes(1)
    expect(result.current.podeInstalar).toBe(false)
    await act(async () => { await result.current.instalar() })
    expect(prompt).toHaveBeenCalledTimes(1)
  })

  it('appinstalled esquece o evento', () => {
    iniciarCapturaInstalacao()
    const { result } = renderHook(() => useInstalarPwa())
    act(() => { window.dispatchEvent(eventoInstalar().ev) })
    expect(result.current.podeInstalar).toBe(true)
    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    expect(result.current.podeInstalar).toBe(false)
  })
})
