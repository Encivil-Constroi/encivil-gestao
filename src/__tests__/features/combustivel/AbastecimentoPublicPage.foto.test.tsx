import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AbastecimentoPublicPage } from '@/app/pages/pub/AbastecimentoPublicPage'

const V = '11111111-1111-4111-8111-111111111111'
const P = '22222222-2222-4222-8222-222222222222'

const mocks = vi.hoisted(() => ({
  upload: vi.fn(async (..._a: unknown[]) => ({ error: null })),
  invoke: vi.fn(async (..._a: unknown[]) => ({ data: { litros: 10.21, custo_total: 20, confianca: 'alta' }, error: null })),
  reduzida: null as File | null,
  reduzir: vi.fn(),
}))

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ insert: async () => ({ error: null }) }),
    storage: {
      from: () => ({
        upload: mocks.upload,
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x/combustivel-taloes/${p}` } }),
      }),
    },
    functions: { invoke: mocks.invoke },
    rpc: async () => ({ data: null, error: null }),
  },
}))
vi.mock('@/features/combustivel/services/bombaService', () => ({
  fetchEstadoBomba: vi.fn(async () => null),
  fetchEstadoPedidoBomba: vi.fn(async () => ({ estado: 'AUTORIZADO', pumpActivatedAt: null, pumpMaxSeconds: 180 })),
}))
vi.mock('@/features/combustivel/lib/reduzirFoto', () => ({
  reduzirFoto: (f: File) => { mocks.reduzir(f); return Promise.resolve(mocks.reduzida ?? f) },
}))

// Mesmo formato da política de upload (public.foto_abastecimento_valida)
const CAMINHO_VALIDO = new RegExp(`^${V}/\\d{4}-\\d{2}-\\d{2}_${P}_\\d{1,16}\\.(jpg|png|webp|heic|heif)$`)

beforeEach(() => {
  vi.useFakeTimers()
  mocks.upload.mockClear()
  mocks.invoke.mockClear()
  mocks.reduzir.mockClear()
  mocks.reduzida = null
  sessionStorage.setItem('encivil_fuel', JSON.stringify({ pendId: P, tipo: 'CARRINHA', vehicleId: V }))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  sessionStorage.clear()
})

async function enviarFoto(original: File) {
  render(
    <MemoryRouter initialEntries={[`/pub/combustivel?v=${V}&vn=Carrinha`]}>
      <AbastecimentoPublicPage />
    </MemoryRouter>
  )
  await act(async () => { await vi.advanceTimersByTimeAsync(3_000) })
  expect(screen.getByText('Autorizado!')).toBeInTheDocument()
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [original] } })
  await act(async () => {
    fireEvent.submit(input.closest('form')!)
    await vi.advanceTimersByTimeAsync(0)
  })
}

describe('AbastecimentoPublicPage — envio da foto', () => {
  it('envia a foto reduzida, em JPEG, num caminho aceite pela política', async () => {
    const original = new File([new Uint8Array(4_000_000)], 'IMG.HEIC', { type: 'image/heic' })
    mocks.reduzida = new File([new Uint8Array(300_000)], 'foto.jpg', { type: 'image/jpeg' })
    await enviarFoto(original)

    expect(mocks.reduzir).toHaveBeenCalledWith(original)
    expect(mocks.upload).toHaveBeenCalledOnce()
    const [caminho, ficheiro, opcoes] = mocks.upload.mock.calls[0] as [string, File, { contentType: string; upsert: boolean }]
    expect(ficheiro).toBe(mocks.reduzida)
    expect(caminho).toMatch(CAMINHO_VALIDO)
    expect(caminho).toMatch(/\.jpg$/)
    expect(opcoes).toEqual({ contentType: 'image/jpeg', upsert: false })
    expect(mocks.invoke).toHaveBeenCalledWith('ler-foto-abastecimento',
      { body: { foto_url: expect.stringContaining(caminho), tipo_fonte: 'CARRINHA' } })
  })

  it('sem redução possível envia a original com o tipo dela', async () => {
    const original = new File([new Uint8Array(1000)], 'IMG.PNG', { type: 'image/png' })
    await enviarFoto(original)
    const [caminho, ficheiro, opcoes] = mocks.upload.mock.calls[0] as [string, File, { contentType: string }]
    expect(ficheiro).toBe(original)
    expect(caminho).toMatch(CAMINHO_VALIDO)
    expect(caminho).toMatch(/\.png$/)
    expect(opcoes.contentType).toBe('image/png')
  })
})
