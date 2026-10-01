import { Package } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { urlFotoArmazem } from '@/app/lib/fotosArmazem'

export function MiniFoto({ caminho, alt, tamanho = 'md', Icone = Package }: {
  caminho: string | null | undefined; alt: string; tamanho?: 'sm' | 'md' | 'lg'; Icone?: LucideIcon
}) {
  const url = urlFotoArmazem(caminho)
  const dim = tamanho === 'sm' ? 'w-8 h-8 rounded-lg' : tamanho === 'lg' ? 'w-14 h-14 rounded-xl' : 'w-10 h-10 rounded-lg'
  if (url) return <img src={url} alt={alt} loading="lazy" className={`${dim} object-cover bg-muted shrink-0 border border-border`} />
  return (
    <div className={`${dim} bg-muted text-muted-foreground flex items-center justify-center shrink-0`} aria-hidden="true">
      <Icone className="w-1/2 h-1/2" />
    </div>
  )
}
