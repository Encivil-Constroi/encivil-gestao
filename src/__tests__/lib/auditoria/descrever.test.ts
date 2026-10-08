import { describe, it, expect } from 'vitest'
import { camposAlterados, descreverRegisto, nomeDoAlvo, limitesPeriodo, inicioDiaLisboa } from '@/app/lib/auditoria/descrever'

const upd = { id: '1', action: 'profiles.update', actor_id: 'a', created_at: '2026-10-08T10:00:00Z',
  target_id: 'u2', details: { role: { antes: 'armazem', depois: 'gestor' }, nome: { antes: 'Rui', depois: 'Rui Silva' } } }

describe('descrever auditoria', () => {
  it('update: campos e frase', () => {
    expect(camposAlterados(upd.action, upd.details)).toEqual([
      { campo: 'nome', rotulo: 'Nome', antes: 'Rui', depois: 'Rui Silva' },
      { campo: 'role', rotulo: 'Papel', antes: 'Armazém', depois: 'Gestor' },
    ])
    expect(descreverRegisto(upd, 'Ana', 'Rui Silva')).toBe('Ana alterou o utilizador Rui Silva (Nome, Papel)')
  })
  it('delete e nome do alvo', () => {
    const del = { ...upd, action: 'faturas_fornecedor.delete', details: { id: 'f', numero_fatura: 'FT 123', fornecedor: 'X' } }
    expect(nomeDoAlvo(del, new Map())).toBe('FT 123')
    expect(descreverRegisto(del, 'Ana', 'FT 123')).toBe('Ana eliminou a fatura de fornecedor FT 123')
  })
  it('insert oculta id e formata booleanos', () => {
    const ins = { ...upd, action: 'obras.insert', details: { id: 'o', nome: 'Escola X', ativo: true } }
    expect(descreverRegisto(ins, 'Rui', 'Escola X')).toBe('Rui criou a obra Escola X')
    expect(camposAlterados(ins.action, ins.details).find(c => c.campo === 'id')).toBeUndefined()
    expect(camposAlterados(ins.action, ins.details).find(c => c.campo === 'ativo')?.depois).toBe('Sim')
  })
  it('nome do alvo vem dos perfis quando existe', () => {
    expect(nomeDoAlvo(upd, new Map([['u2', 'Rui Silva']]))).toBe('Rui Silva')
  })
  it('NIF nunca mostra o valor', () => {
    const c = camposAlterados('colaboradores.update', { nif: { antes: '123', depois: '456' } })
    expect(c[0]).toMatchObject({ antes: '(alterado)', depois: '(alterado)' })
  })
  it('registos antigos e details nulo', () => {
    const antigo = { ...upd, action: 'role_change', details: null }
    expect(descreverRegisto(antigo, 'Ana', null)).toBe('Ana: Alteração de papel')
    expect(camposAlterados('role_change', null)).toEqual([])
    expect(camposAlterados('obras.update', null)).toEqual([])
  })
  it('período em Lisboa (verão e inverno)', () => {
    expect(limitesPeriodo('hoje', new Date('2026-07-01T23:30:00Z'))).toEqual({ desde: '2026-07-01T23:00:00.000Z' })
    expect(limitesPeriodo('hoje', new Date('2026-01-10T10:00:00Z'))).toEqual({ desde: '2026-01-10T00:00:00.000Z' })
    expect(limitesPeriodo('todos')).toEqual({})
    expect(inicioDiaLisboa('2026-10-01')).toBe('2026-09-30T23:00:00.000Z')
  })
  it('eliminação antiga (delete_<tabela>) mostra campos, frase e oculta NIF', () => {
    const del = { ...upd, action: 'delete_autos_medicao', target_id: 'x',
      details: { id: 'a1', numero: 3, obra_id: 'o1', valor_total: 1200, nif: '123456789', foto_path: 'p' } }
    const c = camposAlterados(del.action, del.details)
    expect(c.find(x => x.campo === 'numero')).toMatchObject({ antes: '3', depois: '—' })
    expect(c.find(x => x.campo === 'nif')).toMatchObject({ antes: '(alterado)', depois: '—' })
    expect(c.find(x => x.campo === 'id' || x.campo === 'foto_path')).toBeUndefined()
    expect(nomeDoAlvo(del, new Map())).toBe('nº 3')
    expect(descreverRegisto(del, 'Ana', 'nº 3')).toBe('Ana eliminou o auto de medição nº 3')
    expect(descreverRegisto({ ...del, action: 'delete_subempreiteiros' }, 'Ana', 'Construções X'))
      .toBe('Ana eliminou o subempreiteiro Construções X')
    expect(descreverRegisto({ ...del, action: 'delete_comb_abastecimentos' }, 'Ana', null)).toBe('Ana eliminou o abastecimento')
    expect(descreverRegisto({ ...del, action: 'delete_outra' }, 'Ana', null)).toBe('Ana: Eliminação (outra)')
  })
  it('ações antigas com detalhes (role_change, auto_*) listam os campos', () => {
    expect(camposAlterados('role_change', { novo_role: 'gestor' })).toEqual([
      { campo: 'novo_role', rotulo: 'Novo papel', antes: '—', depois: 'Gestor' },
    ])
    expect(camposAlterados('auto_devolver', { motivo: 'Falta medição' })[0]).toMatchObject({ rotulo: 'Motivo', depois: 'Falta medição' })
    expect(camposAlterados('validar_auto', { nif: '1' })[0]).toMatchObject({ depois: '(alterado)' })
  })
})
