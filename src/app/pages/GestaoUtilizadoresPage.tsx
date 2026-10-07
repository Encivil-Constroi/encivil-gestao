import { useState } from 'react'
import { toast } from 'sonner'
import { UserPlus, MoreVertical, ShieldCheck, ShieldOff, RefreshCw, Mail, Users, KeyRound } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import {
  useUtilizadores,
  useCriarUtilizador,
  useRedefinirSenha,
  useAlterarPapel,
  useDesativarUtilizador,
  useReativarUtilizador,
  useRemoverMfa,
} from '@/features/auth/hooks/useUtilizadores'
import { emailEfetivo, gerarSenha, loginDeEmail, normalizarLogin, senhaValida } from '@/features/auth/lib/contaInterna'
import { mensagemSenha, validarSenha } from '@/features/auth/lib/politicaSenha'
import { useAsync } from '@/app/lib/useAsync'
import { nivelMfa, mfaObrigatorio, definirMfaObrigatorio } from '@/features/auth/services/mfaService'
import type { RoleUtilizador, Utilizador } from '@/features/auth/services/utilizadoresService'

const ROLES: { value: RoleUtilizador; label: string; desc: string }[] = [
  { value: 'admin',    label: 'Administrador', desc: 'Acesso total + gestão de utilizadores' },
  { value: 'gestor',   label: 'Gestor',        desc: 'Gestão e aprovação; sem eliminar permanente' },
  { value: 'armazem',  label: 'Armazém',       desc: 'Movimentos de stock, ferramentas e combustível' },
  { value: 'medicoes', label: 'Medições',      desc: 'Autos de medição de subempreiteiros' },
  { value: 'mecanico', label: 'Mecânico',      desc: 'Frota: manutenções, checklists e prazos das viaturas' },
  { value: 'motorista', label: 'Motorista',    desc: 'Só pede abastecimentos para a sua viatura e vê os seus pedidos' },
  { value: 'leitura', label: 'Leitura',       desc: 'Apenas visualização, sem edições' },
]

const ROLE_BADGE: Record<RoleUtilizador, string> = {
  admin:    'bg-primary/10 text-primary',
  gestor:   'bg-muted text-foreground',
  armazem:  'bg-muted text-foreground',
  medicoes: 'bg-muted text-foreground',
  mecanico: 'bg-muted text-foreground',
  motorista: 'bg-muted text-foreground',
  leitura:  'bg-muted text-muted-foreground',
}

const inputCls = 'w-full px-3 py-2.5 bg-input-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── Campo de senha com Mostrar/Gerar ───────────────────────────────────────────
function CampoSenha({ id, valor, onChange, rotulo = 'Senha' }: {
  id: string; valor: string; onChange: (v: string) => void; rotulo?: string
}) {
  const [visivel, setVisivel] = useState(false)
  const btnCls = 'px-3 py-2.5 border border-border rounded-lg text-sm hover:bg-muted transition-colors shrink-0'
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-1.5">{rotulo} <span className="text-destructive">*</span></label>
      <div className="flex gap-2">
        <input
          id={id}
          type={visivel ? 'text' : 'password'}
          value={valor}
          onChange={e => onChange(e.target.value)}
          autoComplete="new-password"
          className={`${inputCls} min-w-0`}
        />
        <button type="button" onClick={() => setVisivel(v => !v)} className={btnCls}>
          {visivel ? 'Ocultar' : 'Mostrar'}
        </button>
        <button type="button" onClick={() => { onChange(gerarSenha()); setVisivel(true) }} className={btnCls}>
          Gerar
        </button>
      </div>
      {valor.length > 0 && !senhaValida(valor) && (
        <p className="text-xs text-destructive mt-1">{mensagemSenha(validarSenha(valor))}</p>
      )}
    </div>
  )
}

// ── Formulário de novo utilizador ──────────────────────────────────────────────
export function NovoUtilizadorModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { criar, loading, error: erro } = useCriarUtilizador()
  const [nome, setNome]   = useState('')
  const [email, setEmail] = useState('')
  const [login, setLogin] = useState('')
  const [loginEditado, setLoginEditado] = useState(false)
  const [senha, setSenha] = useState('')
  const [role, setRole]   = useState<RoleUtilizador>('leitura')
  const [criada, setCriada] = useState<{ login: string; senha: string } | null>(null)

  const emailLimpo = email.trim()
  const loginNorm = normalizarLogin(login)
  const entraCom = emailEfetivo(emailLimpo, login) ? (emailLimpo || loginNorm) : ''
  const podeCriar = nome.trim().length > 0 && entraCom !== '' && senhaValida(senha) && !loading

  const aoMudarNome = (v: string) => {
    setNome(v)
    if (!loginEditado) setLogin(normalizarLogin(v))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!podeCriar) return
    const r = await criar({
      nome: nome.trim(),
      ...(emailLimpo ? { email: emailLimpo } : { login: loginNorm }),
      senha,
      role,
    })
    if (r) {
      const quem = loginDeEmail(r.email) ?? r.email
      toast.success(`Conta criada. Entra com ${quem}`)
      setCriada({ login: quem, senha })
      onSuccess()
    }
  }

  const copiar = async () => {
    if (!criada) return
    try {
      await navigator.clipboard.writeText(`Utilizador: ${criada.login}\nSenha: ${criada.senha}`)
      toast.success('Credenciais copiadas.')
    } catch {
      toast.error('Não foi possível copiar. Selecione o texto e copie manualmente.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-1">Novo utilizador</h2>
        {criada ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Conta criada. Guarde estas credenciais: a senha não volta a ser mostrada.</p>
            <div className="bg-muted/40 border border-border rounded-lg p-3 text-sm font-mono space-y-1">
              <p>Utilizador: {criada.login}</p>
              <p>Senha: {criada.senha}</p>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={copiar}
                className="flex-1 py-2.5 border border-border rounded-lg text-sm hover:bg-muted transition-colors">
                Copiar
              </button>
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                Fechar
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-5">
              Crie a conta já com senha. O email é opcional.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="nu-nome" className="block text-sm font-medium mb-1.5">Nome <span className="text-destructive">*</span></label>
                <input id="nu-nome" type="text" value={nome} onChange={e => aoMudarNome(e.target.value)}
                  className={inputCls} placeholder="Nome completo" autoFocus />
              </div>
              <div>
                <label htmlFor="nu-email" className="block text-sm font-medium mb-1.5">Email <span className="text-muted-foreground font-normal text-xs">(opcional)</span></label>
                <input id="nu-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className={inputCls} placeholder="utilizador@encivil.pt" />
              </div>
              <div>
                <label htmlFor="nu-login" className="block text-sm font-medium mb-1.5">Utilizador{!emailLimpo && <span className="text-destructive"> *</span>}</label>
                <input id="nu-login" type="text" value={login}
                  onChange={e => { setLogin(e.target.value); setLoginEditado(true) }}
                  className={inputCls} placeholder="ana.costa" autoComplete="off" />
              </div>
              <CampoSenha id="nu-senha" valor={senha} onChange={setSenha} />
              <div>
                <label htmlFor="nu-papel" className="block text-sm font-medium mb-1.5">Papel</label>
                <select id="nu-papel" value={role} onChange={e => setRole(e.target.value as RoleUtilizador)} className={inputCls}>
                  {ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>
                  ))}
                </select>
              </div>
              {entraCom && <p className="text-xs text-muted-foreground">Entra com: {entraCom}</p>}
              {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={onClose}
                  className="flex-1 py-2.5 border border-border rounded-lg text-sm hover:bg-muted transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={!podeCriar}
                  className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
                  {loading ? 'A criar…' : 'Criar conta'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

// ── Redefinir senha ────────────────────────────────────────────────────────────
function RedefinirSenhaModal({ utilizador, onClose }: { utilizador: Utilizador; onClose: () => void }) {
  const { redefinir, loading, error: erro } = useRedefinirSenha()
  const [senha, setSenha] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!senhaValida(senha)) return
    if (await redefinir(utilizador.id, senha)) {
      toast.success('Senha atualizada')
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-1">Redefinir senha</h2>
        <p className="text-sm text-muted-foreground mb-5">{utilizador.nome}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <CampoSenha id="rs-senha" valor={senha} onChange={setSenha} rotulo="Nova senha" />
          {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-border rounded-lg text-sm hover:bg-muted transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={!senhaValida(senha) || loading}
              className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
              {loading ? 'A guardar…' : 'Redefinir'}
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
  onRedefinirSenha,
  onRemoverMfa,
}: {
  utilizador: Utilizador
  currentUserId: string
  onRoleChange: (userId: string, role: RoleUtilizador) => void
  onToggleAtivo: (utilizador: Utilizador) => void
  onRedefinirSenha: (utilizador: Utilizador) => void
  onRemoverMfa: (utilizador: Utilizador) => void
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
            <div className="border-t border-border my-1" />
            <button
              onClick={() => { onRedefinirSenha(utilizador); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center gap-2"
            >
              <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
              Redefinir senha
            </button>
            {!isSelf && utilizador.mfa && (
              <>
                <div className="border-t border-border my-1" />
                <button
                  onClick={() => { onRemoverMfa(utilizador); setOpen(false) }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center gap-2"
                >
                  <ShieldOff className="w-3.5 h-3.5 text-muted-foreground" />
                  Remover MFA
                </button>
              </>
            )}
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
  const [modalNovo, setModalNovo]              = useState(false)
  const [paraRedefinir, setParaRedefinir]      = useState<Utilizador | null>(null)
  const { remover: removerMfa, loading: removendoMfa } = useRemoverMfa()
  const { data: nivel } = useAsync(nivelMfa, [], { errorMsg: 'Não foi possível ler o nível de verificação' })
  const { data: obrigatorio, reload: recarregarObrigatorio } = useAsync(mfaObrigatorio, [], { errorMsg: 'Não foi possível ler a configuração de MFA' })
  const [aGuardarMfa, setAGuardarMfa] = useState(false)
  const [busca, setBusca]                      = useState('')

  const filtrados = utilizadores.filter(u =>
    u.nome.toLowerCase().includes(busca.toLowerCase()) ||
    u.email.toLowerCase().includes(busca.toLowerCase()) ||
    (u.login ?? '').toLowerCase().includes(busca.toLowerCase()),
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

  const isBusy = alterandoPapel || desativando || reativando || removendoMfa

  const semMfa = utilizadores.filter(u => u.ativo && (u.role === 'admin' || u.role === 'gestor') && !u.mfa).length
  const sessaoAal1 = nivel?.atual === 'aal1'

  const handleRemoverMfa = async (u: Utilizador) => {
    if (!window.confirm(`Remover a verificação em dois passos de ${u.nome}? Terá de a configurar de novo.`)) return
    if (await removerMfa(u.id)) { toast.success(`MFA de ${u.nome} removido.`); reload() }
  }

  const handleInterruptor = async () => {
    const ligar = !obrigatorio
    if (ligar && semMfa > 0 && !window.confirm(
      `${semMfa} utilizador(es) admin/gestor ainda não configuraram e vão ter de o fazer no próximo acesso. Continuar?`,
    )) return
    setAGuardarMfa(true)
    try {
      await definirMfaObrigatorio(ligar)
      toast.success(ligar ? 'Verificação em dois passos obrigatória.' : 'Verificação em dois passos deixou de ser obrigatória.')
      recarregarObrigatorio()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível alterar a configuração.')
    } finally {
      setAGuardarMfa(false)
    }
  }

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
            onClick={() => setModalNovo(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Novo utilizador
          </button>
        </div>
      </div>

      {/* ── Interruptor de MFA ── */}
      <div className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">Exigir verificação em dois passos para admin e gestor</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {sessaoAal1 ? 'Entra com verificação em dois passos para alterar.' : 'Quem ainda não a configurou é levado ao registo no próximo acesso.'}
          </p>
        </div>
        <input
          type="checkbox"
          role="switch"
          aria-label="Exigir verificação em dois passos para admin e gestor"
          checked={obrigatorio ?? false}
          disabled={sessaoAal1 || aGuardarMfa || obrigatorio === null}
          onChange={handleInterruptor}
          className="w-5 h-5 shrink-0"
        />
      </div>

      {/* ── Barra de pesquisa ── */}
      <div className="relative">
        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="search"
          placeholder="Pesquisar por nome, utilizador ou email…"
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
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email / Utilizador</span>
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
                      {u.mfa && <span className="text-[11px] text-success font-medium">MFA</span>}
                      {!u.mfa && (u.role === 'admin' || u.role === 'gestor') && (
                        <span className="text-[11px] text-warning font-medium">Sem MFA</span>
                      )}
                    </div>
                  </div>

                  {/* Email — oculto no mobile */}
                  <p className="hidden md:flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                    <span className="truncate">{u.semEmail ? (u.login ?? u.email) : u.email}</span>
                    {u.semEmail && <span className="shrink-0 px-1.5 py-0.5 rounded bg-muted text-[11px] font-medium">sem email</span>}
                  </p>

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
                      onRedefinirSenha={setParaRedefinir}
                      onRemoverMfa={handleRemoverMfa}
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

      {modalNovo && (
        <NovoUtilizadorModal
          onClose={() => setModalNovo(false)}
          onSuccess={reload}
        />
      )}
      {paraRedefinir && (
        <RedefinirSenhaModal utilizador={paraRedefinir} onClose={() => setParaRedefinir(null)} />
      )}
    </div>
  )
}
