import { describe, expect, it } from 'vitest'
import {
  aPagar, alcadaNecessaria, arred2, bloqueiosPagamento, certificado, retencao, saldoArtigo,
  validarLinhasAuto, type AutoEntrada, type LinhaAutoEntrada,
} from '@/features/obras/lib/medicao'
import type { SubDocEstadoRow } from '@/features/obras/db'

describe('dinheiro', () => {
  it('arredonda a 2 casas', () => {
    expect(arred2(1.005)).toBe(1.01)
    expect(arred2(0.1 + 0.2)).toBe(0.3)
  })
  it('certificado = valor − glosado', () => {
    expect(certificado(1000, 150.5)).toBe(849.5)
    expect(certificado(1000, 0)).toBe(1000)
    expect(certificado(1000, 1000)).toBe(0)
  })
  it('retenção sobre o certificado', () => {
    expect(retencao(849.5, 5)).toBe(42.48)
    expect(retencao(0, 5)).toBe(0)
    expect(retencao(1000, 0)).toBe(0)
  })
  it('a pagar = certificado − retenção, e fecha com o certificado', () => {
    const pagar = aPagar(1000, 100, 5)
    expect(pagar).toBe(855)
    expect(pagar + retencao(certificado(1000, 100), 5)).toBe(certificado(1000, 100))
  })
  it('saldo de artigo: positivo, zero e excesso', () => {
    expect(saldoArtigo(100, 40.5)).toBe(59.5)
    expect(saldoArtigo(100, 100)).toBe(0)
    expect(saldoArtigo(100, 100.25)).toBe(-0.25)
    expect(saldoArtigo(0.3, 0.1)).toBe(0.2)
  })
})

const linha = (o: Partial<LinhaAutoEntrada> = {}): LinhaAutoEntrada => ({
  descricao: 'Betão', artigoId: 'a1', isExtra: false, precoUnitario: 10, precoContrato: 10,
  quantidade: 5, qtdPedida: 5, justificacao: null, quantidadePrevista: 100, acumuladoOutrosAutos: 0, ...o,
})
const unit = (o: Partial<AutoEntrada> = {}): AutoEntrada => ({
  tipoContrato: 'unitario', dataMedicao: '2026-10-01', hoje: '2026-10-04', valorPeriodo: 50,
  percentagemPeriodo: null, valorGlobal: null, acumuladoPctOutrosAutos: 0, linhas: [linha()], ...o,
})
const glob = (o: Partial<AutoEntrada> = {}): AutoEntrada => ({
  tipoContrato: 'global', dataMedicao: '2026-10-01', hoje: '2026-10-04', valorPeriodo: 2000,
  percentagemPeriodo: 10, valorGlobal: 20000, acumuladoPctOutrosAutos: 30, linhas: [], ...o,
})

describe('validarLinhasAuto — unitário', () => {
  it('aceita um auto válido', () => expect(validarLinhasAuto(unit())).toEqual([]))
  it('recusa data futura', () => {
    expect(validarLinhasAuto(unit({ dataMedicao: '2026-10-05' }))).toContain('A data da medição não pode ser futura.')
  })
  it('aceita a data de hoje', () => expect(validarLinhasAuto(unit({ dataMedicao: '2026-10-04' }))).toEqual([]))
  it('recusa auto sem linhas', () => {
    expect(validarLinhasAuto(unit({ linhas: [], valorPeriodo: 0 }))).toContain('O auto não tem linhas.')
  })
  it('recusa preço diferente do contrato', () => {
    const e = validarLinhasAuto(unit({ linhas: [linha({ precoUnitario: 11 })], valorPeriodo: 55 }))
    expect(e.join(' ')).toContain('não corresponde ao do contrato')
  })
  it('sem preço de contrato conhecido não compara', () => {
    expect(validarLinhasAuto(unit({ linhas: [linha({ precoContrato: null })] }))).toEqual([])
  })
  it('recusa verificada acima da pedida', () => {
    const e = validarLinhasAuto(unit({ linhas: [linha({ quantidade: 6, qtdPedida: 5 })], valorPeriodo: 60 }))
    expect(e.join(' ')).toContain('excede a pedida')
  })
  it('sem qtd pedida usa a própria quantidade', () => {
    expect(validarLinhasAuto(unit({ linhas: [linha({ qtdPedida: null })] }))).toEqual([])
  })
  it('recusa acumulado acima do previsto', () => {
    const e = validarLinhasAuto(unit({ linhas: [linha({ acumuladoOutrosAutos: 96, quantidadePrevista: 100 })] }))
    expect(e.join(' ')).toContain('excede a prevista')
  })
  it('aceita acumulado igual ao previsto', () => {
    expect(validarLinhasAuto(unit({ linhas: [linha({ acumuladoOutrosAutos: 95 })] }))).toEqual([])
  })
  it('extra sem justificação é recusado; com justificação passa sem outras regras', () => {
    const extra = linha({ isExtra: true, artigoId: null, justificacao: '  ', quantidadePrevista: null, qtdPedida: 1 })
    expect(validarLinhasAuto(unit({ linhas: [extra] })).join(' ')).toContain('justificação')
    expect(validarLinhasAuto(unit({ linhas: [{ ...extra, justificacao: 'Pedido do dono de obra' }] }))).toEqual([])
  })
  it('linha sem artigo e sem extra não é verificada por artigo', () => {
    expect(validarLinhasAuto(unit({ linhas: [linha({ artigoId: null })] }))).toEqual([])
  })
  it('valor do período tem tolerância de 0,01', () => {
    expect(validarLinhasAuto(unit({ valorPeriodo: 50.01 }))).toEqual([])
    expect(validarLinhasAuto(unit({ valorPeriodo: 50.02 }))).toContain('O valor do período não corresponde à soma das linhas.')
  })
  it('acumula vários erros', () => {
    const e = validarLinhasAuto(unit({ dataMedicao: '2027-01-01', linhas: [linha({ precoUnitario: 9 })], valorPeriodo: 1 }))
    expect(e.length).toBeGreaterThanOrEqual(3)
  })
})

describe('validarLinhasAuto — global', () => {
  it('aceita um auto válido', () => expect(validarLinhasAuto(glob())).toEqual([]))
  it('recusa percentagem 0 ou negativa', () => {
    expect(validarLinhasAuto(glob({ percentagemPeriodo: 0, valorPeriodo: 0 }))).toContain('A percentagem do período tem de ser superior a 0.')
    expect(validarLinhasAuto(glob({ percentagemPeriodo: null, valorPeriodo: 0 })).length).toBeGreaterThan(0)
  })
  it('recusa acumulado acima de 100 e aceita exatamente 100', () => {
    expect(validarLinhasAuto(glob({ acumuladoPctOutrosAutos: 95 }))).toContain('O acumulado ultrapassa 100% do contrato.')
    expect(validarLinhasAuto(glob({ acumuladoPctOutrosAutos: 90 }))).toEqual([])
  })
  it('valor tem de bater com percentagem × global (±0,01)', () => {
    expect(validarLinhasAuto(glob({ valorPeriodo: 2000.01 }))).toEqual([])
    expect(validarLinhasAuto(glob({ valorPeriodo: 2001 }))).toContain('O valor do período não corresponde à percentagem do valor global.')
  })
  it('sem valor global conhecido não compara o valor', () => {
    expect(validarLinhasAuto(glob({ valorGlobal: null, valorPeriodo: 1 }))).toEqual([])
  })
})

describe('alcadaNecessaria', () => {
  const cfg = { alcada_gestor_ate: 10000 }
  it('gestor até ao limite (inclusive)', () => {
    expect(alcadaNecessaria({ certificado: 10000, temExtras: false }, cfg)).toBe('gestor')
    expect(alcadaNecessaria({ certificado: 0.01, temExtras: false }, cfg)).toBe('gestor')
  })
  it('admin acima do limite', () => {
    expect(alcadaNecessaria({ certificado: 10000.01, temExtras: false }, cfg)).toBe('admin')
  })
  it('admin sempre que há trabalhos a mais', () => {
    expect(alcadaNecessaria({ certificado: 100, temExtras: true }, cfg)).toBe('admin')
  })
})

const doc = (tipo: SubDocEstadoRow['tipo'], estado: SubDocEstadoRow['estado'], obrigatorio = true): SubDocEstadoRow => ({
  tipo, obrigatorio, estado, validade: null, dias_restantes: null, doc_id: null, referencia: null,
})
const cfgPag = { exigir_fatura_para_pagar: true, bloquear_pagamento_sem_docs: true }
const faturaOk = { numero: 'FT 2026/12', path: 'sub/fatura-1.pdf', valor: 1000 }

describe('bloqueiosPagamento', () => {
  it('sem bloqueios nem avisos quando tudo está em ordem', () => {
    const r = bloqueiosPagamento({ fatura: faturaOk, valorAprovado: 1000, docs: [doc('CERT_SS', 'ok')], ocorrenciasAltas: 0 }, cfgPag)
    expect(r).toEqual({ bloqueios: [], avisos: [], docsEstado: 'ok' })
  })
  it('bloqueia sem fatura (null, sem número ou sem ficheiro)', () => {
    for (const fatura of [null, { ...faturaOk, numero: ' ' }, { ...faturaOk, path: null }]) {
      const r = bloqueiosPagamento({ fatura, docs: [], ocorrenciasAltas: 0 }, cfgPag)
      expect(r.bloqueios[0]).toContain('fatura')
    }
  })
  it('não exige fatura se a configuração o dispensa', () => {
    const r = bloqueiosPagamento({ fatura: null, docs: [], ocorrenciasAltas: 0 }, { ...cfgPag, exigir_fatura_para_pagar: false })
    expect(r.bloqueios).toEqual([])
  })
  it('valor divergente é só aviso e nunca bloqueia', () => {
    const r = bloqueiosPagamento({ fatura: { ...faturaOk, valor: 1500 }, valorAprovado: 1000, docs: [], ocorrenciasAltas: 0 }, cfgPag)
    expect(r.bloqueios).toEqual([])
    expect(r.avisos).toEqual(['O valor da fatura diverge do valor aprovado.'])
  })
  it('diferença de 0,01 não gera aviso', () => {
    const r = bloqueiosPagamento({ fatura: { ...faturaOk, valor: 1000.01 }, valorAprovado: 1000, docs: [], ocorrenciasAltas: 0 }, cfgPag)
    expect(r.avisos).toEqual([])
  })
  it('bloqueia com ocorrências altas por resolver', () => {
    const r = bloqueiosPagamento({ fatura: faturaOk, docs: [], ocorrenciasAltas: 2 }, cfgPag)
    expect(r.bloqueios.join(' ')).toContain('ocorrências graves')
  })
  it('bloqueia com documentos em falta ou expirados, mas não com os a expirar', () => {
    const r = bloqueiosPagamento({ fatura: faturaOk, docs: [doc('CERT_SS', 'em_falta'), doc('CERT_AT', 'expirado'), doc('ALVARA', 'a_expirar')], ocorrenciasAltas: 0 }, cfgPag)
    expect(r.bloqueios).toHaveLength(1)
    expect(r.bloqueios[0]).toContain('Segurança Social')
    expect(r.bloqueios[0]).toContain('Finanças')
    expect(r.bloqueios[0]).not.toContain('IMPIC')
    expect(r.docsEstado).toBe('critico')
  })
  it('documentos não obrigatórios em falta não bloqueiam', () => {
    const r = bloqueiosPagamento({ fatura: faturaOk, docs: [doc('SEGURO_RC', 'em_falta', false)], ocorrenciasAltas: 0 }, cfgPag)
    expect(r.bloqueios).toEqual([])
  })
  it('documentos a expirar dão estado a_expirar', () => {
    const r = bloqueiosPagamento({ fatura: faturaOk, docs: [doc('CERT_SS', 'a_expirar')], ocorrenciasAltas: 0 }, cfgPag)
    expect(r.docsEstado).toBe('a_expirar')
  })
  it('sem bloqueio por documentos quando desativado, mantendo o estado crítico', () => {
    const r = bloqueiosPagamento({ fatura: faturaOk, docs: [doc('CERT_SS', 'em_falta')], ocorrenciasAltas: 0 }, { ...cfgPag, bloquear_pagamento_sem_docs: false })
    expect(r.bloqueios).toEqual([])
    expect(r.docsEstado).toBe('critico')
  })
})
