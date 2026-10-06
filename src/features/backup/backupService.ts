import { supabase } from '@/integrations/supabase/client'

// nomes de tabela dinâmicos — cast necessário pois o tipo gerado não aceita strings arbitrárias
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as any

// ── Lista canónica das tabelas incluídas no backup ───────────────────────────
// Excluídas intencionalmente:
//   audit_log                   — gerido pelo Supabase, pode ser muito grande
//   profiles                    — dados de autenticação geridos pelo Supabase Auth
//   resumo_assiduidade_dia      — calculado; pode ser reconstruído a partir de faltas/horários
//   pump_*, push_subscriptions  — estado operacional da bomba e subscrições push; recriam-se sozinhos
//   veiculo_manutencao_edicoes, obra_eventos, obra_autores, auto_evidencias, auto_verificacoes, regras_classificacao
//                               — histórico/derivados auxiliares; o backup da BD (scripts/backup) cobre-os

export const TABELAS_BACKUP = [
  // Obras & contratos financeiros
  { id: 'obras',                    label: 'Obras',                       grupo: 'Obras' },
  { id: 'subempreiteiros',          label: 'Subempreiteiros',             grupo: 'Obras' },
  { id: 'subempreiteiro_artigos',   label: 'Artigos de Subempreiteiro',   grupo: 'Obras' },
  { id: 'autos_medicao',            label: 'Autos de Medição',            grupo: 'Obras' },
  { id: 'auto_linhas',              label: 'Linhas de Auto',              grupo: 'Obras' },
  { id: 'liberacoes_retencao',      label: 'Liberações de Retenção',      grupo: 'Obras' },
  { id: 'obra_fases', label: 'Fases de Obra', grupo: 'Obras' },
  { id: 'obra_orcamento_itens', label: 'Orçamento (EAP)', grupo: 'Obras' },
  { id: 'obra_relatorios_diarios', label: 'Relatórios Diários', grupo: 'Obras' },
  { id: 'obra_equipa', label: 'Equipa de Obra', grupo: 'Obras' },
  { id: 'obra_afericoes', label: 'Aferições', grupo: 'Obras' },
  { id: 'obra_fotos', label: 'Fotos de Obra', grupo: 'Obras' },
  { id: 'registos_obra', label: 'Registos de Obra', grupo: 'Obras' },
  { id: 'sub_ocorrencias', label: 'Ocorrências de Subempreitada', grupo: 'Obras' },
  { id: 'sub_documentos', label: 'Documentos de Subempreitada', grupo: 'Obras' },
  { id: 'auto_glosas', label: 'Glosas de Auto', grupo: 'Obras' },
  { id: 'subs_config', label: 'Configuração de Subempreitadas', grupo: 'Obras' },
  // Armazém
  { id: 'produtos',                 label: 'Produtos',                    grupo: 'Armazém' },
  { id: 'movimentos_stock',         label: 'Movimentos de Stock',         grupo: 'Armazém' },
  { id: 'faturas_fornecedor', label: 'Faturas de Fornecedor', grupo: 'Faturas' },
  { id: 'linhas_fatura', label: 'Linhas de Fatura', grupo: 'Faturas' },
  { id: 'guias_transporte', label: 'Guias de Transporte', grupo: 'Faturas' },
  // Ferramentas
  { id: 'ferramentas',              label: 'Ferramentas',                 grupo: 'Ferramentas' },
  { id: 'emprestimos_ferramentas',  label: 'Empréstimos de Ferramentas',  grupo: 'Ferramentas' },
  // Combustível
  { id: 'comb_veiculos',             label: 'Viaturas',                    grupo: 'Combustível' },
  { id: 'comb_abastecimentos',      label: 'Abastecimentos',              grupo: 'Combustível' },
  // Desde o abastecimento v2 os pedidos ficam guardados (fotos, leituras, decisões)
  { id: 'comb_abastecimentos_pendentes', label: 'Pedidos de Abastecimento', grupo: 'Combustível' },
  { id: 'comb_precos',              label: 'Preços do Combustível',       grupo: 'Combustível' },
  { id: 'comb_aprovadores',         label: 'Aprovadores de Abastecimento', grupo: 'Combustível' },
  { id: 'veiculo_atribuicoes', label: 'Atribuições de Condutor', grupo: 'Frota' },
  { id: 'veiculo_checklists', label: 'Checklists de Viatura', grupo: 'Frota' },
  { id: 'veiculo_entregas', label: 'Entregas de Viatura', grupo: 'Frota' },
  { id: 'veiculo_manutencoes', label: 'Manutenções', grupo: 'Frota' },
  { id: 'frota_itens_catalogo', label: 'Catálogo de Itens de Frota', grupo: 'Frota' },
  { id: 'frota_veiculo_itens', label: 'Itens por Viatura', grupo: 'Frota' },
  // Recursos Humanos
  { id: 'colaboradores',            label: 'Colaboradores',               grupo: 'RH' },
  { id: 'horarios',                 label: 'Horários',                    grupo: 'RH' },
  { id: 'horario_colaborador',      label: 'Horários por Colaborador',    grupo: 'RH' },
  { id: 'faltas',                   label: 'Faltas',                      grupo: 'RH' },
  { id: 'tipos_falta',              label: 'Tipos de Falta',              grupo: 'RH' },
  { id: 'feriados_excecoes',        label: 'Feriados e Exceções',         grupo: 'RH' },
  { id: 'custo_hora_colaborador',   label: 'Custo/Hora por Colaborador',  grupo: 'RH' },
  { id: 'picagens', label: 'Picagens', grupo: 'RH' },
  { id: 'tipos_epi', label: 'Tipos de EPI', grupo: 'RH' },
  { id: 'atribuicoes_epi', label: 'Atribuições de EPI', grupo: 'RH' },
  { id: 'tipos_formacao', label: 'Tipos de Formação', grupo: 'RH' },
  { id: 'formacoes_colaborador', label: 'Formações por Colaborador', grupo: 'RH' },
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
