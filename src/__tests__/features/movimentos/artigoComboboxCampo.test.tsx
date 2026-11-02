import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { CLASSE_CAMPO } from '@/app/components/CampoSelect'

vi.mock('@/features/movimentos/components/MiniFoto', () => ({ MiniFoto: () => null }))

import { ArtigoCombobox } from '@/features/movimentos/components/ArtigoCombobox'

afterEach(cleanup)

describe('ArtigoCombobox', () => {
  it('o gatilho usa o aspeto e a altura dos outros campos (CLASSE_CAMPO)', () => {
    render(<ArtigoCombobox artigos={[]} valor="" onChange={() => {}} />)
    const gatilho = screen.getByRole('button', { name: /Escolha o artigo/ })
    for (const c of CLASSE_CAMPO.split(' ').filter(c => !c.startsWith('disabled:'))) expect(gatilho.className).toContain(c)
  })
})
