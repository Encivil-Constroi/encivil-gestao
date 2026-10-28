export type LinhaGemini = {
  descricao: string
  quantidade: number | null
  unidade: string | null
  preco_unitario: number | null
  total_linha: number | null
}

const CAMPOS_NUMERICOS = ['quantidade', 'preco_unitario', 'total_linha'] as const

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
      if (v !== undefined && v !== null && !(typeof v === 'number' && Number.isFinite(v))) {
        throw new Error(`Campo ${c} inválido`)
      }
    }
    if (o.unidade !== undefined && o.unidade !== null && typeof o.unidade !== 'string') throw new Error('Unidade inválida')
  }
  return linhas as LinhaGemini[]
}
