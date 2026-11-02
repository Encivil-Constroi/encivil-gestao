function urlLoopbackValida(valor: string): boolean {
  try {
    const url = new URL(valor)
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
      && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash
  } catch {
    return false
  }
}

export function selecionarConfiguracaoSupabase(
  urlEnv: string | undefined,
  chaveEnv: string | undefined,
  dev: boolean,
  fallback: { url: string; chave: string },
): { url: string; chave: string; usaFallback: boolean } {
  const url = (urlEnv ?? '').trim()
  const chave = (chaveEnv ?? '').trim()
  const hosted = /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)
  const loopback = dev && urlLoopbackValida(url)
  const chaveValida = /^sb_publishable_[A-Za-z0-9_-]+$/.test(chave)
  // URL e chave pertencem ao mesmo projeto: o fallback nunca pode misturar os pares.
  if ((!hosted && !loopback) || !chaveValida) {
    // Em dev, uma config preenchida mas inválida falha alto: cair em produção sem aviso é perigoso.
    if (dev && (url || chave)) {
      throw new Error(
        'Configuração Supabase local inválida: VITE_SUPABASE_URL tem de ser https://<projeto>.supabase.co ou http(s)://localhost|127.0.0.1:<porta> e VITE_SUPABASE_PUBLISHABLE_KEY tem de começar por sb_publishable_. Corrija o .env.local — em desenvolvimento nunca se usa o projeto de produção por omissão.',
      )
    }
    return { ...fallback, usaFallback: true }
  }
  return { url: loopback ? new URL(url).origin : url, chave, usaFallback: false }
}
