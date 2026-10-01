import type { ClimaObra, FotoObra } from '../db'

export type DadosRelatorio = {
  data: string
  clima: ClimaObra | null
  temperatura_c: number | null
  clima_descricao: string
  equipa_ids: string[]
  equipa_outros: string
  subempreiteiros_ids: string[]
  trabalhos: string
  houve_ocorrencias: boolean
  ocorrencias: string
  observacoes: string
  fotos: FotoObra[]
}

export function validarRelatorioParaSubmissao(dados: DadosRelatorio): string | null {
  if (!dados.clima) return 'Indique o clima do dia.'
  if (!dados.trabalhos.trim()) return 'Descreva os trabalhos realizados.'
  if (dados.equipa_ids.length === 0 && !dados.equipa_outros.trim()) return 'Indique quem esteve presente na obra.'
  if (dados.houve_ocorrencias && !dados.ocorrencias.trim()) return 'Descreva as ocorrências do dia.'
  if (dados.houve_ocorrencias && dados.fotos.length === 0) return 'Junte pelo menos uma foto das ocorrências.'
  return null
}

export function hojeLisboa(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
