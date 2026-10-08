import { useEffect, useState } from 'react'
import { FileText, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Button } from './ui/button'
import { normalizarNumero, formatarNumero, linkWhatsApp, numerosRecentes, guardarNumeroRecente } from '../lib/whatsapp'
import { gerarPdfDeElemento, partilharOuDescarregarPdf } from '../lib/pdf/gerarPdf'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  texto: string
  obterElementoPdf?: () => HTMLElement | null
  nomePdf?: string
  numeroInicial?: string
}

export function EnviarWhatsAppDialog({ open, onOpenChange, texto, obterElementoPdf, nomePdf = 'relatorio', numeroInicial }: Props) {
  const [numero, setNumero] = useState('')
  const [msg, setMsg] = useState(texto)
  const [aGerar, setAGerar] = useState(false)
  const [recentes, setRecentes] = useState<string[]>([])
  const [descarregado, setDescarregado] = useState(false)

  useEffect(() => {
    if (!open) return
    setNumero(numeroInicial ?? '')
    setDescarregado(false)
    setMsg(texto)
    setRecentes(numerosRecentes())
  }, [open, texto, numeroInicial])

  const normalizado = numero.trim() ? normalizarNumero(numero) : null
  const invalido = numero.trim() !== '' && normalizado === null

  const abrirConversa = (n: string) => {
    guardarNumeroRecente(n)
    window.open(linkWhatsApp(n, msg), '_blank')
  }

  const enviarPdf = async () => {
    if (!normalizado || !obterElementoPdf) return
    const el = obterElementoPdf()
    if (!el) { toast.error('Não foi possível gerar o PDF'); return }
    setAGerar(true)
    try {
      const ficheiro = await gerarPdfDeElemento(el, nomePdf)
      const r = await partilharOuDescarregarPdf(ficheiro, msg)
      if (r === 'cancelado') return
      if (r === 'descarregado') {
        // window.open depois do trabalho assíncrono seria travado pelo bloqueador de pop-ups:
        // o utilizador abre a conversa com um clique próprio.
        guardarNumeroRecente(normalizado)
        setDescarregado(true)
        toast.success('PDF descarregado — anexe-o na conversa')
        return
      }
      guardarNumeroRecente(normalizado)
      onOpenChange(false)
    } catch (e) {
      // Cancelar a folha de partilha não é um erro
      if (e instanceof DOMException && e.name === 'AbortError') return
      toast.error('Não foi possível gerar o PDF')
    } finally {
      setAGerar(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[10000]">
        <DialogHeader>
          <DialogTitle>Enviar por WhatsApp</DialogTitle>
          <DialogDescription>Indique o número de destino e envie o resumo ou o PDF.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="wa-numero" className="text-sm font-medium">Número</label>
            <Input id="wa-numero" inputMode="tel" placeholder="912 345 678 ou +351…" value={numero} onChange={e => setNumero(e.target.value)} />
            {normalizado && <p className="text-xs text-muted-foreground">{formatarNumero(normalizado)}</p>}
            {invalido && <p className="text-xs text-destructive">Número inválido</p>}
          </div>
          {recentes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {recentes.map(r => (
                <button key={r} type="button" onClick={() => setNumero(formatarNumero(r))} className="px-2.5 py-1 rounded-full bg-accent text-foreground text-xs hover:bg-accent/80">
                  {formatarNumero(r)}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <label htmlFor="wa-texto" className="text-sm font-medium">Mensagem</label>
            <Textarea id="wa-texto" rows={8} value={msg} onChange={e => setMsg(e.target.value)} />
          </div>
        </div>
        {descarregado && normalizado && (
          <a href={linkWhatsApp(normalizado, msg)} target="_blank" rel="noopener noreferrer" onClick={() => onOpenChange(false)}
            className="flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90">
            <MessageCircle className="w-4 h-4" /> Abrir conversa no WhatsApp
          </a>
        )}
        <DialogFooter>
          {obterElementoPdf && (
            <Button type="button" variant="outline" disabled={!normalizado || aGerar} onClick={() => void enviarPdf()}>
              <FileText className="w-4 h-4" /> {aGerar ? 'A gerar PDF…' : 'Enviar PDF'}
            </Button>
          )}
          <Button type="button" disabled={!normalizado || aGerar} onClick={() => { if (normalizado) { abrirConversa(normalizado); onOpenChange(false) } }}>
            <MessageCircle className="w-4 h-4" /> Abrir conversa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
