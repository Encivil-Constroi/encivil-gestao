import { useMutation } from '@/app/lib/useMutation'
import { invalidateCache } from '@/app/lib/useAsync'
import { registarFormacao, uploadCertificado, type NovaFormacao } from '../services/formacoesService'

export function useRegistarFormacao(colaboradorId?: string) {
  const { mutate, loading, error } = useMutation(
    (input: NovaFormacao) => registarFormacao(input),
    'Erro ao registar formação'
  )

  async function registar(input: NovaFormacao) {
    const result = await mutate(input)
    if (result && colaboradorId) {
      invalidateCache(`formacoes-colab-${colaboradorId}`)
    }
    return result
  }

  return { registar, loading, error }
}

export function useUploadCertificado() {
  const { mutate: upload, loading, error } = useMutation(
    (params: { colaboradorId: string; file: File }) =>
      uploadCertificado(params.colaboradorId, params.file),
    'Erro ao carregar certificado'
  )
  return { upload, loading, error }
}
