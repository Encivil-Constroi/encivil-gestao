import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'

// Tabelas da migration 20260917180000_fase8_livro_obra, ainda fora dos tipos gerados.
// Declaradas no formato dos tipos gerados — sem `as any`.
// Quando os tipos forem regenerados, apagar este ficheiro e usar `supabase`.

export type RegistoObraRow = {
  id: string; obra_id: string; data: string; categoria: string; descricao: string
  foto_keys: string[]; autor_id: string; created_at: string
}
type RegistoObraInsert = {
  obra_id: string; data: string; categoria: string; descricao: string; foto_keys?: string[]; autor_id: string
}
type RegistoObraUpdate = Partial<Pick<RegistoObraRow, 'data' | 'categoria' | 'descricao' | 'foto_keys'>>

export type GuiaLinhaJson = { descricao: string; quantidade: number; unidade: string }
export type GuiaTransporteRow = {
  id: string; numero: string; obra_id: string | null; viatura_id: string | null
  motorista_id: string | null; origem: string | null; destino: string | null
  data_carga: string | null; estado: string; linhas: GuiaLinhaJson[]; created_at: string
}

type LivroObraDatabase = {
  __InternalSupabase: { PostgrestVersion: '14.5' }
  public: {
    Tables: {
      registos_obra: { Row: RegistoObraRow; Insert: RegistoObraInsert; Update: RegistoObraUpdate; Relationships: [] }
      guias_transporte: { Row: GuiaTransporteRow; Insert: never; Update: { estado: string }; Relationships: [] }
    }
    Views: { [_ in never]: never }
    Functions: {
      criar_guia_transporte: {
        Args: {
          p_obra_id: string | null; p_motorista: string | null; p_origem: string | null
          p_destino: string | null; p_data_carga: string; p_linhas: GuiaLinhaJson[]
        }
        Returns: string
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export const livroObraDb = supabase as unknown as SupabaseClient<LivroObraDatabase>
