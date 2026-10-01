import type { ObraResumoRow } from '@/features/obras/db'

let seq = 0

export function obraFixture(p: Partial<ObraResumoRow> = {}): ObraResumoRow {
  seq++
  return {
    obra_id: `obra-${seq}`, nome: `Obra ${seq}`, cliente: null, localizacao: null, morada: null,
    latitude: null, longitude: null, estado: 'ativa',
    data_inicio: null, data_prevista_fim: null, data_fim_real: null,
    progresso_pct: null, progresso_fonte: 'nenhuma', progresso_esperado_pct: null,
    saude: 'ok', motivos: [], orcamento: null, custo_total: 0,
    equipa_n: 0, viaturas_n: 0, ferramentas_n: 0, subs_n: 0, materiais_valor: 0,
    ocorrencias_abertas: 0, relatorios_n: 0, fotos_n: 0, afericoes_n: 0,
    ultimo_relatorio: null, dias_sem_relatorio: null,
    responsavel_id: null, responsavel_nome: null, engenheiro_id: null, engenheiro_nome: null,
    tipo_obra: null, descricao: null, observacoes: null,
    ...p,
  }
}
