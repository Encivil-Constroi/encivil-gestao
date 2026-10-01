import { useEffect } from 'react'
import { X } from 'lucide-react'

// Foto em ecrã inteiro para mostrar a um agente: fundo preto, imagem ajustada ao telemóvel
export function VisorDocumento({ titulo, subtitulo, url, aoFechar }: {
  titulo: string; subtitulo?: string; url: string; aoFechar: () => void
}) {
  useEffect(() => {
    const aoTecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', aoTecla)
    return () => window.removeEventListener('keydown', aoTecla)
  }, [aoFechar])

  return (
    <div role="dialog" aria-modal="true" aria-label={titulo} className="fixed inset-0 z-[100] bg-black flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{titulo}</p>
          {subtitulo && <p className="text-xs text-white/70 truncate">{subtitulo}</p>}
        </div>
        <button type="button" onClick={aoFechar} aria-label="Fechar"
          className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 transition-colors">
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center p-2" onClick={aoFechar}>
        <img src={url} alt={titulo} className="max-w-full max-h-full object-contain" />
      </div>
    </div>
  )
}
