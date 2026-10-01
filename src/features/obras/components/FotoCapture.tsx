import { useId, useRef, useState } from 'react'
import { Camera, ImagePlus, Loader2, X } from 'lucide-react'
import type { FotoObra, PastaFotoObra } from '../db'
import { enviarFotoObra, urlFotoObra } from '../lib/fotosObras'

type Props = {
  obraId: string
  pasta: PastaFotoObra
  valor: FotoObra[]
  onChange: (fotos: FotoObra[]) => void
  rotulo?: string
  max?: number
  desativado?: boolean
  // Permite escrever uma legenda em cada foto
  legendas?: boolean
}

const botao = 'inline-flex items-center gap-1.5 px-3 py-2 border border-border rounded-xl text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50'

// Várias fotos de uma vez: câmara do telemóvel ou galeria. Envia logo para o
// bucket e devolve a lista no formato guardado em jsonb ({ path, legenda }).
export function FotoCapture({ obraId, pasta, valor, onChange, rotulo = 'Fotografias', max = 12, desativado = false, legendas = true }: Props) {
  const id = useId()
  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)
  const [aEnviar, setAEnviar] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const livres = max - valor.length

  const enviar = async (lista: FileList | null) => {
    const ficheiros = [...(lista ?? [])].filter(f => !f.type || f.type.startsWith('image/')).slice(0, Math.max(0, livres))
    if (ficheiros.length === 0) return
    setErro(null)
    setAEnviar(n => n + ficheiros.length)
    const novas: FotoObra[] = []
    for (const f of ficheiros) {
      try {
        novas.push(await enviarFotoObra(obraId, pasta, f))
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível enviar a foto.')
      } finally {
        setAEnviar(n => n - 1)
      }
    }
    if (novas.length > 0) onChange([...valor, ...novas])
  }

  const mudarLegenda = (i: number, legenda: string) =>
    onChange(valor.map((f, j) => (j === i ? { ...f, legenda: legenda || null } : f)))

  return (
    <div className="space-y-2">
      <p id={`${id}-t`} className="text-sm font-medium">
        {rotulo} <span className="text-muted-foreground font-normal text-xs">({valor.length}/{max})</span>
      </p>

      {valor.length > 0 && (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {valor.map((f, i) => (
            <li key={f.path} className="relative rounded-xl border border-border overflow-hidden bg-card">
              <img src={urlFotoObra(f.path) ?? ''} alt={f.legenda || `Foto ${i + 1}`} className="w-full aspect-square object-cover bg-muted" />
              {!desativado && (
                <button type="button" onClick={() => onChange(valor.filter((_, j) => j !== i))} aria-label={`Remover foto ${i + 1}`}
                  className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80">
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
              {legendas && (
                <input type="text" value={f.legenda ?? ''} onChange={e => mudarLegenda(i, e.target.value)} disabled={desativado}
                  placeholder="Legenda (opcional)" aria-label={`Legenda da foto ${i + 1}`}
                  className="w-full px-2.5 py-2 text-xs bg-input-background border-t border-border focus:outline-none focus:ring-2 focus:ring-primary" />
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" className={botao} onClick={() => camRef.current?.click()} disabled={desativado || livres <= 0 || aEnviar > 0}>
          <Camera className="w-4 h-4" aria-hidden="true" /> Tirar foto
        </button>
        <button type="button" className={botao} onClick={() => galRef.current?.click()} disabled={desativado || livres <= 0 || aEnviar > 0}>
          <ImagePlus className="w-4 h-4" aria-hidden="true" /> Da galeria
        </button>
        {aEnviar > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
            <Loader2 className="w-4 h-4 animate-spin text-primary" aria-hidden="true" /> A enviar {aEnviar}…
          </span>
        )}
        {livres <= 0 && <span className="text-xs text-muted-foreground">Limite de {max} fotos atingido.</span>}
      </div>

      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" data-testid="fotos-camera"
        onChange={e => { void enviar(e.target.files); e.target.value = '' }} />
      <input ref={galRef} type="file" accept="image/*" multiple className="hidden" data-testid="fotos-galeria"
        onChange={e => { void enviar(e.target.files); e.target.value = '' }} />
      {erro && <p role="alert" className="text-xs text-destructive">{erro}</p>}
    </div>
  )
}
