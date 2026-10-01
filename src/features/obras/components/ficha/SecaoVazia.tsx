import type { ReactNode } from 'react'
import { Hammer } from 'lucide-react'

// Marcador das secções da ficha que as tarefas seguintes preenchem
export function SecaoVazia({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-6 text-center space-y-3">
      <Hammer className="w-7 h-7 mx-auto text-muted-foreground/60" aria-hidden="true" />
      <h2 className="text-sm font-semibold">{titulo}</h2>
      <p className="text-sm text-muted-foreground">Esta secção está a ser preparada.</p>
      {children}
    </div>
  )
}
