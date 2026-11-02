import { useState } from 'react'
import { Bell, AlertTriangle, ShieldAlert, CheckCircle, Eye, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/app/components/ui/button'
import { PageHeader, LARGURA_PAGINA } from '@/app/components/PageHeader'
import { FiltroChips } from '@/app/components/FiltroChips'
import { useTodosAlertas, useReconhecerAlerta, useResolverAlerta, useAvaliarAlertas } from '../hooks/useAlertas'
import { labelTipo } from '../services/alertasService'
import type { Alerta, AlertaEstado } from '@/app/types'
import { useRole } from '@/features/auth/useRole'
import { textoPrazoAlerta } from '@/app/lib/prazoFrota'

type Tab = AlertaEstado | 'TODOS'

function SeveridadeBadge({ sev }: { sev: Alerta['severidade'] }) {
  return sev === 'URGENTE' ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-destructive/10 text-destructive">
      <ShieldAlert className="w-3 h-3" /> Urgente
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-warning/15 text-warning">
      <AlertTriangle className="w-3 h-3" /> Atenção
    </span>
  )
}

function EstadoBadge({ estado }: { estado: AlertaEstado }) {
  switch (estado) {
    case 'ATIVO':
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive">Ativo</span>
    case 'RECONHECIDO':
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-info/10 text-info">Reconhecido</span>
    case 'RESOLVIDO':
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">Resolvido</span>
  }
}

function AlertaCard({
  alerta,
  onReconhecer,
  onResolver,
  podeAtuar,
}: {
  alerta: Alerta
  onReconhecer: (id: string) => void
  onResolver: (id: string) => void
  podeAtuar: boolean
}) {
  return (
    <div className={`bg-card rounded-xl border p-4 space-y-3 transition-colors ${
      alerta.severidade === 'URGENTE' && alerta.estado === 'ATIVO'
        ? 'border-destructive/30'
        : 'border-border'
    }`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{alerta.entidadeNome ?? '—'}</p>
          {alerta.entidadeDetalhe && (
            <p className="text-xs text-muted-foreground">{alerta.entidadeDetalhe}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SeveridadeBadge sev={alerta.severidade} />
          <EstadoBadge estado={alerta.estado} />
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span><strong className="text-foreground">Tipo:</strong> {labelTipo(alerta.regraTipo)}</span>
        {alerta.regraTipo === 'FROTA_ITEM' ? (
          <span><strong className="text-foreground">Prazo:</strong> {textoPrazoAlerta(alerta.valorAtual, alerta.valorLimiar)}</span>
        ) : alerta.valorAtual !== undefined && (
          <span><strong className="text-foreground">Atual:</strong> {alerta.valorAtual.toLocaleString('pt-PT')}</span>
        )}
        {alerta.regraTipo !== 'FROTA_ITEM' && alerta.valorLimiar !== undefined && (
          <span><strong className="text-foreground">Limiar:</strong> {alerta.valorLimiar.toLocaleString('pt-PT')}</span>
        )}
        <span><strong className="text-foreground">Criado:</strong> {alerta.criadoEm.toLocaleDateString('pt-PT')}</span>
      </div>

      {podeAtuar && alerta.estado !== 'RESOLVIDO' && (
        <div className="flex gap-2 pt-1">
          {alerta.estado === 'ATIVO' && (
            <button
              onClick={() => onReconhecer(alerta.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-accent transition-colors"
            >
              <Eye className="w-3.5 h-3.5" /> Reconhecer
            </button>
          )}
          <button
            onClick={() => onResolver(alerta.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success/10 text-success border border-success/20 text-xs font-medium hover:bg-success/20 transition-colors"
          >
            <CheckCircle className="w-3.5 h-3.5" /> Resolver
          </button>
        </div>
      )}
    </div>
  )
}

const TABS: { valor: Tab; rotulo: string; tom?: 'destructive' }[] = [
  { valor: 'ATIVO',       rotulo: 'Ativos', tom: 'destructive' },
  { valor: 'RECONHECIDO', rotulo: 'Reconhecidos' },
  { valor: 'RESOLVIDO',   rotulo: 'Resolvidos' },
  { valor: 'TODOS',       rotulo: 'Todos' },
]

export function AlertasPage() {
  const [tab, setTab] = useState<Tab>('ATIVO')
  const { alertas, loading, reload } = useTodosAlertas()
  const { reconhecer, loading: recLoading } = useReconhecerAlerta()
  const { resolver, loading: resLoading } = useResolverAlerta()
  const { avaliar, loading: avalLoading } = useAvaliarAlertas()
  const { isAdmin, isGestor } = useRole()
  const podeAtuar = isAdmin || isGestor

  const filtered = tab === 'TODOS' ? alertas : alertas.filter(a => a.estado === tab)

  const counts: Record<Tab, number> = {
    ATIVO:       alertas.filter(a => a.estado === 'ATIVO').length,
    RECONHECIDO: alertas.filter(a => a.estado === 'RECONHECIDO').length,
    RESOLVIDO:   alertas.filter(a => a.estado === 'RESOLVIDO').length,
    TODOS:       alertas.length,
  }

  async function handleReconhecer(id: string) {
    const ok = await reconhecer(id)
    if (ok) { toast.success('Alerta reconhecido'); reload() }
    else toast.error('Não foi possível reconhecer o alerta.')
  }

  async function handleResolver(id: string) {
    const ok = await resolver(id)
    if (ok) { toast.success('Alerta marcado como resolvido'); reload() }
    else toast.error('Não foi possível resolver o alerta.')
  }

  async function handleAvaliar() {
    const n = await avaliar()
    if (n !== undefined) {
      toast.success(n === 0 ? 'Nenhum alerta novo gerado' : `${n} alerta(s) gerado(s)`)
      reload()
    } else {
      toast.error('Não foi possível avaliar as regras de alerta.')
    }
  }

  return (
    <div className={`${LARGURA_PAGINA} space-y-4`}>
      <PageHeader
        titulo="Alertas"
        descricao="Manutenção preventiva e vencimentos"
        acoes={isAdmin && (
          <Button variant="outline" onClick={handleAvaliar} disabled={avalLoading}>
            <RefreshCw className={avalLoading ? 'animate-spin' : ''} aria-hidden="true" />
            Avaliar agora
          </Button>
        )}
      />

      <FiltroChips
        ariaLabel="Estado dos alertas"
        valor={tab}
        onChange={setTab}
        opcoes={TABS.map(t => ({ ...t, contagem: counts[t.valor] }))}
      />

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-card rounded-xl border border-border p-4 space-y-3">
              <div className="flex justify-between">
                <div className="skeleton h-4 w-48" />
                <div className="skeleton h-5 w-20 rounded-full" />
              </div>
              <div className="skeleton h-3 w-64" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Bell className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {tab === 'ATIVO' ? 'Nenhum alerta ativo' : 'Sem alertas nesta categoria'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(a => (
            <AlertaCard
              key={a.id}
              alerta={a}
              onReconhecer={handleReconhecer}
              onResolver={handleResolver}
              podeAtuar={podeAtuar && !recLoading && !resLoading}
            />
          ))}
        </div>
      )}
    </div>
  )
}
