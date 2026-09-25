import { rpcSemTipos } from '@/app/lib/rpcSemTipos'

// Shelly faz polling a cada 5s; 20s sem contacto = 4 polls falhados
const OFFLINE_APOS_SEG = 20

export type EstadoBomba = {
  online:              boolean
  segundosSemContacto: number
  relayOn:             boolean | null
  nivelAlarme:         boolean | null
}

type EstadoBombaRow = {
  last_seen_at:          string
  segundos_sem_contacto: number
  relay_on:              boolean | null
  nivel_alarme:          boolean | null
}

export async function fetchEstadoBomba(): Promise<EstadoBomba | null> {
  const rows = await rpcSemTipos<EstadoBombaRow[] | null>('estado_bomba', { p_pump_id: 'POLO2' })
  const r = rows?.[0]
  if (!r) return null
  return {
    online:              r.segundos_sem_contacto < OFFLINE_APOS_SEG,
    segundosSemContacto: r.segundos_sem_contacto,
    relayOn:             r.relay_on,
    nivelAlarme:         r.nivel_alarme,
  }
}

export type EstadoPedidoBomba = {
  estado:          string
  pumpActivatedAt: string | null
  pumpMaxSeconds:  number
}

type EstadoPedidoRow = {
  estado:            string
  pump_activated_at: string | null
  pump_max_seconds:  number | null
}

// Usado pela página pública (anon): a tabela não tem SELECT para anon
export async function fetchEstadoPedidoBomba(pedidoId: string): Promise<EstadoPedidoBomba | null> {
  const rows = await rpcSemTipos<EstadoPedidoRow[] | null>('get_pend_estado_bomba', { p_id: pedidoId })
  const r = rows?.[0]
  if (!r) return null
  return {
    estado:          r.estado,
    pumpActivatedAt: r.pump_activated_at,
    pumpMaxSeconds:  r.pump_max_seconds ?? 180,
  }
}

// Sem pedidoId = corte de emergência (exige admin/gestor/armazém)
export async function pararBomba(pedidoId?: string): Promise<void> {
  await rpcSemTipos('parar_bomba', { p_pedido_id: pedidoId ?? null })
}
