import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  buscarConfiguracoes, atualizarConfiguracoes,
  type AtualizarConfiguracoes,
} from '../services/configuracoesService'

export function useConfiguracoes() {
  const { data: config, loading, error, reload } = useAsync(
    buscarConfiguracoes, [],
    { errorMsg: 'Erro ao carregar configurações' }
  )

  const { mutate: _guardar, loading: saving, error: saveError } = useMutation(
    (input: AtualizarConfiguracoes) => atualizarConfiguracoes(config!.id, input),
    'Erro ao guardar configurações'
  )

  const atualizar = async (input: AtualizarConfiguracoes): Promise<boolean> => {
    if (!config) return false
    const updated = await _guardar(input)
    if (updated) reload()
    return updated !== null
  }

  return { config, loading, saving, error: error ?? saveError, atualizar, reload }
}
