import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import { obraFixture } from './obrasFixtures'

const m = vi.hoisted(() => ({
  guardar: vi.fn(async (_: unknown) => 'nova-obra' as string | null),
  atualizar: vi.fn(async (..._: unknown[]) => ({}) as unknown),
  visao: null as unknown,
  geofence: null as unknown,
}))

vi.mock('@/features/obras/hooks/useObras', () => ({
  useVisaoObra: () => ({ visao: m.visao, loading: false, error: null, reload: vi.fn() }),
  useObra: () => ({ obra: m.geofence, loading: false, error: null, reload: vi.fn() }),
  useGuardarObra: () => ({ guardar: m.guardar, loading: false, error: null }),
  useAtualizarObra: () => ({ atualizar: m.atualizar, loading: false, error: null }),
  useColaboradoresAtivos: () => ({ colaboradores: [{ id: 'c1', nome: 'Rui Eng.' }, { id: 'c2', nome: 'Ana' }], loading: false }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
// O mapa de geofence (Leaflet) não corre no jsdom
vi.mock('@/features/obras/components/GeofenceConfig', () => ({ GeofenceConfig: () => <div>mapa-geofence</div> }))

import { toast } from 'sonner'
import { ObraFormPage } from '@/features/obras/components/ObraFormPage'

function abrir(caminho = '/obras/nova') {
  render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="/obras/nova" element={<ObraFormPage />} />
        <Route path="/obras/:id/editar" element={<ObraFormPage />} />
        <Route path="/obras/:id" element={<p>ficha-aberta</p>} />
        <Route path="/obras" element={<p>lista-aberta</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const escrever = (rotulo: string | RegExp, valor: string) =>
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } })

beforeEach(() => { m.visao = null; m.geofence = null })
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('Formulário da obra', () => {
  it('exige o nome', async () => {
    abrir()
    fireEvent.submit(screen.getByRole('button', { name: 'Criar obra' }).closest('form')!)
    expect(toast.error).toHaveBeenCalledWith('Indique o nome da obra.')
    expect(m.guardar).not.toHaveBeenCalled()
  })

  it('recusa um fim previsto anterior ao início', () => {
    abrir()
    escrever(/Nome da obra/, 'Obra X')
    escrever('Início (opcional)', '2026-06-10')
    escrever('Fim previsto (opcional)', '2026-06-01')
    fireEvent.submit(screen.getByRole('button', { name: 'Criar obra' }).closest('form')!)
    expect(toast.error).toHaveBeenCalledWith('A data prevista de fim não pode ser anterior ao início.')
    expect(m.guardar).not.toHaveBeenCalled()
  })

  it('cria a obra com datas, estado, orçamento e o ponto vindo de um link do Google Maps', async () => {
    abrir()
    escrever(/Nome da obra/, '  Moradia Cascais ')
    escrever(/^Estado/, 'planeada')
    escrever('Início (opcional)', '2026-06-01')
    escrever('Fim previsto (opcional)', '2026-12-01')
    escrever(/Orçamento/, '120000.50')
    escrever('Engenheiro (opcional)', 'c1')
    escrever(/Link do Google Maps ou coordenadas/, 'https://www.google.com/maps/@38.7223,-9.1399,17z')
    fireEvent.click(screen.getByRole('button', { name: /Aplicar/ }))
    expect(screen.getByText('Localização definida: 38.722300, -9.139900')).toBeInTheDocument()
    expect(screen.getByTitle('Localização da obra no Google Maps')).toHaveAttribute('src', expect.stringContaining('q=38.7223,-9.1399'))

    fireEvent.click(screen.getByRole('button', { name: 'Criar obra' }))
    await waitFor(() => expect(m.guardar).toHaveBeenCalledTimes(1))
    expect(m.guardar).toHaveBeenCalledWith(expect.objectContaining({
      id: null, nome: '  Moradia Cascais ', estado: 'planeada', dataInicio: '2026-06-01', dataPrevistaFim: '2026-12-01',
      orcamento: 120000.5, engenheiroId: 'c1', latitude: 38.7223, longitude: -9.1399,
    }))
    await screen.findByText('ficha-aberta')
    expect(m.atualizar).not.toHaveBeenCalled()
  })

  it('mostra erro para link curto e não altera o ponto', () => {
    abrir()
    escrever(/Link do Google Maps ou coordenadas/, 'https://maps.app.goo.gl/AbC123')
    fireEvent.click(screen.getByRole('button', { name: /Aplicar/ }))
    expect(screen.getByRole('alert')).toHaveTextContent(/links curtos/i)
    expect(screen.getByText('Sem localização definida')).toBeInTheDocument()
  })

  it('usa a localização do dispositivo', async () => {
    const getCurrentPosition = vi.fn((ok: (p: unknown) => void) => ok({ coords: { latitude: 41.1496123456, longitude: -8.6109987654 } }))
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
    abrir()
    fireEvent.click(screen.getByRole('button', { name: /Usar a minha localização/ }))
    expect(await screen.findByText('Usada a localização do dispositivo.')).toBeInTheDocument()
    expect(screen.getByText('Coordenadas: 41.149612, -8.610999')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Navegar/ })).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=41.149612,-8.610999')
    expect(screen.getByRole('link', { name: /Abrir no Google Maps/ })).toHaveAttribute('href', expect.stringContaining('query=41.149612,-8.610999'))
  })

  it('o ponto pode ser removido', () => {
    abrir()
    escrever(/Link do Google Maps ou coordenadas/, '38.7, -9.1')
    fireEvent.click(screen.getByRole('button', { name: /Aplicar/ }))
    fireEvent.click(screen.getByRole('button', { name: /Remover ponto/ }))
    expect(screen.getByText('Sem localização definida')).toBeInTheDocument()
  })

  it('na edição preenche os campos e guarda com o id da obra', async () => {
    m.visao = obraFixture({
      obra_id: 'o7', nome: 'Escola', cliente: 'Município', estado: 'suspensa', data_inicio: '2026-01-10',
      data_prevista_fim: '2026-09-30', orcamento: 5000, latitude: 40.2, longitude: -8.4, engenheiro_id: 'c2', morada: 'Rua A',
    })
    abrir('/obras/o7/editar')
    await waitFor(() => expect(screen.getByLabelText(/Nome da obra/)).toHaveValue('Escola'))
    expect(screen.getByLabelText(/^Estado/)).toHaveValue('suspensa')
    expect(screen.getByLabelText('Engenheiro (opcional)')).toHaveValue('c2')
    expect(screen.getByText('Coordenadas: 40.200000, -8.400000')).toBeInTheDocument()

    escrever(/Nome da obra/, 'Escola Nova')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar alterações' }))
    await waitFor(() => expect(m.guardar).toHaveBeenCalledWith(expect.objectContaining({ id: 'o7', nome: 'Escola Nova', latitude: 40.2, longitude: -8.4, estado: 'suspensa' })))
  })

  it('mantém a geofence existente: guarda-a pelo caminho próprio', async () => {
    m.visao = obraFixture({ obra_id: 'o7', nome: 'Escola' })
    m.geofence = { geofenceTipo: 'RAIO', geofenceCentroLat: 40.1, geofenceCentroLon: -8.1, geofenceRaioM: 150 }
    abrir('/obras/o7/editar')
    await waitFor(() => expect(screen.getByLabelText(/Nome da obra/)).toHaveValue('Escola'))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar alterações' }))
    await waitFor(() => expect(m.atualizar).toHaveBeenCalledWith('nova-obra', { geofenceTipo: 'RAIO', geofenceCentroLat: 40.1, geofenceCentroLon: -8.1, geofenceRaioM: 150 }))
  })

  it('desligar a geofence limpa-a', async () => {
    m.visao = obraFixture({ obra_id: 'o7', nome: 'Escola' })
    m.geofence = { geofenceTipo: 'RAIO', geofenceCentroLat: 40.1, geofenceCentroLon: -8.1, geofenceRaioM: 150 }
    abrir('/obras/o7/editar')
    await waitFor(() => expect(screen.getByLabelText(/Nome da obra/)).toHaveValue('Escola'))
    fireEvent.click(screen.getByRole('switch', { name: 'Ativar geofence' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar alterações' }))
    await waitFor(() => expect(m.atualizar).toHaveBeenCalledWith('nova-obra', { geofenceTipo: null }))
  })

  it('falha ao guardar: avisa e não navega', async () => {
    m.guardar.mockResolvedValueOnce(null)
    abrir()
    escrever(/Nome da obra/, 'Obra X')
    fireEvent.click(screen.getByRole('button', { name: 'Criar obra' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Não foi possível guardar a obra.'))
    expect(screen.queryByText('ficha-aberta')).not.toBeInTheDocument()
  })

  it('arquivar só existe na edição', async () => {
    abrir()
    expect(screen.queryByRole('button', { name: /Arquivar/ })).not.toBeInTheDocument()
    cleanup()
    m.visao = obraFixture({ obra_id: 'o7', nome: 'Escola' })
    abrir('/obras/o7/editar')
    fireEvent.click(await screen.findByRole('button', { name: /Arquivar/ }))
    await waitFor(() => expect(m.atualizar).toHaveBeenCalledWith('o7', { active: false }))
    await screen.findByText('lista-aberta')
  })
})
