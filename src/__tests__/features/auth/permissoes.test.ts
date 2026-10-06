import { describe, it, expect } from 'vitest'
import {
  PERMISSOES_INICIAIS, alternarPermissao, papelDasPermissoes, permissoesDoPapel,
} from '@/features/auth/lib/permissoes'
import type { RoleUtilizador } from '@/features/auth/AuthContext'

describe('permissões ↔ papel', () => {
  it('cada papel faz ida e volta sem mudar', () => {
    const papeis: RoleUtilizador[] = ['admin', 'gestor', 'armazem', 'mecanico', 'motorista', 'medicoes', 'leitura']
    for (const p of papeis) expect(papelDasPermissoes(permissoesDoPapel(p), p)).toBe(p)
  })
  it('por omissão é só leitura', () => {
    expect(papelDasPermissoes(PERMISSOES_INICIAIS)).toBe('leitura')
  })
  it('Frota → mecânico; Armazém ou Combustível → armazém; Frota + Armazém → gestor', () => {
    const frota = alternarPermissao(PERMISSOES_INICIAIS, 'gestorFrota')
    expect(papelDasPermissoes(frota)).toBe('mecanico')
    expect(papelDasPermissoes(alternarPermissao(PERMISSOES_INICIAIS, 'gestorCombustivel'))).toBe('armazem')
    expect(papelDasPermissoes(alternarPermissao(frota, 'gestorArmazem'))).toBe('gestor')
  })
  it('administrador liga tudo; apenas leitura desliga tudo', () => {
    const admin = alternarPermissao(PERMISSOES_INICIAIS, 'administrador')
    expect(papelDasPermissoes(admin)).toBe('admin')
    expect(admin.gestorFrota && admin.gestorArmazem && admin.gestorCombustivel && !admin.apenasLeitura).toBe(true)
    const leitura = alternarPermissao(admin, 'apenasLeitura')
    expect(papelDasPermissoes(leitura)).toBe('leitura')
    expect(leitura.administrador || leitura.gestorFrota).toBe(false)
  })
  it('desligar o último interruptor volta a só leitura; relatórios não se editam', () => {
    const frota = alternarPermissao(PERMISSOES_INICIAIS, 'gestorFrota')
    expect(frota.verRelatorios).toBe(false)
    expect(alternarPermissao(frota, 'verRelatorios')).toBe(frota)
    expect(alternarPermissao(frota, 'gestorFrota').apenasLeitura).toBe(true)
  })
  it('motorista é exclusivo', () => {
    const m = alternarPermissao(alternarPermissao(PERMISSOES_INICIAIS, 'gestorFrota'), 'motorista')
    expect(papelDasPermissoes(m)).toBe('motorista')
    expect(m.gestorFrota).toBe(false)
  })
  it('papel medições mantém-se se nada mudar', () => {
    expect(papelDasPermissoes(permissoesDoPapel('medicoes'), 'medicoes')).toBe('medicoes')
  })
})
