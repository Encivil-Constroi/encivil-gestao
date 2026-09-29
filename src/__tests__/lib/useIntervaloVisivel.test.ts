import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useIntervaloVisivel } from '@/app/lib/useIntervaloVisivel'

let oculto = false

function mudarVisibilidade(o: boolean) {
  oculto = o
  act(() => { document.dispatchEvent(new Event('visibilitychange')) })
}

beforeEach(() => {
  vi.useFakeTimers()
  oculto = false
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => oculto })
})

afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
})

describe('useIntervaloVisivel', () => {
  it('corre a cada intervalo com a página visível, não logo ao montar', () => {
    const fn = vi.fn()
    renderHook(() => useIntervaloVisivel(fn, 1_000))
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(3_000)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('pausa com a página oculta', () => {
    const fn = vi.fn()
    renderHook(() => useIntervaloVisivel(fn, 1_000))
    vi.advanceTimersByTime(1_000)
    mudarVisibilidade(true)
    vi.advanceTimersByTime(60_000)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('ao voltar corre logo e retoma o intervalo', () => {
    const fn = vi.fn()
    renderHook(() => useIntervaloVisivel(fn, 1_000))
    mudarVisibilidade(true)
    vi.advanceTimersByTime(5_000)
    mudarVisibilidade(false)
    expect(fn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2_000)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('evento de visibilidade sem ter ficado oculta não duplica o intervalo', () => {
    const fn = vi.fn()
    renderHook(() => useIntervaloVisivel(fn, 1_000))
    mudarVisibilidade(false)
    mudarVisibilidade(false)
    vi.advanceTimersByTime(2_000)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('montado com a página oculta só arranca quando fica visível', () => {
    oculto = true
    const fn = vi.fn()
    renderHook(() => useIntervaloVisivel(fn, 1_000))
    vi.advanceTimersByTime(5_000)
    expect(fn).not.toHaveBeenCalled()
    mudarVisibilidade(false)
    expect(fn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1_000)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('inativo não corre nem reage à visibilidade', () => {
    const fn = vi.fn()
    renderHook(() => useIntervaloVisivel(fn, 1_000, false))
    vi.advanceTimersByTime(5_000)
    mudarVisibilidade(true)
    mudarVisibilidade(false)
    expect(fn).not.toHaveBeenCalled()
  })

  it('desativar e desmontar param o intervalo e o ouvinte', () => {
    const fn = vi.fn()
    const { rerender, unmount } = renderHook(({ ativo }) => useIntervaloVisivel(fn, 1_000, ativo),
      { initialProps: { ativo: true } })
    vi.advanceTimersByTime(1_000)
    rerender({ ativo: false })
    vi.advanceTimersByTime(5_000)
    mudarVisibilidade(true); mudarVisibilidade(false)
    expect(fn).toHaveBeenCalledTimes(1)

    rerender({ ativo: true })
    vi.advanceTimersByTime(1_000)
    expect(fn).toHaveBeenCalledTimes(2)
    unmount()
    vi.advanceTimersByTime(5_000)
    mudarVisibilidade(true); mudarVisibilidade(false)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('usa sempre a versão mais recente de fn sem reiniciar o intervalo', () => {
    const a = vi.fn()
    const b = vi.fn()
    const { rerender } = renderHook(({ f }) => useIntervaloVisivel(f, 1_000), { initialProps: { f: a } })
    vi.advanceTimersByTime(600)
    rerender({ f: b })
    vi.advanceTimersByTime(400)
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
  })
})
