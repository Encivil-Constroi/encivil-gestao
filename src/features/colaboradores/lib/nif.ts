// O NIF é carregado à parte (RPC colaborador_nif) e pode não ter chegado ao
// formulário; enviá-lo sem o utilizador lhe ter mexido apagava o NIF guardado.
export function camposNif(valor: string, alterado: boolean): { nif?: string } {
  return alterado ? { nif: valor } : {}
}
