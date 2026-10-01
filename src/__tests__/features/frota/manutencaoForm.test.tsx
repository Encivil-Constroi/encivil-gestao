import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import { invalidateCache } from '@/app/lib/useAsync'
import type { ItemCatalogoRow, Categoria, Natureza } from '@/features/frota/db'

const mocks = vi.hoisted(() => ({
  role: 'mecanico' as string,
  registar: vi.fn(async (_a: Record<string, unknown>) => 'nova-id' as string),
  editar: vi.fn(async () => true as const),
  contexto: {} as Record<string, unknown>,
  paraEditar: null as unknown,
  carregarContexto: vi.fn(),
}))

vi.mock('@/features/auth/useRole', () => ({
  useRole: () => ({ role: mocks.role, isAdmin: mocks.role === 'admin', podeFrota: ['admin', 'gestor', 'mecanico'].includes(mocks.role) }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const viaturas = [
  { id: 'v1', nome: 'Carrinha 1', identificacao: '00-AA-00', marca: 'Renault', modelo: 'Master', tipo: 'viatura' },
  { id: 'v2', nome: 'Grua', identificacao: '11-BB-11', marca: null, modelo: null, tipo: 'maquina' },
]
let seq = 0
function item(o: Partial<ItemCatalogoRow> & { categoria: Categoria; natureza: Natureza; rotulo: string }): ItemCatalogoRow {
  seq++
  return {
    id: `i${seq}`, chave: `k${seq}`, intervalo_km_padrao: null, intervalo_meses_padrao: null,
    limiar_atencao_km: 2000, limiar_urgente_km: 500, limiar_atencao_dias: 30, limiar_urgente_dias: 7,
    ordem: seq, ativo: true, criado_por: null, criado_em: '', atualizado_em: '', ...o,
  }
}
const luzes  = item({ categoria: 'INSPECAO_RAPIDA', natureza: 'CHECKLIST', rotulo: 'Luzes' })
const oleo   = item({ categoria: 'REVISAO_PERIODICA', natureza: 'MANUTENCAO', rotulo: 'Óleo', intervalo_km_padrao: 15000, intervalo_meses_padrao: 12 })
const seguro = item({ categoria: 'OBRIGACAO_LEGAL', natureza: 'MANUTENCAO', rotulo: 'Seguro', intervalo_meses_padrao: 12 })
const catalogo = [luzes, oleo, seguro]

vi.mock('@/features/frota/hooks/useFrota', () => ({
  useResumoFrota: () => ({ viaturas, loading: false, error: null, reload: vi.fn() }),
  useCatalogo: () => ({ catalogo, loading: false, error: null, reload: vi.fn() }),
}))
vi.mock('@/features/frota/services/frotaService', () => ({ registarManutencao: mocks.registar }))
vi.mock('@/features/frota/services/manutencaoService', () => ({
  carregarContextoViatura: (id: string) => mocks.carregarContexto(id),
  carregarManutencao: async () => mocks.paraEditar,
  editarManutencao: mocks.editar,
}))

import { toast } from 'sonner'
import { ManutencaoFormPage } from '@/features/frota/components/ManutencaoFormPage'

const hoje = () => {
  const d = new Date(); const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const clicar = (el: Element) => act(async () => { fireEvent.click(el) })
const gravar = () => clicar(screen.getByRole('button', { name: /Gravar \d* ?intervenç|Guardar correção/ }))

function abrir(caminho: string) {
  render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="/frota/manutencao/nova" element={<ManutencaoFormPage />} />
        <Route path="/frota/manutencao/:id/editar" element={<ManutencaoFormPage />} />
        <Route path="/frota/manutencao" element={<p>HISTORICO</p>} />
        <Route path="/frota/viatura/:id" element={<p>FICHA</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function escolherViatura(rotulo: RegExp) {
  const campo = screen.getByRole('combobox', { name: /Matrícula/ })
  await act(async () => { fireEvent.focus(campo) })
  await clicar(screen.getByRole('option', { name: rotulo }))
}
const marcar = (rotulo: string) => clicar(screen.getByRole('checkbox', { name: rotulo }))
const outroTrabalho = () => clicar(screen.getByRole('button', { name: /Outro trabalho/ }))

beforeEach(() => {
  invalidateCache('frota-*')
  mocks.role = 'mecanico'
  mocks.registar.mockClear()
  mocks.editar.mockClear()
  vi.mocked(toast.error).mockClear()
  mocks.carregarContexto.mockReset().mockImplementation(async (id: string) => ({
    viatura: id === 'v1'
      ? { id: 'v1', nome: 'Carrinha 1', marca: 'Renault', modelo: 'Master', identificacao: '00-AA-00', tipo: 'viatura', unidade_contador: 'km', data_ultima_revisao: '2026-03-12', km_ultima_revisao: 120000 }
      : { id: 'v2', nome: 'Grua', marca: null, modelo: null, identificacao: '11-BB-11', tipo: 'maquina', unidade_contador: 'horas', data_ultima_revisao: null, km_ultima_revisao: null },
    kmAtual: id === 'v1' ? 125000 : 900,
    itens: [],
  }))
})
afterEach(cleanup)

describe('ManutencaoFormPage — registar', () => {
  it('ao escolher a viatura mostra a última revisão e a leitura atual', async () => {
    abrir('/frota/manutencao/nova')
    await escolherViatura(/00-AA-00/)
    const ponto = await screen.findByLabelText('Ponto de partida')
    expect(ponto).toHaveTextContent('12/03/2026')
    expect(ponto).toHaveTextContent(/120\D?000 km/)
    expect(ponto).toHaveTextContent(/125\D?000 km/)
  })

  it('máquina sem revisão: "sem revisão registada" e horas', async () => {
    abrir('/frota/manutencao/nova')
    await escolherViatura(/11-BB-11/)
    const ponto = await screen.findByLabelText('Ponto de partida')
    expect(ponto).toHaveTextContent('sem revisão registada')
    expect(ponto).toHaveTextContent(/900 h/)
    expect(screen.getAllByText(/Horas atuais/).length).toBe(2)
  })

  it('a viatura vem pré-escolhida do link e a lista só tem itens de manutenção, todos marcáveis', async () => {
    abrir('/frota/manutencao/nova?viatura=v1')
    expect(await screen.findByLabelText('Ponto de partida')).toBeInTheDocument()
    const caixas = screen.getAllByRole('checkbox').map(c => c.closest('label')?.textContent)
    expect(caixas).toEqual(expect.arrayContaining(['Óleo', 'Seguro']))
    expect(caixas).not.toContain('Luzes')
    expect(screen.getByRole('button', { name: /Outro trabalho/ })).toBeInTheDocument()
  })

  it('sem viatura ou sem tipo não grava', async () => {
    abrir('/frota/manutencao/nova')
    await gravar()
    expect(toast.error).toHaveBeenLastCalledWith('Escolha a viatura ou máquina.')
    await escolherViatura(/00-AA-00/)
    await gravar()
    expect(toast.error).toHaveBeenLastCalledWith('Escolha pelo menos um tipo de manutenção.')
    expect(mocks.registar).not.toHaveBeenCalled()
  })

  it('item com prazo em km exige os km; data futura é recusada', async () => {
    abrir('/frota/manutencao/nova?viatura=v1')
    await screen.findByLabelText('Ponto de partida')
    await marcar('Óleo')
    await gravar()
    expect(toast.error).toHaveBeenLastCalledWith('Indique os km: este item tem prazo em km.')
    fireEvent.change(screen.getByLabelText(/Data da intervenção/), { target: { value: '2999-01-01' } })
    await gravar()
    expect(toast.error).toHaveBeenLastCalledWith('A data da intervenção não pode ser futura.')
    expect(mocks.registar).not.toHaveBeenCalled()
  })

  it('avisa (sem bloquear) quando os km são menores que a última leitura', async () => {
    abrir('/frota/manutencao/nova?viatura=v1')
    await screen.findByLabelText('Ponto de partida')
    fireEvent.change(screen.getByPlaceholderText(/Última leitura/), { target: { value: '100' } })
    expect(screen.getByRole('alert')).toHaveTextContent(/menos do que a última leitura/)
  })

  it('grava com os argumentos certos (tipo do catálogo, vírgula decimal, recomeça o prazo)', async () => {
    abrir('/frota/manutencao/nova?viatura=v1')
    await screen.findByLabelText('Ponto de partida')
    await marcar('Óleo')
    fireEvent.change(screen.getByPlaceholderText(/Última leitura/), { target: { value: '126000' } })
    fireEvent.change(screen.getByLabelText('Custo — Óleo'), { target: { value: '85,50' } })
    fireEvent.change(screen.getByPlaceholderText(/Polo 2/), { target: { value: ' Polo 2 ' } })
    await gravar()
    expect(mocks.registar).toHaveBeenCalledWith({
      veiculoId: 'v1', itemId: oleo.id, descricao: null, data: hoje(), km: 126000, custo: 85.5,
      oficina: 'Polo 2', observacoes: null, atualizaProxima: true, proximaData: null,
    })
    expect(await screen.findByText('FICHA')).toBeInTheDocument()    // veio da ficha da viatura
  })

  it('"Outro" exige descrição e nunca mexe em prazos', async () => {
    abrir('/frota/manutencao/nova')
    await escolherViatura(/00-AA-00/)
    await screen.findByLabelText('Ponto de partida')
    await outroTrabalho()
    await gravar()
    expect(toast.error).toHaveBeenLastCalledWith('Descreva o trabalho feito.')
    fireEvent.change(screen.getByLabelText('Outro trabalho 1'), { target: { value: 'Lâmpada do farol' } })
    await gravar()
    expect(mocks.registar).toHaveBeenCalledWith(expect.objectContaining({
      veiculoId: 'v1', itemId: null, descricao: 'Lâmpada do farol', atualizaProxima: false, proximaData: null,
    }))
    expect(await screen.findByText('HISTORICO')).toBeInTheDocument()
  })

  it('várias coisas de uma só vez: uma intervenção por item, com custo próprio, mais um trabalho avulso', async () => {
    abrir('/frota/manutencao/nova?viatura=v1')
    await screen.findByLabelText('Ponto de partida')
    await marcar('Óleo')
    await marcar('Seguro')
    await outroTrabalho()
    fireEvent.change(screen.getByPlaceholderText(/Última leitura/), { target: { value: '126000' } })
    fireEvent.change(screen.getByLabelText('Custo — Óleo'), { target: { value: '80' } })
    fireEvent.change(screen.getByLabelText('Custo — Seguro'), { target: { value: '300,5' } })
    fireEvent.change(screen.getByLabelText('Outro trabalho 1'), { target: { value: 'Farol' } })
    fireEvent.change(screen.getByLabelText('Custo — outro trabalho 1'), { target: { value: '12' } })
    await gravar()
    expect(mocks.registar).toHaveBeenCalledTimes(3)
    const chamadas = mocks.registar.mock.calls.map(c => c[0])
    expect(chamadas.map(c => [c.itemId, c.custo, c.atualizaProxima])).toEqual([
      [oleo.id, 80, true], [seguro.id, 300.5, true], [null, 12, false],
    ])
    expect(chamadas.every(c => c.veiculoId === 'v1' && c.km === 126000 && c.data === hoje())).toBe(true)
    expect(await screen.findByText('FICHA')).toBeInTheDocument()
  })

  it('se uma falhar a meio, o que já ficou gravado sai da lista (sem duplicar ao repetir)', async () => {
    mocks.registar.mockResolvedValueOnce('a').mockResolvedValueOnce(undefined as unknown as string)
    abrir('/frota/manutencao/nova?viatura=v1')
    await screen.findByLabelText('Ponto de partida')
    await marcar('Seguro')
    await marcar('Óleo')
    fireEvent.change(screen.getByPlaceholderText(/Última leitura/), { target: { value: '126000' } })
    await gravar()
    expect(mocks.registar).toHaveBeenCalledTimes(2)
    expect(toast.error).toHaveBeenLastCalledWith('Foram gravados 1 trabalho; os restantes falharam — tente de novo.')
    expect(screen.getByRole('checkbox', { name: 'Óleo' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Seguro' })).toBeChecked()
  })

  it('quem só consulta não tem acesso ao formulário', () => {
    mocks.role = 'leitura'
    abrir('/frota/manutencao/nova')
    expect(screen.getByText(/Não tem permissão/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Gravar/ })).not.toBeInTheDocument()
  })
})

describe('ManutencaoFormPage — editar', () => {
  beforeEach(() => {
    mocks.paraEditar = {
      manutencao: {
        id: 'm1', veiculo_id: 'v1', item_id: oleo.id, descricao: 'Filtro Mann', data: '2026-09-10', km_na_altura: 120000,
        custo: 80, oficina: 'Polo 2', observacoes: null, atualiza_proxima: true, condutor_id: null, criado_por: 'u', criado_em: '',
      },
      edicoes: [{
        id: 'e1', manutencao_id: 'm1', editado_por: 'u', editado_por_nome: 'Ana', editado_em: '2026-09-11T09:00:00',
        antes: { item_id: oleo.id, descricao: null, data: '2026-09-10', km_na_altura: 110000, custo: 80, oficina: 'Polo 2', observacoes: null },
        depois: { item_id: oleo.id, descricao: 'Filtro Mann', data: '2026-09-10', km_na_altura: 120000, custo: 80, oficina: 'Polo 2', observacoes: null },
      }],
    }
  })

  it('carrega a intervenção, avisa que fica em nome do utilizador e mostra as correções anteriores', async () => {
    abrir('/frota/manutencao/m1/editar')
    expect(await screen.findByText(/fica registada com o seu nome/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /Matrícula/ })).toBeDisabled()
    expect(screen.getByLabelText(/Tipo de manutenção/)).toHaveValue(oleo.id)
    expect(screen.getByDisplayValue('Polo 2')).toBeInTheDocument()
    expect(screen.getByText('Correções anteriores')).toBeInTheDocument()
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText(/110000/)).toBeInTheDocument()
    expect(screen.queryByText(/Atualizar o próximo prazo/)).not.toBeInTheDocument()
  })

  it('guarda chamando editar_manutencao (não cria nova) e volta ao histórico', async () => {
    abrir('/frota/manutencao/m1/editar')
    await screen.findByText(/fica registada com o seu nome/)
    fireEvent.change(screen.getByPlaceholderText('Ex: 85,50'), { target: { value: '95' } })
    await gravar()
    expect(mocks.registar).not.toHaveBeenCalled()
    expect(mocks.editar).toHaveBeenCalledWith({
      id: 'm1', itemId: oleo.id, descricao: 'Filtro Mann', data: '2026-09-10', km: 120000, custo: 95,
      oficina: 'Polo 2', observacoes: null,
    })
    expect(await screen.findByText('HISTORICO')).toBeInTheDocument()
  })
})
