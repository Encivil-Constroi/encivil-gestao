import { numeroOuNulo } from './frota'
import type { DadosItemCatalogo } from '../services/frotaService'
import type { Categoria, Natureza } from '../db'

export type FormItem = {
  rotulo: string; categoria: Categoria; natureza: Natureza
  intervaloKm: string; intervaloMeses: string
  limiarAtencaoKm: string; limiarUrgenteKm: string; limiarAtencaoDias: string; limiarUrgenteDias: string
  ativo: boolean
}

// Valida o formulário; devolve os dados ou a mensagem de erro
export function validarItem(f: FormItem): DadosItemCatalogo | string {
  const rotulo = f.rotulo.trim()
  if (rotulo.length < 2 || rotulo.length > 120) return 'O nome tem de ter entre 2 e 120 caracteres.'
  const n = {
    intervaloKm: numeroOuNulo(f.intervaloKm), intervaloMeses: numeroOuNulo(f.intervaloMeses),
    atKm: numeroOuNulo(f.limiarAtencaoKm), urgKm: numeroOuNulo(f.limiarUrgenteKm),
    atDias: numeroOuNulo(f.limiarAtencaoDias), urgDias: numeroOuNulo(f.limiarUrgenteDias),
  }
  const manutencao = f.natureza === 'MANUTENCAO'
  if (manutencao) {
    if (n.intervaloKm !== null && !(n.intervaloKm > 0)) return 'Intervalo em km inválido.'
    if (n.intervaloMeses !== null && !(Number.isInteger(n.intervaloMeses) && n.intervaloMeses > 0)) return 'Intervalo em meses tem de ser um número inteiro maior que 0.'
    for (const v of [n.atKm, n.urgKm, n.atDias, n.urgDias]) if (v === null || !Number.isFinite(v) || v < 0) return 'Preencha os avisos com números iguais ou maiores que 0.'
    if (n.urgKm! > n.atKm!) return 'O aviso urgente (km) tem de ser menor ou igual ao aviso de atenção.'
    if (n.urgDias! > n.atDias!) return 'O aviso urgente (dias) tem de ser menor ou igual ao aviso de atenção.'
    if (!Number.isInteger(n.atDias) || !Number.isInteger(n.urgDias)) return 'Os avisos em dias têm de ser números inteiros.'
  }
  return {
    rotulo, categoria: f.categoria, natureza: f.natureza,
    intervaloKm: manutencao ? n.intervaloKm : null,
    intervaloMeses: manutencao ? n.intervaloMeses : null,
    limiarAtencaoKm: manutencao ? n.atKm! : 2000, limiarUrgenteKm: manutencao ? n.urgKm! : 500,
    limiarAtencaoDias: manutencao ? n.atDias! : 30, limiarUrgenteDias: manutencao ? n.urgDias! : 7,
    ativo: f.ativo,
  }
}

