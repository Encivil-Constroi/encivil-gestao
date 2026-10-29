import { useAuth } from '@/features/auth/AuthContext'
import { useMutation } from '@/app/lib/useMutation'
import { invalidateCache } from '@/app/lib/useAsync'
import {
  registarPicagem,
  registarPicagemGeofence,
  type NovaPicagem,
  type ValidacaoPicagem,
  validarPicagem,
  corrigirHoraPicagem,
} from '../services/picagensService'
import { enqueuePendingPicagem } from '../offlineQueue'
import { isNetworkError } from '@/app/lib/errosRede'
import { hojeLisboa } from '@/app/lib/dataLisboa'
import type { Picagem, ResultadoPicagem } from '@/app/types'

export type PicarResult =
  | { picagem: Picagem | null; queued: false; resultado: ResultadoPicagem; distanciaM?: number }
  | { picagem: null; queued: true }

export type PicarInput = NovaPicagem & {
  obraGeofenceTipo?: string | null
}

function cacheKeyDia(colaboradorId: string, data: string) {
  return `picagens-dia-${colaboradorId}-${data}`
}
function cacheKeyObra(obraId: string, data: string) {
  return `picagens-obra-${obraId}-${data}`
}

// Obtém posição GPS com timeout de 8s. Retorna null se não disponível ou negado.
// Chamado apenas ao picar — nunca no load da página.
async function getGPS(): Promise<{ lat: number; lon: number; precisaoM: number } | null> {
  if (!navigator.geolocation) return null
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat:      pos.coords.latitude,
        lon:      pos.coords.longitude,
        precisaoM: Math.round(pos.coords.accuracy),
      }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 30000, enableHighAccuracy: true }
    )
  })
}

export function usePicar() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const { mutate, loading, error } = useMutation(
    async (input: PicarInput): Promise<PicarResult> => {
      if (!userId) throw new Error('Sessão terminada. Entre de novo para registar.')
      // Um por picagem: o mesmo valor vai ao INSERT, à RPC e à fila, para um reenvio não duplicar
      const clientId = input.clientId ?? crypto.randomUUID()
      if (!navigator.onLine) {
        enqueuePendingPicagem({ ...input, clientId, origem: 'OFFLINE' }, userId)
        return { picagem: null, queued: true }
      }

      const data = hojeLisboa(new Date(input.timestampDispositivo))

      try {
        // Geofence path: obra configurada com geofence → pedir GPS
        if (input.obraGeofenceTipo) {
          const gps = await getGPS()
          if (gps) {
            const result = await registarPicagemGeofence({ ...input, clientId, ...gps })
            invalidateCache(cacheKeyDia(input.colaboradorId, data), cacheKeyObra(input.obraId, data))
            return {
              picagem:    null,
              queued:     false,
              resultado:  result.resultado,
              distanciaM: result.distanciaM ?? undefined,
            }
          }
          // GPS indisponível ou negado → fallback para MVP (PENDENTE_VALIDACAO)
        }

        // MVP path: sem geofence ou GPS indisponível
        const picagem = await registarPicagem({ ...input, clientId })
        invalidateCache(cacheKeyDia(input.colaboradorId, data), cacheKeyObra(input.obraId, data))
        // null: o servidor já tinha esta picagem (reenvio); fica a aguardar validação como qualquer outra
        return { picagem, queued: false, resultado: picagem?.resultado ?? 'PENDENTE_VALIDACAO' }
      } catch (e) {
        if (isNetworkError(e)) {
          enqueuePendingPicagem({ ...input, clientId, origem: 'OFFLINE' }, userId)
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
