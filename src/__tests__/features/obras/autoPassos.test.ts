import { describe, expect, it, vi } from 'vitest'

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }))

import { passoAtual, proximoPasso, type ContextoPassos } from '@/features/obras/components/subempreitadas/auto/AutoPassos'
import { acumuladoOutrosAutos, caminhoFatura, hashSha256 } from '@/features/obras/lib/autoDados'
import { textoLocal } from '@/features/obras/components/subempreitadas/auto/EvidenciaCapture'

const ctx = (p: Partial<ContextoPassos> = {}): ContextoPassos => ({
  workflow: 'rascunho', temFatura: false, pago: false, exigirFatura: true, role: 'medicoes',
  errosSubmissao: [], verificacaoIniciada: false, itensPendentes: 0, evidenciasValidas: 0, minFotos: 2,
  certificado: 100, alcada: 'gestor', alcadaLimite: 10000, docsEmFalta: null, bloqueiosPagamento: [], ...p,
})

describe('passoAtual', () => {
  it('segue o workflow até à aprovação e depois fatura e pagamento', () => {
    expect(passoAtual('rascunho', false, false)).toBe('rascunho')
    expect(passoAtual('submetido', false, false)).toBe('submetido')
    expect(passoAtual('verificado', true, false)).toBe('verificado')
    expect(passoAtual('validado', false, false)).toBe('aprovado')
    expect(passoAtual('validado', true, false)).toBe('faturado')
    expect(passoAtual('validado', true, true)).toBe('pago')
    expect(passoAtual('validado', false, true)).toBe('pago')
  })
})

describe('proximoPasso', () => {
  it('rascunho: erros de submissão e papel', () => {
    expect(proximoPasso(ctx()).bloqueios).toEqual([])
    expect(proximoPasso(ctx({ errosSubmissao: ['O auto não tem linhas.'] })).bloqueios).toEqual(['O auto não tem linhas.'])
    expect(proximoPasso(ctx({ role: 'leitura' })).bloqueios[0]).toMatch(/Só a equipa de medições/)
    expect(proximoPasso(ctx({ role: null })).bloqueios).toHaveLength(1)
    expect(proximoPasso(ctx()).acao).toBe('Submeter para verificação')
  })

  it('submetido: ficha e fotografias', () => {
    expect(proximoPasso(ctx({ workflow: 'submetido' })).bloqueios[0]).toBe('Falta iniciar a ficha de verificação.')
    const b = proximoPasso(ctx({ workflow: 'submetido', verificacaoIniciada: true, itensPendentes: 3, evidenciasValidas: 1 })).bloqueios
    expect(b[0]).toBe('Faltam 3 itens da ficha de verificação.')
    expect(b[1]).toMatch(/pelo menos 2 fotografias válidas .*há 1/)
    expect(proximoPasso(ctx({ workflow: 'submetido', verificacaoIniciada: true, evidenciasValidas: 2 })).bloqueios).toEqual([])
    expect(proximoPasso(ctx({ workflow: 'submetido', verificacaoIniciada: true, evidenciasValidas: 2, role: 'armazem' })).bloqueios).toHaveLength(1)
  })

  it('verificado: certificado, papel, alçada e documentos', () => {
    expect(proximoPasso(ctx({ workflow: 'verificado', role: 'gestor' })).bloqueios).toEqual([])
    expect(proximoPasso(ctx({ workflow: 'verificado', role: 'gestor', certificado: 0 })).bloqueios[0]).toMatch(/superior a 0/)
    expect(proximoPasso(ctx({ workflow: 'verificado', role: 'medicoes' })).bloqueios[0]).toMatch(/gestor ou pelo administrador/)
    expect(proximoPasso(ctx({ workflow: 'verificado', role: 'gestor', alcada: 'admin' })).bloqueios[0]).toMatch(/só o administrador aprova/)
    expect(proximoPasso(ctx({ workflow: 'verificado', role: 'admin', alcada: 'admin' })).bloqueios).toEqual([])
    expect(proximoPasso(ctx({ workflow: 'verificado', role: 'admin', docsEmFalta: 'Documentos em falta.' })).bloqueios[0]).toMatch(/com exceção/)
    expect(proximoPasso(ctx({ workflow: 'verificado' })).notas[0]).toMatch(/Quem criou o auto não o pode aprovar/)
  })

  it('aprovado: fatura, pagamento e pago', () => {
    const semFatura = proximoPasso(ctx({ workflow: 'validado', role: 'gestor' }))
    expect(semFatura.acao).toBe('Guardar a fatura')
    expect(semFatura.bloqueios[0]).toMatch(/o ERP não emite faturas/)
    expect(proximoPasso(ctx({ workflow: 'validado', role: 'medicoes' })).bloqueios).toHaveLength(2)
    const naoExige = proximoPasso(ctx({ workflow: 'validado', role: 'gestor', exigirFatura: false }))
    expect(naoExige.acao).toBe('Pagar')
    expect(naoExige.bloqueios).toEqual([])
    const bloqueado = proximoPasso(ctx({ workflow: 'validado', role: 'gestor', temFatura: true, bloqueiosPagamento: ['X'] }))
    expect(bloqueado.bloqueios).toEqual(['X'])
    expect(bloqueado.notas[0]).toMatch(/administrador pode pagar com exceção/)
    expect(proximoPasso(ctx({ workflow: 'validado', role: 'leitura', temFatura: true })).bloqueios[0]).toMatch(/regista o pagamento/)
    expect(proximoPasso(ctx({ workflow: 'validado', temFatura: true, pago: true })).acao).toBeNull()
  })
})

describe('autoDados (puro)', () => {
  it('acumulado conta só autos submetidos/verificados/validados e ignora extras e o próprio', () => {
    const l = (itemId: string | undefined, quantity: number, isExtra = false) => ({ itemId, quantity, isExtra })
    const mapa = acumuladoOutrosAutos([
      { id: 'a', workflow: 'validado', lines: [l('x', 10), l('y', 1)] },
      { id: 'b', workflow: 'submetido', lines: [l('x', 5)] },
      { id: 'c', workflow: 'verificado', lines: [l('x', 2), l(undefined, 9, true)] },
      { id: 'd', workflow: 'rascunho', lines: [l('x', 100)] },
      { id: 'e', workflow: 'validado', lines: [l('x', 1000)] },
      { id: 'f', workflow: 'validado' },
    ], 'e')
    expect(mapa).toEqual({ x: 17, y: 1 })
  })

  it('caminho da fatura no bucket privado', () => {
    expect(caminhoFatura('sub-1', 'application/pdf', 123)).toEqual({ caminho: 'sub-1/fatura-123.pdf', contentType: 'application/pdf' })
    expect(caminhoFatura('sub-1', 'image/jpeg', 5)?.caminho).toBe('sub-1/fatura-5.jpg')
    expect(caminhoFatura('sub-1', 'text/plain')).toBeNull()
  })

  it('SHA-256 em hexadecimal', async () => {
    const blob = new Blob(['abc'])
    expect(await hashSha256(blob)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('texto da localização', () => {
    expect(textoLocal({ dentro: true, distancia: 12.4 })).toBe('Dentro da obra ✓ (12 m)')
    expect(textoLocal({ dentro: true, distancia: null })).toBe('Dentro da obra ✓')
    expect(textoLocal({ dentro: false, distancia: 1500 })).toMatch(/^Fora ✗ \(1.?500 m\)$/)
    expect(textoLocal({ dentro: false, distancia: null })).toBe('Fora ✗ (?)')
    expect(textoLocal({ dentro: null, distancia: null })).toBe('Localização da obra não comparada')
  })
})
