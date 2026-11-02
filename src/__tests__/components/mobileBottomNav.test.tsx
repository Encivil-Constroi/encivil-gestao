import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

let papel = { isAdmin: false, podeArmazem: false, isMecanico: false, isMotorista: false }
vi.mock('@/features/auth/useRole', () => ({ useRole: () => papel }))

import { MobileBottomNav } from '@/app/components/MobileBottomNav'

const montar = () => render(<MemoryRouter><MobileBottomNav /></MemoryRouter>)

describe('MobileBottomNav', () => {
  afterEach(cleanup)

  it('sem permissão de movimento não reserva a ranhura do FAB e mostra 4 links', () => {
    papel = { isAdmin: false, podeArmazem: false, isMecanico: false, isMotorista: false }
    const { container } = montar()
    expect(screen.getAllByRole('link')).toHaveLength(4)
    expect(container.querySelector('.w-14')).toBeNull()
  })

  it('com permissão mostra o botão de movimento (5 links)', () => {
    papel = { isAdmin: true, podeArmazem: true, isMecanico: false, isMotorista: false }
    montar()
    expect(screen.getAllByRole('link')).toHaveLength(5)
  })
})
