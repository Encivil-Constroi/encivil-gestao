import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ShieldAlert, ShieldCheck, ShieldX, Wrench, ImageOff } from 'lucide-react'
import type { ToolStatus } from '@/app/types'
import { urlFotoArmazem } from '@/app/lib/fotosArmazem'
import { useRole } from '@/features/auth/useRole'
import { ESTADO_FERRAMENTA, estadoGarantia, textoGarantia } from '../lib/estadoFerramenta'

export function EstadoFerramenta({ estado, grande = false }: { estado: ToolStatus; grande?: boolean }) {
  const e = ESTADO_FERRAMENTA[estado]
  return (
    <span data-estado={estado}
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${e.classe} ${grande ? 'px-3 py-1 text-sm' : 'px-2.5 py-0.5 text-xs'}`}>
      <span className={`rounded-full ${e.ponto} ${grande ? 'w-2 h-2' : 'w-1.5 h-1.5'}`} aria-hidden="true" />
      {e.rotulo}
    </span>
  )
}

export function SeloGarantia({ garantiaAte, compacto = false }: { garantiaAte?: string; compacto?: boolean }) {
  const g = estadoGarantia(garantiaAte)
  if (g.tipo === 'sem') return null
  const estilo = {
    valida: { cls: 'bg-success/10 text-success', Icone: ShieldCheck },
    a_terminar: { cls: 'bg-warning/15 text-warning', Icone: ShieldAlert },
    expirada: { cls: 'bg-destructive/10 text-destructive', Icone: ShieldX },
  }[g.tipo]
  return (
    <span data-garantia={g.tipo}
      className={`inline-flex items-center gap-1 rounded-md font-medium ${estilo.cls} ${compacto ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-1 text-xs'}`}>
      <estilo.Icone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      {textoGarantia(g)}
    </span>
  )
}

export function FotoFerramenta({ caminho, alt, className = '' }: { caminho?: string | null; alt: string; className?: string }) {
  const url = urlFotoArmazem(caminho)
  return url
    ? <img src={url} alt={alt} loading="lazy" className={`object-cover bg-muted ${className}`} />
    : (
      <div className={`flex items-center justify-center bg-muted text-muted-foreground/50 ${className}`} aria-hidden="true">
        <Wrench className="w-1/3 h-1/3 max-w-10 max-h-10" />
      </div>
    )
}

// Foto de prova (entrega/devolução); abre em tamanho real num separador novo
export function FotoProva({ caminho, rotulo }: { caminho?: string | null; rotulo: string }) {
  const url = urlFotoArmazem(caminho)
  return (
    <figure className="min-w-0">
      <figcaption className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{rotulo}</figcaption>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="block">
          <img src={url} alt={rotulo} loading="lazy" className="w-full aspect-[4/3] object-cover rounded-xl bg-muted border border-border" />
        </a>
      ) : (
        <div className="w-full aspect-[4/3] rounded-xl bg-muted border border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground">
          <ImageOff className="w-5 h-5" aria-hidden="true" />
          <span className="text-[11px]">Sem foto</span>
        </div>
      )}
    </figure>
  )
}

// Páginas de escrita (form, empréstimo, devolução): quem não pode registar
// é avisado e volta à lista — a RLS recusaria de qualquer forma.
export function useExigePermissaoFerramentas(): boolean {
  const { podeFerramentas, loading } = useRole()
  const navigate = useNavigate()
  const negado = !loading && !podeFerramentas
  useEffect(() => {
    if (!negado) return
    toast.error('Não tem permissão para registar ferramentas.')
    navigate('/armazem/ferramentas', { replace: true })
  }, [negado, navigate])
  return !loading && podeFerramentas
}

export const inputCls = 'w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-base'

export function Campo({ rotulo, opcional, children, htmlFor, ajuda }: {
  rotulo: string; opcional?: boolean; children: React.ReactNode; htmlFor?: string; ajuda?: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium mb-1.5">
        {rotulo} {opcional && <span className="text-muted-foreground font-normal text-xs">(opcional)</span>}
      </label>
      {children}
      {ajuda}
    </div>
  )
}

export function Carregando() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]" role="status" aria-label="A carregar">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
