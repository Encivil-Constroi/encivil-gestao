import { describe, it, expect } from 'vitest'
import { decidirEstadoMfa } from '@/features/auth/hooks/useEstadoMfa'

const aal1 = { atual: 'aal1', seguinte: 'aal1' } as const
const aal1ComFator = { atual: 'aal1', seguinte: 'aal2' } as const
const aal2 = { atual: 'aal2', seguinte: 'aal2' } as const

describe('decidirEstadoMfa', () => {
  it('quem tem fator e sessão aal1 tem de dar o código (qualquer papel)', () => {
    expect(decidirEstadoMfa({ papel: 'armazem', obrigatorio: false, temFator: true, nivel: aal1ComFator })).toBe('desafio')
  })
  it('admin sem fator com interruptor ligado → registo', () => {
    expect(decidirEstadoMfa({ papel: 'admin', obrigatorio: true, temFator: false, nivel: aal1 })).toBe('registo')
  })
  it('gestor sem fator com interruptor desligado → ok', () => {
    expect(decidirEstadoMfa({ papel: 'gestor', obrigatorio: false, temFator: false, nivel: aal1 })).toBe('ok')
  })
  it('motorista sem fator com interruptor ligado → ok (opcional para ele)', () => {
    expect(decidirEstadoMfa({ papel: 'motorista', obrigatorio: true, temFator: false, nivel: aal1 })).toBe('ok')
  })
  it('sessão aal2 → ok', () => {
    expect(decidirEstadoMfa({ papel: 'admin', obrigatorio: true, temFator: true, nivel: aal2 })).toBe('ok')
  })
})
