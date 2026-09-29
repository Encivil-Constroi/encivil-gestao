import { describe, it, expect } from 'vitest'
import { mensagemErroPedido } from '@/features/combustivel/lib/erroPedido'

const GENERICA = 'Erro ao enviar. Verifica a ligação.'

describe('mensagemErroPedido', () => {
  it('violação de RLS (limite da viatura) → mensagem do limite', () => {
    expect(mensagemErroPedido({
      code: '42501', message: 'new row violates row-level security policy for table "comb_abastecimentos_pendentes"',
    })).toMatch(/3 pedidos para esta viatura nos últimos 5 minutos/)
  })

  it.each([
    [{ code: '42501', message: 'permission denied for table comb_abastecimentos_pendentes' }],
    [{ code: '23503', message: 'violates foreign key constraint' }],
    [{ code: '', message: 'TypeError: Failed to fetch' }],
    [{ message: 'row-level security' }],
    [{}],
  ])('%o → mensagem genérica', (erro) => {
    expect(mensagemErroPedido(erro)).toBe(GENERICA)
  })
})
