// Limitador partilhado (RPC rate_limit_consumir, papel de serviço).
export const MSG_LIMITE = 'Demasiados pedidos. Tenta dentro de instantes.'

type ClienteRpc = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>
}

export async function dentroDoLimite(cliente: ClienteRpc, chave: string, janelaSeg: number, max: number): Promise<boolean> {
  const { data, error } = await cliente.rpc('rate_limit_consumir', { p_chave: chave, p_janela_seg: janelaSeg, p_max: max })
  // Falha aberta: um erro do limitador (ou a migration ainda por aplicar) não pode
  // parar o trabalho das equipas; fica nos Logs para se ver.
  if (error) { console.error(`[limite] ${chave}: ${error.message}`); return true }
  return data === true
}

export function respostaLimite(cors: Record<string, string>, janelaSeg: number): Response {
  return new Response(JSON.stringify({ erro: MSG_LIMITE }), {
    status: 429,
    headers: { ...cors, 'Content-Type': 'application/json', 'Retry-After': String(janelaSeg) },
  })
}
