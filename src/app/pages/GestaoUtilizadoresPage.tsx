import { useState } from 'react'
import { toast } from 'sonner'
import { UserPlus, MoreVertical, ShieldCheck, ShieldOff, RefreshCw, Mail, Users } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import {
  useUtilizadores,
  useConvidarUtilizador,
  useAlterarPapel,
  useDesativarUtilizador,
  useReativarUtilizador,
} from '@/features/auth/hooks/useUtilizadores'
import type { RoleUtilizador, Utilizador } from '@/features/auth/services/utilizadoresService'

const ROLES: { value: RoleUtilizador; label: string; desc: string }[] = [
  { value: 'admin',    label: 'Administrador', desc: 'Acesso total + gestão de utilizadores' },
  { value: 'gestor',   label: 'Gestor',        desc: 'Gestão e aprovação; sem eliminar permanente' },
  { value: 'armazem',  label: 'Armazém',       desc: 'Movimentos de stock, ferramentas e combustível' },
  { value: 'medicoes', label: 'Medições',      desc: 'Autos de medição de subempreiteiros' },
  { value: 'leitura',  label: 'Leitura',       desc: 'Apenas visualização, sem edições' },
]

const ROLE_BADGE: Record<RoleUtilizador, string> = {
  admin:    'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  gestor:   'bg-blue-100   text-blue-700   dark:bg-blue-900/30   dark:text-blue-300',
  armazem:  'bg-amber-100  text-amber-700  dark:bg-amber-900/30  dark:text-amber-300',
  medicoes: 'bg-teal-100   text-teal-700   dark:bg-teal-900/30   dark:text-teal-300',
  leitura:  'bg-gray-100   text-gray-600   dark:bg-gray-800       dark:text-gray-400',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── Formulário de convite ──────────────────────────────────────────────────────
function ConvidarModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { convidar, loading } = useConvidarUtilizador()
  const [email, setEmail] = useState('')
  const [nome,  setNome]  = useState('')
  const [role,  setRole]  = useState<RoleUtilizador>('gestor')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = await convidar(email.trim(), nome.trim(), role)
    if (result !== undefined) {
      toast.success(`Convite enviado para ${email}`)
      onSuccess()
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-1">Convidar utilizador</h2>
        <p className="text-sm text-muted-foreground mb-5">
          O utilizador receberá um email com um link de acesso.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Nome</label>
            <input
              type="text"
              value={nome}
              onChange={e => setNome(e.target.value)}
              required
              className="w-full px-3 py-2.5 bg-input-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Nome completo"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 bg-input-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="utilizador@encivil.pt"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Papel</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value as RoleUtilizador)}
              className="w-full px-3 py-2.5 bg-input-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-border rounded-lg text-sm hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? 'A enviar…' : 'Enviar convite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Menu de ações por utilizador ───────────────────────────────────────────────
function MenuAcoes({
  utilizador,
  currentUserId,
  onRoleChange,
  onToggleAtivo,
}: {
  utilizador: Utilizador
  currentUserId: string
  onRoleChange: (userId: string, role: RoleUtilizador) => void
  onToggleAtivo: (utilizador: Utilizador) => void
}) {
  const [open, setOpen] = useState(false)
  const isSelf = utilizador.id === currentUserId

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-20 w-52 bg-popover border border-border rounded-xl shadow-lg py-1 overflow-hidden">
            <p className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Alterar papel
            </p>
            {ROLES.filter(r => r.value !== utilizador.role).map(r => (
              <button
                key={r.value}
                onClick={() => { onRoleChange(utilizador.id, r.value); setOpen(false) }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center gap-2"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" />
                {r.label}
              </button>
            ))}
            {!isSelf && (
              <>
                <div className="border-t border-border my-1" />
                <button
                  onClick={() => { onToggleAtivo(utilizador); setOpen(false) }}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                    utilizador.ativo
                      ? 'text-destructive hover:bg-destructive/10'
                      : 'text-success hover:bg-success/10'
                  }`}
                >
                  <ShieldOff className="w-3.5 h-3.5" />
                  {utilizador.ativo ? 'Desativar conta' : 'Reativar conta'}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────
export function GestaoUtilizadoresPage() {
  const { user } = useAuth()
  const { utilizadores, loading, error, reload } = useUtilizadores()
  const { alterar, loading: alterandoPapel } = useAlterarPapel()
  const { desativar, loading: desativando }   = useDesativarUtilizador()
  const { reativar, loading: reativando }     = useReativarUtilizador()
  const [modalConvite, setModalConvite]        = useState(false)
  const [busca, setBusca]                      = useState('')

  const filtrados = utilizadores.filter(u =>
    u.nome.toLowerCase().includes(busca.toLowerCase()) ||
    u.email.toLowerCase().includes(busca.toLowerCase()),
  )

  const handleRoleChange = async (userId: string, role: RoleUtilizador) => {
    await alterar(userId, role)
    toast.success('Papel atualizado.')
    reload()
  }

  const handleToggleAtivo = async (u: Utilizador) => {
    if (u.ativo) {
      const ok = await desativar(u.id)
      if (ok) { toast.success(`${u.nome} foi desativado.`); reload() }
    } else {
      const ok = await reativar(u.id)
      if (ok) { toast.success(`${u.nome} foi reativado.`); reload() }
    }
  }

  const isBusy = alterandoPapel || desativando || reativando

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
      {/* ── Cabeçalho ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Gestão de Utilizadores</h1>
            <p className="text-sm text-muted-foreground">
              {utilizadores.length} {utilizadores.length === 1 ? 'utilizador' : 'utilizadores'} registados
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={reload}
            disabled={loading || isBusy}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground disabled:opacity-40"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setModalConvite(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Convidar
          </button>
        </div>
      </div>

      {/* ── Barra de pesquisa ── */}
      <div className="relative">
        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="search"
          placeholder="Pesquisar por nome ou email…"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-input-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* ── Estado de erro ── */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-sm text-destructive">
          {error} —{' '}
          <button onClick={reload} className="underline font-medium">tentar novamente</button>
        </div>
      )}

      {/* ── Tabela / Lista ── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum utilizador encontrado</p>
          {busca && <p className="text-sm mt-1">Tente outra pesquisa</p>}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {/* Header da tabela — desktop */}
          <div className="hidden md:grid grid-cols-[1fr_1fr_140px_140px_48px] gap-4 px-5 py-3 border-b border-border bg-muted/30">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Utilizador</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Papel</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Último acesso</span>
            <span />
          </div>

          <ul className="divide-y divide-border">
            {filtrados.map(u => {
              const roleInfo = ROLES.find(r => r.value === u.role)
              const isSelf = u.id === user?.id
              return (
                <li
                  key={u.id}
                  className={`px-5 py-4 flex md:grid md:grid-cols-[1fr_1fr_140px_140px_48px] gap-4 items-center transition-colors hover:bg-muted/20 ${!u.ativo ? 'opacity-50' : ''}`}
                >
                  {/* Nome + badge */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                      {u.nome.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {u.nome}
                        {isSelf && <span className="ml-1.5 text-xs text-muted-foreground font-normal">(você)</span>}
                      </p>
                      {!u.ativo && (
                        <span className="text-[11px] text-destructive font-medium">Desativado</span>
                      )}
                    </div>
                  </div>

                  {/* Email — oculto no mobile */}
                  <p className="hidden md:block text-sm text-muted-foreground truncate">{u.email}</p>

                  {/* Papel */}
                  <div>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${ROLE_BADGE[u.role]}`}>
                      {roleInfo?.label ?? u.role}
                    </span>
                  </div>

                  {/* Último acesso */}
                  <p className="hidden md:block text-sm text-muted-foreground tabular-nums">
                    {formatDate(u.ultimoLogin)}
                  </p>

                  {/* Ações */}
                  <div className="ml-auto md:ml-0">
                    <MenuAcoes
                      utilizador={u}
                      currentUserId={user?.id ?? ''}
                      onRoleChange={handleRoleChange}
                      onToggleAtivo={handleToggleAtivo}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* ── Legenda de papéis ── */}
      <details className="group">
        <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none">
          Ver descrição dos papéis
        </summary>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ROLES.map(r => (
            <div key={r.value} className="flex items-start gap-3 p-3 bg-muted/30 rounded-xl">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${ROLE_BADGE[r.value]}`}>
                {r.label}
              </span>
              <p className="text-xs text-muted-foreground">{r.desc}</p>
            </div>
          ))}
        </div>
      </details>

      {/* ── Modal de convite ── */}
      {modalConvite && (
        <ConvidarModal
          onClose={() => setModalConvite(false)}
          onSuccess={reload}
        />
      )}
    </div>
  )
}
