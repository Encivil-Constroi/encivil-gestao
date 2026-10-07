// Subconjunto da estrutura de erro do Supabase / PostgREST
interface SupabaseError {
  message: string
  code?: string
  details?: string
  hint?: string
}

function isSupabaseError(e: unknown): e is SupabaseError {
  return typeof e === 'object' && e !== null && 'message' in e
}

// Mapeamento de códigos de erro PostgreSQL / PostgREST → mensagens PT
const CODE_MAP: Record<string, string> = {
  // PostgreSQL — integridade de dados
  '23505': 'Registo duplicado — já existe um entrada com estes dados.',
  '23503': 'Não é possível eliminar — existem registos associados.',
  '23502': 'Campo obrigatório em falta.',
  '23514': 'Valor fora dos limites permitidos.',
  // PostgreSQL — permissões
  '42501': 'Sem permissão para esta operação.',
  // Supabase Auth
  'weak_password': 'A palavra-passe não cumpre os requisitos de segurança.',
  // PostgREST
  'PGRST116': 'Registo não encontrado.',
  'PGRST301': 'Sessão expirada — faça login novamente.',
  'PGRST204': 'Nenhum resultado devolvido pelo servidor.',
}

/**
 * Converte um erro do Supabase em mensagem legível em português.
 *
 * Erros P0001 (RAISE EXCEPTION das nossas RPCs) são já em português e passam
 * diretamente. Códigos PostgreSQL/PostgREST conhecidos são mapeados. Para
 * erros de rede usa mensagem amigável. `fallback` é retornado para erros
 * desconhecidos.
 */
export function parseSupabaseError(e: unknown, fallback = 'Ocorreu um erro inesperado.'): string {
  // Erros de rede (fetch falhou antes de chegar ao servidor)
  const msg = isSupabaseError(e) ? e.message : e instanceof Error ? e.message : ''
  if (
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('network request failed')
  ) {
    return 'Sem ligação ao servidor. Verifique a sua rede e tente novamente.'
  }

  if (!isSupabaseError(e)) {
    return e instanceof Error ? (e.message || fallback) : fallback
  }

  // Erros customizados das RPCs (RAISE EXCEPTION) — mensagem já em português
  if (e.code === 'P0001') return e.message

  // Códigos mapeados
  if (e.code && CODE_MAP[e.code]) return CODE_MAP[e.code]

  // Mensagem original como último recurso antes do fallback genérico
  return e.message || fallback
}

// Erro de Edge Function: o corpo { erro } já vem em pt-PT
export async function mensagemErroFuncao(e: unknown, fallback: string): Promise<string> {
  const contexto = typeof e === 'object' && e !== null && 'context' in e ? (e as { context: unknown }).context : null
  if (contexto && typeof (contexto as { json?: unknown }).json === 'function') {
    try {
      const corpo: unknown = await (contexto as { json: () => Promise<unknown> }).json()
      const erro = typeof corpo === 'object' && corpo !== null ? (corpo as { erro?: unknown }).erro : undefined
      if (typeof erro === 'string' && erro) return erro
    } catch { /* corpo ilegível: segue para a mensagem genérica */ }
  }
  return parseSupabaseError(e, fallback)
}
