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
  // Autorizado mas à espera: outro motorista está a usar a bomba
  bombaOcupada:    boolean
}

type EstadoPedidoRow = {
  estado:            string
  pump_activated_at: string | null
  pump_max_seconds:  number | null
  bomba_ocupada:     boolean | null
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
    bombaOcupada:    r.bomba_ocupada === true,
  }
}

export type MotivoFimSessao = 'TEMPO' | 'TERMINEI' | 'EMERGENCIA' | 'INTERROMPIDO'

export type SessaoBomba = {
  id:                  string
  veiculoNome:         string | null
  funcionarioNome:     string | null
  segundosAutorizados: number
  inicioEm:            string
  fimEm:               string | null
  motivoFim:           MotivoFimSessao | null
}

type SessaoBombaRow = {
  id:                   string
  veiculo_nome:         string | null
  funcionario_nome:     string | null
  segundos_autorizados: number
  inicio_em:            string
  fim_em:               string | null
  motivo_fim:           MotivoFimSessao | null
}

export async function fetchSessoesBomba(limite = 5): Promise<SessaoBomba[]> {
  const rows = await rpcSemTipos<SessaoBombaRow[] | null>('sessoes_bomba', { p_limite: limite })
  return (rows ?? []).map(r => ({
    id:                  r.id,
    veiculoNome:         r.veiculo_nome,
    funcionarioNome:     r.funcionario_nome,
    segundosAutorizados: r.segundos_autorizados,
    inicioEm:            r.inicio_em,
    fimEm:               r.fim_em,
    motivoFim:           r.motivo_fim,
  }))
}

// Sem pedidoId = corte de emergência (exige admin/gestor/armazém)
export async function pararBomba(pedidoId?: string): Promise<void> {
  await rpcSemTipos('parar_bomba', { p_pedido_id: pedidoId ?? null })
}
