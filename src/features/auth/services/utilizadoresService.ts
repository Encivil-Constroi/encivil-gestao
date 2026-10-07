import { supabase } from '@/integrations/supabase/client'

export type { RoleUtilizador } from '../AuthContext'
import type { RoleUtilizador } from '../AuthContext'

export interface Utilizador {
  id: string
  email: string
  nome: string
  role: RoleUtilizador
  ativo: boolean
  ultimoLogin: string | null
  criadoEm: string
  login: string | null
  semEmail: boolean
}

async function mensagemErro(error: { message: string; context?: unknown }): Promise<string> {
  const ctx = error.context
  if (ctx instanceof Response) {
    try {
      const corpo = (await ctx.clone().json()) as { erro?: string }
      if (corpo?.erro) return corpo.erro
    } catch { /* corpo não-JSON */ }
  }
  return error.message.includes('non-2xx') ? 'Erro no servidor de contas. Tente novamente.' : error.message
}

async function chamarAdmin<T>(action: string, payload?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('admin-utilizadores', {
    body: { action, payload },
  })
  if (error) throw new Error(await mensagemErro(error))
  const resp = data as unknown as { erro?: string } & T
  if (resp?.erro) throw new Error(resp.erro)
  return data as T
}

export async function listarUtilizadores(): Promise<Utilizador[]> {
  return chamarAdmin<Utilizador[]>('listar')
}

export type ExtrasConvite = { colaboradorId?: string; telemovel?: string; fotoPath?: string }

export async function convidarUtilizador(email: string, nome: string, role: RoleUtilizador, extras: ExtrasConvite = {}): Promise<void> {
  await chamarAdmin('convidar', { email, nome, role, ...extras })
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

export type NovoUtilizador = {
  nome: string
  role: RoleUtilizador
  senha: string
  email?: string
  login?: string
  colaboradorId?: string
  telemovel?: string
  fotoPath?: string
}

export async function criarUtilizador(d: NovoUtilizador): Promise<{ userId: string; email: string }> {
  const r = await chamarAdmin<{ sucesso: boolean; userId: string; email: string }>('criar', { ...d })
  return { userId: r.userId, email: r.email }
}

export async function redefinirSenha(userId: string, senha: string): Promise<void> {
  await chamarAdmin('redefinirSenha', { userId, senha })
}
