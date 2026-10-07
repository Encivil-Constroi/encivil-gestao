import { describe, it, expect } from 'vitest'
import { parseSupabaseError } from '@/app/lib/parseSupabaseError'

describe('parseSupabaseError — senha fraca', () => {
  it('mapeia weak_password do Auth', () => {
    expect(parseSupabaseError({ message: 'Password should contain...', code: 'weak_password' }))
      .toBe('A palavra-passe não cumpre os requisitos de segurança.')
  })
})
