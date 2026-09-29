import { describe, it, expect } from 'vitest'
import { notificacaoDoPush } from '@/app/lib/notificacaoPush'

const combustivel = {
  titulo: 'ENCIVIL · Combustível',
  opcoes: {
    body: 'Novo pedido de abastecimento aguarda autorização.', tag: 'abastecimento',
    data: { url: '/combustivel' }, icon: '/pwa-192x192.png', badge: '/pwa-64x64.png',
  },
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

  it('corta textos enormes', () => {
    const n = notificacaoDoPush(JSON.stringify({ title: 'T'.repeat(500), body: 'B'.repeat(5000), url: '/frota' }))
    expect(n.titulo.length).toBe(80)
    expect(n.opcoes.body.length).toBe(400)
  })
})
