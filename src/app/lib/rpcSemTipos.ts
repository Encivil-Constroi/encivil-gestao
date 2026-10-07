import { supabase } from '@/integrations/supabase/client'

type RpcFn = (fn: string, args?: Record<string, unknown>) => PromiseLike<{
  data: unknown
  error: { message: string } | null
}>

// Para RPCs de migrations cujos tipos ainda não foram regenerados.
// bind é obrigatório: SupabaseClient.rpc usa this.rest internamente. Feito na
// chamada (não ao importar) para não exigir supabase.rpc a quem só importa o módulo.
const rpc: RpcFn = (fn, args) => (supabase.rpc.bind(supabase) as unknown as RpcFn)(fn, args)

export async function rpcSemTipos<T = void>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args)
  if (error) throw error
  return data as T
}
