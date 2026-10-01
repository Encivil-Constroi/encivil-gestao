import { useId, useRef, useState } from 'react'
import { Camera, ImagePlus, Loader2, X } from 'lucide-react'
import { enviarFotoDocumento, urlFotoDocumento, type DocumentoFoto } from '../lib/fotosFrota'

// Foto do seguro ou da IPO: câmara ou ficheiro, envia logo para o bucket frota-docs e devolve o caminho
export function FotoDocumento({ viaturaId, documento, valor, onChange, rotulo }: {
  viaturaId: string
  documento: DocumentoFoto
  valor: string | null
  onChange: (caminho: string | null) => void
  rotulo: string
}) {
  const id = useId()
  const camRef = useRef<HTMLInputElement>(null)
  const ficRef = useRef<HTMLInputElement>(null)
  const [aEnviar, setAEnviar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const enviar = async (f: File | null | undefined) => {
    if (!f) return
    if (f.type && !f.type.startsWith('image/')) { setErro('Escolha uma imagem.'); return }
    setErro(null)
    setAEnviar(true)
    try {
      onChange(await enviarFotoDocumento(viaturaId, documento, f))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar a foto.')
    } finally {
      setAEnviar(false)
    }
  }

  const url = urlFotoDocumento(valor)
  const botao = 'inline-flex items-center gap-1.5 px-3 py-2 border border-border rounded-xl text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50'

  return (
    <div>
      <p id={`${id}-t`} className="text-sm font-medium mb-1.5">
        {rotulo} <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
      </p>
      <div className="rounded-2xl border-2 border-dashed border-border p-3" role="group" aria-labelledby={`${id}-t`}>
        {url ? (
          <div className="relative">
            <img src={url} alt={rotulo} className="w-full max-h-56 object-contain rounded-xl bg-muted" />
            <button type="button" onClick={() => onChange(null)} aria-label={`Remover ${rotulo.toLowerCase()}`}
              className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 py-3 text-muted-foreground">
            {aEnviar ? <Loader2 className="w-7 h-7 animate-spin text-primary" aria-hidden="true" /> : <ImagePlus className="w-7 h-7" aria-hidden="true" />}
            <p className="text-xs">{aEnviar ? 'A enviar…' : 'Sem foto'}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2 justify-center mt-2">
          <button type="button" className={botao} disabled={aEnviar} onClick={() => camRef.current?.click()}>
            <Camera className="w-4 h-4" aria-hidden="true" /> {url ? 'Nova foto' : 'Tirar foto'}
          </button>
          <button type="button" className={botao} disabled={aEnviar} onClick={() => ficRef.current?.click()}>
            <ImagePlus className="w-4 h-4" aria-hidden="true" /> Ficheiro
          </button>
        </div>
      </div>
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" data-testid={`foto-${documento}-camera`}
        onChange={e => { void enviar(e.target.files?.[0]); e.target.value = '' }} />
      <input ref={ficRef} type="file" accept="image/*" className="hidden" data-testid={`foto-${documento}-ficheiro`}
        onChange={e => { void enviar(e.target.files?.[0]); e.target.value = '' }} />
      {erro && <p role="alert" className="text-xs text-destructive mt-1">{erro}</p>}
    </div>
  )
}
