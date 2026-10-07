// Só o site da ENCIVIL (produção, previews do Cloudflare Pages e dev local)
// pode chamar as funções a partir de um browser. Chamadas sem Origin
// (pg_cron, Shelly, servidor) não são afetadas — a autenticação é o JWT/segredo.
const ORIGENS = new Set([
  'https://app.encivilconstroi.com',
  'https://encivil-gestao.pages.dev',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])
const PREVIEW = /^https:\/\/[a-z0-9-]+\.encivil-gestao\.pages\.dev$/

export function origemPermitida(origem: string | null): boolean {
  if (!origem) return false
  return ORIGENS.has(origem) || PREVIEW.test(origem)
}

export function cabecalhosCors(req: Request, metodos = 'POST, OPTIONS'): Record<string, string> {
  const origem = req.headers.get('Origin')
  const base: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': metodos,
    'Vary': 'Origin',
  }
  if (origem && origemPermitida(origem)) base['Access-Control-Allow-Origin'] = origem
  return base
}

export function respostaPreflight(req: Request, metodos?: string): Response {
  return new Response('ok', { headers: cabecalhosCors(req, metodos) })
}

export function origemRecusada(req: Request): boolean {
  const origem = req.headers.get('Origin')
  return origem !== null && !origemPermitida(origem)
}
