import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'

// Tabelas da Fase 9 (migration 20260929030000). Os tipos gerados só voltam a
// ser regenerados com o CLI (etapa 3 do plano de segurança); até lá o esquema
// fica declarado aqui, com o mesmo formato dos tipos gerados — sem `as any`.
// Quando os tipos forem regenerados, apagar este ficheiro e usar `supabase`.

export type Categoria = 'INSPECAO_RAPIDA' | 'REVISAO_PERIODICA' | 'LONGO_PRAZO' | 'OBRIGACAO_LEGAL'
export type Natureza  = 'CHECKLIST' | 'MANUTENCAO'
export type EstadoItem = 'OK' | 'ATENCAO' | 'MAU'

export type ItemCatalogoRow = {
  id: string
  chave: string
  rotulo: string
  categoria: Categoria
  natureza: Natureza
  intervalo_km_padrao: number | null
  intervalo_meses_padrao: number | null
  limiar_atencao_km: number
  limiar_urgente_km: number
  limiar_atencao_dias: number
  limiar_urgente_dias: number
  ordem: number
  ativo: boolean
  criado_por: string | null
  criado_em: string
  atualizado_em: string
}

export type VeiculoItemRow = {
  id: string
  veiculo_id: string
  item_id: string
  ativo: boolean
  intervalo_km: number | null
  intervalo_meses: number | null
  proxima_km: number | null
  proxima_data: string | null
  ultima_km: number | null
  ultima_data: string | null
  atualizado_por: string | null
  atualizado_em: string
}

export type AtribuicaoRow = {
  id: string
  veiculo_id: string
  colaborador_id: string
  desde: string
  ate: string | null
  criado_por: string | null
  criado_em: string
}

export type ManutencaoRow = {
  id: string
  veiculo_id: string
  item_id: string | null
  descricao: string | null
  data: string
  km_na_altura: number | null
  custo: number | null
  oficina: string | null
  observacoes: string | null
  atualiza_proxima: boolean
  condutor_id: string | null
  criado_por: string | null
  criado_em: string
}

export type ItemChecklistGravado = {
  item_id: string
  chave: string
  rotulo: string
  categoria: Categoria
  estado: EstadoItem
  observacao: string | null
}

export type ChecklistRow = {
  id: string
  veiculo_id: string
  data: string
  km_na_altura: number | null
  itens: ItemChecklistGravado[]
  estado_geral: EstadoItem
  observacoes: string | null
  foto_keys: string[]
  condutor_id: string | null
  criado_por: string | null
  criado_em: string
}

export type DestinatarioRow = { user_id: string; criado_em: string }

export type EstadoOperacional = 'LIVRE' | 'EM_USO' | 'OFICINA'

export type ResumoViaturaRow = {
  id: string
  codigo: string
  nome: string
  marca: string | null
  modelo: string | null
  identificacao: string | null
  tipo: string
  unidade_contador: string
  estado_operacional: EstadoOperacional
  obra_id: string | null
  obra_nome: string | null
  km_atual: number | null
  condutor_id: string | null
  condutor_nome: string | null
  condutor_desde: string | null
  data_fim_seguro: string | null
  data_proxima_ipo: string | null
  data_ultima_revisao: string | null
  alertas_urgentes: number
  alertas_atencao: number
  ultimo_checklist_data: string | null
  ultimo_checklist_estado: EstadoItem | null
}

// Entrega e devolução (veiculo_entregas / frota_listar_entregas)
export type NivelCombustivel = 'RESERVA' | 'QUARTO' | 'METADE' | 'TRES_QUARTOS' | 'CHEIO'
export type NivelAdblue = 'NA' | 'VAZIO' | 'BAIXO' | 'OK'
export type NivelOleo = 'NA' | 'BAIXO' | 'OK'
export type NivelPneus = 'NA' | 'GASTOS' | 'BAIXO' | 'OK'
export type NivelLimpeza = 'NA' | 'LIMPAR' | 'OK'
export type VistaDano = 'frente' | 'tras' | 'lado_esq' | 'lado_dir' | 'cima'
export type DanoMarcado = { vista: VistaDano; x: number; y: number; nota?: string }
export type InventarioSeguranca = { colete?: boolean; triangulo?: boolean; documentos?: boolean; macaco?: boolean }

export type EntregaRow = {
  id: string
  veiculo_id: string
  veiculo_nome: string
  identificacao: string | null
  tipo: 'ENTREGA' | 'DEVOLUCAO'
  colaborador_id: string
  colaborador_nome: string
  obra_id: string | null
  obra_nome: string | null
  data: string
  km: number
  combustivel: NivelCombustivel
  adblue: NivelAdblue
  oleo: NivelOleo
  refrigeracao: NivelOleo
  pneus: NivelPneus
  limpeza: NivelLimpeza
  inventario: InventarioSeguranca
  danos: DanoMarcado[]
  observacoes: string | null
  entrega_ref: string | null
  para_oficina: boolean
  registado_por: string
  criado_em: string
}

export type DadosEntrega = {
  combustivel: NivelCombustivel
  adblue: NivelAdblue
  oleo: NivelOleo
  refrigeracao: NivelOleo
  pneus: NivelPneus
  limpeza: NivelLimpeza
  inventario: InventarioSeguranca
  danos: DanoMarcado[]
}

export type LinhaTempoRow = {
  quando: string
  tipo: 'REGISTO' | 'ENTREGA' | 'DEVOLUCAO' | 'MANUTENCAO' | 'EDICAO' | 'CHECKLIST' | 'ABASTECIMENTO'
  titulo: string
  detalhe: string | null
  leitura: number | null
  utilizador: string | null
  ref_id: string
}

export type HistoricoManutencaoRow = {
  id: string
  veiculo_id: string
  veiculo_nome: string
  identificacao: string | null
  unidade_contador: string
  item_id: string | null
  item_rotulo: string | null
  descricao: string | null
  data: string
  km_na_altura: number | null
  custo: number | null
  oficina: string | null
  observacoes: string | null
  condutor_nome: string | null
  registado_por: string
  registado_em: string
  editado_por: string | null
  editado_em: string | null
}

// Colunas de comb_veiculos acrescentadas pela migration 20261002000000
export type VeiculoFrotaRow = {
  id: string
  codigo: string
  nome: string
  marca: string | null
  modelo: string | null
  identificacao: string | null
  tipo: string
  tipo_combustivel: string
  unidade_contador: string
  estado_operacional: EstadoOperacional
  obra_atual_id: string | null
  data_ultima_revisao: string | null
  km_ultima_revisao: number | null
  km_registo: number | null
  data_fim_seguro: string | null
  seguro_foto_path: string | null
  data_proxima_ipo: string | null
  ipo_foto_path: string | null
  observacoes: string | null
  ativo: boolean
  created_at: string
  created_by: string | null
}

type Tabela<Row, Insert = never, Update = never> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

type ItemCatalogoInsert = Pick<ItemCatalogoRow, 'chave' | 'rotulo' | 'categoria' | 'natureza'>
  & Partial<Pick<ItemCatalogoRow, 'intervalo_km_padrao' | 'intervalo_meses_padrao' | 'limiar_atencao_km'
    | 'limiar_urgente_km' | 'limiar_atencao_dias' | 'limiar_urgente_dias' | 'ordem' | 'ativo'>>

export type FrotaDatabase = {
  __InternalSupabase: { PostgrestVersion: '14.5' }
  public: {
    Tables: {
      frota_itens_catalogo:       Tabela<ItemCatalogoRow, ItemCatalogoInsert, Partial<Omit<ItemCatalogoInsert, 'chave'>>>
      frota_veiculo_itens:        Tabela<VeiculoItemRow>
      veiculo_atribuicoes:        Tabela<AtribuicaoRow>
      veiculo_manutencoes:        Tabela<ManutencaoRow>
      veiculo_checklists:         Tabela<ChecklistRow>
      frota_alerta_destinatarios: Tabela<DestinatarioRow, { user_id: string }>
      comb_veiculos:              Tabela<VeiculoFrotaRow>
      veiculo_entregas:           Tabela<Omit<EntregaRow, 'veiculo_nome' | 'identificacao' | 'colaborador_nome' | 'obra_nome' | 'registado_por'> & { criado_por: string | null }>
    }
    Views: { [_ in never]: never }
    Functions: {
      frota_resumo_viaturas: { Args: Record<string, never>; Returns: ResumoViaturaRow[] }
      km_atual_veiculo:      { Args: { p_veiculo_id: string }; Returns: number | null }
      avaliar_frota:         { Args: { p_veiculo_id?: string }; Returns: number }
      configurar_item_veiculo: {
        Args: {
          p_veiculo_id: string; p_item_id: string; p_ativo: boolean
          p_intervalo_km: number | null; p_intervalo_meses: number | null
          p_proxima_km: number | null; p_proxima_data: string | null
        }
        Returns: string
      }
      registar_manutencao: {
        Args: {
          p_veiculo_id: string; p_item_id: string | null; p_descricao: string | null; p_data: string
          p_km: number | null; p_custo: number | null; p_oficina: string | null; p_observacoes: string | null
          p_atualiza: boolean; p_proxima_data?: string | null
        }
        Returns: string
      }
      registar_checklist: {
        Args: {
          p_veiculo_id: string; p_data: string; p_km: number | null
          p_itens: { item_id: string; estado: EstadoItem; observacao?: string | null }[]
          p_observacoes: string | null; p_foto_keys?: string[]
        }
        Returns: string
      }
      entregar_viatura: {
        Args: {
          p_veiculo_id: string; p_colaborador_id: string; p_obra_id: string | null; p_data: string; p_km: number
          p_combustivel: NivelCombustivel; p_adblue: NivelAdblue; p_oleo: NivelOleo; p_refrigeracao: NivelOleo
          p_pneus: NivelPneus; p_limpeza: NivelLimpeza; p_inventario: InventarioSeguranca; p_danos: DanoMarcado[]
          p_observacoes?: string | null
        }
        Returns: string
      }
      devolver_viatura: {
        Args: {
          p_veiculo_id: string; p_data: string; p_km: number
          p_combustivel: NivelCombustivel; p_adblue: NivelAdblue; p_oleo: NivelOleo; p_refrigeracao: NivelOleo
          p_pneus: NivelPneus; p_limpeza: NivelLimpeza; p_inventario: InventarioSeguranca; p_danos: DanoMarcado[]
          p_observacoes?: string | null; p_para_oficina?: boolean
        }
        Returns: string
      }
      definir_estado_viatura: { Args: { p_veiculo_id: string; p_estado: 'LIVRE' | 'OFICINA' }; Returns: undefined }
      frota_guardar_viatura: {
        Args: {
          p_id: string | null; p_marca: string | null; p_modelo: string | null; p_tipo: string
          p_identificacao: string | null; p_unidade_contador: 'km' | 'horas'; p_tipo_combustivel: string
          p_km_atual: number; p_data_ultima_revisao: string | null; p_km_ultima_revisao: number | null
          p_data_fim_seguro: string | null; p_seguro_foto_path: string | null
          p_data_proxima_ipo: string | null; p_ipo_foto_path: string | null; p_observacoes?: string | null
        }
        Returns: string
      }
      frota_arquivar_viatura: { Args: { p_veiculo_id: string; p_arquivar?: boolean }; Returns: undefined }
      editar_manutencao: {
        Args: {
          p_id: string; p_item_id: string | null; p_descricao: string | null; p_data: string; p_km: number | null
          p_custo: number | null; p_oficina: string | null; p_observacoes: string | null
        }
        Returns: undefined
      }
      frota_linha_tempo: { Args: { p_veiculo_id: string; p_limite?: number }; Returns: LinhaTempoRow[] }
      frota_historico_manutencoes: {
        Args: { p_veiculo_id?: string | null; p_desde?: string | null; p_ate?: string | null; p_limite?: number }
        Returns: HistoricoManutencaoRow[]
      }
      frota_listar_entregas: { Args: { p_veiculo_id?: string | null; p_limite?: number }; Returns: EntregaRow[] }
      atribuir_condutor: {
        Args: { p_veiculo_id: string; p_colaborador_id: string | null; p_desde?: string }
        Returns: string | null
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export const frotaDb = supabase as unknown as SupabaseClient<FrotaDatabase>
