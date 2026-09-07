import { useState } from 'react'
import { Plus, Search, Users, Archive, RotateCcw, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState } from '@/app/components/EmptyState'
import { ConfirmDialog } from '@/app/components/ConfirmDialog'
import { useRole } from '@/features/auth/useRole'
import {
  useColaboradores,
  useArquivarColaborador,
  useRestaurarColaborador,
} from '../hooks/useColaboradores'
import { ColaboradorDrawer } from './ColaboradorDrawer'
import type { Colaborador } from '@/app/types'

type Tab = 'ativos' | 'arquivados'

export function ColaboradoresPage() {
  const { isAdmin, isGestor } = useRole()
  const podeEditar = isAdmin || isGestor

  const [tab, setTab]             = useState<Tab>('ativos')
  const [search, setSearch]       = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Colaborador | null>(null)
  const [archiveId, setArchiveId]   = useState<string | null>(null)
  const [restoreId, setRestoreId]   = useState<string | null>(null)

  const { colaboradores: ativos,     loading: loadingAtivos,     reload: reloadAtivos }     = useColaboradores(true)
  const { colaboradores: arquivados, loading: loadingArquivados, reload: reloadArquivados } = useColaboradores(false)
  const { arquivar, loading: arquivando } = useArquivarColaborador()
  const { restaurar, loading: restaurando } = useRestaurarColaborador()

  const arquivadosSomente = arquivados.filter(c => !c.ativo || !ativos.some(a => a.id === c.id))

  const filter = (list: Colaborador[]) =>
    list.filter(c => {
      const q = search.toLowerCase()
      return (
        c.nome.toLowerCase().includes(q) ||
        c.numeroMecan.toLowerCase().includes(q) ||
        c.cargo.toLowerCase().includes(q) ||
        (c.obraNome ?? '').toLowerCase().includes(q)
      )
    })

  const filteredAtivos     = filter(ativos)
  const filteredArquivados = filter(arquivadosSomente)

  const openCreate = () => { setEditTarget(null); setDrawerOpen(true) }
  const openEdit   = (c: Colaborador) => { setEditTarget(c); setDrawerOpen(true) }
  const closeDrawer = () => { setDrawerOpen(false); setEditTarget(null) }

  const handleSaved = () => {
    closeDrawer()
    reloadAtivos()
    reloadArquivados()
  }

  const handleArchive = async () => {
    if (!archiveId) return
    const nome = ativos.find(c => c.id === archiveId)?.nome
    const ok = await arquivar(archiveId)
    if (ok) {
      toast.success(`"${nome}" arquivado.`)
      setArchiveId(null)
      reloadAtivos()
      reloadArquivados()
    } else {
      toast.error('Erro ao arquivar colaborador.')
    }
  }

  const handleRestore = async () => {
    if (!restoreId) return
    const nome = arquivadosSomente.find(c => c.id === restoreId)?.nome
    const ok = await restaurar(restoreId)
    if (ok) {
      toast.success(`"${nome}" restaurado.`)
      setRestoreId(null)
      reloadAtivos()
      reloadArquivados()
    } else {
      toast.error('Erro ao restaurar colaborador.')
    }
  }

  const renderRow = (c: Colaborador, isArchived = false) => (
    <div key={c.id} className="flex items-center gap-3 p-4 border-b border-border last:border-0 hover:bg-accent/30 transition-colors">
      {/* Avatar inicial */}
      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <span className="text-sm font-bold text-primary">{c.nome.charAt(0).toUpperCase()}</span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate ${isArchived ? 'text-muted-foreground' : ''}`}>{c.nome}</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {c.numeroMecan} · {c.cargo}
          {c.obraNome && <span className="text-primary/70"> · {c.obraNome}</span>}
        </p>
      </div>

      {/* Ações */}
      {podeEditar && (
        <div className="flex items-center gap-2 shrink-0">
          {!isArchived ? (
            <>
              <button
                onClick={() => openEdit(c)}
                className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                aria-label="Editar"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => setArchiveId(c.id)}
                className="p-2 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                aria-label="Arquivar"
              >
                <Archive className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setRestoreId(c.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Restaurar
            </button>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Colaboradores</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loadingAtivos ? 'A carregar…' : `${ativos.length} colaborador${ativos.length !== 1 ? 'es' : ''} ativo${ativos.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        {podeEditar && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 active:scale-95 transition-all text-sm font-semibold shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Novo Colaborador</span>
            <span className="sm:hidden">Novo</span>
          </button>
        )}
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-border px-4 pt-3 gap-1">
          <button
            onClick={() => setTab('ativos')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 -mb-px transition-colors ${
              tab === 'ativos' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users className="w-4 h-4" />
            Ativos
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${tab === 'ativos' ? 'bg-primary/10' : 'bg-muted'}`}>
              {ativos.length}
            </span>
          </button>
          {podeEditar && (
            <button
              onClick={() => setTab('arquivados')}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 -mb-px transition-colors ${
                tab === 'arquivados' ? 'border-warning text-warning' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Archive className="w-4 h-4" />
              Arquivados
              {arquivadosSomente.length > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${tab === 'arquivados' ? 'bg-warning/10' : 'bg-muted'}`}>
                  {arquivadosSomente.length}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Pesquisa */}
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Pesquisar por nome, número, cargo ou obra…"
              className="w-full pl-10 pr-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            />
          </div>
        </div>

        {/* Lista — Ativos */}
        {tab === 'ativos' && (
          loadingAtivos ? (
            <div className="p-8 text-center text-sm text-muted-foreground">A carregar colaboradores…</div>
          ) : filteredAtivos.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nenhum colaborador encontrado"
              description={
                search
                  ? 'Tente alterar a pesquisa.'
                  : podeEditar
                    ? 'Adicione o primeiro colaborador da empresa.'
                    : 'Nenhum colaborador registado ainda.'
              }
            />
          ) : (
            <div>{filteredAtivos.map(c => renderRow(c, false))}</div>
          )
        )}

        {/* Lista — Arquivados */}
        {tab === 'arquivados' && (
          loadingArquivados ? (
            <div className="p-8 text-center text-sm text-muted-foreground">A carregar…</div>
          ) : filteredArquivados.length === 0 ? (
            <EmptyState icon={Archive} title="Nenhum colaborador arquivado" description="Colaboradores arquivados aparecem aqui." />
          ) : (
            <div>{filteredArquivados.map(c => renderRow(c, true))}</div>
          )
        )}
      </div>

      {/* Drawer de criação / edição */}
      {drawerOpen && (
        <ColaboradorDrawer
          colaborador={editTarget}
          onClose={closeDrawer}
          onSaved={handleSaved}
        />
      )}

      {/* Confirmação de arquivamento */}
      {archiveId && (
        <ConfirmDialog
          title={`Arquivar "${ativos.find(c => c.id === archiveId)?.nome}"?`}
          description="O colaborador deixará de aparecer nas listagens ativas. Pode ser restaurado a qualquer momento."
          confirmLabel="Arquivar"
          variant="warning"
          loading={arquivando}
          onConfirm={handleArchive}
          onCancel={() => setArchiveId(null)}
        />
      )}

      {/* Confirmação de restauro */}
      {restoreId && (
        <ConfirmDialog
          title={`Restaurar "${arquivadosSomente.find(c => c.id === restoreId)?.nome}"?`}
          description="O colaborador voltará a aparecer nas listagens ativas."
          confirmLabel="Restaurar"
          variant="warning"
          loading={restaurando}
          onConfirm={handleRestore}
          onCancel={() => setRestoreId(null)}
        />
      )}
    </div>
  )
}
