import { limparCacheMemoria } from '@/app/lib/useAsync'

// Telemóveis partilhados em obra: ao sair, nada do utilizador anterior pode
// ficar legível. Os caches de assets ficam (a app tem de arrancar offline);
// a fila offline fica (é de outro utilizador e só ele a envia — ver offlineQueue).
export const CACHES_COM_DADOS = ['supabase-api'] as const
// Inventário: nenhuma chave de localStorage guarda dados de negócio hoje (só
// preferências, datas locais e a fila offline). Novas chaves com dados entram aqui.
export const CHAVES_LOCAIS_COM_DADOS: readonly string[] = []

export async function limparDadosLocais(): Promise<void> {
  limparCacheMemoria()
  try {
    sessionStorage.clear()
    CHAVES_LOCAIS_COM_DADOS.forEach(k => localStorage.removeItem(k))
  } catch { /* armazenamento bloqueado: nada a limpar */ }
  if (typeof caches === 'undefined' || !caches) return
  await Promise.all(CACHES_COM_DADOS.map(nome => caches.delete(nome).catch(() => false)))
}
