import { describe, it, expect } from 'vitest'
import { vendorChunk } from '@/build/vendorChunks'

const nm = (pkg: string, file = 'index.js') => `/projeto/node_modules/${pkg}/${file}`

describe('vendorChunk', () => {
  it.each([
    ['recharts', 'vendor-charts'],
    ['recharts-scale', 'vendor-charts'],
    ['react-smooth', 'vendor-charts'],
    ['victory-vendor', 'vendor-charts'],
    ['d3-shape', 'vendor-charts'],
    ['d3-scale', 'vendor-charts'],
    ['internmap', 'vendor-charts'],
    ['decimal.js-light', 'vendor-charts'],
    ['qrcode.react', 'vendor-qrcode'],
    ['react', 'vendor-react'],
    ['react-dom', 'vendor-react'],
    ['scheduler', 'vendor-react'],
    ['@radix-ui/react-dialog', 'vendor-radix'],
    ['@supabase/supabase-js', 'vendor-supabase'],
    ['@supabase/auth-js', 'vendor-supabase'],
  ])('%s → %s', (pkg, chunk) => {
    expect(vendorChunk(nm(pkg))).toBe(chunk)
  })

  // Dependências partilhadas não podem ser arrastadas para vendor-charts:
  // era isto que punha o recharts no arranque de todas as páginas.
  it.each(['clsx', 'react-is', 'react-router', 'react-router-dom', 'lodash', 'eventemitter3',
    'tiny-invariant', 'tailwind-merge', 'lucide-react', 'decimal.js', 'd3'])(
    '%s fica fora dos vendor-*', (pkg) => {
      expect(vendorChunk(nm(pkg))).toBeUndefined()
    })

  it('código da app nunca vai para um vendor', () => {
    expect(vendorChunk('/projeto/src/app/pages/ReportsPage.tsx')).toBeUndefined()
    expect(vendorChunk('/projeto/src/components/recharts/Grafico.tsx')).toBeUndefined()
  })

  it('aceita caminhos Windows e node_modules aninhados', () => {
    expect(vendorChunk('C:\\projeto\\node_modules\\recharts\\es6\\index.js')).toBe('vendor-charts')
    expect(vendorChunk('/p/node_modules/.pnpm/recharts@2.15.0/node_modules/recharts/es6/index.js'))
      .toBe('vendor-charts')
    expect(vendorChunk('/p/node_modules/recharts/node_modules/clsx/dist/clsx.mjs')).toBeUndefined()
  })
})
