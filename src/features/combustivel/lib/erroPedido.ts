// A policy pend_anon_insert recusa o 4.º pedido da mesma viatura em 5 minutos
// com uma violação de RLS. Sem isto o motorista via "Verifica a ligação" e
// ficava a tentar em vão. Outros 42501 ("permission denied") são falhas de
// configuração e mantêm a mensagem genérica.
export function mensagemErroPedido(error: { code?: string; message?: string }): string {
  if (error.code === '42501' && /row-level security/i.test(error.message ?? '')) {
    return 'Já foram feitos 3 pedidos para esta viatura nos últimos 5 minutos. Aguarde e tente de novo.'
  }
  return 'Erro ao enviar. Verifica a ligação.'
}
