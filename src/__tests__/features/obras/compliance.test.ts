import { describe, expect, it } from 'vitest'
import {
  estadoDocs, estadoDocumento, maisRecentePorTipo, mensagemDocsEmFalta, resumoDocs, tiposEmFaltaOuExpirados,
} from '@/features/obras/lib/compliance'

const HOJE = '2026-10-04'

describe('estadoDocumento', () => {
  it('sem validade conta como em dia', () => expect(estadoDocumento(null, HOJE, 30)).toEqual({ estado: 'ok', diasRestantes: null }))
  it('em dia além do aviso', () => expect(estadoDocumento('2026-12-31', HOJE, 30)).toMatchObject({ estado: 'ok', diasRestantes: 88 }))
  it('a expirar dentro do aviso (inclusive)', () => {
    expect(estadoDocumento('2026-11-03', HOJE, 30)).toEqual({ estado: 'a_expirar', diasRestantes: 30 })
    expect(estadoDocumento('2026-11-04', HOJE, 30).estado).toBe('ok')
  })
  it('válido hoje ainda está a expirar (0 dias)', () => expect(estadoDocumento(HOJE, HOJE, 30)).toEqual({ estado: 'a_expirar', diasRestantes: 0 }))
  it('expirado ontem', () => expect(estadoDocumento('2026-10-03', HOJE, 30)).toEqual({ estado: 'expirado', diasRestantes: -1 }))
  it('ignora a parte horária de timestamps', () => expect(estadoDocumento('2026-10-03T23:00:00Z', HOJE, 30).estado).toBe('expirado'))
})

describe('maisRecentePorTipo', () => {
  it('escolhe a emissão mais recente, depois a criação', () => {
    const m = maisRecentePorTipo([
      { tipo: 'CERT_SS', validade: null, emitidoEm: '2026-01-01', id: 'a' },
      { tipo: 'CERT_SS', validade: null, emitidoEm: '2026-06-01', id: 'b' },
      { tipo: 'CERT_AT', validade: null, emitidoEm: '2026-02-01', criadoEm: '2026-02-02', id: 'c' },
      { tipo: 'CERT_AT', validade: null, emitidoEm: '2026-02-01', criadoEm: '2026-03-02', id: 'd' },
    ])
    expect(m.get('CERT_SS')?.id).toBe('b')
    expect(m.get('CERT_AT')?.id).toBe('d')
  })
})

describe('estadoDocs', () => {
  const obrig = ['CERT_SS', 'CERT_AT', 'ALVARA'] as const
  it('marca em falta os obrigatórios sem documento', () => {
    const r = estadoDocs([], [...obrig], HOJE, 30)
    expect(r.map(x => x.estado)).toEqual(['em_falta', 'em_falta', 'em_falta'])
    expect(r.every(x => x.obrigatorio)).toBe(true)
  })
  it('usa o documento mais recente por tipo (renovação substitui o expirado)', () => {
    const r = estadoDocs([
      { tipo: 'CERT_SS', validade: '2026-01-01', emitidoEm: '2025-01-01', id: 'velho' },
      { tipo: 'CERT_SS', validade: '2027-01-01', emitidoEm: '2026-09-01', id: 'novo', referencia: 'R1' },
    ], ['CERT_SS'], HOJE, 30)
    expect(r[0]).toMatchObject({ estado: 'ok', doc_id: 'novo', referencia: 'R1' })
  })
  it('inclui tipos não obrigatórios presentes', () => {
    const r = estadoDocs([{ tipo: 'SEGURO_RC', validade: '2026-10-10' }], ['CERT_SS'], HOJE, 30)
    expect(r.find(x => x.tipo === 'SEGURO_RC')).toMatchObject({ obrigatorio: false, estado: 'a_expirar', dias_restantes: 6 })
  })
})

describe('resumo e bloqueios', () => {
  const estados = estadoDocs([
    { tipo: 'CERT_SS', validade: '2026-10-10' },
    { tipo: 'CERT_AT', validade: '2026-01-01' },
  ], ['CERT_SS', 'CERT_AT', 'ALVARA'], HOJE, 30)
  it('lista obrigatórios em falta ou expirados', () => expect(tiposEmFaltaOuExpirados(estados)).toEqual(['CERT_AT', 'ALVARA']))
  it('estado global crítico, a expirar e ok', () => {
    expect(resumoDocs(estados)).toBe('critico')
    expect(resumoDocs(estadoDocs([{ tipo: 'CERT_SS', validade: '2026-10-10' }], ['CERT_SS'], HOJE, 30))).toBe('a_expirar')
    expect(resumoDocs(estadoDocs([{ tipo: 'CERT_SS', validade: null }], ['CERT_SS'], HOJE, 30))).toBe('ok')
  })
  it('mensagem em português ou null', () => {
    expect(mensagemDocsEmFalta([])).toBeNull()
    expect(mensagemDocsEmFalta(['ALVARA'])).toBe('Documentos em falta ou expirados: Alvará / título IMPIC.')
  })
})
