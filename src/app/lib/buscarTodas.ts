// O PostgREST corta cada resposta em max_rows (1000 no Supabase) sem dar erro:
// listas, exportações e totais que precisam de todas as linhas pedem-nas por páginas.
// Só repete uma query que o service já construiu (filtros e ordem ficam no service);
// a ordem tem de ser determinística (com `id` como desempate) para as páginas não se sobreporem.
export const TAMANHO_PAGINA = 1000

type Pagina<T> = PromiseLike<{ data: T[] | null; error: unknown }>

// Só pára numa página vazia: se o max_rows do servidor for menor que a página pedida (ex.: 500),
// uma página curta não significa fim. O deslocamento avança pelas linhas realmente recebidas.
export async function buscarTodas<T>(pagina: (de: number, ate: number) => Pagina<T>): Promise<T[]> {
  const todas: T[] = []
  for (let de = 0; ; de = todas.length) {
    const { data, error } = await pagina(de, de + TAMANHO_PAGINA - 1)
    if (error) throw error
    const linhas = data ?? []
    if (linhas.length === 0) return todas
    todas.push(...linhas)
  }
}
