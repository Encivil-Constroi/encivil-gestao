export type LogRow = {
  id: string
  action: string
  actor_id: string | null
  created_at: string
  details: Record<string, unknown> | null
  target_id: string | null
}

export type CampoAlterado = { campo: string; rotulo: string; antes: string; depois: string }

// Tabelas com o trigger auditar_alteracao (20261008060000_seguranca_auditoria.sql)
export const TABELAS_AUDITADAS = [
  'profiles', 'colaboradores', 'faturas_fornecedor', 'comb_aprovadores',
  'configuracoes_empresa', 'seguranca_config', 'obras',
] as const

// Tabelas ainda com o trigger audit_delete (20260703000002): action = 'delete_<tabela>'
export const TABELAS_ELIMINACAO_LEGADA = ['subempreiteiros', 'autos_medicao', 'comb_abastecimentos'] as const

// Opções do filtro "Módulo"
export const TABELAS_FILTRO: readonly string[] = [...TABELAS_AUDITADAS, ...TABELAS_ELIMINACAO_LEGADA]

const TABELA_LABEL: Record<string, string> = {
  profiles:              'utilizadores',
  colaboradores:         'colaboradores',
  faturas_fornecedor:    'faturas de fornecedor',
  comb_aprovadores:      'aprovadores de combustível',
  configuracoes_empresa: 'configurações da empresa',
  seguranca_config:      'configuração de segurança',
  obras:                 'obras',
  subempreiteiros:       'subempreiteiros',
  autos_medicao:         'autos de medição',
  comb_abastecimentos:   'abastecimentos',
}

export function labelTabela(tabela: string): string {
  return TABELA_LABEL[tabela] ?? tabela
}

const ENTIDADE: Record<string, string> = {
  profiles:              'o utilizador',
  colaboradores:         'o colaborador',
  obras:                 'a obra',
  faturas_fornecedor:    'a fatura de fornecedor',
  comb_aprovadores:      'o aprovador de combustível',
  configuracoes_empresa: 'as configurações da empresa',
  seguranca_config:      'a configuração de segurança',
  subempreiteiros:       'o subempreiteiro',
  autos_medicao:         'o auto de medição',
  comb_abastecimentos:   'o abastecimento',
}

const VERBO: Record<string, string> = { insert: 'criou', update: 'alterou', delete: 'eliminou' }

// Mudanças nestas tabelas mexem em acessos/segurança, seja qual for a operação
const TABELAS_SENSIVEIS = new Set(['profiles', 'seguranca_config', 'comb_aprovadores'])

export const OPERACAO_LABEL: Record<string, string> = {
  insert: 'Criação',
  update: 'Alteração',
  delete: 'Eliminação',
}

export function separarAction(action: string): { tabela: string; operacao: 'insert' | 'update' | 'delete' } | null {
  const m = /^([a-z0-9_]+)\.(insert|update|delete)$/.exec(action)
  return m ? { tabela: m[1], operacao: m[2] as 'insert' | 'update' | 'delete' } : null
}

export function labelAction(action: string): string {
  const generica = separarAction(action)
  if (generica) return `${OPERACAO_LABEL[generica.operacao]} em ${labelTabela(generica.tabela)}`
  if (action.startsWith('delete_'))  return `Eliminação (${labelTabela(action.slice(7))})`
  switch (action) {
    case 'role_change':              return 'Alteração de papel'
    case 'mfa_obrigatorio':          return 'Verificação em dois passos obrigatória'
    case 'validar_subempreiteiro':   return 'Validação subempreiteiro'
    case 'validar_auto':             return 'Validação auto'
    case 'auto_aprovar':             return 'Aprovação de auto'
    case 'auto_devolver':            return 'Devolução de auto'
    case 'auto_glosar':              return 'Glosa em auto'
    case 'auto_levantar_glosa':      return 'Glosa levantada em auto'
    case 'auto_registar_fatura':     return 'Fatura registada em auto'
    case 'auto_verificar_excecao':   return 'Exceção verificada em auto'
    case 'auto_guardar_evidencias_admin': return 'Evidências de auto guardadas'
    case 'marcar_auto_pago':         return 'Auto marcado como pago'
    default: return action
  }
}

export function severidadeAction(action: string): 'high' | 'medium' | 'low' {
  const generica = separarAction(action)
  if (generica) {
    if (generica.operacao === 'delete' || TABELAS_SENSIVEIS.has(generica.tabela)) return 'high'
    return 'medium'
  }
  if (action === 'role_change' || action === 'mfa_obrigatorio' || action.startsWith('delete_')) return 'high'
  if (action.startsWith('validar_')) return 'medium'
  return 'low'
}

const ROTULO_CAMPO: Record<string, string> = {
  nome: 'Nome',
  email: 'Email',
  role: 'Papel',
  novo_role: 'Novo papel',
  telemovel: 'Telemóvel',
  ativo: 'Ativo',
  cargo: 'Cargo',
  numero_mecan: 'Nº mecanográfico',
  obra_id: 'Obra',
  estado: 'Estado',
  total_fatura: 'Total',
  numero_fatura: 'Nº fatura',
  fornecedor: 'Fornecedor',
  data_fatura: 'Data da fatura',
  orcamento: 'Orçamento',
  cliente: 'Cliente',
  localizacao: 'Local',
  mfa_obrigatorio: 'MFA obrigatório',
  nif: 'NIF',
}

const ROTULO_PAPEL: Record<string, string> = {
  admin: 'Administrador', gestor: 'Gestor', armazem: 'Armazém', medicoes: 'Medições',
  mecanico: 'Mecânico', motorista: 'Motorista', leitura: 'Leitura',
}

const CAMPOS_OCULTOS = new Set(['id', 'created_at', 'updated_at', 'atualizado_em', 'user_id'])
const CAMPOS_PESSOAIS = new Set(['nif'])

function rotuloCampo(campo: string): string {
  const r = ROTULO_CAMPO[campo]
  if (r) return r
  const txt = campo.replace(/_/g, ' ')
  return txt.charAt(0).toUpperCase() + txt.slice(1)
}

function formatarValor(campo: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  if (typeof v === 'string') {
    if (campo === 'role' || campo.endsWith('_role')) return ROTULO_PAPEL[v] ?? v
    const d = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(v)
    if (d) return `${d[3]}/${d[2]}/${d[1]}`
    return v
  }
  if (typeof v === 'object') {
    const s = JSON.stringify(v)
    return s.length > 80 ? `${s.slice(0, 79)}…` : s
  }
  return String(v)
}

function ehDiff(v: unknown): v is { antes?: unknown; depois?: unknown } {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && ('antes' in v || 'depois' in v)
}

// Ações antigas: 'delete_<tabela>' equivale a '<tabela>.delete'; as restantes
// (role_change, validar_*, auto_*…) mostram os campos gravados como valor final.
function operacaoDe(action: string): 'insert' | 'update' | 'delete' | 'outra' {
  const g = separarAction(action)
  if (g) return g.operacao
  return action.startsWith('delete_') ? 'delete' : 'outra'
}

export function camposAlterados(action: string, details: Record<string, unknown> | null): CampoAlterado[] {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return []
  const operacao = operacaoDe(action)
  const out: CampoAlterado[] = []
  for (const [campo, valor] of Object.entries(details)) {
    if (CAMPOS_OCULTOS.has(campo) || campo.endsWith('_path')) continue
    let antes: string
    let depois: string
    if (operacao === 'update') {
      if (!ehDiff(valor)) continue
      antes = formatarValor(campo, valor.antes)
      depois = formatarValor(campo, valor.depois)
    } else if (operacao === 'insert' || operacao === 'outra') {
      antes = '—'
      depois = formatarValor(campo, valor)
    } else {
      antes = formatarValor(campo, valor)
      depois = '—'
    }
    if (CAMPOS_PESSOAIS.has(campo)) {
      if (antes !== '—') antes = '(alterado)'
      if (depois !== '—') depois = '(alterado)'
    }
    out.push({ campo, rotulo: rotuloCampo(campo), antes, depois })
  }
  return out.sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt'))
}

const CAMPOS_NOME = ['nome', 'numero_fatura', 'designacao', 'titulo']

export function nomeDoAlvo(row: LogRow, nomesPerfis: Map<string, string>): string | null {
  if (row.target_id) {
    const n = nomesPerfis.get(row.target_id)
    if (n) return n
  }
  const d = row.details
  if (!d) return null
  for (const c of CAMPOS_NOME) {
    const v = d[c]
    const bruto = ehDiff(v) ? v.depois : v
    if (typeof bruto === 'string' && bruto.trim()) return bruto
  }
  // Autos de medição só têm número
  if (typeof d.numero === 'number') return `nº ${d.numero}`
  return null
}

export function descreverRegisto(row: LogRow, nomeAtor: string, nomeAlvo: string | null): string {
  const g = separarAction(row.action)
  if (!g) {
    const tabela = row.action.startsWith('delete_') ? row.action.slice(7) : null
    const entidade = tabela ? ENTIDADE[tabela] : undefined
    if (!entidade) return `${nomeAtor}: ${labelAction(row.action)}`
    return nomeAlvo ? `${nomeAtor} eliminou ${entidade} ${nomeAlvo}` : `${nomeAtor} eliminou ${entidade}`
  }
  const entidade = ENTIDADE[g.tabela] ?? `o registo (${g.tabela})`
  let frase = `${nomeAtor} ${VERBO[g.operacao]} ${entidade}`
  if (nomeAlvo) frase += ` ${nomeAlvo}`
  if (g.operacao === 'update') {
    const campos = camposAlterados(row.action, row.details)
    if (campos.length > 0) frase += ` (${campos.map(c => c.rotulo).join(', ')})`
  }
  return frase
}

// --- Períodos em Europe/Lisbon ---------------------------------------------

const FMT_LISBOA = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Lisbon', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
})

function offsetLisboaMs(instante: number): number {
  const p: Record<string, number> = {}
  for (const x of FMT_LISBOA.formatToParts(new Date(instante))) if (x.type !== 'literal') p[x.type] = Number(x.value)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instante / 1000) * 1000
}

/** Data (YYYY-MM-DD) em Lisboa de um instante. */
export function dataLisboa(instante: Date): string {
  const p: Record<string, string> = {}
  for (const x of FMT_LISBOA.formatToParts(instante)) if (x.type !== 'literal') p[x.type] = x.value
  return `${p.year}-${p.month}-${p.day}`
}

/** Instante UTC (ISO) em que começa o dia YYYY-MM-DD em Lisboa. */
export function inicioDiaLisboa(dia: string): string {
  const [y, m, d] = dia.split('-').map(Number)
  const naive = Date.UTC(y, m - 1, d)
  let inst = naive - offsetLisboaMs(naive)
  inst = naive - offsetLisboaMs(inst)
  return new Date(inst).toISOString()
}

export function somarDias(dia: string, n: number): string {
  const [y, m, d] = dia.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

export function limitesPeriodo(
  periodo: 'hoje' | 'semana' | 'mes' | 'todos',
  agora: Date = new Date(),
): { desde?: string; ate?: string } {
  if (periodo === 'todos') return {}
  const hoje = dataLisboa(agora)
  const recuo = periodo === 'hoje' ? 0 : periodo === 'semana' ? 6 : 29
  return { desde: inicioDiaLisboa(somarDias(hoje, -recuo)) }
}
