export interface OpcaoFiltro<T extends string> {
  valor: T
  rotulo: string
  contagem?: number
}

interface FiltroChipsProps<T extends string> {
  opcoes: readonly OpcaoFiltro<T>[]
  valor: T
  onChange: (valor: T) => void
  ariaLabel: string
}

// Único estilo de filtros e sub-vistas dentro de uma página (substitui os "segmentados").
export function FiltroChips<T extends string>({ opcoes, valor, onChange, ariaLabel }: FiltroChipsProps<T>) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex gap-2 overflow-x-auto">
      {opcoes.map(o => {
        const ativo = o.valor === valor
        return (
          <button key={o.valor} type="button" aria-pressed={ativo} onClick={() => onChange(o.valor)}
            className={`inline-flex items-center gap-1.5 min-h-10 md:min-h-9 px-3.5 rounded-full border text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              ativo ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:bg-accent hover:text-foreground'}`}>
            {o.rotulo}
            {o.contagem !== undefined && <span className="tabular-nums text-xs">{o.contagem}</span>}
          </button>
        )
      })}
    </div>
  )
}
