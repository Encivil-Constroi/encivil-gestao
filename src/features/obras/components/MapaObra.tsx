import { MapPin, ExternalLink, Navigation } from 'lucide-react'
import { urlEmbed, urlEmbedTexto, urlAbrir, urlAbrirTexto, urlNavegar, urlNavegarTexto, formatarCoordenadas } from '../lib/mapas'

type Props = {
  latitude: number | null
  longitude: number | null
  // Sem coordenadas, usa a morada como pesquisa
  morada?: string | null
  altura?: number
  mostrarAcoes?: boolean
}

const botao = 'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors'

// Pré-visualização do Google Maps sem chave de API (iframe output=embed)
export function MapaObra({ latitude, longitude, morada, altura = 240, mostrarAcoes = true }: Props) {
  const temCoordenadas = latitude != null && longitude != null
  const texto = morada?.trim() || null

  if (!temCoordenadas && !texto) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 flex flex-col items-center justify-center gap-1.5 text-muted-foreground text-sm py-10"
        style={{ minHeight: altura }}>
        <MapPin className="w-6 h-6" aria-hidden="true" />
        Sem localização definida
      </div>
    )
  }

  const embed = temCoordenadas ? urlEmbed(latitude, longitude) : urlEmbedTexto(texto!)
  const abrir = temCoordenadas ? urlAbrir(latitude, longitude) : urlAbrirTexto(texto!)
  const navegar = temCoordenadas ? urlNavegar(latitude, longitude) : urlNavegarTexto(texto!)

  return (
    <div className="space-y-2">
      <div className="rounded-2xl overflow-hidden border border-border bg-muted" style={{ height: altura }}>
        <iframe title="Localização da obra no Google Maps" src={embed} loading="lazy" width="100%" height="100%"
          style={{ border: 0 }} referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
      </div>
      {temCoordenadas && <p className="text-xs text-muted-foreground">Coordenadas: {formatarCoordenadas(latitude, longitude)}</p>}
      {mostrarAcoes && (
        <div className="flex gap-2 flex-wrap">
          <a href={abrir} target="_blank" rel="noopener noreferrer" className={`${botao} bg-secondary/20 hover:bg-secondary/30`}>
            <ExternalLink className="w-4 h-4" aria-hidden="true" /> Abrir no Google Maps
          </a>
          <a href={navegar} target="_blank" rel="noopener noreferrer" className={`${botao} bg-primary text-primary-foreground hover:bg-primary/90`}>
            <Navigation className="w-4 h-4" aria-hidden="true" /> Navegar
          </a>
        </div>
      )}
    </div>
  )
}
