import { useEffect, useState } from 'react'
import { ChevronRight, KeyRound, Save, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { useAsync } from '@/app/lib/useAsync'
import { FotoPerfilInput } from '@/app/components/FotoPerfilInput'
import { useAuth } from '../AuthContext'
import { useRole } from '../useRole'
import { useMeuPerfil, useAtualizarContacto, usePedirNovoEmail, useAlterarSenha } from '../hooks/usePerfil'
import { SENHA_MIN, DICA_SENHA, mensagemSenha, validarSenha } from '../lib/politicaSenha'
import { listarFatores } from '../services/mfaService'

const inputCls = 'w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm'
const labelCls = 'block text-sm font-medium mb-1.5'
const botaoCls = 'inline-flex items-center justify-center gap-2 px-5 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60'
const TELEMOVEL_OK = /^\+?[0-9 ]{9,15}$/

export function PerfilPage() {
  const { user, recarregarPerfil } = useAuth()
  const { role } = useRole()
  const { perfil, loading, reload } = useMeuPerfil(user?.id)
  const { mutate: atualizar, loading: aGuardar, error: erroContacto } = useAtualizarContacto()
  const { mutate: pedirEmail } = usePedirNovoEmail()
  const { mutate: trocarSenha, loading: aTrocar, error: erroSenha } = useAlterarSenha()
  const { data: fatoresMfa } = useAsync(listarFatores, [user?.id], { enabled: !!user, errorMsg: 'Erro ao ler a verificação em dois passos' })

  const [contacto, setContacto] = useState({ nome: '', email: '', telemovel: '', fotoPath: null as string | null })
  const [senha, setSenha] = useState({ atual: '', nova: '', confirmar: '' })

  useEffect(() => {
    if (!perfil) return
    setContacto({ nome: perfil.nome, email: user?.email ?? perfil.email, telemovel: perfil.telemovel ?? '', fotoPath: perfil.foto_path })
  }, [perfil, user?.email])

  const guardarContacto = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contacto.nome.trim()) { toast.error('O nome é obrigatório.'); return }
    if (contacto.telemovel.trim() && !TELEMOVEL_OK.test(contacto.telemovel.trim())) {
      toast.error('Telemóvel inválido. Ex.: 912 345 678 ou +351 912 345 678'); return
    }
    if ((await atualizar(contacto.nome, contacto.telemovel, contacto.fotoPath)) !== true) return
    const emailAtual = (user?.email ?? '').toLowerCase()
    const emailNovo = contacto.email.trim().toLowerCase()
    if (emailNovo && emailNovo !== emailAtual) {
      if ((await pedirEmail(emailNovo)) === true) toast.success(`Contacto atualizado. Confirme o novo email no link enviado para ${emailNovo}.`)
    } else {
      toast.success('Contacto atualizado.')
    }
    await recarregarPerfil()
    reload()
  }

  const guardarSenha = async (e: React.FormEvent) => {
    e.preventDefault()
    const erroPolitica = mensagemSenha(validarSenha(senha.nova))
    if (erroPolitica) { toast.error(erroPolitica); return }
    if (senha.nova !== senha.confirmar) { toast.error('A confirmação não coincide com a nova senha/PIN.'); return }
    if ((await trocarSenha(user?.email ?? '', senha.atual, senha.nova)) === true) {
      toast.success('Senha/PIN alterado.')
      setSenha({ atual: '', nova: '', confirmar: '' })
    }
  }

  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground">A carregar perfil…</div>

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">O meu perfil</h1>
        <p className="text-sm text-muted-foreground mt-1">Papel na app: <span className="font-medium text-foreground">{role ?? '—'}</span> (definido pela administração)</p>
      </div>

      <form onSubmit={guardarContacto} className="bg-card border border-border rounded-2xl p-5 space-y-4">
        {user && <FotoPerfilInput dono={{ tipo: 'perfis', id: user.id }} valor={contacto.fotoPath} onChange={fotoPath => setContacto(c => ({ ...c, fotoPath }))} />}
        <div>
          <label htmlFor="perfil-nome" className={labelCls}>Nome</label>
          <input id="perfil-nome" className={inputCls} value={contacto.nome} onChange={e => setContacto(c => ({ ...c, nome: e.target.value }))} required />
        </div>
        <div>
          <label htmlFor="perfil-email" className={labelCls}>Email</label>
          <input id="perfil-email" type="email" className={inputCls} value={contacto.email} onChange={e => setContacto(c => ({ ...c, email: e.target.value }))} required />
          <p className="text-xs text-muted-foreground mt-1">Ao mudar o email, enviamos um link de confirmação para o endereço novo.</p>
        </div>
        <div>
          <label htmlFor="perfil-tel" className={labelCls}>Telemóvel</label>
          <input id="perfil-tel" type="tel" inputMode="tel" className={inputCls} placeholder="912 345 678" value={contacto.telemovel} onChange={e => setContacto(c => ({ ...c, telemovel: e.target.value }))} />
        </div>
        {erroContacto && <p role="alert" className="text-sm text-destructive">{erroContacto}</p>}
        <button type="submit" disabled={aGuardar} className={botaoCls}><Save className="w-4 h-4" aria-hidden="true" />{aGuardar ? 'A guardar…' : 'Atualizar contacto'}</button>
      </form>

      <form onSubmit={guardarSenha} className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <h2 className="text-base font-semibold">Alterar senha / PIN de acesso</h2>
        <div>
          <label htmlFor="senha-atual" className={labelCls}>Senha / PIN atual</label>
          <input id="senha-atual" type="password" autoComplete="current-password" className={inputCls} value={senha.atual} onChange={e => setSenha(s => ({ ...s, atual: e.target.value }))} required />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="senha-nova" className={labelCls}>Nova senha / PIN</label>
            <input id="senha-nova" type="password" autoComplete="new-password" minLength={SENHA_MIN} className={inputCls} value={senha.nova} onChange={e => setSenha(s => ({ ...s, nova: e.target.value }))} required />
            <p className="text-xs text-muted-foreground mt-1">{DICA_SENHA}</p>
          </div>
          <div>
            <label htmlFor="senha-conf" className={labelCls}>Repetir</label>
            <input id="senha-conf" type="password" autoComplete="new-password" className={inputCls} value={senha.confirmar} onChange={e => setSenha(s => ({ ...s, confirmar: e.target.value }))} required />
          </div>
        </div>
        {erroSenha && <p role="alert" className="text-sm text-destructive">{erroSenha}</p>}
        <button type="submit" disabled={aTrocar} className={botaoCls}><KeyRound className="w-4 h-4" aria-hidden="true" />{aTrocar ? 'A alterar…' : 'Alterar senha / PIN'}</button>
      </form>

      <section className="bg-card border border-border rounded-2xl p-5 space-y-3">
        <h2 className="text-base font-semibold">Segurança</h2>
        <Link to="/seguranca/mfa" className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 hover:bg-accent transition-colors">
          <ShieldCheck className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
          <span className="flex-1 text-sm font-medium">Verificação em dois passos</span>
          {fatoresMfa && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${fatoresMfa.length > 0 ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'}`}>
              {fatoresMfa.length > 0 ? 'Ativa' : 'Não ativa'}
            </span>
          )}
          <ChevronRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
        </Link>
      </section>
    </div>
  )
}
