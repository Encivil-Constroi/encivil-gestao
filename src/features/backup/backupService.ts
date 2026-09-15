import { supabase } from '@/integrations/supabase/client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ── Lista canónica das tabelas incluídas no backup ───────────────────────────
// Excluídas intencionalmente:
//   audit_log                   — gerido pelo Supabase, pode ser muito grande
//   profiles                    — dados de autenticação geridos pelo Supabase Auth
//   comb_abastecimentos_pendentes — fila transiente de QR codes (dados temporários)
//   resumo_assiduidade_dia      — calculado; pode ser reconstruído a partir de faltas/horários

export const TABELAS_BACKUP = [
  // Obras & contratos financeiros
  { id: 'obras',                    label: 'Obras',                       grupo: 'Obras' },
  { id: 'subempreiteiros',          label: 'Subempreiteiros',             grupo: 'Obras' },
  { id: 'subempreiteiro_artigos',   label: 'Artigos de Subempreiteiro',   grupo: 'Obras' },
  { id: 'autos_medicao',            label: 'Autos de Medição',            grupo: 'Obras' },
  { id: 'auto_linhas',              label: 'Linhas de Auto',              grupo: 'Obras' },
  { id: 'liberacoes_retencao',      label: 'Liberações de Retenção',      grupo: 'Obras' },
  // Armazém
  { id: 'produtos',                 label: 'Produtos',                    grupo: 'Armazém' },
  { id: 'movimentos_stock',         label: 'Movimentos de Stock',         grupo: 'Armazém' },
  // Ferramentas
  { id: 'ferramentas',              label: 'Ferramentas',                 grupo: 'Ferramentas' },
  { id: 'emprestimos_ferramentas',  label: 'Empréstimos de Ferramentas',  grupo: 'Ferramentas' },
  // Combustível
  { id: 'comb_viaturas',            label: 'Viaturas',                    grupo: 'Combustível' },
  { id: 'comb_abastecimentos',      label: 'Abastecimentos',              grupo: 'Combustível' },
  // Recursos Humanos
  { id: 'colaboradores',            label: 'Colaboradores',               grupo: 'RH' },
  { id: 'horarios',                 label: 'Horários',                    grupo: 'RH' },
  { id: 'horario_colaborador',      label: 'Horários por Colaborador',    grupo: 'RH' },
  { id: 'faltas',                   label: 'Faltas',                      grupo: 'RH' },
  { id: 'tipos_falta',              label: 'Tipos de Falta',              grupo: 'RH' },
  { id: 'feriados_excecoes',        label: 'Feriados e Exceções',         grupo: 'RH' },
  { id: 'custo_hora_colaborador',   label: 'Custo/Hora por Colaborador',  grupo: 'RH' },
  // Manutenção
  { id: 'regras_alerta',            label: 'Regras de Alerta',            grupo: 'Manutenção' },
  { id: 'alertas',                  label: 'Alertas',                     grupo: 'Manutenção' },
  // Configuração
  { id: 'configuracoes_empresa',    label: 'Configurações da Empresa',    grupo: 'Sistema' },
] as const

export type TabelaId = typeof TABELAS_BACKUP[number]['id']

export type BackupData = {
  versao:     string
  aplicacao:  string
  exportadoEm: string
  tabelas:    Record<string, unknown[]>
}

// Busca todas as linhas de uma tabela com paginação automática.
// O Supabase limita 1000 linhas por pedido — para tabelas grandes como
// movimentos_stock, itera até não haver mais resultados.
export async function exportarTabela(tabela: string): Promise<unknown[]> {
  const PAGE = 1000
  const all: unknown[] = []
  let from = 0

  while (true) {
    const { data, error } = await db
      .from(tabela)
      .select('*')
      .range(from, from + PAGE - 1)

    if (error) throw new Error(error.message)
    if (!data?.length) break
    all.push(...data)
    if (data.length < PAGE) break  // última página — menos que PAGE resultados
    from += PAGE
  }

  return all
}
