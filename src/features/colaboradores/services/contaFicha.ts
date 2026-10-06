import {
  alterarPapel, convidarUtilizador, desativarUtilizador, reativarUtilizador,
  type Utilizador, type RoleUtilizador,
} from '@/features/auth/services/utilizadoresService'

export type PedidoConta = {
  colaboradorId: string
  nome: string
  email: string
  telemovel: string
  fotoPath: string | null
  role: RoleUtilizador
  contaAtiva: boolean
  // Conta já ligada à ficha (a conhecida pela administração), se existir
  utilizador?: Utilizador
}

// Aplica as permissões da ficha à conta (só admin: a Edge Function recusa os outros).
// Devolve a mensagem de aviso a mostrar, ou null se correu tudo.
export async function sincronizarConta(p: PedidoConta): Promise<string | null> {
  try {
    if (p.utilizador) {
      if (p.utilizador.role !== p.role) await alterarPapel(p.utilizador.id, p.role)
      if (p.utilizador.ativo !== p.contaAtiva) {
        await (p.contaAtiva ? reativarUtilizador : desativarUtilizador)(p.utilizador.id)
      }
      return null
    }
    if (!p.contaAtiva) return null
    if (!p.email.trim()) return 'Ficha guardada, mas a conta não foi criada: falta o email.'
    await convidarUtilizador(p.email.trim().toLowerCase(), p.nome, p.role, {
      colaboradorId: p.colaboradorId,
      telemovel: p.telemovel.trim() || undefined,
      fotoPath: p.fotoPath ?? undefined,
    })
    return null
  } catch (e) {
    return `Ficha guardada, mas as permissões falharam: ${e instanceof Error ? e.message : 'erro desconhecido'}`
  }
}
