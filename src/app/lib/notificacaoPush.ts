// Traduz o conteúdo de uma push no que o service worker mostra.
// Com conteúdo (cifrado RFC 8291): pedidos e decisões de abastecimento
// (notificar-abastecimento) e alertas de frota (send-push-frota).
// Sem conteúdo ou ilegível: texto genérico de combustível (compatível com
// subscrições antigas).

export type Notificacao = {
  titulo: string
  opcoes: {
    body: string; icon: string; badge: string; tag: string; data: { url: string }
    renotify?: boolean; requireInteraction?: boolean; vibrate?: number[]
  }
  // Número a mostrar no ícone da app (pedidos à espera), quando vem no push
  contagem: number | null
}

const ICONES = { icon: '/pwa-192x192.png', badge: '/pwa-64x64.png' }

const COMBUSTIVEL: Notificacao = {
  titulo: 'ENCIVIL · Combustível',
  opcoes: { ...ICONES, body: 'Há um pedido de abastecimento para ver.', tag: 'abastecimento', data: { url: '/abastecimento' } },
  contagem: null,
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
  const tag = texto(dados.tag, 60) || 'geral'
  const contagem = typeof dados.contagem === 'number' && Number.isInteger(dados.contagem) && dados.contagem >= 0 && dados.contagem < 1000
    ? dados.contagem : null
  // Abastecimento: alguém está parado à espera — a notificação fica no ecrã e vibra
  const abastecimento = tag.startsWith('abast-')
  return {
    titulo,
    opcoes: {
      ...ICONES, body: corpo, tag, data: { url },
      ...(abastecimento ? { renotify: true, requireInteraction: true, vibrate: [200, 100, 200] } : {}),
    },
    contagem,
  }
}
