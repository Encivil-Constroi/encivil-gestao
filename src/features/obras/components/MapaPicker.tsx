import { useId, useState } from 'react'
import { LocateFixed, Loader2, X, ExternalLink, Check } from 'lucide-react'
import { interpretarLocalizacao, arredondar6, formatarCoordenadas } from '../lib/mapas'
import { MapaObra } from './MapaObra'
import { inputCls } from './ui'

type Props = {
  latitude: number | null
  longitude: number | null
  morada?: string
  onChange: (lat: number | null, lon: number | null) => void
}

const botao = 'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-secondary/20 hover:bg-secondary/30 transition-colors disabled:opacity-60'

// Define o ponto GPS da obra sem chave de API: cola-se um link do Google Maps
// ou coordenadas, ou usa-se a localização do dispositivo
export function MapaPicker({ latitude, longitude, morada, onChange }: Props) {
  const id = useId()
  const [texto, setTexto] = useState('')
  const [aviso, setAviso] = useState<{ tipo: 'erro' | 'ok'; texto: string } | null>(null)
  const [aLocalizar, setALocalizar] = useState(false)

  const aplicar = (valor: string) => {
    if (!valor.trim()) { setAviso(null); return }
    const r = interpretarLocalizacao(valor)
    if (r.ok) {
      onChange(r.lat, r.lon)
      setAviso({ tipo: 'ok', texto: `Localização definida: ${formatarCoordenadas(r.lat, r.lon)}` })
      setTexto('')
    } else {
      setAviso({ tipo: 'erro', texto: r.mensagem })
    }
  }

  const usarGps = () => {
    if (!navigator.geolocation) { setAviso({ tipo: 'erro', texto: 'Este dispositivo não dá acesso à localização.' }); return }
    setALocalizar(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setALocalizar(false)
        onChange(arredondar6(pos.coords.latitude), arredondar6(pos.coords.longitude))
        setAviso({ tipo: 'ok', texto: 'Usada a localização do dispositivo.' })
      },
      () => {
        setALocalizar(false)
        setAviso({ tipo: 'erro', texto: 'Não foi possível obter a localização. Verifique a permissão do browser ou cole um link.' })
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    )
  }

  const procurarNoGoogle = morada?.trim()
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(morada.trim())}`
    : 'https://www.google.com/maps'

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${id}-loc`} className="block text-sm font-medium mb-1.5">
          Link do Google Maps ou coordenadas <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
        </label>
        <div className="flex gap-2">
          <input id={`${id}-loc`} type="text" value={texto} onChange={e => setTexto(e.target.value)}
            onPaste={e => { const v = e.clipboardData.getData('text'); if (v) { e.preventDefault(); setTexto(v); aplicar(v) } }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); aplicar(texto) } }}
            placeholder="Ex.: 38.7223, -9.1399 ou https://www.google.com/maps/…"
            className={inputCls} />
          <button type="button" onClick={() => aplicar(texto)} className={`${botao} shrink-0`}>
            <Check className="w-4 h-4" aria-hidden="true" /> Aplicar
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          No Google Maps, toque longamente no local, copie o link da barra do browser ou as coordenadas e cole aqui.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={usarGps} disabled={aLocalizar} className={botao}>
          {aLocalizar ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <LocateFixed className="w-4 h-4" aria-hidden="true" />}
          Usar a minha localização
        </button>
        <a href={procurarNoGoogle} target="_blank" rel="noopener noreferrer" className={botao}>
          <ExternalLink className="w-4 h-4" aria-hidden="true" /> Procurar no Google Maps
        </a>
        {latitude != null && longitude != null && (
          <button type="button" onClick={() => { onChange(null, null); setAviso(null) }} className={botao}>
            <X className="w-4 h-4" aria-hidden="true" /> Remover ponto
          </button>
        )}
      </div>

      {aviso && (
        <p role={aviso.tipo === 'erro' ? 'alert' : 'status'}
          className={`text-sm ${aviso.tipo === 'erro' ? 'text-destructive' : 'text-success'}`}>{aviso.texto}</p>
      )}

      <MapaObra latitude={latitude} longitude={longitude} morada={morada} altura={220} />
    </div>
  )
}
