import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  mfa: {
    getAuthenticatorAssuranceLevel: vi.fn(),
    listFactors: vi.fn(),
    enroll: vi.fn(),
    unenroll: vi.fn(),
    challengeAndVerify: vi.fn(),
  },
  maybeSingle: vi.fn(),
}))
const { mfa, maybeSingle } = m
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { mfa: m.mfa },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: m.maybeSingle }) }) }),
    rpc: vi.fn(),
  },
}))

import { nivelMfa, listarFatores, iniciarRegisto, verificarCodigo, mfaObrigatorio } from '@/features/auth/services/mfaService'

beforeEach(() => vi.clearAllMocks())

describe('mfaService', () => {
  it('nivelMfa traduz a resposta do Supabase', async () => {
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })
    expect(await nivelMfa()).toEqual({ atual: 'aal1', seguinte: 'aal2' })
  })
  it('listarFatores devolve só TOTP verificados', async () => {
    mfa.listFactors.mockResolvedValue({ data: { totp: [
      { id: 'f1', friendly_name: 'Tel', status: 'verified', created_at: '2026-10-01' },
      { id: 'f2', friendly_name: null, status: 'unverified', created_at: '2026-10-02' },
    ], all: [] }, error: null })
    expect(await listarFatores()).toEqual([{ id: 'f1', nome: 'Tel', criadoEm: '2026-10-01' }])
  })
  it('iniciarRegisto remove registos por confirmar antes de criar outro', async () => {
    mfa.listFactors.mockResolvedValue({ data: { totp: [], all: [{ id: 'velho', status: 'unverified' }] }, error: null })
    mfa.unenroll.mockResolvedValue({ error: null })
    mfa.enroll.mockResolvedValue({ data: { id: 'novo', totp: { qr_code: 'data:image/svg+xml;x', secret: 'ABC', uri: 'otpauth://x' } }, error: null })
    const r = await iniciarRegisto()
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: 'velho' })
    expect(r).toEqual({ fatorId: 'novo', qrSvg: 'data:image/svg+xml;x', segredo: 'ABC' })
  })
  it('verificarCodigo recusa códigos que não são 6 algarismos sem chamar o servidor', async () => {
    await expect(verificarCodigo('f1', '12a456')).rejects.toThrow('O código tem 6 algarismos.')
    expect(mfa.challengeAndVerify).not.toHaveBeenCalled()
  })
  it('verificarCodigo aceita espaços e dá erro claro se o código for recusado', async () => {
    mfa.challengeAndVerify.mockResolvedValue({ data: null, error: { message: 'Invalid TOTP code entered' } })
    await expect(verificarCodigo('f1', '123 456')).rejects.toThrow('Código inválido ou expirado.')
    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f1', code: '123456' })
  })
  it('mfaObrigatorio é false se a tabela ainda não existir (site antes da migration)', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { code: 'PGRST205', message: 'not found' } })
    expect(await mfaObrigatorio()).toBe(false)
  })
  it('mfaObrigatorio propaga outros erros', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { code: '08006', message: 'ligação' } })
    await expect(mfaObrigatorio()).rejects.toBeTruthy()
  })
  it('mfaObrigatorio lê o interruptor', async () => {
    maybeSingle.mockResolvedValue({ data: { mfa_obrigatorio: true }, error: null })
    expect(await mfaObrigatorio()).toBe(true)
  })
})
