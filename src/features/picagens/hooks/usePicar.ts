import { useMutation } from '@/app/lib/useMutation'
import { invalidateCache } from '@/app/lib/useAsync'
import {
  registarPicagem,
  type NovaPicagem,
  type ValidacaoPicagem,
  validarPicagem,
  corrigirHoraPicagem,
} from '../services/picagensService'
import { enqueuePendingPicagem, isNetworkError } from '../offlineQueue'
import type { Picagem } from '@/app/types'

export type PicarResult = { picagem: Picagem; queued: false } | { picagem: null; queued: true }

function cacheKeyDia(colaboradorId: string, data: string) {
  return `picagens-dia-${colaboradorId}-${data}`
}
function cacheKeyObra(obraId: string, data: string) {
  return `picagens-obra-${obraId}-${data}`
}

export function usePicar() {
  const { mutate, loading, error } = useMutation(
    async (input: NovaPicagem): Promise<PicarResult> => {
      if (!navigator.onLine) {
        enqueuePendingPicagem({ ...input, origem: 'OFFLINE' })
        return { picagem: null, queued: true }
      }
      try {
        const picagem = await registarPicagem(input)
        const data = input.timestampDispositivo.split('T')[0]
        invalidateCache(cacheKeyDia(input.colaboradorId, data), cacheKeyObra(input.obraId, data))
        return { picagem, queued: false }
      } catch (e) {
        if (isNetworkError(e)) {
          enqueuePendingPicagem({ ...input, origem: 'OFFLINE' })
          return { picagem: null, queued: true }
        }
        throw e
      }
    },
    'Erro ao registar picagem'
  )
  return { picar: mutate, loading, error }
}

export function useValidarPicagem() {
  const { mutate, loading, error } = useMutation(
    async (id: string, params: ValidacaoPicagem): Promise<true> => {
      await validarPicagem(id, params)
      return true
    },
    'Erro ao validar picagem'
  )
  return { validar: mutate, loading, error }
}

export function useCorrigirHoraPicagem() {
  const { mutate, loading, error } = useMutation(
    async (
      id: string,
      horaOriginal: string,
      novaHora: string,
      validadaPor: string
    ): Promise<true> => {
      await corrigirHoraPicagem(id, horaOriginal, novaHora, validadaPor)
      return true
    },
    'Erro ao corrigir hora'
  )
  return { corrigir: mutate, loading, error }
}
