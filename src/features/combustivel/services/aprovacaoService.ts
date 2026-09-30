import { combDb } from '../db'

// Separado do pedidosService: o menu lateral usa isto em todas as páginas e
// não deve trazer para o arranque o resto dos pedidos (carregado à parte)
export async function fetchPodeAprovar(): Promise<boolean> {
  const { data, error } = await combDb.rpc('pode_aprovar_combustivel')
  if (error) throw error
  return data === true
}

export async function contarAguardam(): Promise<number> {
  const { count, error } = await combDb.from('comb_abastecimentos_pendentes')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'AGUARDA_AUTORIZACAO')
  if (error) throw error
  return count ?? 0
}
