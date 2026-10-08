// Tem de avaliar ANTES do cliente Supabase: o cliente consome e limpa o #access_token
// do URL ao ser criado, e o router arranca antes da página de recuperação montar.

export type EntradaRecuperacao =
  | { tipo: 'token_hash'; tokenHash: string }
  | { tipo: 'sessao' }
  | { tipo: 'erro'; codigo: string; descricao: string }

const MARCADOR = 'encivil-recuperacao'
const CAMINHO_RESET = '/reset-password'

export function analisarEntradaUrl(search: string, hash: string): EntradaRecuperacao | null {
  const q = new URLSearchParams(search)
  const tokenHash = q.get('token_hash')
  if (q.get('type') === 'recovery' && tokenHash) return { tipo: 'token_hash', tokenHash }

  const h = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  const codigo = h.get('error_code') ?? h.get('error')
  if (codigo) return { tipo: 'erro', codigo, descricao: h.get('error_description') ?? '' }
  if (h.get('access_token') && h.get('type') === 'recovery') return { tipo: 'sessao' }
  return null
}

let capturada: EntradaRecuperacao | null = null

export function entradaCapturada(): EntradaRecuperacao | null {
  return capturada
}

export function temMarcadorRecuperacao(): boolean {
  try { return sessionStorage.getItem(MARCADOR) === '1' } catch { return false }
}

export function limparMarcadorRecuperacao(): void {
  try { sessionStorage.removeItem(MARCADOR) } catch { /* sessionStorage indisponível */ }
}

function capturar(): void {
  if (typeof window === 'undefined') return
  const { search, hash, pathname } = window.location
  capturada = analisarEntradaUrl(search, hash)
  if (!capturada) return
  if (capturada.tipo !== 'erro') {
    try { sessionStorage.setItem(MARCADOR, '1') } catch { /* sessionStorage indisponível */ }
  }
  if (pathname !== CAMINHO_RESET) window.history.replaceState(window.history.state, '', `${CAMINHO_RESET}${search}${hash}`)
}

capturar()
