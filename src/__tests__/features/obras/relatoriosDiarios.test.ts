import { describe, expect, it } from 'vitest'
import { validarRelatorioParaSubmissao, type DadosRelatorio } from '@/features/obras/lib/relatorioDiario'

const base: DadosRelatorio = {
  data: '2026-10-01', clima: 'SOL', temperatura_c: null, clima_descricao: '',
  equipa_ids: ['col-1'], equipa_outros: '', subempreiteiros_ids: [],
  trabalhos: 'Betonagem da laje', houve_ocorrencias: false, ocorrencias: '', observacoes: '', fotos: [],
}

describe('validação do relatório diário antes da submissão', () => {
  it('aceita equipa externa quando não há colaborador alocado presente', () => {
    expect(validarRelatorioParaSubmissao({ ...base, equipa_ids: [], equipa_outros: 'João Silva' })).toBeNull()
  })

  it('exige clima, trabalhos e presença', () => {
    expect(validarRelatorioParaSubmissao({ ...base, clima: null })).toMatch(/clima/i)
    expect(validarRelatorioParaSubmissao({ ...base, trabalhos: '  ' })).toMatch(/trabalhos/i)
    expect(validarRelatorioParaSubmissao({ ...base, equipa_ids: [] })).toMatch(/presente/i)
  })

  it('exige descrição e foto quando houve ocorrências', () => {
    expect(validarRelatorioParaSubmissao({ ...base, houve_ocorrencias: true })).toMatch(/ocorrências/i)
    expect(validarRelatorioParaSubmissao({ ...base, houve_ocorrencias: true, ocorrencias: 'Atraso' })).toMatch(/foto/i)
    expect(validarRelatorioParaSubmissao({ ...base, houve_ocorrencias: true, ocorrencias: 'Atraso', fotos: [{ path: 'obra/relatorios/foto.jpg', legenda: null }] })).toBeNull()
  })
})
