import { describe, it, expect } from 'vitest'
import { notificacaoDoPush } from '@/app/lib/notificacaoPush'

const combustivel = {
  titulo: 'ENCIVIL · Combustível',
  opcoes: {
    body: 'Há um pedido de abastecimento para ver.', tag: 'abastecimento',
    data: { url: '/abastecimento' }, icon: '/pwa-192x192.png', badge: '/pwa-64x64.png',
  },
  contagem: null,
}

describe('notificacaoDoPush', () => {
  it.each([null, undefined, ''])('push sem conteúdo (%s) continua a ser o pedido de combustível', c => {
    expect(notificacaoDoPush(c)).toEqual(combustivel)
  })

  it('alerta de frota mostra o texto enviado e abre a Frota', () => {
    const n = notificacaoDoPush(JSON.stringify({
      title: 'Frota · Urgente', body: 'Carrinha 2 — Seguro (validade): vence em 3 dias', url: '/frota', tag: 'frota',
    }))
    expect(n.titulo).toBe('Frota · Urgente')
    expect(n.opcoes).toMatchObject({ body: 'Carrinha 2 — Seguro (validade): vence em 3 dias', tag: 'frota', data: { url: '/frota' } })
  })

  it.each([
    ['JSON inválido', '{nao é json'],
    ['sem título', JSON.stringify({ body: 'x' })],
    ['sem corpo', JSON.stringify({ title: 'x' })],
    ['não é objeto', JSON.stringify('texto')],
    ['nulo', 'null'],
  ])('conteúdo estranho (%s) cai no texto seguro de combustível', (_n, c) => {
    expect(notificacaoDoPush(c)).toEqual(combustivel)
  })

  it.each([
    ['site externo', 'https://phishing.example/login'],
    ['protocolo relativo', '//phishing.example'],
    ['javascript', 'javascript:alert(1)'],
    ['não é texto', 42],
  ])('o toque nunca abre %s', (_n, url) => {
    const n = notificacaoDoPush(JSON.stringify({ title: 'T', body: 'B', url }))
    expect(n.opcoes.data.url).toBe('/')
  })

  it('pedido de abastecimento: fica no ecrã, vibra, volta a avisar e leva a contagem para o ícone', () => {
    const n = notificacaoDoPush(JSON.stringify({
      title: '⛽ Pedido de abastecimento (3 à espera)', body: '👷 Rui · 🚐 Carrinha 3', url: '/abastecer/pedidos?pedido=abc',
      tag: 'abast-11111111-2222-3333-4444-555555555555', contagem: 3,
    }))
    expect(n.titulo).toBe('⛽ Pedido de abastecimento (3 à espera)')
    expect(n.opcoes).toMatchObject({ requireInteraction: true, renotify: true, data: { url: '/abastecer/pedidos?pedido=abc' } })
    expect(n.opcoes.vibrate?.length).toBeGreaterThan(0)
    expect(n.contagem).toBe(3)
  })

  it('frota não fica presa no ecrã nem mexe no ícone', () => {
    const n = notificacaoDoPush(JSON.stringify({ title: 'Frota', body: 'x', url: '/frota', tag: 'frota' }))
    expect(n.opcoes.requireInteraction).toBeUndefined()
    expect(n.contagem).toBeNull()
  })

  it.each([[-1], [1.5], ['3'], [5000]])('contagem inválida (%s) é ignorada', c => {
    expect(notificacaoDoPush(JSON.stringify({ title: 'T', body: 'B', tag: 'abast-x', contagem: c })).contagem).toBeNull()
  })

  it('corta textos enormes', () => {
    const n = notificacaoDoPush(JSON.stringify({ title: 'T'.repeat(500), body: 'B'.repeat(5000), url: '/frota' }))
    expect(n.titulo.length).toBe(80)
    expect(n.opcoes.body.length).toBe(400)
  })
})
