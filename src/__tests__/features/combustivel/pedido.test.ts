import { describe, it, expect } from 'vitest'
import {
  fasePedido, nivelEspera, textoDuracao, lerNumero, litrosPorDiferenca, minutosDesde,
} from '@/features/combustivel/lib/pedido'
import type { PedidoRow } from '@/features/combustivel/db'

const AGORA = Date.parse('2026-09-30T10:00:00Z')
const antes = (s: number) => new Date(AGORA - s * 1000).toISOString()
const depois = (s: number) => new Date(AGORA + s * 1000).toISOString()

type Base = Parameters<typeof fasePedido>[0]
const p = (o: Partial<PedidoRow> = {}): Base => ({
  estado: 'AUTORIZADO', tipo_fonte: 'POLO2', contador_inicial: null, bomba_ligada_em: null,
  pump_auth_expires_at: null, pump_activated_at: null, pump_max_seconds: 600, ...o,
})

describe('fase do pedido (o que o motorista vê)', () => {
  it.each([
    ['AGUARDA_AUTORIZACAO', 'ESPERA'], ['REJEITADO', 'RECUSADO'], ['CANCELADO', 'CANCELADO'],
    ['CONCLUIDO', 'CONCLUIDO'], ['AGUARDA_APROVACAO', 'ANTIGO'],
  ] as const)('%s → %s', (estado, fase) => {
    expect(fasePedido(p({ estado }), null, AGORA)).toBe(fase)
  })

  it('posto de rua e carrinha autorizados: registo com foto', () => {
    expect(fasePedido(p({ tipo_fonte: 'POSTO_RUA' }), null, AGORA)).toBe('REGISTO')
    expect(fasePedido(p({ tipo_fonte: 'CARRINHA' }), null, AGORA)).toBe('REGISTO')
  })

  it('Polo 2: primeiro a leitura inicial, depois o botão', () => {
    expect(fasePedido(p(), null, AGORA)).toBe('CONTADOR_INICIAL')
    expect(fasePedido(p({ contador_inicial: 0 }), null, AGORA)).toBe('LIGAR')
  })

  it('"Ligar bomba" carregado e ainda válido: a ligar; expirado sem ligar: volta ao botão', () => {
    const base = { contador_inicial: 100, bomba_ligada_em: antes(10) }
    expect(fasePedido(p({ ...base, pump_auth_expires_at: depois(60) }), null, AGORA)).toBe('A_LIGAR')
    expect(fasePedido(p({ ...base, pump_auth_expires_at: antes(1) }), null, AGORA)).toBe('LIGAR')
  })

  it('bomba ligada: usa a sessão do servidor quando existe', () => {
    const ligada = p({ contador_inicial: 100, pump_activated_at: antes(30) })
    expect(fasePedido(ligada, true, AGORA)).toBe('A_ABASTECER')
    expect(fasePedido(ligada, false, AGORA)).toBe('CONTADOR_FINAL')
  })

  it('bomba ligada sem resposta do servidor: decide pelo relógio (10 min)', () => {
    expect(fasePedido(p({ contador_inicial: 1, pump_activated_at: antes(599) }), null, AGORA)).toBe('A_ABASTECER')
    expect(fasePedido(p({ contador_inicial: 1, pump_activated_at: antes(601) }), null, AGORA)).toBe('CONTADOR_FINAL')
    expect(fasePedido(p({ contador_inicial: 1, pump_activated_at: antes(601), pump_max_seconds: null }), null, AGORA)).toBe('CONTADOR_FINAL')
  })
})

describe('tempo de espera', () => {
  it.each([[0, 'normal'], [29, 'normal'], [30, 'atencao'], [59, 'atencao'], [60, 'critico'], [300, 'critico']] as const)(
    '%i min → %s', (m, n) => expect(nivelEspera(m)).toBe(n))

  it.each([[0, 'agora mesmo'], [1, '1 min'], [59, '59 min'], [60, '1 h'], [80, '1 h 20 min'], [24 * 60, '1 dia'], [3 * 24 * 60 + 5, '3 dias']] as const)(
    '%i min → "%s"', (m, t) => expect(textoDuracao(m)).toBe(t))

  it('minutos desde: nunca negativo', () => {
    expect(minutosDesde(antes(125), AGORA)).toBe(2)
    expect(minutosDesde(depois(60), AGORA)).toBe(0)
  })
})

describe('números escritos pelo motorista', () => {
  it.each([
    ['1042,5', 1042.5], ['1042.5', 1042.5], ['1.042,5', 1042.5], ['1 042,5', 1042.5], [' 12 ', 12], ['0', 0],
  ] as const)('"%s" → %s', (t, n) => expect(lerNumero(t)).toBe(n))

  it.each(['', '  ', 'abc', '-3', '1,2,3', '12a', '1e3'])('"%s" é inválido', t => expect(lerNumero(t)).toBeNull())
})

describe('litros pela diferença do contador (igual ao servidor)', () => {
  it('diferença normal, arredondada ao ml', () => {
    expect(litrosPorDiferenca(1000.5, 1045.7)).toEqual({ litros: 45.2 })
  })
  it('sem leitura final: nada a mostrar', () => {
    expect(litrosPorDiferenca(10, null)).toBeNull()
  })
  it('final igual ou menor que a inicial: erro com a inicial', () => {
    expect(litrosPorDiferenca(500, 500)).toMatchObject({ erro: expect.stringMatching(/maior que a inicial/) })
    expect(litrosPorDiferenca(500, 499)).toMatchObject({ erro: expect.stringMatching(/maior que a inicial/) })
  })
  it('mais de 1000 L: impossível; 1000 L exatos: aceite', () => {
    expect(litrosPorDiferenca(0, 1000.01)).toMatchObject({ erro: expect.stringMatching(/impossível/) })
    expect(litrosPorDiferenca(0, 1000)).toEqual({ litros: 1000 })
  })
})
