import {
  alterarPapel, criarUtilizador, desativarUtilizador, reativarUtilizador,
  type Utilizador, type RoleUtilizador,
} from '@/features/auth/services/utilizadoresService'
import { emailEfetivo, senhaValida } from '@/features/auth/lib/contaInterna'

export type PedidoConta = {
  colaboradorId: string
  nome: string
  email: string
  // Utilizador de entrada e senha inicial (vazios = não criar conta)
  login: string
  senha: string
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
    if (!emailEfetivo(p.email, p.login) || !senhaValida(p.senha)) {
      return 'Ficha guardada, mas a conta não foi criada: indique email ou utilizador e uma senha.'
    }
    await criarUtilizador({
      nome: p.nome, role: p.role, senha: p.senha,
      email: p.email.trim().toLowerCase() || undefined,
      login: p.login.trim() || undefined,
      colaboradorId: p.colaboradorId,
      telemovel: p.telemovel.trim() || undefined,
      fotoPath: p.fotoPath ?? undefined,
    })
    return null
  } catch (e) {
    return `Ficha guardada, mas as permissões falharam: ${e instanceof Error ? e.message : 'erro desconhecido'}`
  }
}
