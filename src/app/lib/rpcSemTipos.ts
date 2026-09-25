import { supabase } from '@/integrations/supabase/client'

type RpcFn = (fn: string, args?: Record<string, unknown>) => PromiseLike<{
  data: unknown
  error: { message: string } | null
}>

// Para RPCs de migrations cujos tipos ainda não foram regenerados.
// bind é obrigatório: SupabaseClient.rpc usa this.rest internamente.
const rpc = supabase.rpc.bind(supabase) as unknown as RpcFn

export async function rpcSemTipos<T = void>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args)
  if (error) throw error
  return data as T
}
