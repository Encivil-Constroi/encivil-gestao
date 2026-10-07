// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { compararMigrations, versao } from './verificar-migrations.mjs'

describe('verificar-migrations', () => {
  it('extrai a versão do nome do ficheiro', () => {
    expect(versao('20261008010000_seguranca_mfa.sql')).toBe('20261008010000')
  })
  it('lista o que falta aplicar e o que só existe em produção', () => {
    const r = compararMigrations(['20260101000000_a.sql', '20260102000000_b.sql'], ['20260101000000', '20250101000000'])
    expect(r).toEqual({ emFalta: ['20260102000000_b.sql'], desconhecidas: ['20250101000000'] })
  })
})
