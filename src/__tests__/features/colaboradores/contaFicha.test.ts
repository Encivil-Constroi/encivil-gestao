import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  alterarPapel: vi.fn(async () => {}), criarUtilizador: vi.fn(async () => ({ userId: 'u9', email: 'x' })),
  desativarUtilizador: vi.fn(async () => {}), reativarUtilizador: vi.fn(async () => {}),
}))
vi.mock('@/features/auth/services/utilizadoresService', () => m)

import { sincronizarConta, type PedidoConta } from '@/features/colaboradores/services/contaFicha'

const base: PedidoConta = {
  colaboradorId: 'c1', nome: 'Rui', email: 'Rui@Teste.pt', telemovel: '912 345 678', fotoPath: null,
  role: 'armazem', contaAtiva: true, login: '', senha: '',
}
const util = {
  id: 'u1', email: 'rui@teste.pt', nome: 'Rui', role: 'leitura' as const, ativo: true,
  ultimoLogin: null, criadoEm: '', login: null, semEmail: false, mfa: false,
}

beforeEach(() => { Object.values(m).forEach(f => f.mockClear()) })

describe('sincronizarConta', () => {
  it('sem conta, com email e senha: cria a conta e liga a ficha', async () => {
    expect(await sincronizarConta({ ...base, senha: 'Abcdefgh1234' })).toBeNull()
    expect(m.criarUtilizador).toHaveBeenCalledWith({
      nome: 'Rui', role: 'armazem', senha: 'Abcdefgh1234', email: 'rui@teste.pt', login: undefined,
      colaboradorId: 'c1', telemovel: '912 345 678', fotoPath: undefined,
    })
  })
  it('com login e senha (sem email): cria com colaboradorId', async () => {
    expect(await sincronizarConta({ ...base, email: '', login: 'rui.silva', senha: 'Abcdefgh1234' })).toBeNull()
    expect(m.criarUtilizador).toHaveBeenCalledWith(expect.objectContaining({ login: 'rui.silva', email: undefined, colaboradorId: 'c1' }))
  })
  it('sem conta e conta desligada: não faz nada', async () => {
    expect(await sincronizarConta({ ...base, contaAtiva: false })).toBeNull()
    expect(m.criarUtilizador).not.toHaveBeenCalled()
  })
  it('sem email nem login avisa em vez de falhar', async () => {
    expect(await sincronizarConta({ ...base, email: ' ', senha: 'Abcdefgh1234' }))
      .toBe('Ficha guardada, mas a conta não foi criada: indique email ou utilizador e uma senha.')
    expect(m.criarUtilizador).not.toHaveBeenCalled()
  })
  it('senha curta avisa em vez de falhar', async () => {
    expect(await sincronizarConta({ ...base, senha: 'abc' })).toMatch(/não foi criada/)
    expect(m.criarUtilizador).not.toHaveBeenCalled()
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
    m.criarUtilizador.mockRejectedValueOnce(new Error('Acesso negado'))
    expect(await sincronizarConta({ ...base, senha: 'Abcdefgh1234' })).toMatch(/Ficha guardada.*Acesso negado/)
  })
})
