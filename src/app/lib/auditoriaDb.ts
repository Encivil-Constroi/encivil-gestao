import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'
import type { Database } from '@/integrations/supabase/types'

// Auditoria genérica (migration 20261008060000). Os tipos gerados só voltam a ser
// regenerados com o CLI; até lá as colunas novas do audit_log ficam declaradas
// aqui por cima dos tipos gerados — sem `as any`.
// Quando os tipos forem regenerados, apagar este ficheiro e usar `supabase`.

type Pub = Database['public']
type T = Pub['Tables']

export type AuditLogExtra = { tabela: string | null; operacao: string | null }

type AuditLog = Omit<T['audit_log'], 'Row' | 'Insert' | 'Update'> & {
  Row: T['audit_log']['Row'] & AuditLogExtra
  Insert: T['audit_log']['Insert'] & Partial<AuditLogExtra>
  Update: T['audit_log']['Update'] & Partial<AuditLogExtra>
}

export type AuditoriaDatabase = Omit<Database, 'public'> & {
  public: Omit<Pub, 'Tables'> & {
    Tables: Omit<T, 'audit_log'> & { audit_log: AuditLog }
  }
}

export const auditoriaDb = supabase as unknown as SupabaseClient<AuditoriaDatabase>
