// Classificação de erros para as filas offline (movimentos e picagens). O erro do
// supabase-js é um objeto simples ({ message, code, … }), não uma instância de Error.

function mensagem(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'object' && e !== null && 'message' in e) return String(e.message)
  return String(e)
}

function codigo(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'string') return e.code
  return ''
}

// Heurística: sem navigator.onLine OU mensagem típica de falha de rede/timeout
// ("Failed to fetch" no Chrome, "NetworkError" no Firefox, "Load failed" no Safari).
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  return /failed to fetch|networkerror|network request failed|err_internet|err_connection|err_network|load failed|timeout/i.test(mensagem(e))
}

// Só estes erros justificam tirar um registo da fila: o servidor recusou-o e repetir
// dá o mesmo resultado. Tudo o resto (5xx/429 do Cloudflare, statement timeout,
// JWT expirado, erro sem código) pode resolver-se sozinho — apagar perdia o registo.
// PGRST116 (resposta sem a linha) só surge depois de o servidor ter aceitado o pedido.
export function ehErroDefinitivo(e: unknown): boolean {
  if (isNetworkError(e)) return false
  const c = codigo(e)
  return c === 'P0001' || c === '42501' || c === 'PGRST116' || /^2[23][0-9A-Z]{3}$/.test(c)
}
