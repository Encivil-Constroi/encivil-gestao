import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { GUIA_RAPIDO, GUIAS_POR_PAPEL, FAQ, RECUPERAR_ACESSO, textoComNegrito } from '@/app/pages/ajuda/conteudo'
import { PASSOS_INSTALACAO } from '@/app/pages/ajuda/instalacao'
import { TextoPasso } from '@/app/pages/ajuda/componentes'

const textos: string[] = [
  ...[...GUIA_RAPIDO, ...Object.values(GUIAS_POR_PAPEL).flat(), RECUPERAR_ACESSO]
    .flatMap(s => [s.titulo, s.resumo, ...s.passos]),
  ...FAQ.flatMap(f => [f.pergunta, f.resposta]),
  ...Object.values(PASSOS_INSTALACAO).flat(),
]

describe('negrito em todo o conteúdo da Ajuda', () => {
  it('há conteúdo para verificar', () => { expect(textos.length).toBeGreaterThan(100) })

  it.each(textos)('%s', t => {
    // Marcadores sempre aos pares e nada do formato antigo (dois espaços)
    expect((t.match(/\*\*/g) ?? []).length % 2).toBe(0)
    expect(t).not.toMatch(/ {2}/)
    for (const p of textoComNegrito(t)) {
      expect(p.texto).not.toContain('*')
      if (p.negrito) {
        expect(p.texto).not.toBe('')
        expect(p.texto).toBe(p.texto.trim())
      }
    }
  })

  it('FAQ não usa marcadores (é mostrado como texto simples)', () => {
    for (const f of FAQ) expect(`${f.pergunta}${f.resposta}`).not.toContain('**')
  })

  it('"Link de recuperação" sai a negrito e a frase fica intacta', () => {
    const passo = Object.values(GUIAS_POR_PAPEL).flat().flatMap(s => s.passos).find(p => p.includes('Link de recuperação'))!
    const { container } = render(<p><TextoPasso texto={passo} /></p>)
    expect(container.querySelector('strong')?.textContent).toBe('Link de recuperação')
    expect(container.textContent).toBe('Toque em Link de recuperação. A app cria um link pessoal, válido cerca de 1 hora.')
  })
})
