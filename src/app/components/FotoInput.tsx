import { useEffect, useId, useRef, useState } from 'react'
import { Camera, ClipboardPaste, ImagePlus, Loader2, X } from 'lucide-react'
import { enviarFotoArmazem, urlFotoArmazem, type DonoFoto } from '@/app/lib/fotosArmazem'

// Foto de um artigo/ferramenta: câmara (telemóvel), ficheiro, ou colar uma
// imagem copiada da internet (Ctrl+V). Envia logo e devolve o caminho no bucket.
export function FotoInput({
  dono, valor, onChange, rotulo = 'Foto', obrigatoria = false, soCamera = false, desativado = false,
}: {
  dono: DonoFoto
  valor: string | null
  onChange: (caminho: string | null) => void
  rotulo?: string
  obrigatoria?: boolean
  // Prova de estado (empréstimo/devolução): só câmara, sem galeria nem colar
  soCamera?: boolean
  desativado?: boolean
}) {
  const id = useId()
  const camRef = useRef<HTMLInputElement>(null)
  const ficRef = useRef<HTMLInputElement>(null)
  const zonaRef = useRef<HTMLDivElement>(null)
  const [aEnviar, setAEnviar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const enviar = async (f: File | null | undefined) => {
    if (!f) return
    if (f.type && !f.type.startsWith('image/')) { setErro('Escolha uma imagem.'); return }
    setErro(null)
    setAEnviar(true)
    try {
      onChange(await enviarFotoArmazem(dono, f))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar a foto.')
    } finally {
      setAEnviar(false)
    }
  }

  // Colar (Ctrl+V) com o foco na zona da foto
  useEffect(() => {
    const zona = zonaRef.current
    if (!zona || soCamera || desativado) return
    const aoColar = (ev: ClipboardEvent) => {
      const item = [...(ev.clipboardData?.items ?? [])].find(i => i.type.startsWith('image/'))
      if (!item) return
      ev.preventDefault()
      const f = item.getAsFile()
      if (f) void enviar(new File([f], 'colada.png', { type: f.type || 'image/png' }))
    }
    zona.addEventListener('paste', aoColar)
    return () => zona.removeEventListener('paste', aoColar)
  })

  const url = urlFotoArmazem(valor)
  const botao = 'inline-flex items-center gap-1.5 px-3 py-2 border border-border rounded-xl text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50'

  return (
    <div>
      <label htmlFor={`${id}-cam`} className="block text-sm font-medium mb-1.5">
        {rotulo} {obrigatoria ? <span className="text-destructive">*</span> : <span className="text-muted-foreground font-normal text-xs">(opcional)</span>}
      </label>
      <div ref={zonaRef} tabIndex={soCamera ? -1 : 0} aria-label={soCamera ? undefined : `${rotulo}: clique e cole uma imagem (Ctrl+V)`}
        className="rounded-2xl border-2 border-dashed border-border p-3 focus:outline-none focus:border-primary">
        {url ? (
          <div className="relative">
            <img src={url} alt={rotulo} className="w-full max-h-64 object-contain rounded-xl bg-muted" />
            {!desativado && (
              <button type="button" onClick={() => onChange(null)} aria-label="Remover foto"
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80">
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-4 text-center text-muted-foreground">
            {aEnviar ? <Loader2 className="w-8 h-8 animate-spin text-primary" aria-hidden="true" /> : <ImagePlus className="w-8 h-8" aria-hidden="true" />}
            <p className="text-xs">{aEnviar ? 'A enviar…' : soCamera ? 'Fotografe o estado atual' : 'Tire uma foto, escolha um ficheiro ou cole uma imagem (Ctrl+V)'}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2 justify-center mt-2">
          <button type="button" className={botao} onClick={() => camRef.current?.click()} disabled={aEnviar || desativado}>
            <Camera className="w-4 h-4" aria-hidden="true" /> {url ? 'Nova foto' : 'Tirar foto'}
          </button>
          {!soCamera && (
            <>
              <button type="button" className={botao} onClick={() => ficRef.current?.click()} disabled={aEnviar || desativado}>
                <ImagePlus className="w-4 h-4" aria-hidden="true" /> Ficheiro
              </button>
              <button type="button" className={botao} onClick={() => zonaRef.current?.focus()} disabled={aEnviar || desativado}
                title="Copie uma imagem (ex.: do Google), clique aqui e carregue Ctrl+V">
                <ClipboardPaste className="w-4 h-4" aria-hidden="true" /> Colar
              </button>
            </>
          )}
        </div>
      </div>
      <input id={`${id}-cam`} ref={camRef} type="file" accept="image/*" capture="environment" className="hidden"
        data-testid="foto-camera" onChange={e => { void enviar(e.target.files?.[0]); e.target.value = '' }} />
      {!soCamera && (
        <input ref={ficRef} type="file" accept="image/*" className="hidden" data-testid="foto-ficheiro"
          onChange={e => { void enviar(e.target.files?.[0]); e.target.value = '' }} />
      )}
      {erro && <p role="alert" className="text-xs text-destructive mt-1">{erro}</p>}
    </div>
  )
}
