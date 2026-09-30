import type { EstadoPedido, PedidoRow, TipoCombustivel, TipoFonte } from '../db'

export const ROTULO_FONTE: Record<TipoFonte, string> = {
  POLO2: 'Bomba Polo 2', CARRINHA: 'Carrinha', POSTO_RUA: 'Posto de rua',
}
export const ROTULO_COMBUSTIVEL: Record<TipoCombustivel, string> = { gasoleo: 'Gasóleo', gasolina: 'Gasolina' }

export const ROTULO_ESTADO: Record<EstadoPedido, string> = {
  AGUARDA_AUTORIZACAO: 'A aguardar',
  AUTORIZADO:          'Autorizado',
  AGUARDA_APROVACAO:   'Por aprovar (antigo)',
  REJEITADO:           'Recusado',
  CONCLUIDO:           'Concluído',
  CANCELADO:           'Cancelado',
}

// Espelha as regras de concluir_pedido_abastecimento (20260930010000)
export const LITROS_MAX = 1000
export const BOMBA_MAX_SEGUNDOS = 600

// Em que passo está o motorista — decide o ecrã do pedido
export type Fase =
  | 'ESPERA' | 'RECUSADO' | 'CANCELADO' | 'CONCLUIDO' | 'ANTIGO'
  | 'CONTADOR_INICIAL' | 'LIGAR' | 'A_LIGAR' | 'A_ABASTECER' | 'CONTADOR_FINAL'
  | 'REGISTO'   // posto de rua / carrinha: foto do talão ou do medidor

type PedidoFase = Pick<PedidoRow,
  'estado' | 'tipo_fonte' | 'contador_inicial' | 'bomba_ligada_em' | 'pump_auth_expires_at' | 'pump_activated_at' | 'pump_max_seconds'>

// sessaoAtiva: do get_pend_estado_bomba (null = ainda sem resposta; usa-se o relógio)
export function fasePedido(p: PedidoFase, sessaoAtiva: boolean | null, agora = Date.now()): Fase {
  switch (p.estado) {
    case 'AGUARDA_AUTORIZACAO': return 'ESPERA'
    case 'REJEITADO':           return 'RECUSADO'
    case 'CANCELADO':           return 'CANCELADO'
    case 'CONCLUIDO':           return 'CONCLUIDO'
    case 'AGUARDA_APROVACAO':   return 'ANTIGO'
  }
  if (p.tipo_fonte !== 'POLO2') return 'REGISTO'
  if (p.contador_inicial == null) return 'CONTADOR_INICIAL'
  if (!p.pump_activated_at) {
    const pedidoVivo = p.bomba_ligada_em != null && p.pump_auth_expires_at != null
      && new Date(p.pump_auth_expires_at).getTime() > agora
    return pedidoVivo ? 'A_LIGAR' : 'LIGAR'
  }
  if (sessaoAtiva != null) return sessaoAtiva ? 'A_ABASTECER' : 'CONTADOR_FINAL'
  const fim = new Date(p.pump_activated_at).getTime() + (p.pump_max_seconds ?? BOMBA_MAX_SEGUNDOS) * 1_000
  return fim > agora ? 'A_ABASTECER' : 'CONTADOR_FINAL'
}

export type NivelEspera = 'normal' | 'atencao' | 'critico'

export function minutosDesde(iso: string, agora = Date.now()): number {
  return Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 60_000))
}

// À espera de decisão: até 30 min é normal, depois atenção, a partir de 1 h crítico
export function nivelEspera(minutos: number): NivelEspera {
  if (minutos >= 60) return 'critico'
  if (minutos >= 30) return 'atencao'
  return 'normal'
}

export function textoDuracao(minutos: number): string {
  if (minutos < 1) return 'agora mesmo'
  if (minutos < 60) return `${minutos} min`
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  if (h >= 24) {
    const d = Math.floor(h / 24)
    return d === 1 ? '1 dia' : `${d} dias`
  }
  return m ? `${h} h ${m} min` : `${h} h`
}

// Aceita "1 042,5", "1042.5", "1.042,5"
export function lerNumero(texto: string): number | null {
  const limpo = texto.trim().replace(/\s/g, '')
  if (!limpo) return null
  // Com vírgula, a vírgula é a decimal e os pontos são milhares
  const normal = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo
  if (!/^\d+(\.\d+)?$/.test(normal)) return null
  const n = Number(normal)
  return Number.isFinite(n) ? n : null
}

export type ResultadoLitros = { litros: number } | { erro: string }

export function litrosPorDiferenca(inicial: number, final: number | null): ResultadoLitros | null {
  if (final == null) return null
  if (final <= inicial) return { erro: `A leitura final tem de ser maior que a inicial (${formatarNumero(inicial)})` }
  const litros = Math.round((final - inicial) * 1000) / 1000
  if (litros > LITROS_MAX) return { erro: `Diferença impossível (${formatarNumero(litros)} L) — confirme as leituras` }
  return { litros }
}

export function formatarNumero(n: number, casas = 2): string {
  return n.toLocaleString('pt-PT', { maximumFractionDigits: casas })
}

export function formatarEuros(n: number): string {
  return n.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

export function formatarHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
}

export function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Estados em que o pedido ainda está "vivo" (aparece como em curso)
export const EM_CURSO: EstadoPedido[] = ['AGUARDA_AUTORIZACAO', 'AUTORIZADO']
