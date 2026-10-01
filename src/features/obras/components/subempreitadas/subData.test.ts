import { describe, expect, it } from 'vitest'
import { validarEvidencias, validarOcorrencia } from './subData'

describe('dados de subempreitadas', () => {
  it('recusa progresso físico fora de 0 a 100 e atraso negativo', () => {
    expect(validarEvidencias({ progresso: 101, atraso: 0 })).toMatch(/progresso/i)
    expect(validarEvidencias({ progresso: 20, atraso: -1 })).toMatch(/atraso/i)
    expect(validarEvidencias({ progresso: 0, atraso: 0 })).toBeNull()
  })

  it('exige descrição e data válida nas ocorrências', () => {
    expect(validarOcorrencia('', '2026-10-01', '2026-10-01', 0)).toMatch(/descrição/i)
    expect(validarOcorrencia('Chuva', '2026-10-02', '2026-10-01', 0)).toMatch(/futura/i)
    expect(validarOcorrencia('Chuva', '2026-10-01', '2026-10-01', 0)).toBeNull()
  })
})
