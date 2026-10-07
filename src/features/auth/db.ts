import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'

// Tabelas do reforço de segurança (migrations 20261008010000 e 20261008020000).
// Até os tipos serem regenerados o esquema fica declarado aqui, com o mesmo
// formato dos tipos gerados — sem `as any`. Depois de regenerar, apagar este
// ficheiro e usar `supabase`.

export type SegurancaConfigRow = {
  id: boolean
  mfa_obrigatorio: boolean
  atualizado_por: string | null
  atualizado_em: string
}

export type EventoSegurancaRow = {
  id: string
  tipo: string
  utilizador_id: string | null
  email: string | null
  detalhe: Record<string, unknown> | null
  criado_em: string
}

type Tabela<Row> = {
  Row: Row
  Insert: never
  Update: never
  Relationships: []
}

export type SegurancaDatabase = {
  __InternalSupabase: { PostgrestVersion: '14.5' }
  public: {
    Tables: {
      seguranca_config:  Tabela<SegurancaConfigRow>
      eventos_seguranca: Tabela<EventoSegurancaRow>
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export const segurancaDb = supabase as unknown as SupabaseClient<SegurancaDatabase>
