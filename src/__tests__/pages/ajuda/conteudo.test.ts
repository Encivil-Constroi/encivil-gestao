import { describe, it, expect } from 'vitest'
// Lido como texto pelo Vite (sem node:fs, que o tsconfig de src não conhece)
import rotas from '@/app/routes.tsx?raw'
import {
  GUIA_RAPIDO, GUIAS_POR_PAPEL, FAQ, RECUPERAR_ACESSO, ROTULOS_PAPEL,
  filtrarSecoes, filtrarFaq, textoComNegrito,
} from '@/app/pages/ajuda/conteudo'

const PAPEIS = ['admin', 'gestor', 'armazem', 'medicoes', 'mecanico', 'motorista', 'leitura'] as const

describe('GUIAS_POR_PAPEL', () => {
  it.each(PAPEIS)('%s tem pelo menos uma secção com passos', p => {
    expect(GUIAS_POR_PAPEL[p].length).toBeGreaterThan(0)
    GUIAS_POR_PAPEL[p].forEach(s => expect(s.passos.length).toBeGreaterThan(0))
  })

  it.each(PAPEIS)('%s tem rótulo em português', p => {
    expect(ROTULOS_PAPEL[p]).toBeTruthy()
  })

  it('ids únicos dentro de cada papel', () => {
    for (const p of PAPEIS) {
      const ids = GUIAS_POR_PAPEL[p].map(s => s.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('cobre as tarefas mínimas de cada papel', () => {
    const texto = (p: typeof PAPEIS[number]) => GUIAS_POR_PAPEL[p].map(s => `${s.titulo} ${s.passos.join(' ')}`).join(' ')
    expect(texto('armazem')).toMatch(/saída/i)
    expect(texto('armazem')).toMatch(/entrada/i)
    expect(texto('armazem')).toMatch(/inventário/i)
    expect(texto('armazem')).toMatch(/ferramenta/i)
    expect(texto('motorista')).toMatch(/combustível/i)
    expect(texto('mecanico')).toMatch(/manutenção/i)
    expect(texto('medicoes')).toMatch(/auto/i)
    expect(texto('admin')).toMatch(/Link de recuperação/)
    expect(texto('admin')).toMatch(/Auditoria/)
    expect(texto('admin')).toMatch(/[Bb]ackup/)
    expect(texto('gestor')).toMatch(/Relatórios/)
    expect(texto('leitura')).toMatch(/consult/i)
  })

  it('o motorista e o mecânico só veem os ecrãs que têm no menu', () => {
    for (const s of GUIAS_POR_PAPEL.motorista) if (s.rota) expect(s.rota.startsWith('/abastecimento')).toBe(true)
    for (const s of GUIAS_POR_PAPEL.mecanico) if (s.rota) expect(s.rota.startsWith('/frota')).toBe(true)
  })
})

describe('rotas', () => {
  it('todas as rotas citadas existem em routes.tsx', () => {
    const todas = [...GUIA_RAPIDO, RECUPERAR_ACESSO, ...Object.values(GUIAS_POR_PAPEL).flat()]
      .map(s => s.rota).filter(Boolean) as string[]
    for (const r of todas) expect(rotas, r).toContain(`'${r.split('/')[1]}'`)
  })
})

describe('RECUPERAR_ACESSO', () => {
  it('explica as duas vias', () => {
    const t = `${RECUPERAR_ACESSO.resumo} ${RECUPERAR_ACESSO.passos.join(' ')}`
    expect(t).toMatch(/Esqueceu a palavra-passe\?/)
    expect(t).toMatch(/administrador/)
    expect(t).toMatch(/WhatsApp/)
    expect(t).toMatch(/1 hora/)
    expect(t).toMatch(/12/)
  })
})

describe('FAQ', () => {
  it('tem perguntas com resposta', () => {
    expect(FAQ.length).toBeGreaterThan(3)
    FAQ.forEach(f => { expect(f.pergunta).toMatch(/\?$/); expect(f.resposta.length).toBeGreaterThan(10) })
  })
  it('filtrarFaq ignora acentos e maiúsculas', () => {
    expect(filtrarFaq([{ pergunta: 'Instalação?', resposta: 'x' }], 'INSTALACAO')).toHaveLength(1)
    expect(filtrarFaq([{ pergunta: 'A?', resposta: 'Palavra-passe' }], 'palavra')).toHaveLength(1)
    expect(filtrarFaq([{ pergunta: 'A?', resposta: 'b' }], 'zzz')).toHaveLength(0)
  })
})

describe('filtrarSecoes', () => {
  const s = [
    { id: 'a', titulo: 'Saída', resumo: '', passos: ['x'] },
    { id: 'b', titulo: 'Outro', resumo: 'Ferramentas', passos: ['y'] },
    { id: 'c', titulo: 'Mais', resumo: '', passos: ['Toque em  Guardar'] },
  ]
  it('ignora acentos', () => {
    expect(filtrarSecoes([s[0]], 'saida')).toHaveLength(1)
  })
  it('procura no resumo e nos passos, sem distinguir maiúsculas', () => {
    expect(filtrarSecoes(s, 'FERRAMENTAS').map(x => x.id)).toEqual(['b'])
    expect(filtrarSecoes(s, 'guardar').map(x => x.id)).toEqual(['c'])
  })
  it('termo vazio devolve tudo', () => {
    expect(filtrarSecoes(s, '   ')).toHaveLength(3)
  })
})

describe('textoComNegrito', () => {
  it('marca como negrito o texto entre **', () => {
    expect(textoComNegrito('Clica em **Guardar** no fim')).toEqual([
      { texto: 'Clica em ', negrito: false },
      { texto: 'Guardar', negrito: true },
      { texto: ' no fim', negrito: false },
    ])
  })
})
