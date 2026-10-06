import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'

// Abastecimento v2 (migration 20260930010000). Os tipos gerados só voltam a
// ser regenerados com o CLI (etapa 3 do plano de segurança); até lá o esquema
// fica declarado aqui, com o mesmo formato dos tipos gerados — sem `as any`.
// Quando os tipos forem regenerados, apagar este ficheiro e usar `supabase`.

export type TipoFonte = 'POLO2' | 'CARRINHA' | 'POSTO_RUA'
export type TipoCombustivel = 'gasoleo' | 'gasolina'
export type OrigemLeitura = 'IA' | 'MANUAL'
export type EstadoPedido =
  | 'AGUARDA_AUTORIZACAO' | 'AUTORIZADO' | 'AGUARDA_APROVACAO' | 'REJEITADO' | 'CONCLUIDO' | 'CANCELADO'

// pump_auth_token fica de fora de propósito: é o token de uso único que liga o
// relé físico e nunca deve chegar ao browser
export type PedidoRow = {
  id: string
  veiculo_id: string
  veiculo_nome: string
  funcionario_nome: string
  data: string
  tipo_fonte: TipoFonte | null
  tipo_combustivel: TipoCombustivel | null
  estado: EstadoPedido
  contador: number | null
  km_anterior: number | null
  km_suspeito: boolean
  foto_km_path: string | null
  observacoes: string | null
  local: string | null
  solicitante_id: string | null
  colaborador_id: string | null
  criado_em: string
  autorizado_em: string | null
  decisao_em: string | null
  motivo_recusa: string | null
  contador_inicial: number | null
  contador_inicial_origem: OrigemLeitura | null
  foto_contador_inicial_path: string | null
  bomba_ligada_em: string | null
  pump_auth_expires_at: string | null
  pump_activated_at: string | null
  pump_max_seconds: number | null
  contador_final: number | null
  contador_final_origem: OrigemLeitura | null
  foto_final_path: string | null
  litros: number | null
  custo_total: number | null
  preco_litro: number | null
  concluido_em: string | null
  cancelado_em: string | null
  abastecimento_id: string | null
  // Fluxo anterior (registos em AGUARDA_APROVACAO da passagem para o v2)
  foto_url: string | null
  foto_medidor_url: string | null
  litros_gemini: number | null
  custo_gemini: number | null
}

export type PrecoRow = { tipo_combustivel: TipoCombustivel; preco_litro: number; atualizado_em: string }
export type AprovadorRow = { user_id: string; criado_em: string }

// Linha do relatório: abastecimentos concluídos com as colunas do v2
export type AbastecimentoAnaliseRow = {
  id: string
  veiculo_id: string
  data: string
  litros: number
  custo_total: number
  contador: number | null
  responsavel: string | null
  tipo_fonte: TipoFonte | null
  tipo_combustivel: TipoCombustivel | null
  solicitante_id: string | null
  colaborador_id: string | null
  pedido_id: string | null
  comb_veiculos: { nome: string; codigo: string; unidade_contador: string } | null
}

export type ContextoRow = {
  nome: string | null
  colaborador_id: string | null
  veiculo_id: string | null
  veiculo_nome: string | null
  veiculo_identificacao: string | null
  tipo_combustivel: string | null
  km_atual: number | null
  pedido_aberto_id: string | null
  pode_aprovar: boolean
}

type Tabela<Row, Relationships extends unknown[] = []> = {
  Row: Row
  Insert: never
  Update: never
  Relationships: Relationships
}

export type CombustivelDatabase = {
  __InternalSupabase: { PostgrestVersion: '14.5' }
  public: {
    Tables: {
      comb_abastecimentos_pendentes: Tabela<PedidoRow & { pump_auth_token: string | null }>
      comb_precos:                   Tabela<PrecoRow>
      comb_aprovadores:              Tabela<AprovadorRow>
      comb_abastecimentos:           Tabela<Omit<AbastecimentoAnaliseRow, 'comb_veiculos'>, [{
        foreignKeyName: 'comb_abastecimentos_veiculo_id_fkey'
        columns: ['veiculo_id']
        isOneToOne: false
        referencedRelation: 'comb_veiculos'
        referencedColumns: ['id']
      }]>
      comb_veiculos: Tabela<{ id: string; nome: string; codigo: string; unidade_contador: string; ativo: boolean; identificacao: string | null; tipo_combustivel: string | null }>
    }
    Views: { [_ in never]: never }
    Functions: {
      meu_contexto_abastecimento: { Args: Record<string, never>; Returns: ContextoRow[] }
      pode_aprovar_combustivel:   { Args: Record<string, never>; Returns: boolean }
      criar_pedido_abastecimento: {
        Args: {
          p_id: string; p_veiculo_id: string; p_tipo_fonte: TipoFonte; p_tipo_combustivel: TipoCombustivel
          p_km: number; p_foto_km_path: string; p_observacoes: string | null
        }
        Returns: string
      }
      autorizar_abastecimento:       { Args: { p_id: string }; Returns: undefined }
      rejeitar_abastecimento:        { Args: { p_id: string; p_motivo: string | null }; Returns: undefined }
      aprovar_abastecimento_pendente: { Args: { p_id: string }; Returns: undefined }
      cancelar_pedido_abastecimento: { Args: { p_id: string }; Returns: undefined }
      registar_contador_inicial: {
        Args: { p_id: string; p_leitura: number; p_foto_path: string; p_origem: OrigemLeitura }
        Returns: undefined
      }
      ligar_bomba: { Args: { p_id: string }; Returns: undefined }
      cancelar_autorizacao_bomba: { Args: { p_id: string }; Returns: undefined }
      concluir_pedido_abastecimento: {
        Args: {
          p_id: string; p_leitura_final: number | null; p_litros: number | null; p_custo: number | null
          p_foto_path: string; p_origem: OrigemLeitura
        }
        Returns: string
      }
      definir_aprovador_combustivel: { Args: { p_user_id: string; p_aprova: boolean }; Returns: undefined }
      definir_preco_combustivel:     { Args: { p_tipo: TipoCombustivel; p_preco: number }; Returns: undefined }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export const combDb = supabase as unknown as SupabaseClient<CombustivelDatabase>
