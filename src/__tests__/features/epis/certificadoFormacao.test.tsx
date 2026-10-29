import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const m = vi.hoisted(() => ({ registar: vi.fn(), upload: vi.fn() }))

vi.mock('@/features/colaboradores/hooks/useColaboradores', () => ({ useColaboradores: () => ({ colaboradores: [], loading: false }) }))
vi.mock('@/features/epis/hooks/useFormacoesColaborador', () => ({
  useTiposFormacao: () => ({ tipos: [{ id: 't1', designacao: 'ACT', validadeAnos: 2 }] }),
  useFormacoesColaborador: () => ({ formacoes: [], loading: false }),
}))
vi.mock('@/features/epis/hooks/useRegistarFormacao', () => ({
  useRegistarFormacao: () => ({ registar: m.registar, loading: false }),
  useUploadCertificado: () => ({ upload: m.upload, loading: false }),
}))

import { NovaFormacaoForm } from '@/features/epis/components/FormacoesPage'

afterEach(() => { cleanup(); vi.clearAllMocks() })

function preencher() {
  const onClose = vi.fn()
  const { container } = render(<NovaFormacaoForm colaboradorId="c1" onClose={onClose} />)
  fireEvent.change(container.querySelector('select')!, { target: { value: 't1' } })
  const file = new File(['x'], 'cert.pdf', { type: 'application/pdf' })
  fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } })
  return { onClose, container }
}

describe('Certificado de formação', () => {
  it('upload falhado: não regista, mostra o erro e mantém o formulário', async () => {
    m.upload.mockResolvedValue(null)
    const { onClose, container } = preencher()
    fireEvent.submit(container.querySelector('form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent(/certificado/i)
    expect(m.registar).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('upload ok: regista com a chave do certificado', async () => {
    m.upload.mockResolvedValue('c1/1.pdf'); m.registar.mockResolvedValue({ id: 'f1' })
    const { onClose, container } = preencher()
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(m.registar).toHaveBeenCalledWith(expect.objectContaining({ certificadoKey: 'c1/1.pdf' }))
  })
})
