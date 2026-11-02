import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

const toaster = vi.fn((_props: Record<string, unknown>) => null)
vi.mock('sonner', () => ({ Toaster: (p: Record<string, unknown>) => toaster(p) }))
vi.mock('@/features/theme/ThemeProvider', () => ({ useTheme: () => ({ resolvedTheme: 'dark' }) }))

import { ToasterTema } from '@/app/components/ToasterTema'

describe('ToasterTema', () => {
  it('passa o tema resolvido da app ao sonner', () => {
    render(<ToasterTema />)
    expect(toaster).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark', richColors: true }))
  })
})
