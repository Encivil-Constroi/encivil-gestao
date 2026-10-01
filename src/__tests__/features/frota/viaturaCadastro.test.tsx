import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import type { VeiculoFrotaRow } from '@/features/frota/db'
import { mockUseRole } from './frotaFixtures'

const UUID = '0b1c2d3e-0000-4000-8000-000000000001'

const viaturaBase: VeiculoFrotaRow = {
  id: 'v1', codigo: 'V-01', nome: 'Toyota Hilux', marca: 'Toyota', modelo: 'Hilux', identificacao: '50-AA-50', tipo: 'viatura',
  tipo_combustivel: 'gasoleo', unidade_contador: 'km', estado_operacional: 'LIVRE', obra_atual_id: null,
  data_ultima_revisao: '2026-06-01', km_ultima_revisao: 9000, km_registo: 8000, data_fim_seguro: '2027-01-01', seguro_foto_path: 'viaturas/v1/seguro_1.jpg',
  data_proxima_ipo: null, ipo_foto_path: null, observacoes: null, ativo: true, created_at: '2026-01-01T10:00:00Z', created_by: null,
}

const mocks = vi.hoisted(() => ({
  role: 'admin' as string,
  edicao: null as { viatura: unknown; kmAtual: number } | null,
  guardar: vi.fn(async (_d: unknown) => 'id-guardado' as string | null),
  arquivar: vi.fn(async (_id: string, _v: boolean) => true),
  definir: vi.fn(async (_id: string, _e: string) => true),
  enviarFoto: vi.fn(async (_id: string, doc: string, _f: File) => `viaturas/x/${doc}_1.jpg`),
}))

vi.mock('@/features/auth/useRole', () => ({ useRole: () => mockUseRole(mocks.role) }))
vi.mock('@/features/frota/hooks/useFrota', () => ({
  useViaturaEdicao: (id?: string) => ({ dados: id ? mocks.edicao : undefined, loading: false, error: null, reload: vi.fn() }),
  useGuardarViatura: () => ({ guardar: mocks.guardar, loading: false, error: null }),
  useArquivarViatura: () => ({ arquivar: mocks.arquivar, loading: false }),
  useDefinirEstadoViatura: () => ({ definir: mocks.definir, loading: false }),
}))
vi.mock('@/features/frota/lib/fotosFrota', () => ({
  enviarFotoDocumento: (...a: [string, string, File]) => mocks.enviarFoto(...a),
  urlFotoDocumento: (p: string | null) => (p ? `https://fotos.test/${p}` : null),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
import { toast } from 'sonner'
import { ViaturaFormPage } from '@/features/frota/components/ViaturaFormPage'

function abrir(caminho: string) {
  render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="/frota/viatura/nova" element={<ViaturaFormPage />} />
        <Route path="/frota/viatura/:id/editar" element={<ViaturaFormPage />} />
        <Route path="/frota/viatura/:id" element={<p>FICHA</p>} />
        <Route path="/frota/viaturas" element={<p>LISTA</p>} />
        <Route path="/frota" element={<p>FROTA</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const clicar = (el: Element) => act(async () => { fireEvent.click(el) })
const escrever = (rotulo: RegExp | string, valor: string) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } })

beforeEach(() => {
  mocks.role = 'admin'
  mocks.edicao = { viatura: viaturaBase, kmAtual: 9800 }
  mocks.guardar.mockClear()
  mocks.arquivar.mockClear()
  mocks.definir.mockClear()
  mocks.enviarFoto.mockClear()
  vi.mocked(toast.error).mockClear()
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(UUID)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('ViaturaFormPage — registar', () => {
  it('cria com o id gerado no browser e com as leituras e datas preenchidas', async () => {
    abrir('/frota/viatura/nova')
    expect(screen.getByRole('heading', { name: 'Nova viatura / máquina' })).toBeInTheDocument()
    escrever(/^Marca/, 'Fiat')
    escrever(/^Modelo/, 'Punto')
    escrever(/Matrícula/, '00-xx-00')
    escrever(/atuais/, '15000')
    escrever(/^Data da última revisão/, '2026-05-01')
    escrever(/na última revisão/, '7500')
    escrever(/^Seguro válido até/, '2027-03-01')
    escrever(/^Próxima IPO/, '2027-04-01')
    await clicar(screen.getByRole('button', { name: 'Registar viatura' }))
    expect(mocks.guardar).toHaveBeenCalledWith(expect.objectContaining({
      id: UUID, marca: 'Fiat', modelo: 'Punto', tipo: 'viatura', identificacao: '00-XX-00', unidade: 'km',
      leituraAtual: 15000, dataUltimaRevisao: '2026-05-01', leituraUltimaRevisao: 7500, dataSeguro: '2027-03-01', dataIpo: '2027-04-01',
    }))
    expect(await screen.findByText('FICHA')).toBeInTheDocument()
  })

  it('as fotos do seguro e da IPO usam o id da viatura e seguem no registo', async () => {
    abrir('/frota/viatura/nova')
    escrever(/^Marca/, 'Fiat')
    escrever(/atuais/, '100')
    const f = new File(['x'], 'seguro.png', { type: 'image/png' })
    await act(async () => { fireEvent.change(screen.getByTestId('foto-seguro-ficheiro'), { target: { files: [f] } }) })
    await act(async () => { fireEvent.change(screen.getByTestId('foto-ipo-camera'), { target: { files: [f] } }) })
    expect(mocks.enviarFoto).toHaveBeenNthCalledWith(1, UUID, 'seguro', f)
    expect(mocks.enviarFoto).toHaveBeenNthCalledWith(2, UUID, 'ipo', f)
    await clicar(screen.getByRole('button', { name: 'Registar viatura' }))
    expect(mocks.guardar).toHaveBeenCalledWith(expect.objectContaining({
      id: UUID, seguroFoto: 'viaturas/x/seguro_1.jpg', ipoFoto: 'viaturas/x/ipo_1.jpg',
    }))
  })

  it('exige marca ou modelo e a leitura atual', async () => {
    abrir('/frota/viatura/nova')
    await clicar(screen.getByRole('button', { name: 'Registar viatura' }))
    expect(toast.error).toHaveBeenLastCalledWith('Indique a marca e o modelo.')
    escrever(/^Modelo/, 'Hilux')
    await clicar(screen.getByRole('button', { name: 'Registar viatura' }))
    expect(toast.error).toHaveBeenLastCalledWith('Indique os km atuais.')
    expect(mocks.guardar).not.toHaveBeenCalled()
  })

  it('recusa a leitura da última revisão acima da atual', async () => {
    abrir('/frota/viatura/nova')
    escrever(/^Modelo/, 'Hilux')
    escrever(/atuais/, '1000')
    escrever(/na última revisão/, '2000')
    await clicar(screen.getByRole('button', { name: 'Registar viatura' }))
    expect(toast.error).toHaveBeenLastCalledWith('A leitura da última revisão não pode ser superior à atual.')
    expect(mocks.guardar).not.toHaveBeenCalled()
  })

  it('máquina passa a contar horas, e a escolha manual da unidade é respeitada', () => {
    abrir('/frota/viatura/nova')
    fireEvent.change(screen.getByLabelText('Tipo de veículo'), { target: { value: 'maquina' } })
    expect(screen.getByLabelText('Contador')).toHaveValue('horas')
    expect(screen.getByLabelText('Horas atuais')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Contador'), { target: { value: 'km' } })
    fireEvent.change(screen.getByLabelText('Tipo de veículo'), { target: { value: 'gerador' } })
    expect(screen.getByLabelText('Contador')).toHaveValue('km')
  })

  it('desligar "operacional" no registo põe a viatura na oficina', async () => {
    abrir('/frota/viatura/nova')
    escrever(/^Modelo/, 'Hilux')
    escrever(/atuais/, '10')
    await clicar(screen.getByRole('switch', { name: 'Viatura operacional' }))
    await clicar(screen.getByRole('button', { name: 'Registar viatura' }))
    expect(mocks.definir).toHaveBeenCalledWith('id-guardado', 'OFICINA')
  })

  it('sem permissão avisa e volta à Frota', async () => {
    mocks.role = 'leitura'
    abrir('/frota/viatura/nova')
    expect(await screen.findByText('FROTA')).toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith('Não tem permissão para registar ou editar viaturas.')
  })

  it.each(['mecanico', 'armazem'])('%s pode abrir o registo', papel => {
    mocks.role = papel
    abrir('/frota/viatura/nova')
    expect(screen.getByRole('heading', { name: 'Nova viatura / máquina' })).toBeInTheDocument()
  })
})

describe('ViaturaFormPage — editar', () => {
  it('preenche o formulário, bloqueia a leitura atual e guarda com o id da viatura', async () => {
    abrir('/frota/viatura/v1/editar')
    expect(screen.getByRole('heading', { name: 'Editar viatura' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText(/^Marca/)).toHaveValue('Toyota'))
    expect(screen.getByLabelText(/atuais/)).toBeDisabled()
    expect(screen.getByLabelText(/atuais/)).toHaveValue('9800')
    expect(screen.getByAltText('Foto do seguro')).toHaveAttribute('src', 'https://fotos.test/viaturas/v1/seguro_1.jpg')
    await clicar(screen.getByRole('button', { name: 'Guardar alterações' }))
    expect(mocks.guardar).toHaveBeenCalledWith(expect.objectContaining({
      id: 'v1', leituraAtual: 9800, dataUltimaRevisao: '2026-06-01', leituraUltimaRevisao: 9000, seguroFoto: 'viaturas/v1/seguro_1.jpg',
    }))
    expect(mocks.definir).not.toHaveBeenCalled()
    expect(await screen.findByText('FICHA')).toBeInTheDocument()
  })

  it('o interruptor operacional move entre Livre e Oficina', async () => {
    abrir('/frota/viatura/v1/editar')
    const interruptor = screen.getByRole('switch', { name: 'Viatura operacional' })
    expect(interruptor).toHaveAttribute('aria-checked', 'true')
    await clicar(interruptor)
    await clicar(screen.getByRole('button', { name: 'Guardar alterações' }))
    expect(mocks.definir).toHaveBeenCalledWith('id-guardado', 'OFICINA')
  })

  it('em uso: interruptor bloqueado com explicação e arquivar desativado', () => {
    mocks.edicao = { viatura: { ...viaturaBase, estado_operacional: 'EM_USO' }, kmAtual: 9800 }
    abrir('/frota/viatura/v1/editar')
    expect(screen.getByRole('switch', { name: 'Viatura operacional' })).toBeDisabled()
    expect(screen.getByText(/Está em uso: registe primeiro a devolução para a poder pôr na oficina/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Arquivar/ })).toBeDisabled()
  })

  it('em uso nunca chama definir_estado ao guardar', async () => {
    mocks.edicao = { viatura: { ...viaturaBase, estado_operacional: 'EM_USO' }, kmAtual: 9800 }
    abrir('/frota/viatura/v1/editar')
    await clicar(screen.getByRole('button', { name: 'Guardar alterações' }))
    expect(mocks.definir).not.toHaveBeenCalled()
  })

  it('arquivar pede confirmação e volta à lista', async () => {
    abrir('/frota/viatura/v1/editar')
    await clicar(screen.getByRole('button', { name: /Arquivar/ }))
    expect(mocks.arquivar).not.toHaveBeenCalled()
    await clicar(screen.getByRole('button', { name: 'Confirmar arquivo' }))
    expect(mocks.arquivar).toHaveBeenCalledWith('v1', true)
    expect(await screen.findByText('LISTA')).toBeInTheDocument()
  })

  it('viatura arquivada pode ser restaurada', async () => {
    mocks.edicao = { viatura: { ...viaturaBase, ativo: false }, kmAtual: 9800 }
    abrir('/frota/viatura/v1/editar')
    await clicar(screen.getByRole('button', { name: 'Restaurar viatura' }))
    expect(mocks.arquivar).toHaveBeenCalledWith('v1', false)
    expect(await screen.findByText('FICHA')).toBeInTheDocument()
  })
})
