export type LinhaGemini = {
  descricao: string
  quantidade: number | null
  unidade: string | null
  preco_unitario: number | null
  total_linha: number | null
}

// Limites de linhas_fatura: NUMERIC(10,3), (12,4) e (12,2); fora deles o insert falha na BD.
// Menos meia unidade da última casa, porque o arredondamento pode estourar o limite.
const LIMITES = {
  quantidade: 1e7 - 0.0005,
  preco_unitario: 1e8 - 0.00005,
  total_linha: 1e10 - 0.005,
} as const
const CAMPOS_NUMERICOS = Object.keys(LIMITES) as Array<keyof typeof LIMITES>

// Valida a saída da Gemini antes de tocar na BD: uma linha inválida abortaria o
// insert depois de apagadas as linhas anteriores.
export function validarLinhas(linhas: unknown): LinhaGemini[] {
  if (!Array.isArray(linhas) || linhas.length === 0) throw new Error('Sem linhas')
  for (const l of linhas) {
    if (typeof l !== 'object' || l === null) throw new Error('Linha inválida')
    const o = l as Record<string, unknown>
    if (typeof o.descricao !== 'string' || o.descricao.trim() === '') throw new Error('Descrição inválida')
    for (const c of CAMPOS_NUMERICOS) {
      const v = o[c]
      if (v !== undefined && v !== null && !(typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < LIMITES[c])) {
        throw new Error(`Campo ${c} inválido`)
      }
    }
    if (o.unidade !== undefined && o.unidade !== null && typeof o.unidade !== 'string') throw new Error('Unidade inválida')
  }
  return linhas as LinhaGemini[]
}
