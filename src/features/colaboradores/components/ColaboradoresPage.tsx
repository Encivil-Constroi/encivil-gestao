import { useState } from 'react'
import { Plus, Search, Users, Archive, RotateCcw, Pencil, Clock, CalendarX, Phone, UserPlus } from 'lucide-react'
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
import { ColaboradorForm } from './ColaboradorForm'
import { urlFotoRh } from '@/app/lib/fotosRh'
import { hrefTel } from '../lib/telefone'
import { HorariosPage } from '@/features/horarios/components/HorariosPage'
import { FaltasPage } from '@/features/horarios/components/FaltasPage'
import type { Colaborador } from '@/app/types'

type MainTab = 'equipa' | 'perfil' | 'horarios' | 'faltas'
type Tab = 'ativos' | 'arquivados'

export function ColaboradoresPage() {
  const { isAdmin, isGestor } = useRole()
  const podeEditar = isAdmin || isGestor

  const [mainTab, setMainTab]     = useState<MainTab>('equipa')
  const [tab, setTab]             = useState<Tab>('ativos')
  const [search, setSearch]       = useState('')
  const [setor, setSetor]         = useState('')
  const [cargo, setCargo]         = useState('')
  const [obra, setObra]           = useState('')
  const [formKey, setFormKey]     = useState(0)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Colaborador | null>(null)
  const [archiveId, setArchiveId]   = useState<string | null>(null)
  const [restoreId, setRestoreId]   = useState<string | null>(null)

  const { colaboradores: ativos,     loading: loadingAtivos,     reload: reloadAtivos }     = useColaboradores(true)
  const { colaboradores: arquivados, loading: loadingArquivados, reload: reloadArquivados } = useColaboradores(false)
  const { arquivar, loading: arquivando } = useArquivarColaborador()
  const { restaurar, loading: restaurando } = useRestaurarColaborador()

  const arquivadosSomente = arquivados.filter(c => !c.ativo || !ativos.some(a => a.id === c.id))

  const todos = [...ativos, ...arquivadosSomente]
  const unicos = (f: (c: Colaborador) => string | undefined) =>
    [...new Set(todos.map(f).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'pt'))
  const setores = unicos(c => c.setor)
  const cargos  = unicos(c => c.cargo)
  const obras   = unicos(c => c.obraNome)

  const filter = (list: Colaborador[]) =>
    list.filter(c => {
      const q = search.toLowerCase()
      return (
        (!setor || c.setor === setor) &&
        (!cargo || c.cargo === cargo) &&
        (!obra  || c.obraNome === obra) &&
        (
          c.nome.toLowerCase().includes(q) ||
          c.numeroMecan.toLowerCase().includes(q) ||
          c.cargo.toLowerCase().includes(q) ||
          (c.setor ?? '').toLowerCase().includes(q) ||
          (c.obraNome ?? '').toLowerCase().includes(q)
        )
      )
    })

  const filteredAtivos     = filter(ativos)
  const filteredArquivados = filter(arquivadosSomente)

  const openCreate = () => { setMainTab('perfil') }
  const openEdit   = (c: Colaborador) => { setEditTarget(c); setDrawerOpen(true) }
  const closeDrawer = () => { setDrawerOpen(false); setEditTarget(null) }

  const handleSaved = () => {
    closeDrawer()
    setMainTab('equipa')
    setFormKey(k => k + 1)
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
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
        {c.fotoPath
          ? <img src={urlFotoRh(c.fotoPath) ?? ''} alt={c.nome} loading="lazy" className="w-full h-full object-cover" />
          : <span className="text-sm font-bold text-primary">{c.nome.charAt(0).toUpperCase()}</span>}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate ${isArchived ? 'text-muted-foreground' : ''}`}>{c.nome}</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {c.numeroMecan} · {c.cargo}{c.setor && ` · ${c.setor}`}
          {c.obraNome && <span className="text-primary/70"> · {c.obraNome}</span>}
        </p>
      </div>

      {/* Ligar — tel: abre a app Telefone no Android e no iOS (também na PWA) */}
      {!isArchived && hrefTel(c.telemovel) && (
        <a
          href={hrefTel(c.telemovel)!}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-success-foreground bg-success rounded-lg hover:opacity-90 transition-opacity shrink-0"
          aria-label={`Ligar a ${c.nome}`}
        >
          <Phone className="w-4 h-4" aria-hidden="true" />
          <span className="hidden sm:inline">Ligar</span>
        </a>
      )}

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
      {/* Cabeçalho + abas principais */}
      <div>
        <h1 className="text-xl md:text-2xl font-semibold mb-3">Recursos Humanos</h1>
        <div className="flex gap-1 border-b border-border">
          {([
            { id: 'equipa',   label: 'Equipa',   Icon: Users     },
            ...(podeEditar ? [{ id: 'perfil' as MainTab, label: 'Criar perfil', Icon: UserPlus }] : []),
            { id: 'horarios', label: 'Horários', Icon: Clock     },
            { id: 'faltas',   label: 'Faltas',   Icon: CalendarX },
          ] as { id: MainTab; label: string; Icon: typeof Users }[]).map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setMainTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                mainTab === id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Aba Criar perfil */}
      {mainTab === 'perfil' && podeEditar && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden max-w-2xl flex flex-col">
          <ColaboradorForm key={formKey} onSaved={handleSaved} onCancel={() => setMainTab('equipa')} />
        </div>
      )}

      {/* Aba Horários */}
      {mainTab === 'horarios' && <HorariosPage />}

      {/* Aba Faltas */}
      {mainTab === 'faltas' && <FaltasPage />}

      {/* Aba Equipa */}
      {mainTab === 'equipa' && <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {loadingAtivos ? 'A carregar…' : `${ativos.length} colaborador${ativos.length !== 1 ? 'es' : ''} ativo${ativos.length !== 1 ? 's' : ''}`}
        </p>
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
              placeholder="Pesquisar por nome, número, cargo, setor ou obra…"
              className="w-full pl-10 pr-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            />
          </div>
        </div>

        {/* Filtros */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-4 border-b border-border">
          {([
            { rotulo: 'Setor', valor: setor, set: setSetor, opcoes: setores },
            { rotulo: 'Cargo', valor: cargo, set: setCargo, opcoes: cargos },
            { rotulo: 'Obra',  valor: obra,  set: setObra,  opcoes: obras  },
          ]).map(f => (
            <select key={f.rotulo} value={f.valor} onChange={e => f.set(e.target.value)} aria-label={`Filtrar por ${f.rotulo.toLowerCase()}`}
              className="w-full px-3 py-2.5 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm">
              <option value="">{f.rotulo}: todos</option>
              {f.opcoes.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ))}
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

      {/* Botão + : novo colaborador (aba Criar perfil) */}
      {podeEditar && (
        <button
          onClick={openCreate}
          aria-label="Adicionar colaborador"
          className="fixed right-4 bottom-24 md:bottom-6 z-30 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all"
        >
          <Plus className="w-6 h-6" aria-hidden="true" />
        </button>
      )}

      {/* Drawer de edição */}
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
      </>}
    </div>
  )
}
