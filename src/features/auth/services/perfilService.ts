import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'
import { rpcSemTipos } from '@/app/lib/rpcSemTipos'
import { mensagemSenha, validarSenha } from '../lib/politicaSenha'

// profiles com telemovel e foto_path (migration 20261007000000), ainda sem
// tipos gerados. Quando forem regenerados, apagar este remendo.
export type PerfilRow = { nome: string; email: string; telemovel: string | null; foto_path: string | null; role: string }

type PerfilDatabase = {
  __InternalSupabase: { PostgrestVersion: '14.5' }
  public: {
    Tables: { profiles: { Row: PerfilRow & { id: string }; Insert: never; Update: never; Relationships: [] } }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
const perfilDb = supabase as unknown as SupabaseClient<PerfilDatabase>

const SELECT = 'nome, email, telemovel, foto_path, role'

export async function buscarMeuPerfil(userId: string): Promise<PerfilRow> {
  const { data, error } = await perfilDb.from('profiles').select(SELECT).eq('id', userId).single()
  if (error) throw error
  return data
}

export async function atualizarContacto(nome: string, telemovel: string, fotoPath: string | null): Promise<true> {
  await rpcSemTipos('atualizar_meu_perfil', { p_nome: nome, p_telemovel: telemovel, p_foto_path: fotoPath })
  return true
}

// O Supabase envia um link de confirmação para o email novo
export async function pedirNovoEmail(email: string): Promise<true> {
  const { error } = await supabase.auth.updateUser({ email: email.trim().toLowerCase() })
  if (error) throw error
  return true
}

// Confirma a senha atual antes de aceitar a nova (sessão roubada não chega para a trocar)
export async function alterarSenha(email: string, atual: string, nova: string): Promise<true> {
  const erroPolitica = mensagemSenha(validarSenha(nova))
  if (erroPolitica) throw new Error(erroPolitica)
  const { error: errAtual } = await supabase.auth.signInWithPassword({ email, password: atual })
  if (errAtual) throw new Error('A senha atual está incorreta.')
  const { error } = await supabase.auth.updateUser({ password: nova })
  if (error) throw error
  return true
}
