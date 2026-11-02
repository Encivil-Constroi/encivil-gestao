import { forwardRef, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'

export const CLASSE_CAMPO = 'w-full min-h-11 px-4 py-3 bg-input-background border border-input rounded-xl text-base md:text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted disabled:text-muted-foreground'

// <select> nativo de propósito: no telemóvel abre o seletor do sistema, melhor que um popover.
export const CampoSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function CampoSelect({ className, children, ...props }, ref) {
    return (
      <div className="relative">
        <select ref={ref} className={`${CLASSE_CAMPO} appearance-none pr-10${className ? ` ${className}` : ''}`} {...props}>
          {children}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      </div>
    )
  },
)
