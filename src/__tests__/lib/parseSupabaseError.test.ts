import { describe, it, expect } from 'vitest'
import { parseSupabaseError } from '@/app/lib/parseSupabaseError'

describe('parseSupabaseError', () => {
  // ── Erros de rede ────────────────────────────────────────────────────────
  it('reconhece "Failed to fetch" como erro de rede', () => {
    const err = new Error('Failed to fetch')
    expect(parseSupabaseError(err)).toContain('ligação')
  })

  it('reconhece "NetworkError" como erro de rede', () => {
    expect(parseSupabaseError({ message: 'NetworkError when attempting fetch' }))
      .toContain('ligação')
  })

  // ── Erros PostgreSQL mapeados ─────────────────────────────────────────────
  it('23505 — unique violation → mensagem de duplicado', () => {
    expect(parseSupabaseError({ message: 'duplicate key', code: '23505' }))
      .toContain('duplicado')
  })

  it('23503 — foreign key violation → mensagem de associação', () => {
    expect(parseSupabaseError({ message: 'fk violation', code: '23503' }))
      .toContain('associados')
  })

  it('23502 — not null violation → campo obrigatório', () => {
    expect(parseSupabaseError({ message: 'null value', code: '23502' }))
      .toContain('obrigatório')
  })

  it('23514 — check violation → valor fora dos limites', () => {
    expect(parseSupabaseError({ message: 'check constraint', code: '23514' }))
      .toContain('limites')
  })

  it('42501 — insufficient privilege → sem permissão', () => {
    expect(parseSupabaseError({ message: 'permission denied', code: '42501' }))
      .toContain('permissão')
  })

  // ── Erros PostgREST ───────────────────────────────────────────────────────
  it('PGRST116 — row not found → registo não encontrado', () => {
    expect(parseSupabaseError({ message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }))
      .toContain('não encontrado')
  })

  it('PGRST301 — JWT expired → sessão expirada', () => {
    expect(parseSupabaseError({ message: 'JWT expired', code: 'PGRST301' }))
      .toContain('expirada')
  })

  // ── Erros de RPC customizados (P0001) ─────────────────────────────────────
  it('P0001 — passa a mensagem do servidor diretamente (já em português)', () => {
    expect(parseSupabaseError({ message: 'Ferramenta já está emprestada.', code: 'P0001' }))
      .toBe('Ferramenta já está emprestada.')
  })

  it('P0001 — outro erro de RPC personalizado', () => {
    expect(parseSupabaseError({ message: 'Auto já foi validado.', code: 'P0001' }))
      .toBe('Auto já foi validado.')
  })

  // ── Erros desconhecidos / fallback ────────────────────────────────────────
  it('código desconhecido usa a mensagem original do servidor', () => {
    const msg = parseSupabaseError({ message: 'connection refused', code: '08006' })
    expect(msg).toBe('connection refused')
  })

  it('Error nativo sem código usa e.message', () => {
    expect(parseSupabaseError(new Error('algo inesperado'))).toBe('algo inesperado')
  })

  it('valor primitivo usa o fallback padrão', () => {
    expect(parseSupabaseError(null)).toContain('inesperado')
  })

  it('undefined usa o fallback padrão', () => {
    expect(parseSupabaseError(undefined)).toContain('inesperado')
  })

  it('fallback personalizado é retornado para erros desconhecidos sem mensagem', () => {
    expect(parseSupabaseError(42, 'Erro ao guardar')).toBe('Erro ao guardar')
  })
})
