import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route, matchRoutes, useLocation, type RouteObject } from 'react-router'
import { isValidElement } from 'react'

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), auth: { onAuthStateChange: vi.fn(), getSession: vi.fn() } } }))

import { router } from '@/app/routes'
import { Redirecionar } from '@/app/components/Redirecionar'

const rotas = router.routes as RouteObject[]

function folha(caminho: string): RouteObject | undefined {
  const m = matchRoutes(rotas, caminho)
  return m?.[m.length - 1].route
}

function Local() {
  const l = useLocation()
  return <p data-testid="local">{l.pathname}{l.search}</p>
}

// Resolve um endereço antigo como o router faz: aplica o redirect da rota que corresponde
function destino(origem: string): string {
  const rota = folha(origem)
  expect(rota, `sem rota para ${origem}`).toBeDefined()
  expect(isValidElement(rota!.element) && rota!.element.type === Redirecionar, `${origem} devia ser um redirect`).toBe(true)
  const padrao = rota!.path!.startsWith('/') ? rota!.path! : `/${rota!.path}`
  render(
    <MemoryRouter initialEntries={[origem]}>
      <Routes>
        <Route path={padrao} element={rota!.element} />
        <Route path="*" element={<Local />} />
      </Routes>
    </MemoryRouter>,
  )
  return screen.getByTestId('local').textContent ?? ''
}

afterEach(cleanup)

describe('endereços antigos redirecionam para o módulo Obras (desenho §2)', () => {
  it.each([
    ['/subempreiteiros', '/obras/subempreitadas'],
    ['/subempreiteiros/novo', '/obras/subempreitada/novo'],
    ['/subempreiteiros/abc-1', '/obras/subempreitada/abc-1'],
    ['/subempreiteiros/abc-1/editar', '/obras/subempreitada/abc-1/editar'],
    ['/subempreiteiros/s9/autos/novo', '/obras/subempreitada/s9/auto/novo'],
    ['/autos/a7', '/obras/auto/a7'],
    ['/autos/a7/editar', '/obras/auto/a7/editar'],
    ['/autos/a7/pdf', '/obras/auto/a7/pdf'],
  ])('%s → %s', (origem, esperado) => {
    expect(destino(origem)).toBe(esperado)
  })

  it('mantém a query (?obra=)', () => {
    expect(destino('/subempreiteiros?obra=o1')).toBe('/obras/subempreitadas?obra=o1')
  })
})

describe('as rotas novas do desenho existem e não caem no 404', () => {
  it.each([
    '/obras', '/obras/lista', '/obras/relatorios', '/obras/subempreitadas', '/obras/nova',
    '/obras/o1', '/obras/o1/editar', '/obras/o1/custos', '/obras/o1/livro', '/obras/o1/guias', '/obras/o1/relatorio',
    '/obras/o1/relatorio-diario/novo', '/obras/relatorio-diario/r1',
    '/obras/subempreitada/novo', '/obras/subempreitada/s1', '/obras/subempreitada/s1/editar', '/obras/subempreitada/s1/auto/novo',
    '/obras/auto/a1', '/obras/auto/a1/editar', '/obras/auto/a1/pdf',
  ])('%s', caminho => {
    const rota = folha(caminho)
    expect(rota).toBeDefined()
    expect(rota!.path).not.toBe('*')
    expect(isValidElement(rota!.element) && rota!.element.type === Redirecionar).toBe(false)
  })

  it('as rotas estáticas ganham a /obras/:id', () => {
    expect(folha('/obras/lista')?.path).toBe('lista')
    expect(folha('/obras/relatorios')?.path).toBe('relatorios')
    expect(folha('/obras/subempreitadas')?.path).toBe('subempreitadas')
    expect(folha('/obras/nova')?.path).toBe('obras/nova')
    expect(folha('/obras/abc')?.path).toBe('obras/:id')
  })

  it('o painel é o índice do layout e o PDF do auto fica fora do layout', () => {
    const painel = matchRoutes(rotas, '/obras')!
    expect(painel.map(r => r.route.path)).toContain('obras')
    expect(painel[painel.length - 1].route.index).toBe(true)
    const pdf = matchRoutes(rotas, '/obras/auto/a1/pdf')!
    expect(pdf.map(r => r.route.path)).not.toContain('/')
    const fin = matchRoutes(rotas, '/obras/o1/relatorio')!
    expect(fin.map(r => r.route.path)).not.toContain('/')
  })
})
