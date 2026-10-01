import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'

const mocks = vi.hoisted(() => ({
  podeFrota: true,
  entregar: vi.fn(async (_a: unknown) => 'e-novo' as string | null),
  devolver: vi.fn(async (_a: unknown) => 'd-novo' as string | null),
  erro: null as string | null,
  entregas: [] as unknown[],
  viaturas: [
    { id: 'v1', codigo: 'V-01', nome: 'Carrinha 1', marca: 'Ford', modelo: 'Transit', identificacao: 'AA-11-BB', unidade_contador: 'km', estado_operacional: 'LIVRE', km_atual: 1000, condutor_nome: null, condutor_desde: null, obra_nome: null },
    { id: 'v2', codigo: 'V-02', nome: 'Carrinha 2', marca: 'Renault', modelo: 'Master', identificacao: 'CC-22-DD', unidade_contador: 'km', estado_operacional: 'EM_USO', km_atual: 2000, condutor_nome: 'Zé Manel', condutor_desde: '2026-09-20', obra_nome: 'Obra Norte' },
    { id: 'v3', codigo: 'V-03', nome: 'Carrinha 3', marca: 'Fiat', modelo: 'Ducato', identificacao: 'EE-33-FF', unidade_contador: 'km', estado_operacional: 'OFICINA', km_atual: 3000, condutor_nome: null, condutor_desde: null, obra_nome: null },
    { id: 'm1', codigo: 'M-01', nome: 'Retroescavadora', marca: 'JCB', modelo: '3CX', identificacao: null, unidade_contador: 'horas', estado_operacional: 'LIVRE', km_atual: 500, condutor_nome: null, condutor_desde: null, obra_nome: null },
  ] as unknown[],
}))

vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ podeFrota: mocks.podeFrota }) }))
vi.mock('@/features/frota/hooks/useFrota', () => ({
  useResumoFrota: () => ({ viaturas: mocks.viaturas, loading: false, error: null, reload: vi.fn() }),
  useColaboradoresAtivos: () => ({ colaboradores: [{ id: 'c1', nome: 'Ana Silva' }, { id: 'c2', nome: 'Rui Costa' }] }),
}))
vi.mock('@/features/frota/hooks/useEntregas', () => ({
  useEntregas: () => ({ entregas: mocks.entregas, loading: false, error: null, reload: vi.fn() }),
  useObrasAtivas: () => ({ obras: [{ id: 'o1', nome: 'Obra Sul' }], loading: false }),
  useEntregarViatura: () => ({ entregar: mocks.entregar, loading: false, error: mocks.erro }),
  useDevolverViatura: () => ({ devolver: mocks.devolver, loading: false, error: mocks.erro }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { EntregaFormPage } from '@/features/frota/components/EntregaFormPage'

function abrir(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/frota/entregar" element={<EntregaFormPage tipo="ENTREGA" />} />
        <Route path="/frota/devolver" element={<EntregaFormPage tipo="DEVOLUCAO" />} />
        <Route path="/frota/viatura/:id" element={<div>FICHA</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

const grupo = (nome: string) => screen.getByRole('radiogroup', { name: nome })
const escolher = (nome: string, opcao: string) => fireEvent.click(within(grupo(nome)).getByRole('radio', { name: opcao }))

const entregaV2 = {
  id: 'e1', veiculo_id: 'v2', tipo: 'ENTREGA', colaborador_id: 'c1', colaborador_nome: 'Zé Manel', data: '2026-09-20', km: 1900,
  combustivel: 'CHEIO', adblue: 'OK', oleo: 'OK', refrigeracao: 'BAIXO', pneus: 'GASTOS', limpeza: 'OK',
  inventario: { colete: true, triangulo: true }, danos: [{ vista: 'frente', x: 0.2, y: 0.3, nota: 'Amolgadela' }],
  entrega_ref: null,
}

beforeEach(() => { mocks.podeFrota = true; mocks.erro = null; mocks.entregas = []; mocks.entregar.mockClear(); mocks.devolver.mockClear() })
afterEach(cleanup)

describe('Entrega: escolha da viatura', () => {
  it('só as livres são selecionáveis; em uso e oficina desativadas com o motivo', () => {
    abrir('/frota/entregar')
    const livre = screen.getByRole('button', { name: /AA-11-BB/ }) as HTMLButtonElement
    const emUso = screen.getByRole('button', { name: /CC-22-DD/ }) as HTMLButtonElement
    const oficina = screen.getByRole('button', { name: /EE-33-FF/ }) as HTMLButtonElement
    expect(livre.disabled).toBe(false)
    expect(emUso.disabled).toBe(true)
    expect(emUso.textContent).toContain('em uso por Zé Manel')
    expect(oficina.disabled).toBe(true)
    expect(oficina.textContent).toContain('na oficina')
  })

  it('pesquisa por matrícula/modelo e mostra o modelo ao escolher', () => {
    abrir('/frota/entregar')
    fireEvent.change(screen.getByPlaceholderText(/Pesquisar por matrícula/), { target: { value: 'transit' } })
    expect(screen.queryByRole('button', { name: /CC-22-DD/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /AA-11-BB/ }))
    expect(screen.getByText('Modelo: Ford Transit')).toBeTruthy()
    expect((screen.getByLabelText('KM atuais') as HTMLInputElement).value).toBe('1000')
  })

  it('?viatura= pré-seleciona uma livre mas ignora uma em uso', () => {
    abrir('/frota/entregar?viatura=v1')
    expect(screen.getByText('Modelo: Ford Transit')).toBeTruthy()
    cleanup()
    abrir('/frota/entregar?viatura=v2')
    expect(screen.queryByText(/Modelo:/)).toBeNull()
  })

  it('máquina usa horas', () => {
    abrir('/frota/entregar?viatura=m1')
    expect(screen.getByLabelText('Horas atuais')).toBeTruthy()
  })
})

describe('Entrega: validações e envio', () => {
  it('pede a viatura, o condutor, o valor mínimo e o combustível', () => {
    abrir('/frota/entregar')
    const confirmar = () => fireEvent.click(screen.getByRole('button', { name: 'Confirmar e entregar chave' }))
    confirmar()
    expect(screen.getByRole('alert').textContent).toContain('Escolha a viatura')
    fireEvent.click(screen.getByRole('button', { name: /AA-11-BB/ }))
    confirmar()
    expect(screen.getByRole('alert').textContent).toContain('Escolha quem vai conduzir')
    fireEvent.change(screen.getByLabelText('Quem vai conduzir?'), { target: { value: 'c1' } })
    fireEvent.change(screen.getByLabelText('KM atuais'), { target: { value: '900' } })
    confirmar()
    expect(screen.getByRole('alert').textContent).toContain('inferiores ao último registo')
    fireEvent.change(screen.getByLabelText('KM atuais'), { target: { value: '1000' } })
    confirmar()
    expect(screen.getByRole('alert').textContent).toContain('combustível')
    expect(mocks.entregar).not.toHaveBeenCalled()
  })

  it('envia os argumentos certos e vai para a ficha', async () => {
    abrir('/frota/entregar?viatura=v1')
    fireEvent.change(screen.getByLabelText('Para que obra vai? (opcional)'), { target: { value: 'o1' } })
    fireEvent.change(screen.getByLabelText('Quem vai conduzir?'), { target: { value: 'c2' } })
    fireEvent.change(screen.getByLabelText('KM atuais'), { target: { value: '1250,5' } })
    escolher('Combustível', '3/4')
    escolher('AdBlue', 'Baixo')
    escolher('Estado dos pneus', 'Gastos')
    escolher('Limpeza (ext/int)', 'Limpar')
    fireEvent.click(screen.getByLabelText('Adicionar dano — Frente'))
    fireEvent.click(screen.getByRole('switch', { name: 'Colete refletor presente?' }))
    fireEvent.change(screen.getByLabelText('Observações'), { target: { value: ' Riscos ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e entregar chave' }))

    await waitFor(() => expect(mocks.entregar).toHaveBeenCalledTimes(1))
    expect(mocks.entregar.mock.calls[0][0]).toMatchObject({
      veiculoId: 'v1', colaboradorId: 'c2', obraId: 'o1', km: 1250.5,
      combustivel: 'TRES_QUARTOS', adblue: 'BAIXO', oleo: 'NA', refrigeracao: 'NA', pneus: 'GASTOS', limpeza: 'LIMPAR',
      inventario: { colete: true }, danos: [{ vista: 'frente', x: 0.5, y: 0.5 }], observacoes: 'Riscos',
    })
    expect(await screen.findByText('FICHA')).toBeTruthy()
  })

  it('mostra o erro do servidor e fica na página', async () => {
    mocks.entregar.mockResolvedValueOnce(null)
    mocks.erro = '"Carrinha 1" já está em uso por Rui'
    abrir('/frota/entregar?viatura=v1')
    fireEvent.change(screen.getByLabelText('Quem vai conduzir?'), { target: { value: 'c1' } })
    escolher('Combustível', 'Cheio')
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e entregar chave' }))
    await waitFor(() => expect(mocks.entregar).toHaveBeenCalled())
    expect(screen.getByRole('alert').textContent).toContain('já está em uso por Rui')
    expect(screen.queryByText('FICHA')).toBeNull()
  })

  it('sem permissão não mostra o formulário', () => {
    mocks.podeFrota = false
    abrir('/frota/entregar')
    expect(screen.queryByRole('button', { name: 'Confirmar e entregar chave' })).toBeNull()
  })
})

describe('Devolução', () => {
  beforeEach(() => { mocks.entregas = [entregaV2] })

  it('só as em uso são selecionáveis', () => {
    abrir('/frota/devolver')
    expect((screen.getByRole('button', { name: /CC-22-DD/ }) as HTMLButtonElement).disabled).toBe(false)
    const livre = screen.getByRole('button', { name: /AA-11-BB/ }) as HTMLButtonElement
    expect(livre.disabled).toBe(true)
    expect(livre.textContent).toContain('livre')
    expect((screen.getByRole('button', { name: /EE-33-FF/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('pré-preenche a partir da entrega e mostra condutor, obra e danos existentes a cinzento', () => {
    abrir('/frota/devolver?viatura=v2')
    expect(screen.getAllByText('Zé Manel').length).toBeGreaterThan(0)
    expect(screen.getByText(/Obra Norte/)).toBeTruthy()
    expect(screen.getByLabelText('Entrega correspondente').textContent).toContain('Danos já existentes: 1')
    expect(within(grupo('Estado dos pneus')).getByRole('radio', { name: 'Gastos' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('switch', { name: 'Colete refletor presente?' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText(/Amolgadela/)).toBeTruthy()
    expect(screen.queryByLabelText('Remover dano 1')).toBeNull()
    expect(screen.queryByLabelText('Quem vai conduzir?')).toBeNull()
  })

  it('envia existentes + novos e para_oficina', async () => {
    abrir('/frota/devolver?viatura=v2')
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' }))
    expect(screen.getByRole('alert').textContent).toContain('combustível')
    escolher('Combustível', '1/2')
    fireEvent.change(screen.getByLabelText('KM atuais'), { target: { value: '2100' } })
    fireEvent.click(screen.getByLabelText('Adicionar dano — Trás'))
    fireEvent.click(screen.getByRole('switch', { name: 'Enviar para a oficina' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' }))

    await waitFor(() => expect(mocks.devolver).toHaveBeenCalledTimes(1))
    const args = mocks.devolver.mock.calls[0][0] as { danos: unknown[] }
    expect(args).toMatchObject({ veiculoId: 'v2', km: 2100, combustivel: 'METADE', paraOficina: true, pneus: 'GASTOS' })
    expect(args.danos).toEqual([
      { vista: 'frente', x: 0.2, y: 0.3, nota: 'Amolgadela' },
      { vista: 'tras', x: 0.5, y: 0.5 },
    ])
    expect(await screen.findByText('FICHA')).toBeTruthy()
  })
})
