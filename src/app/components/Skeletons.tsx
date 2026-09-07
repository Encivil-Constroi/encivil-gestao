/**
 * Componentes skeleton reutilizáveis — substituem "A carregar…" com animação
 * shimmer consistente em toda a aplicação.
 */

/** Linha de lista genérica: ícone + título + subtítulo + badge */
export function SkeletonListRow({ cols = 3 }: { cols?: 2 | 3 | 4 }) {
  return (
    <div className="flex items-center gap-3 px-5 py-4 border-b border-border last:border-0">
      <div className="skeleton h-9 w-9 rounded-xl shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="skeleton h-3.5 w-40" />
        <div className="skeleton h-3 w-28" />
      </div>
      {cols >= 3 && <div className="skeleton h-5 w-16 rounded-full shrink-0" />}
      {cols >= 4 && <div className="skeleton h-3.5 w-12 shrink-0" />}
    </div>
  )
}

/** Card de lista com múltiplas linhas */
export function SkeletonList({ rows = 5, cols }: { rows?: number; cols?: 2 | 3 | 4 }) {
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonListRow key={i} cols={cols} />
      ))}
    </div>
  )
}

/** Card de estatística/KPI (usado em Dashboard, Combustível, etc.) */
export function SkeletonStatCard() {
  return (
    <div className="bg-card rounded-2xl border border-border p-4 space-y-2">
      <div className="skeleton h-3 w-20" />
      <div className="skeleton h-8 w-24" />
      <div className="skeleton h-3 w-16" />
    </div>
  )
}

/** Grid de cards de estatística */
export function SkeletonStatsGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonStatCard key={i} />
      ))}
    </div>
  )
}

/** Linha de tabela: usado em Histórico, Auditoria */
export function SkeletonTableRow({ cells = 5 }: { cells?: number }) {
  const widths = ['w-24', 'w-32', 'w-40', 'w-20', 'w-16']
  return (
    <tr>
      {Array.from({ length: cells }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className={`skeleton h-3.5 ${widths[i % widths.length]}`} />
        </td>
      ))}
    </tr>
  )
}

/** Tabela com skeleton rows */
export function SkeletonTable({ rows = 8, cells }: { rows?: number; cells?: number }) {
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <SkeletonTableRow key={i} cells={cells} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Card simples (formulários em edição, detalhe) */
export function SkeletonCard({ lines = 4 }: { lines?: number }) {
  const lineWidths = ['w-full', 'w-3/4', 'w-full', 'w-1/2', 'w-full', 'w-2/3']
  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
      <div className="skeleton h-4 w-48" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={`skeleton h-3.5 ${lineWidths[i % lineWidths.length]}`} />
      ))}
    </div>
  )
}
