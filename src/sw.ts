/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { StaleWhileRevalidate, CacheFirst, NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

// Responder a SKIP_WAITING enviado por updateServiceWorker(false) no UpdatePrompt.
// Sem este handler, o SW ignorava a mensagem e permanecia em "waiting" para sempre,
// causando um loop de recarregamentos no cliente.
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

// Take control of all clients immediately after activation
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// SPA navigation: serve index.html for all navigations not matched by precache
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/auth\//, /^\/sw-reset\.html$/],
  })
)

// JS/CSS: StaleWhileRevalidate — new chunks fetched in background after each deploy
registerRoute(
  /\.(?:js|css)$/,
  new StaleWhileRevalidate({
    cacheName: 'static-assets',
    plugins: [new ExpirationPlugin({ maxAgeSeconds: 60 * 60 * 24 * 7 })],
  })
)

// Images/fonts: CacheFirst — these never change between deploys
registerRoute(
  /\.(?:png|svg|ico|woff2?)$/,
  new CacheFirst({
    cacheName: 'immutable-assets',
    plugins: [new ExpirationPlugin({ maxAgeSeconds: 60 * 60 * 24 * 30 })],
  })
)

// Supabase API: NetworkFirst — dados críticos de stock nunca servidos do cache
// Regex cobre todos os subdomínios Supabase: rest, auth, storage e Edge Functions
registerRoute(
  /[a-z0-9-]+\.supabase\.co\//,
  new NetworkFirst({
    cacheName: 'supabase-api',
    networkTimeoutSeconds: 10,
    plugins: [new ExpirationPlugin({ maxAgeSeconds: 60 * 5 })],
  })
)

// ── Push notifications ────────────────────────────────────────────────────────
// Payload is data-less (send-push Edge Function sends no body to avoid
// the complexity of RFC 8291 AES-128-GCM encryption). Fixed notification text is
// enough — the boss opens the app to see details.
self.addEventListener('push', () => {
  self.registration.showNotification('ENCIVIL · Combustível', {
    body:  'Novo pedido de abastecimento aguarda autorização.',
    icon:  '/pwa-192x192.png',
    badge: '/pwa-64x64.png',
    tag:   'abastecimento',
    data:  { url: '/combustivel' },
  })
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | null)?.url ?? '/combustivel'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        const wc = client as WindowClient
        if ('focus' in wc) {
          wc.navigate(url)
          return wc.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
