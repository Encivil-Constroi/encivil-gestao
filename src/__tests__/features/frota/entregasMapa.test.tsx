import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useState } from 'react'
import { MapaDanos } from '@/features/frota/components/MapaDanos'
import type { DanoMarcado } from '@/features/frota/db'

afterEach(cleanup)

let ultimo: DanoMarcado[] = []
function Controlado({ inicial = [], existentes = [], max, readOnly }: { inicial?: DanoMarcado[]; existentes?: DanoMarcado[]; max?: number; readOnly?: boolean }) {
  const [v, setV] = useState<DanoMarcado[]>(inicial)
  ultimo = v
  return <MapaDanos value={v} onChange={setV} existentes={existentes} max={max} readOnly={readOnly} />
}

describe('MapaDanos', () => {
  it('adiciona um dano por vista com o botão (alternativa ao toque), com coordenadas 0–1', () => {
    render(<Controlado />)
    fireEvent.click(screen.getByLabelText('Adicionar dano — Frente'))
    fireEvent.click(screen.getByLabelText('Adicionar dano — Cima'))
    expect(ultimo).toEqual([{ vista: 'frente', x: 0.5, y: 0.5 }, { vista: 'cima', x: 0.5, y: 0.5 }])
    expect(screen.getByText('Toque na imagem para marcar novos danos')).toBeTruthy()
  })

  it('o toque na imagem adiciona um marcador na vista tocada', () => {
    render(<Controlado />)
    fireEvent.click(screen.getByRole('group', { name: 'Vista Trás' }))
    expect(ultimo).toHaveLength(1)
    expect(ultimo[0].vista).toBe('tras')
    expect(ultimo[0].x).toBeGreaterThanOrEqual(0)
    expect(ultimo[0].x).toBeLessThanOrEqual(1)
  })

  it('remove um dano e guarda a nota', () => {
    render(<Controlado inicial={[{ vista: 'frente', x: 0.1, y: 0.2 }, { vista: 'lado_dir', x: 0.3, y: 0.4 }]} />)
    fireEvent.change(screen.getByLabelText('Nota do dano 2'), { target: { value: 'Risco' } })
    expect(ultimo[1].nota).toBe('Risco')
    fireEvent.click(screen.getByLabelText('Remover dano 1'))
    expect(ultimo).toEqual([{ vista: 'lado_dir', x: 0.3, y: 0.4, nota: 'Risco' }])
  })

  it('respeita o limite máximo', () => {
    render(<Controlado max={2} existentes={[{ vista: 'cima', x: 0.5, y: 0.5 }]} />)
    fireEvent.click(screen.getByLabelText('Adicionar dano — Frente'))
    expect(ultimo).toHaveLength(1)
    expect(screen.getByText('Máximo de 2 danos atingido')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Adicionar dano — Trás'))
    fireEvent.click(screen.getByRole('group', { name: 'Vista Trás' }))
    expect(ultimo).toHaveLength(1)
  })

  it('danos existentes: numeração à frente, sem remover, novos a seguir', () => {
    render(<Controlado existentes={[{ vista: 'frente', x: 0.5, y: 0.5, nota: 'Amolgadela' }]} inicial={[{ vista: 'tras', x: 0.2, y: 0.2 }]} />)
    expect(screen.getByText(/Amolgadela/)).toBeTruthy()
    expect(screen.getByText(/já existente/)).toBeTruthy()
    expect(screen.queryByLabelText('Remover dano 1')).toBeNull()
    expect(screen.getByLabelText('Remover dano 2')).toBeTruthy()
  })

  it('modo leitura: sem botões nem campos, toque não altera', () => {
    render(<Controlado readOnly inicial={[{ vista: 'frente', x: 0.5, y: 0.5, nota: 'X' }]} />)
    expect(screen.queryByLabelText('Adicionar dano — Frente')).toBeNull()
    expect(screen.queryByLabelText('Remover dano 1')).toBeNull()
    fireEvent.click(screen.getByRole('group', { name: 'Vista Frente' }))
    expect(ultimo).toHaveLength(1)
    expect(screen.getByText('X')).toBeTruthy()
  })
})
