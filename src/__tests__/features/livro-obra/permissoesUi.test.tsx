import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ROLES_ESCRITA_LIVRO_OBRA } from '@/features/livro-obra/lib/permissoes'

const m = vi.hoisted(() => ({ role: 'admin' as string | null }))
vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ role: m.role }) }))
vi.mock('@/features/obras/hooks/useObras', () => ({ useObra: () => ({ obra: { id: 'o1', name: 'Obra X' }, loading: false }) }))
const registo = { id: 'r1', obraId: 'o1', data: '2026-10-01', categoria: 'OCORRENCIA', descricao: 'Teste', fotoKeys: [], autorId: 'u1', createdAt: '2026-10-01T10:00:00Z' }
const guia = { id: 'g1', numero: 'GT-0001', obraId: 'o1', viaturaId: null, motoristaId: null, origem: null, destino: null, dataCarga: '2026-10-01', estado: 'EMITIDA', linhas: [], createdAt: '2026-10-01T10:00:00Z' }
vi.mock('@/features/livro-obra/hooks/useLivroObra', () => ({
  useLivroObra: () => ({ registos: [registo], loading: false, error: null, reload: vi.fn() }),
  useRegistarOcorrencia: () => ({ registar: vi.fn(), loading: false }),
  useEditarRegisto: () => ({ editar: vi.fn(), loading: false }),
}))
vi.mock('@/features/livro-obra/hooks/useCriarGuia', () => ({
  useGuias: () => ({ guias: [guia], loading: false, error: null, reload: vi.fn() }),
  useCriarGuia: () => ({ criar: vi.fn(), loading: false }),
  useActualizarEstadoGuia: () => ({ actualizar: vi.fn() }),
}))
import { LivroObraPage } from '@/features/livro-obra/components/LivroObraPage'
import { GuiasTransportePage } from '@/features/livro-obra/components/GuiasTransportePage'

afterEach(cleanup)
const ver = (el: React.ReactElement) => render(
  <MemoryRouter initialEntries={['/obras/o1']}><Routes><Route path="/obras/:id" element={el} /></Routes></MemoryRouter>)

describe('permissões de escrita do livro de obra e das guias', () => {
  it('lista de papéis espelha a RLS', () => {
    expect([...ROLES_ESCRITA_LIVRO_OBRA]).toEqual(['admin', 'gestor', 'armazem', 'medicoes'])
  })

  it.each(['admin', 'gestor', 'armazem', 'medicoes'])('%s vê Novo Registo e Emitir Guia', role => {
    m.role = role
    ver(<LivroObraPage />)
    expect(screen.getByText('Novo Registo')).toBeTruthy()
    cleanup()
    ver(<GuiasTransportePage />)
    expect(screen.getByText('Emitir Guia')).toBeTruthy()
    expect(screen.getByText('Entregue')).toBeTruthy()
    expect(screen.getByText('Anular')).toBeTruthy()
  })

  it.each(['leitura', 'mecanico', 'motorista', null])('%s não vê botões de escrita', role => {
    m.role = role
    ver(<LivroObraPage />)
    expect(screen.queryByText('Novo Registo')).toBeNull()
    expect(screen.getByText('Teste')).toBeTruthy()
    cleanup()
    ver(<GuiasTransportePage />)
    expect(screen.queryByText('Emitir Guia')).toBeNull()
    expect(screen.queryByText('Entregue')).toBeNull()
    expect(screen.queryByText('Anular')).toBeNull()
    expect(screen.getByText('GT-0001')).toBeTruthy()
  })
})
