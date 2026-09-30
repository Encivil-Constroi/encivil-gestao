import { rpcSemTipos } from '@/app/lib/rpcSemTipos'

// Shelly faz polling a cada 5s; 20s sem contacto = 4 polls falhados
const OFFLINE_APOS_SEG = 20

const hhmm = (t: string | null) => t?.slice(0, 5) ?? null

export type EstadoBomba = {
  nuncaComunicou:      boolean
  online:              boolean
  segundosSemContacto: number | null
  relayOn:             boolean | null
  nivelAlarme:         boolean | null
  // Motivo pelo qual a bomba não pode trabalhar agora (bloqueio ou horário); null = livre
  bloqueioMotivo:      string | null
  bloqueada:           boolean
  motivo:              string | null
  horarioInicio:       string | null
  horarioFim:          string | null
}

type EstadoBombaRow = {
  last_seen_at:          string | null
  segundos_sem_contacto: number | null
  relay_on:              boolean | null
  nivel_alarme:          boolean | null
  bloqueio_motivo:       string | null
  bloqueada:             boolean
  motivo:                string | null
  horario_inicio:        string | null
  horario_fim:           string | null
}

export async function fetchEstadoBomba(): Promise<EstadoBomba | null> {
  const rows = await rpcSemTipos<EstadoBombaRow[] | null>('estado_bomba', { p_pump_id: 'POLO2' })
  const r = rows?.[0]
  if (!r) return null
  return {
    nuncaComunicou:      r.last_seen_at === null,
    online:              r.segundos_sem_contacto !== null && r.segundos_sem_contacto < OFFLINE_APOS_SEG,
    segundosSemContacto: r.segundos_sem_contacto,
    relayOn:             r.relay_on,
    nivelAlarme:         r.nivel_alarme,
    bloqueioMotivo:      r.bloqueio_motivo,
    bloqueada:           r.bloqueada,
    motivo:              r.motivo,
    horarioInicio:       hhmm(r.horario_inicio),
    horarioFim:          hhmm(r.horario_fim),
  }
}

export type RegrasBomba = {
  bloqueada:     boolean
  motivo:        string | null
  horarioInicio: string | null
  horarioFim:    string | null
}

export async function definirRegrasBomba(r: RegrasBomba): Promise<void> {
  await rpcSemTipos('definir_regras_bomba', {
    p_bloqueada:      r.bloqueada,
    p_motivo:         r.motivo,
    p_horario_inicio: r.horarioInicio,
    p_horario_fim:    r.horarioFim,
  })
}

export type MotivoFimSessao = 'TEMPO' | 'TERMINEI' | 'EMERGENCIA' | 'INTERROMPIDO'

export type EstadoPedidoBomba = {
  estado:              string
  pumpActivatedAt:     string | null
  pumpMaxSeconds:      number
  // Autorizado mas à espera: outro motorista (ou uso manual) está a usar a bomba
  bombaOcupada:        boolean
  bloqueioMotivo:      string | null
  sessaoAtiva:         boolean
  motivoFim:           MotivoFimSessao | null
  // O Shelly reportou o relé desligado depois do fim da sessão
  desligadaConfirmada: boolean
}

type EstadoPedidoRow = {
  estado:               string
  pump_activated_at:    string | null
  pump_max_seconds:     number | null
  bomba_ocupada:        boolean | null
  bloqueio_motivo:      string | null
  sessao_ativa:         boolean | null
  motivo_fim:           MotivoFimSessao | null
  desligada_confirmada: boolean | null
}

// O motorista, quem aprova e quem gere combustível (get_pend_estado_bomba, 20260930010000)
export async function fetchEstadoPedidoBomba(pedidoId: string): Promise<EstadoPedidoBomba | null> {
  const rows = await rpcSemTipos<EstadoPedidoRow[] | null>('get_pend_estado_bomba', { p_id: pedidoId })
  const r = rows?.[0]
  if (!r) return null
  return {
    estado:              r.estado,
    pumpActivatedAt:     r.pump_activated_at,
    pumpMaxSeconds:      r.pump_max_seconds ?? 600,
    bombaOcupada:        r.bomba_ocupada === true,
    bloqueioMotivo:      r.bloqueio_motivo,
    sessaoAtiva:         r.sessao_ativa === true,
    motivoFim:           r.motivo_fim,
    desligadaConfirmada: r.desligada_confirmada === true,
  }
}

export type SessaoBomba = {
  id:                  string
  origem:              'APP' | 'MANUAL'
  veiculoNome:         string | null
  funcionarioNome:     string | null
  segundosAutorizados: number
  inicioEm:            string
  fimEm:               string | null
  motivoFim:           MotivoFimSessao | null
}

type SessaoBombaRow = {
  id:                   string
  origem:               'APP' | 'MANUAL' | null
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
    origem:              r.origem ?? 'APP',
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
