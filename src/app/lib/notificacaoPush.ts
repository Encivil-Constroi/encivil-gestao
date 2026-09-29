// Traduz o conteúdo de uma push no que o service worker mostra.
// Sem conteúdo = pedido de combustível (o send-push envia push vazia de
// propósito); com conteúdo = alerta de frota (send-push-frota, cifrado).

export type Notificacao = {
  titulo: string
  opcoes: { body: string; icon: string; badge: string; tag: string; data: { url: string } }
}

const ICONES = { icon: '/pwa-192x192.png', badge: '/pwa-64x64.png' }

const COMBUSTIVEL: Notificacao = {
  titulo: 'ENCIVIL · Combustível',
  opcoes: { ...ICONES, body: 'Novo pedido de abastecimento aguarda autorização.', tag: 'abastecimento', data: { url: '/combustivel' } },
}

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export function notificacaoDoPush(conteudo: string | null | undefined): Notificacao {
  if (!conteudo) return COMBUSTIVEL
  let dados: Record<string, unknown>
  try {
    const lido: unknown = JSON.parse(conteudo)
    if (!lido || typeof lido !== 'object') return COMBUSTIVEL
    dados = lido as Record<string, unknown>
  } catch {
    return COMBUSTIVEL
  }

  const titulo = texto(dados.title, 80)
  const corpo  = texto(dados.body, 400)
  if (!titulo || !corpo) return COMBUSTIVEL

  // Só caminhos internos: o toque nunca abre um site externo
  const url = typeof dados.url === 'string' && /^\/(?!\/)/.test(dados.url) ? dados.url : '/'
  const tag = texto(dados.tag, 40) || 'geral'
  return { titulo, opcoes: { ...ICONES, body: corpo, tag, data: { url } } }
}
