import { useId, useRef, useState } from 'react'
import { Camera, ImagePlus, Loader2, Trash2, User } from 'lucide-react'
import { enviarFotoRh, urlFotoRh, type DonoFotoRh } from '@/app/lib/fotosRh'

// Foto de pessoa: avatar redondo com "Tirar foto" (câmara) e "Galeria".
// Envia logo e devolve o caminho no bucket; a foto é sempre opcional.
export function FotoPerfilInput({
  dono, valor, onChange, rotulo = 'Foto',
}: {
  dono: DonoFotoRh
  valor: string | null
  onChange: (caminho: string | null) => void
  rotulo?: string
}) {
  const id = useId()
  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)
  const [aEnviar, setAEnviar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const enviar = async (f: File | undefined) => {
    if (!f) return
    if (f.type && !f.type.startsWith('image/')) { setErro('Escolha uma imagem.'); return }
    setErro(null)
    setAEnviar(true)
    try {
      onChange(await enviarFotoRh(dono, f))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar a foto.')
    } finally {
      setAEnviar(false)
    }
  }

  const url = urlFotoRh(valor)
  const botao = 'inline-flex items-center gap-1.5 px-3 py-2 border border-border rounded-xl text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50'

  return (
    <div className="flex items-center gap-4">
      <div className="w-20 h-20 rounded-full bg-muted overflow-hidden flex items-center justify-center shrink-0">
        {aEnviar ? <Loader2 className="w-6 h-6 animate-spin text-primary" aria-hidden="true" />
          : url ? <img src={url} alt={rotulo} className="w-full h-full object-cover" />
          : <User className="w-8 h-8 text-muted-foreground" aria-hidden="true" />}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium mb-1.5">{rotulo} <span className="text-muted-foreground font-normal text-xs">(opcional)</span></p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={aEnviar} onClick={() => camRef.current?.click()} className={botao}>
            <Camera className="w-4 h-4" aria-hidden="true" /> Tirar foto
          </button>
          <button type="button" disabled={aEnviar} onClick={() => galRef.current?.click()} className={botao}>
            <ImagePlus className="w-4 h-4" aria-hidden="true" /> Galeria
          </button>
          {url && (
            <button type="button" disabled={aEnviar} onClick={() => onChange(null)} className={botao} aria-label="Remover foto">
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
        {erro && <p role="alert" className="text-xs text-destructive mt-1.5">{erro}</p>}
        <input id={`${id}-cam`} ref={camRef} type="file" accept="image/*" capture="user" className="hidden"
          onChange={e => { void enviar(e.target.files?.[0]); e.target.value = '' }} />
        <input id={`${id}-gal`} ref={galRef} type="file" accept="image/*" className="hidden"
          onChange={e => { void enviar(e.target.files?.[0]); e.target.value = '' }} />
      </div>
    </div>
  )
}
