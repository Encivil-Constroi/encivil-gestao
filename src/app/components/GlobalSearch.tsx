import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router'
import { Search, Building2, Package, HardHat, Wrench, X, Loader2, ArrowRight } from 'lucide-react'
import { pesquisarGlobal, type SearchResult, type SearchResultKind } from '@/features/search/globalSearchService'

const KIND_LABEL: Record<SearchResultKind, string> = {
  obra:            'Obra',
  produto:         'Produto',
  subempreiteiro:  'Subempreiteiro',
  ferramenta:      'Ferramenta',
}

const KIND_ICON: Record<SearchResultKind, React.ReactNode> = {
  obra:           <Building2 className="w-4 h-4" />,
  produto:        <Package className="w-4 h-4" />,
  subempreiteiro: <HardHat className="w-4 h-4" />,
  ferramenta:     <Wrench className="w-4 h-4" />,
}

const KIND_COLOR: Record<SearchResultKind, string> = {
  obra:           'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  produto:        'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  subempreiteiro: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  ferramenta:     'bg-violet-500/10 text-violet-600 dark:text-violet-400',
}

interface Props {
  onClose: () => void
}

export function GlobalSearch({ onClose }: Props) {
  const navigate = useNavigate()
  const inputRef  = useRef<HTMLInputElement>(null)
  const listRef   = useRef<HTMLDivElement>(null)

  const [query,    setQuery]   = useState('')
  const [results,  setResults] = useState<SearchResult[]>([])
  const [loading,  setLoading] = useState(false)
  const [active,   setActive]  = useState(0)

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus() }, [])

  // Debounced search
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setActive(0); return }
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const r = await pesquisarGlobal(query)
        setResults(r)
        setActive(0)
      } finally {
        setLoading(false)
      }
    }, 220)
    return () => clearTimeout(timer)
  }, [query])

  const navigateTo = useCallback((link: string) => {
    navigate(link)
    onClose()
  }, [navigate, onClose])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); return }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0));                  return }
    if (e.key === 'Enter' && results[active]) { navigateTo(results[active].link) }
  }

  // Group results by kind
  const grouped = results.reduce<Record<SearchResultKind, SearchResult[]>>((acc, r) => {
    if (!acc[r.kind]) acc[r.kind] = []
    acc[r.kind].push(r)
    return acc
  }, {} as Record<SearchResultKind, SearchResult[]>)

  const kindOrder: SearchResultKind[] = ['obra', 'subempreiteiro', 'produto', 'ferramenta']

  // Flat index for active tracking across groups
  const flatIndex = (result: SearchResult) => results.indexOf(result)

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4"
      onClick={onClose}
    >
      {/* Modal */}
      <div
        className="w-full max-w-[560px] bg-card rounded-2xl shadow-2xl border border-border overflow-hidden"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
          {loading
            ? <Loader2 className="w-5 h-5 text-muted-foreground shrink-0 animate-spin" />
            : <Search className="w-5 h-5 text-muted-foreground shrink-0" />
          }
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Pesquisar obras, produtos, subempreiteiros, ferramentas…"
            className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
          />
          {query && (
            <button onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus() }}
              className="p-1 rounded hover:bg-accent transition-colors shrink-0"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium border border-border rounded text-muted-foreground bg-muted">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[420px] overflow-y-auto overscroll-contain">
          {query.trim().length < 2 ? (
            <div className="px-4 py-8 text-center">
              <Search className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Escreva pelo menos 2 caracteres para pesquisar</p>
            </div>
          ) : !loading && results.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">Nenhum resultado para <strong>"{query}"</strong></p>
            </div>
          ) : (
            <div className="py-2">
              {kindOrder.map(kind => {
                const items = grouped[kind]
                if (!items?.length) return null
                return (
                  <div key={kind}>
                    <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {KIND_LABEL[kind]}
                    </p>
                    {items.map(r => {
                      const idx = flatIndex(r)
                      const isActive = idx === active
                      return (
                        <button
                          key={r.id}
                          onClick={() => navigateTo(r.link)}
                          onMouseEnter={() => setActive(idx)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                            isActive ? 'bg-accent' : 'hover:bg-accent/50'
                          }`}
                        >
                          <span className={`flex-shrink-0 p-1.5 rounded-lg ${KIND_COLOR[kind]}`}>
                            {KIND_ICON[kind]}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                            {r.subtitle && (
                              <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
                            )}
                          </div>
                          {isActive && <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-t border-border bg-muted/30">
          <span className="text-[10px] text-muted-foreground">
            <kbd className="font-mono">↑↓</kbd> navegar &nbsp;·&nbsp; <kbd className="font-mono">Enter</kbd> abrir &nbsp;·&nbsp; <kbd className="font-mono">Esc</kbd> fechar
          </span>
        </div>
      </div>
    </div>
  )
}
