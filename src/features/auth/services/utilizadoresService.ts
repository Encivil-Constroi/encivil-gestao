import { supabase } from '@/integrations/supabase/client'

export type RoleUtilizador = 'admin' | 'gestor' | 'armazem' | 'medicoes' | 'leitura'

export interface Utilizador {
  id: string
  email: string
  nome: string
  role: RoleUtilizador
  ativo: boolean
  ultimoLogin: string | null
  criadoEm: string
}

async function chamarAdmin<T>(action: string, payload?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('admin-utilizadores', {
    body: { action, payload },
  })
  if (error) throw new Error(error.message)
  const resp = data as unknown as { erro?: string } & T
  if (resp?.erro) throw new Error(resp.erro)
  return data as T
}

export async function listarUtilizadores(): Promise<Utilizador[]> {
  return chamarAdmin<Utilizador[]>('listar')
}

export async function convidarUtilizador(email: string, nome: string, role: RoleUtilizador): Promise<void> {
  await chamarAdmin('convidar', { email, nome, role })
}

export async function alterarPapel(userId: string, role: RoleUtilizador): Promise<void> {
  await chamarAdmin('alterarPapel', { userId, role })
}

export async function desativarUtilizador(userId: string): Promise<void> {
  await chamarAdmin('desativar', { userId })
}

export async function reativarUtilizador(userId: string): Promise<void> {
  await chamarAdmin('reativar', { userId })
}
