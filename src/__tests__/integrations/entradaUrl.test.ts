import { describe, it, expect, beforeEach, vi } from 'vitest'
import { analisarEntradaUrl } from '@/integrations/supabase/entradaUrl'

describe('analisarEntradaUrl', () => {
  it('token_hash com type=recovery', () => {
    expect(analisarEntradaUrl('?token_hash=abc%2B1&type=recovery', '')).toEqual({ tipo: 'token_hash', tokenHash: 'abc+1' })
  })
  it('token_hash sem type=recovery é ignorado', () => {
    expect(analisarEntradaUrl('?token_hash=abc&type=invite', '')).toBeNull()
  })
  it('hash com access_token e type=recovery', () => {
    expect(analisarEntradaUrl('', '#access_token=x&refresh_token=y&type=recovery')).toEqual({ tipo: 'sessao' })
  })
  it('hash com access_token de outro tipo é ignorado', () => {
    expect(analisarEntradaUrl('', '#access_token=x&type=magiclink')).toBeNull()
  })
  it('hash com erro otp_expired', () => {
    expect(analisarEntradaUrl('', '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'))
      .toEqual({ tipo: 'erro', codigo: 'otp_expired', descricao: 'Email link is invalid or has expired' })
  })
  it('hash com access_denied sem error_code', () => {
    expect(analisarEntradaUrl('', '#error=access_denied')).toEqual({ tipo: 'erro', codigo: 'access_denied', descricao: '' })
  })
  it('nada', () => {
    expect(analisarEntradaUrl('', '')).toBeNull()
    expect(analisarEntradaUrl('?x=1', '#secao')).toBeNull()
  })
})

describe('captura na carga do módulo', () => {
  beforeEach(() => { vi.resetModules(); sessionStorage.clear(); window.history.replaceState(null, '', '/') })

  it('hash de recuperação em / vai para /reset-password mantendo o hash e deixa marcador', async () => {
    window.history.replaceState(null, '', '/#access_token=x&type=recovery')
    const mod = await import('@/integrations/supabase/entradaUrl')
    expect(window.location.pathname).toBe('/reset-password')
    expect(window.location.hash).toBe('#access_token=x&type=recovery')
    expect(mod.entradaCapturada()).toEqual({ tipo: 'sessao' })
    expect(mod.temMarcadorRecuperacao()).toBe(true)
    mod.limparMarcadorRecuperacao()
    expect(mod.temMarcadorRecuperacao()).toBe(false)
  })

  it('erro no hash em /login também vai para /reset-password', async () => {
    window.history.replaceState(null, '', '/login#error=access_denied&error_code=otp_expired')
    const mod = await import('@/integrations/supabase/entradaUrl')
    expect(window.location.pathname).toBe('/reset-password')
    expect(mod.entradaCapturada()).toMatchObject({ tipo: 'erro', codigo: 'otp_expired' })
  })

  it('token_hash em /reset-password não muda o URL', async () => {
    window.history.replaceState(null, '', '/reset-password?token_hash=t&type=recovery')
    await import('@/integrations/supabase/entradaUrl')
    expect(window.location.search).toBe('?token_hash=t&type=recovery')
  })

  it('URL normal não faz nada', async () => {
    window.history.replaceState(null, '', '/obras')
    const mod = await import('@/integrations/supabase/entradaUrl')
    expect(window.location.pathname).toBe('/obras')
    expect(mod.entradaCapturada()).toBeNull()
    expect(mod.temMarcadorRecuperacao()).toBe(false)
  })
})
