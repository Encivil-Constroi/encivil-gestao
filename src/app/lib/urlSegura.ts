// href/src vindos da BD só se forem https: bloqueia javascript:, data: e afins
export function urlHttps(url: string | null | undefined): string | null {
  return url && url.startsWith('https://') ? url : null
}
