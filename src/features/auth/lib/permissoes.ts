import type { RoleUtilizador } from '../AuthContext'

// Módulos com escrita controlada por papel.
export type Modulo = 'armazem' | 'ferramentas' | 'combustivel' | 'obras' | 'subempreitadas' | 'colaboradores' | 'frota'

// Fonte única da verdade no frontend — TEM de espelhar public.pode_escrever()
// e a policy colab_write. A segurança real é a RLS; isto serve só para
// mostrar/esconder ações na UI. Aqui (sem React nem cliente Supabase) para o
// teste supabase/tests/permissoes-espelho.test.mjs a comparar com a BD.
export const MATRIZ_ESCRITA: Record<Modulo, RoleUtilizador[]> = {
  armazem:        ['admin', 'gestor', 'armazem'],
  ferramentas:    ['admin', 'gestor', 'armazem'],
  combustivel:    ['admin', 'gestor', 'armazem'],
  obras:          ['admin', 'gestor'],
  subempreitadas: ['admin', 'gestor', 'medicoes'],
  colaboradores:  ['admin', 'gestor'],
  frota:          ['admin', 'gestor', 'mecanico'],
}

// Interruptores da ficha de pessoal. O acesso real continua a ser UM papel
// (enum role_utilizador, aplicado pela RLS): estas funções traduzem os
// interruptores para esse papel e de volta, para a UI nunca prometer mais
// do que o backend aplica.
export type PermissoesFicha = {
  contaAtiva: boolean
  apenasLeitura: boolean
  administrador: boolean
  gestorFrota: boolean
  gestorArmazem: boolean
  gestorCombustivel: boolean
  verRelatorios: boolean
  motorista: boolean
}

export type ChavePermissao = keyof PermissoesFicha

export const PERMISSOES_INICIAIS: PermissoesFicha = {
  contaAtiva: true, apenasLeitura: true, administrador: false, gestorFrota: false,
  gestorArmazem: false, gestorCombustivel: false, verRelatorios: true, motorista: false,
}

// Combustível não tem papel próprio: escreve-se com admin, gestor ou armazém
// (public.pode_escrever('combustivel')), por isso partilha o papel de Armazém.
export function papelDasPermissoes(p: PermissoesFicha, papelAtual?: RoleUtilizador | null): RoleUtilizador {
  if (papelAtual && igual(permissoesDoPapel(papelAtual, p.contaAtiva), p)) return papelAtual
  if (p.administrador) return 'admin'
  if (p.motorista) return 'motorista'
  const armazemOuCombustivel = p.gestorArmazem || p.gestorCombustivel
  if (armazemOuCombustivel && p.gestorFrota) return 'gestor'
  if (p.gestorFrota) return 'mecanico'
  if (armazemOuCombustivel) return 'armazem'
  return 'leitura'
}

export function permissoesDoPapel(papel: RoleUtilizador, contaAtiva = true): PermissoesFicha {
  const base: PermissoesFicha = { ...PERMISSOES_INICIAIS, contaAtiva, apenasLeitura: false, verRelatorios: papel !== 'mecanico' && papel !== 'motorista' }
  switch (papel) {
    case 'admin':     return { ...base, administrador: true, gestorFrota: true, gestorArmazem: true, gestorCombustivel: true }
    case 'gestor':    return { ...base, gestorFrota: true, gestorArmazem: true, gestorCombustivel: true }
    case 'armazem':   return { ...base, gestorArmazem: true, gestorCombustivel: true }
    case 'mecanico':  return { ...base, gestorFrota: true }
    case 'motorista': return { ...base, motorista: true }
    case 'medicoes':  return base
    default:          return { ...base, apenasLeitura: true }
  }
}

function igual(a: PermissoesFicha, b: PermissoesFicha): boolean {
  return (Object.keys(a) as ChavePermissao[]).every(k => a[k] === b[k])
}

// Liga/desliga um interruptor mantendo a coerência (um papel só)
export function alternarPermissao(p: PermissoesFicha, chave: ChavePermissao): PermissoesFicha {
  if (chave === 'verRelatorios') return p
  const n = { ...p, [chave]: !p[chave] }
  if (chave === 'contaAtiva') return n
  if (n[chave]) {
    if (chave === 'apenasLeitura') {
      n.administrador = n.gestorFrota = n.gestorArmazem = n.gestorCombustivel = n.motorista = false
    } else if (chave === 'administrador') {
      n.apenasLeitura = n.motorista = false
      n.gestorFrota = n.gestorArmazem = n.gestorCombustivel = true
    } else if (chave === 'motorista') {
      n.apenasLeitura = n.administrador = n.gestorFrota = n.gestorArmazem = n.gestorCombustivel = false
    } else {
      n.apenasLeitura = n.motorista = false
    }
  } else if (chave !== 'apenasLeitura') {
    n.administrador = false
  }
  if (!n.administrador && !n.apenasLeitura && !n.motorista && !n.gestorFrota && !n.gestorArmazem && !n.gestorCombustivel) {
    n.apenasLeitura = true
  }
  // O mecânico e o motorista só veem a Frota / o abastecimento
  n.verRelatorios = !(n.motorista || (n.gestorFrota && !n.administrador && !n.gestorArmazem && !n.gestorCombustivel))
  return n
}
