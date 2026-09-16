import { useRef, useEffect } from 'react'
import { MapContainer, TileLayer, Circle, useMapEvents, useMap } from 'react-leaflet'
import { Marker } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix Leaflet default icons em Vite (não encontra os PNGs via webpack resolve)
import markerIconPng from 'leaflet/dist/images/marker-icon.png?url'
import markerIcon2xPng from 'leaflet/dist/images/marker-icon-2x.png?url'
import markerShadowPng from 'leaflet/dist/images/marker-shadow.png?url'

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl:       markerIconPng,
  iconRetinaUrl: markerIcon2xPng,
  shadowUrl:     markerShadowPng,
})

// Corrige tamanho do mapa quando o container fica visível após render
function MapResizer() {
  const map = useMap()
  useEffect(() => { map.invalidateSize() }, [map])
  return null
}

function MapClickHandler({ onClick }: { onClick: (lat: number, lon: number) => void }) {
  useMapEvents({ click: e => onClick(e.latlng.lat, e.latlng.lng) })
  return null
}

type Props = {
  lat: number
  lon: number
  raioM: number
  onCentroChange: (lat: number, lon: number) => void
  onRaioChange: (raioM: number) => void
}

export function GeofenceConfig({ lat, lon, raioM, onCentroChange, onRaioChange }: Props) {
  const markerRef = useRef<L.Marker>(null)

  return (
    <div className="space-y-3">
      <div className="rounded-xl overflow-hidden border border-border" style={{ height: 280 }}>
        <MapContainer
          key={`${lat.toFixed(4)}-${lon.toFixed(4)}`}
          center={[lat, lon]}
          zoom={16}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapResizer />
          <MapClickHandler onClick={onCentroChange} />
          <Marker
            ref={markerRef}
            position={[lat, lon]}
            draggable
            eventHandlers={{
              dragend: () => {
                const m = markerRef.current
                if (m) { const p = m.getLatLng(); onCentroChange(p.lat, p.lng) }
              },
            }}
          />
          <Circle
            center={[lat, lon]}
            radius={raioM}
            pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.12, weight: 2 }}
          />
        </MapContainer>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Raio do geofence</label>
          <span className="text-sm text-muted-foreground font-mono tabular-nums">{raioM} m</span>
        </div>
        <input
          type="range"
          min={50}
          max={2000}
          step={10}
          value={raioM}
          onChange={e => onRaioChange(Number(e.target.value))}
          className="w-full accent-primary"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>50 m</span>
          <span>2 000 m</span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Arrasta o marcador ou clica no mapa para definir o centro. Colaboradores dentro do raio com GPS preciso (&lt;50 m) são autorizados automaticamente.
      </p>
    </div>
  )
}
