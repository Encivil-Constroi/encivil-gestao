import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  alterarPapel: vi.fn(async () => {}), convidarUtilizador: vi.fn(async () => {}),
  desativarUtilizador: vi.fn(async () => {}), reativarUtilizador: vi.fn(async () => {}),
}))
vi.mock('@/features/auth/services/utilizadoresService', () => m)

import { sincronizarConta, type PedidoConta } from '@/features/colaboradores/services/contaFicha'

const base: PedidoConta = {
  colaboradorId: 'c1', nome: 'Rui', email: 'Rui@Teste.pt', telemovel: '912 345 678', fotoPath: null,
  role: 'armazem', contaAtiva: true,
}
const util = { id: 'u1', email: 'rui@teste.pt', nome: 'Rui', role: 'leitura' as const, ativo: true, ultimoLogin: null, criadoEm: '' }

beforeEach(() => { Object.values(m).forEach(f => f.mockClear()) })

describe('sincronizarConta', () => {
  it('sem conta e com email: convida com o papel e liga a ficha', async () => {
    expect(await sincronizarConta(base)).toBeNull()
    expect(m.convidarUtilizador).toHaveBeenCalledWith('rui@teste.pt', 'Rui', 'armazem',
      { colaboradorId: 'c1', telemovel: '912 345 678', fotoPath: undefined })
  })
  it('sem conta e conta desligada: não faz nada', async () => {
    expect(await sincronizarConta({ ...base, contaAtiva: false })).toBeNull()
    expect(m.convidarUtilizador).not.toHaveBeenCalled()
  })
  it('sem email avisa em vez de falhar', async () => {
    expect(await sincronizarConta({ ...base, email: ' ' })).toMatch(/falta o email/)
  })
  it('conta existente: muda papel e estado só quando diferem', async () => {
    await sincronizarConta({ ...base, utilizador: util, contaAtiva: false })
    expect(m.alterarPapel).toHaveBeenCalledWith('u1', 'armazem')
    expect(m.desativarUtilizador).toHaveBeenCalledWith('u1')
    m.alterarPapel.mockClear()
    await sincronizarConta({ ...base, utilizador: { ...util, role: 'armazem', ativo: false } })
    expect(m.alterarPapel).not.toHaveBeenCalled()
    expect(m.reativarUtilizador).toHaveBeenCalledWith('u1')
  })
  it('erro da Edge Function vira aviso (a ficha já foi guardada)', async () => {
    m.convidarUtilizador.mockRejectedValueOnce(new Error('Acesso negado'))
    expect(await sincronizarConta(base)).toMatch(/Ficha guardada.*Acesso negado/)
  })
})
