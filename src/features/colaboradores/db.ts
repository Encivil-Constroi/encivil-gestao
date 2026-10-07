import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'

// colaboradores com as colunas da migration 20261007000000 (telemovel, email,
// foto_path, setor), que os tipos gerados ainda não têm. Quando forem
// regenerados, apagar este ficheiro e usar `supabase`.
export type ColaboradorDbRow = {
  id: string
  nome: string
  numero_mecan: string
  nif: string | null
  cargo: string
  obra_id: string | null
  user_id: string | null
  ativo: boolean
  notas: string | null
  telemovel: string | null
  email: string | null
  foto_path: string | null
  setor: string | null
  created_at: string
}

export type ColaboradorDbInsert = Pick<ColaboradorDbRow, 'nome' | 'numero_mecan' | 'cargo'>
  & Partial<Omit<ColaboradorDbRow, 'id' | 'created_at' | 'ativo'>>

export type TipoContrato = 'SEM_TERMO' | 'TERMO_CERTO' | 'TERMO_INCERTO' | 'TEMPORARIO' | 'ESTAGIO' | 'OUTRO'

// colaboradores_dados_laborais (migration 20261007100000) — RGPD: só admin/gestor.
export type DadosLaborais = {
  colaborador_id: string
  niss: string | null
  iban: string | null
  data_admissao: string | null
  tipo_contrato: TipoContrato | null
  data_fim_contrato: string | null
  categoria_profissional: string | null
}

export type ColaboradoresDatabase = {
  __InternalSupabase: { PostgrestVersion: '14.5' }
  public: {
    Tables: {
      colaboradores: {
        Row: ColaboradorDbRow
        Insert: ColaboradorDbInsert
        Update: Partial<ColaboradorDbInsert> & { ativo?: boolean }
        Relationships: [{
          foreignKeyName: 'colaboradores_obra_id_fkey'; columns: ['obra_id']; isOneToOne: false
          referencedRelation: 'obras'; referencedColumns: ['id']
        }]
      }
      colaboradores_dados_laborais: {
        Row: DadosLaborais & { updated_at: string }
        Insert: DadosLaborais & { updated_at?: string }
        Update: Partial<DadosLaborais>
        Relationships: []
      }
      obras: { Row: { id: string; nome: string }; Insert: never; Update: never; Relationships: [] }
    }
    Views: { [_ in never]: never }
    Functions: {
      // 20261008030000: NIF só para admin, gestor e o próprio
      colaborador_nif: { Args: { p_id: string }; Returns: string | null }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export const colaboradoresDb = supabase as unknown as SupabaseClient<ColaboradoresDatabase>
