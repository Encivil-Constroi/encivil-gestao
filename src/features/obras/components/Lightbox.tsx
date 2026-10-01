import { useEffect, useRef } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

export type FotoVisivel = { url: string; legenda?: string | null; rodape?: string | null }

type Props = {
  fotos: FotoVisivel[]
  indice: number
  onFechar: () => void
  onMudar: (indice: number) => void
}

// Visualizador de fotos em ecrã inteiro: setas e Esc no teclado, botões no toque
export function Lightbox({ fotos, indice, onFechar, onMudar }: Props) {
  const fecharRef = useRef<HTMLButtonElement>(null)
  const foto = fotos[indice]
  const anterior = () => onMudar((indice - 1 + fotos.length) % fotos.length)
  const seguinte = () => onMudar((indice + 1) % fotos.length)

  useEffect(() => {
    fecharRef.current?.focus()
    const aoTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar()
      else if (e.key === 'ArrowLeft') anterior()
      else if (e.key === 'ArrowRight') seguinte()
    }
    window.addEventListener('keydown', aoTecla)
    return () => window.removeEventListener('keydown', aoTecla)
  })

  if (!foto) return null
  const botao = 'absolute p-2.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors'

  return (
    <div role="dialog" aria-modal="true" aria-label="Fotografia ampliada"
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4" onClick={onFechar}>
      <button ref={fecharRef} type="button" onClick={onFechar} aria-label="Fechar" className={`${botao} top-4 right-4`}>
        <X className="w-5 h-5" aria-hidden="true" />
      </button>
      {fotos.length > 1 && (
        <>
          <button type="button" onClick={e => { e.stopPropagation(); anterior() }} aria-label="Foto anterior" className={`${botao} left-3 top-1/2 -translate-y-1/2`}>
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          <button type="button" onClick={e => { e.stopPropagation(); seguinte() }} aria-label="Foto seguinte" className={`${botao} right-3 top-1/2 -translate-y-1/2`}>
            <ChevronRight className="w-5 h-5" aria-hidden="true" />
          </button>
        </>
      )}
      <figure className="max-w-full max-h-full flex flex-col items-center gap-2" onClick={e => e.stopPropagation()}>
        <img src={foto.url} alt={foto.legenda || 'Fotografia da obra'} className="max-w-full max-h-[80vh] object-contain rounded-lg" />
        {(foto.legenda || foto.rodape) && (
          <figcaption className="text-center text-sm text-white/90">
            {foto.legenda && <p>{foto.legenda}</p>}
            {foto.rodape && <p className="text-xs text-white/60">{foto.rodape}</p>}
          </figcaption>
        )}
        {fotos.length > 1 && <p className="text-xs text-white/60">{indice + 1} / {fotos.length}</p>}
      </figure>
    </div>
  )
}
