import { useMemo, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { fmtData } from '@/app/lib/format'
import { urlFotoObra } from '../lib/fotosObras'
import { Lightbox, type FotoVisivel } from './Lightbox'

export type FotoGaleria = { path: string; legenda?: string | null; data?: string | null; rotulo?: string | null }

type Props = {
  fotos: FotoGaleria[]
  vazio?: string
  // Colunas da grelha (miniaturas quadradas)
  className?: string
}

// Grelha de miniaturas; ao tocar abre o visualizador com setas e legenda
export function FotosGaleria({ fotos, vazio = 'Sem fotografias.', className = 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5' }: Props) {
  const [aberta, setAberta] = useState<number | null>(null)

  const visiveis = useMemo<FotoVisivel[]>(() => fotos.map(f => ({
    url: urlFotoObra(f.path) ?? '',
    legenda: f.legenda,
    rodape: [f.rotulo, f.data ? fmtData(f.data) : null].filter(Boolean).join(' · ') || null,
  })), [fotos])

  if (fotos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 py-8 text-sm text-muted-foreground">
        <ImageOff className="w-6 h-6" aria-hidden="true" /> {vazio}
      </div>
    )
  }

  return (
    <>
      <ul className={`grid gap-2 ${className}`}>
        {fotos.map((f, i) => (
          <li key={`${f.path}-${i}`}>
            <button type="button" onClick={() => setAberta(i)} aria-label={f.legenda ? `Ampliar foto: ${f.legenda}` : `Ampliar foto ${i + 1}`}
              className="block w-full aspect-square rounded-xl overflow-hidden bg-muted hover:opacity-90 active:scale-[0.98] transition-all">
              <img src={visiveis[i].url} alt={f.legenda || `Foto ${i + 1}`} loading="lazy" className="w-full h-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
      {aberta != null && <Lightbox fotos={visiveis} indice={aberta} onMudar={setAberta} onFechar={() => setAberta(null)} />}
    </>
  )
}
