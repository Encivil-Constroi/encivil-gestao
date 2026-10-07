import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FotoObra } from '@/features/obras/db'

const m = vi.hoisted(() => ({ enviar: vi.fn() }))
vi.mock('@/features/obras/lib/fotosObras', () => ({ enviarFotoObra: m.enviar, urlFotoObra: (path: string) => path }))
import { FotoCapture } from '@/features/obras/components/FotoCapture'

function Formulario() {
  const [fotos, setFotos] = useState<FotoObra[]>([{ path: 'antiga.jpg', legenda: 'Antes' }])
  const [enviando, setEnviando] = useState(false)
  return <><FotoCapture obraId="obra" pasta="afericoes" valor={fotos} onChange={setFotos} {...{ onUploadingChange: setEnviando }} /><button disabled={enviando}>Concluir</button><output>{JSON.stringify(fotos)}</output></>
}
afterEach(() => { cleanup(); vi.clearAllMocks() })
describe('fotos durante envio lento', () => {
  it.each(['legenda', 'remover'])('preserva %s enquanto envia outra foto e impede concluir', async acao => {
    let resolver!: (foto: FotoObra) => void
    m.enviar.mockReturnValue(new Promise<FotoObra>(resolve => { resolver = resolve }))
    render(<Formulario />)
    fireEvent.change(screen.getByTestId('fotos-galeria'), { target: { files: [new File(['foto'], 'foto.jpg', { type: 'image/jpeg' })] } })
    if (acao === 'legenda') fireEvent.change(screen.getByLabelText('Legenda da foto 1'), { target: { value: 'Depois' } })
    else fireEvent.click(screen.getByLabelText('Remover foto 1'))
    expect(screen.getByRole('button', { name: 'Concluir' })).toBeDisabled()
    await act(async () => resolver({ path: 'nova.jpg', legenda: null }))
    const fotos = JSON.parse(screen.getByRole('status').textContent || '[]')
    expect(fotos).toEqual(acao === 'legenda' ? [{ path: 'antiga.jpg', legenda: 'Depois' }, { path: 'nova.jpg', legenda: null }] : [{ path: 'nova.jpg', legenda: null }])
    expect(screen.getByRole('button', { name: 'Concluir' })).toBeEnabled()
  })
})
