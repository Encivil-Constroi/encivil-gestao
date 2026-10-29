// Lista dos serviços de push conhecidos. Tem de coincidir com o CHECK da BD
// (push_subscriptions.endpoint): um endpoint livre permitiria ao servidor fazer
// pedidos POST a qualquer host (SSRF cego).
const HOSTS_EXATOS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com']
const SUFIXOS = ['.push.services.mozilla.com', '.push.apple.com', '.notify.windows.com']

export function endpointPermitido(endpoint: string): boolean {
  let url: URL
  try { url = new URL(endpoint) } catch { return false }
  if (url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '') return false
  const host = url.hostname.toLowerCase()
  if (!/^[a-z0-9.-]+$/.test(host)) return false
  return HOSTS_EXATOS.includes(host) || SUFIXOS.some(s => host.endsWith(s) && host.length > s.length)
}
