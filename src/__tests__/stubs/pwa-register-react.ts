// Substitui o módulo virtual do vite-plugin-pwa nos testes (só existe no build do Vite)
export function useRegisterSW(_opcoes?: unknown) {
  return { needRefresh: [false] as [boolean], updateServiceWorker: (_recarregar?: boolean) => Promise.resolve() }
}
