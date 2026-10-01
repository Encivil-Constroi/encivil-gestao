import { useState, useEffect, useRef } from 'react'
import { Search, ChevronDown } from 'lucide-react'
import { getUnitLabel } from '@/app/data/mockData'
import type { ArtigoArmazem } from '../services/armazemService'
import { MiniFoto } from './MiniFoto'

export function ArtigoCombobox({ artigos, valor, onChange, carregando }: {
  artigos: ArtigoArmazem[]; valor: string; onChange: (id: string) => void; carregando?: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [q, setQ] = useState('')
  const raiz = useRef<HTMLDivElement>(null)
  const sel = artigos.find(a => a.id === valor)

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) { setAberto(false); setQ('') }
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  const termo = q.trim().toLowerCase()
  const lista = termo ? artigos.filter(a => a.nome.toLowerCase().includes(termo) || a.codigo.toLowerCase().includes(termo)) : artigos

  return (
    <div ref={raiz} className="relative">
      <button type="button" disabled={carregando} aria-haspopup="listbox" aria-expanded={aberto}
        onClick={() => setAberto(o => !o)}
        className="w-full flex items-center gap-3 px-3 py-2.5 bg-input-background border border-input rounded-xl text-left focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60">
        {sel && <MiniFoto caminho={sel.fotoPath} alt="" tamanho="md" />}
        <span className="flex-1 min-w-0">
          {carregando ? <span className="text-muted-foreground">A carregar…</span>
            : sel ? <><span className="block font-medium truncate">{sel.nome}</span><span className="block text-xs text-muted-foreground">{sel.codigo}</span></>
            : <span className="text-muted-foreground py-1 block">Escolha o artigo</span>}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {aberto && (
        <div className="absolute z-30 mt-1.5 w-full bg-card border border-border rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-border relative">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar por nome ou código…" aria-label="Pesquisar artigo"
              className="w-full pl-8 pr-3 py-2 bg-input-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto">
            {lista.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">Nenhum artigo encontrado.</li>}
            {lista.map(a => (
              <li key={a.id} role="option" aria-selected={a.id === valor}>
                <button type="button" onClick={() => { onChange(a.id); setAberto(false); setQ('') }}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-accent ${a.id === valor ? 'bg-accent' : ''}`}>
                  <MiniFoto caminho={a.fotoPath} alt="" tamanho="sm" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{a.nome}</span>
                    <span className="block text-xs text-muted-foreground">{a.codigo}</span>
                  </span>
                  <span className="text-xs font-semibold tabular-nums shrink-0">{a.stockAtual} {getUnitLabel(a.unidade)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
