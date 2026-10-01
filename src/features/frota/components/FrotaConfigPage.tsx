import { Link } from 'react-router'
import { ClipboardList, Bell, ChevronRight, Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { useRole } from '@/features/auth/useRole'

function Cartao({ para, icone, titulo, texto }: { para: string; icone: ReactNode; titulo: string; texto: string }) {
  return (
    <Link to={para} className="flex items-center gap-4 bg-card rounded-2xl border border-border p-4 hover:bg-accent/40 active:scale-[0.99] transition-all">
      <span className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">{icone}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{titulo}</span>
        <span className="block text-xs text-muted-foreground mt-0.5">{texto}</span>
      </span>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
    </Link>
  )
}

export function FrotaConfigPage() {
  const { podeFrota, isAdmin } = useRole()

  if (!podeFrota && !isAdmin) {
    return <p className="text-sm text-muted-foreground text-center py-12">Não tem permissão para configurar a frota.</p>
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="space-y-3">
        <Cartao para="/frota/catalogo" icone={<ClipboardList className="w-5 h-5" aria-hidden="true" />}
          titulo="Ficha de revisão (checklist) — itens e intervalos"
          texto="Acrescentar, editar ou desativar itens, e definir os intervalos e os avisos de cada prazo." />
        {isAdmin && (
          <Cartao para="/frota/notificacoes" icone={<Bell className="w-5 h-5" aria-hidden="true" />}
            titulo="Notificações da frota"
            texto="Quem recebe no telemóvel os avisos de revisões, seguro, IPO e outros prazos." />
        )}
      </div>

      <div className="rounded-2xl bg-primary/5 p-4 text-sm space-y-2 flex gap-3">
        <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
        <div className="space-y-1.5">
          <p className="font-semibold">Como funcionam os alertas</p>
          <p className="text-muted-foreground">
            Cada item de manutenção tem um intervalo (em km, horas ou meses). Ao registar uma intervenção, o próximo prazo é calculado sozinho.
          </p>
          <p className="text-muted-foreground">
            Quando falta pouco, o prazo passa a <strong>atenção</strong>; mais perto, a <strong>urgente</strong>. Os limiares de cada item
            definem-se na ficha de revisão. Os prazos a vencer aparecem em Manutenção, no separador &quot;Em oficina e a vencer&quot;.
          </p>
        </div>
      </div>
    </div>
  )
}
