import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/app/components/ui/button'

// As duas únicas larguras de página da app (ecrãs de lista/painel e formulários).
export const LARGURA_PAGINA = 'max-w-6xl mx-auto w-full'
export const LARGURA_FORMULARIO = 'max-w-3xl mx-auto w-full'

interface PageHeaderProps {
  titulo: string
  descricao?: ReactNode
  acoes?: ReactNode
  /** Rota para onde o botão "Voltar" leva. */
  voltar?: string
}

export function PageHeader({ titulo, descricao, acoes, voltar }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="flex items-start gap-2 flex-1 min-w-0">
        {voltar && (
          <Button variant="ghost" size="icon" asChild className="shrink-0 -ml-2">
            <Link to={voltar} aria-label="Voltar">
              <ArrowLeft aria-hidden="true" />
            </Link>
          </Button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">{titulo}</h1>
          {descricao && <p className="text-sm text-muted-foreground mt-0.5">{descricao}</p>}
        </div>
      </div>
      {acoes && <div className="flex flex-wrap gap-2 sm:shrink-0 [&>*]:whitespace-nowrap">{acoes}</div>}
    </header>
  )
}
