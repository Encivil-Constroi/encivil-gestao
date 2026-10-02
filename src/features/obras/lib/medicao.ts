import type { DocsEstadoGlobal, SubDocEstadoRow } from '../db'
import { mensagemDocsEmFalta, tiposEmFaltaOuExpirados } from './compliance'

export const TOLERANCIA_EUR = 0.01

export function arred2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
function arred3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000
}

export function certificado(valorPeriodo: number, glosado: number): number {
  return arred2(valorPeriodo - glosado)
}

export function retencao(cert: number, pct: number): number {
  return arred2((cert * pct) / 100)
}

export function aPagar(valorPeriodo: number, glosado: number, pctRetencao: number): number {
  const cert = certificado(valorPeriodo, glosado)
  return arred2(cert - retencao(cert, pctRetencao))
}

/** Saldo por medir de um artigo; negativo = excesso. */
export function saldoArtigo(prevista: number, acumulada: number): number {
  return arred3(prevista - acumulada)
}

export type LinhaAutoEntrada = {
  descricao?: string
  artigoId: string | null
  isExtra: boolean
  precoUnitario: number
  precoContrato?: number | null
  quantidade: number
  qtdPedida: number | null
  justificacao: string | null
  quantidadePrevista?: number | null
  acumuladoOutrosAutos?: number
}

export type AutoEntrada = {
  tipoContrato: 'unitario' | 'global'
  dataMedicao: string
  hoje: string
  valorPeriodo: number
  percentagemPeriodo: number | null
  valorGlobal: number | null
  acumuladoPctOutrosAutos: number
  linhas: LinhaAutoEntrada[]
}

/** Pré-condições deterministas de `auto_submeter`; devolve as mensagens de erro (vazio = pode submeter). */
export function validarLinhasAuto(a: AutoEntrada): string[] {
  const erros: string[] = []
  if (a.dataMedicao > a.hoje) erros.push('A data da medição não pode ser futura.')

  if (a.tipoContrato === 'unitario') {
    if (a.linhas.length === 0) erros.push('O auto não tem linhas.')
    a.linhas.forEach((l, i) => {
      const nome = l.descricao?.trim() || `linha ${i + 1}`
      if (l.isExtra) {
        if (!l.justificacao?.trim()) erros.push(`Trabalhos a mais exigem justificação (${nome}).`)
        return
      }
      if (l.artigoId === null) return
      if (l.precoContrato != null && arred2(l.precoUnitario) !== arred2(l.precoContrato)) {
        erros.push(`O preço de "${nome}" não corresponde ao do contrato.`)
      }
      if (l.qtdPedida != null && l.quantidade > l.qtdPedida) {
        erros.push(`A quantidade verificada de "${nome}" excede a pedida pelo subempreiteiro.`)
      }
      if (l.quantidadePrevista != null) {
        const acumulado = arred3((l.acumuladoOutrosAutos ?? 0) + l.quantidade)
        if (acumulado > l.quantidadePrevista) {
          erros.push(`A quantidade acumulada de "${nome}" (${acumulado}) excede a prevista (${l.quantidadePrevista}).`)
        }
      }
    })
    const soma = arred2(a.linhas.reduce((s, l) => s + l.quantidade * l.precoUnitario, 0))
    if (a.linhas.length > 0 && Math.abs(soma - a.valorPeriodo) > TOLERANCIA_EUR + 1e-9) {
      erros.push('O valor do período não corresponde à soma das linhas.')
    }
  } else {
    const pct = a.percentagemPeriodo ?? 0
    if (!(pct > 0)) erros.push('A percentagem do período tem de ser superior a 0.')
    if (a.acumuladoPctOutrosAutos + pct > 100 + 1e-9) erros.push('O acumulado ultrapassa 100% do contrato.')
    if (a.valorGlobal != null) {
      const esperado = arred2((pct * a.valorGlobal) / 100)
      if (Math.abs(esperado - a.valorPeriodo) > TOLERANCIA_EUR + 1e-9) {
        erros.push('O valor do período não corresponde à percentagem do valor global.')
      }
    }
  }
  return erros
}

export type PapelAprovacao = 'gestor' | 'admin'

export function alcadaNecessaria(
  a: { certificado: number; temExtras: boolean },
  cfg: { alcada_gestor_ate: number },
): PapelAprovacao {
  return a.temExtras || a.certificado > cfg.alcada_gestor_ate ? 'admin' : 'gestor'
}

export type EntradaBloqueios = {
  fatura: { numero: string | null; path: string | null; valor: number | null } | null
  valorAprovado?: number | null
  docs: SubDocEstadoRow[]
  ocorrenciasAltas: number
}

export type CfgBloqueios = { exigir_fatura_para_pagar: boolean; bloquear_pagamento_sem_docs: boolean }

export type ResultadoBloqueios = {
  bloqueios: string[]
  avisos: string[]
  docsEstado: DocsEstadoGlobal
}

/** O valor da fatura nunca bloqueia: só gera aviso. */
export function bloqueiosPagamento(e: EntradaBloqueios, cfg: CfgBloqueios): ResultadoBloqueios {
  const bloqueios: string[] = []
  const avisos: string[] = []

  const faturaGuardada = !!e.fatura && !!e.fatura.numero?.trim() && !!e.fatura.path
  if (cfg.exigir_fatura_para_pagar && !faturaGuardada) {
    bloqueios.push('Falta guardar a fatura do subempreiteiro (número e ficheiro).')
  }
  if (e.ocorrenciasAltas > 0) {
    bloqueios.push('Existem ocorrências graves de qualidade ou segurança por resolver.')
  }
  const emFalta = tiposEmFaltaOuExpirados(e.docs)
  if (cfg.bloquear_pagamento_sem_docs) {
    const msg = mensagemDocsEmFalta(emFalta)
    if (msg) bloqueios.push(msg)
  }
  if (
    faturaGuardada && e.fatura!.valor != null && e.valorAprovado != null &&
    Math.abs(arred2(e.fatura!.valor) - arred2(e.valorAprovado)) > TOLERANCIA_EUR + 1e-9
  ) {
    avisos.push('O valor da fatura diverge do valor aprovado.')
  }

  const docsEstado: DocsEstadoGlobal = emFalta.length > 0
    ? 'critico'
    : e.docs.some(d => d.obrigatorio && d.estado === 'a_expirar') ? 'a_expirar' : 'ok'
  return { bloqueios, avisos, docsEstado }
}
