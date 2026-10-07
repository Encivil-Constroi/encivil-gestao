import { describe, it, expect } from 'vitest'
import type { RoleUtilizador } from '@/features/auth/AuthContext'
import { secoesDoInicio, atalhosDoInicio, ehPainelExecutivo, saudacao, rotuloDoPapel, type CapacidadesInicio } from '@/app/pages/inicio/secoes'

// Espelha MATRIZ_ESCRITA de useRole.ts
const ESCRITA: Record<RoleUtilizador, { armazem: boolean; frota: boolean; obras: boolean; subs: boolean }> = {
  admin:     { armazem: true,  frota: true,  obras: true,  subs: true },
  gestor:    { armazem: true,  frota: true,  obras: true,  subs: true },
  armazem:   { armazem: true,  frota: false, obras: false, subs: false },
  medicoes:  { armazem: false, frota: false, obras: false, subs: true },
  mecanico:  { armazem: false, frota: true,  obras: false, subs: false },
  motorista: { armazem: false, frota: false, obras: false, subs: false },
  leitura:   { armazem: false, frota: false, obras: false, subs: false },
}

function caps(role: RoleUtilizador | null, extra: Partial<CapacidadesInicio> = {}): CapacidadesInicio {
  const e = role ? ESCRITA[role] : { armazem: false, frota: false, obras: false, subs: false }
  return {
    role, podeArmazem: e.armazem, podeFrota: e.frota, podeCombustivel: e.armazem, podeObras: e.obras,
    podeSubempreitadas: e.subs, podeAprovar: false, temVeiculo: false, ...extra,
  }
}

describe('secoesDoInicio', () => {
  it.each([
    ['gestor', ['frota', 'armazem', 'combustivel', 'obras']],
    ['armazem', ['armazem', 'combustivel']],
    ['mecanico', ['frota']],
    ['medicoes', ['obras']],
    ['motorista', ['veiculo']],
    ['leitura', ['consulta']],
  ] as const)('%s vê só as suas secções', (role, esperado) => {
    expect(secoesDoInicio(caps(role))).toEqual(esperado)
  })

  it('o administrador não tem painel pessoal (tem o Dashboard do CEO)', () => {
    expect(secoesDoInicio(caps('admin'))).toEqual([])
    expect(ehPainelExecutivo('admin')).toBe(true)
    for (const r of ['gestor', 'armazem', 'medicoes', 'mecanico', 'motorista', 'leitura'] as const) {
      expect(ehPainelExecutivo(r)).toBe(false)
    }
  })

  it('sem papel (perfil por carregar) não mostra nada', () => {
    expect(secoesDoInicio(caps(null))).toEqual([])
    expect(atalhosDoInicio(caps(null))).toEqual([])
  })

  it('quem tem carro atribuído ganha a secção do veículo, à frente das outras', () => {
    expect(secoesDoInicio(caps('leitura', { temVeiculo: true }))).toEqual(['veiculo', 'consulta'])
    expect(secoesDoInicio(caps('mecanico', { temVeiculo: true }))).toEqual(['veiculo', 'frota'])
  })

  it('o motorista vê sempre a secção do veículo (sem carro, mostra o estado vazio)', () => {
    expect(secoesDoInicio(caps('motorista', { temVeiculo: false }))).toEqual(['veiculo'])
  })

  it('o aprovador designado vê os pedidos de combustível', () => {
    expect(secoesDoInicio(caps('medicoes', { podeAprovar: true }))).toEqual(['combustivel', 'obras'])
  })
})

describe('atalhosDoInicio', () => {
  const alvos = (c: CapacidadesInicio) => atalhosDoInicio(c).map(a => a.to)

  it('armazém: saída, entrada e pedir combustível', () => {
    expect(alvos(caps('armazem'))).toEqual(['/armazem/movimento/saida', '/armazem/movimento/entrada', '/abastecimento/pedir'])
  })
  it('mecânico: só frota (está isolado dos outros módulos)', () => {
    expect(alvos(caps('mecanico'))).toEqual(['/frota/entregar', '/frota/devolver', '/frota/manutencao/nova'])
  })
  it('motorista: só pedir combustível', () => {
    expect(alvos(caps('motorista'))).toEqual(['/abastecimento/pedir'])
  })
  it('leitura: nenhum atalho de escrita', () => {
    expect(alvos(caps('leitura', { temVeiculo: true }))).toEqual([])
  })
})

describe('texto', () => {
  it('saudação por hora', () => {
    expect([saudacao(7), saudacao(14), saudacao(22)]).toEqual(['Bom dia', 'Boa tarde', 'Boa noite'])
  })
  it('rótulo do papel', () => {
    expect(rotuloDoPapel('gestor')).toBe('Encarregado')
    expect(rotuloDoPapel(null)).toBe('Colaborador')
  })
})
