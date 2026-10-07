import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowLeft, Copy, ShieldCheck, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import { fmtData } from '@/app/lib/format'
import { ConfirmDialog } from '@/app/components/ConfirmDialog'
import { useAuth } from '../AuthContext'
import { useEstadoMfa } from '../hooks/useEstadoMfa'
import { registarEvento } from '../services/eventosSegurancaService'
import { iniciarRegisto, listarFatores, mfaObrigatorio, removerFator, verificarCodigo, type RegistoTotp } from '../services/mfaService'

const PAPEIS_OBRIGADOS = new Set(['admin', 'gestor'])
const inputCls = 'w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-center text-xl tracking-[0.4em] font-mono'
const botaoCls = 'w-full py-3 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium'
const botaoSecCls = 'w-full py-3 border border-border rounded-xl hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium'

export function MfaRegistoPage() {
  const navigate = useNavigate()
  const { session, profile, signOut } = useAuth()
  const uid = session?.user.id
  const { estado, recarregar } = useEstadoMfa()
  const { data: fatores, loading: aCarregar, reload: recarregarFatores } = useAsync(listarFatores, [uid], { enabled: !!uid, errorMsg: 'Erro ao carregar a verificação em dois passos' })
  const { data: obrigatorio } = useAsync(mfaObrigatorio, [uid], { enabled: !!uid, errorMsg: 'Erro ao carregar a configuração' })
  const { mutate: comecar, loading: aComecar } = useMutation(iniciarRegisto, 'Não foi possível iniciar o registo')
  const { mutate: verificar, loading: aVerificar, error: erroCodigo } = useMutation(verificarCodigo, 'Código inválido')
  const { mutate: remover, loading: aRemover } = useMutation(removerFator, 'Não foi possível desativar')

  const [registo, setRegisto] = useState<RegistoTotp | null>(null)
  const [codigo, setCodigo] = useState('')
  const [concluido, setConcluido] = useState(false)
  const [confirmarRemocao, setConfirmarRemocao] = useState(false)

  // Só sai depois de o estado refletir a sessão nova (aal2); senão o guarda reenviava para aqui
  useEffect(() => {
    if (concluido && estado === 'ok') navigate('/', { replace: true })
  }, [concluido, estado, navigate])

  const fator = fatores?.[0]
  const emRegistoObrigatorio = estado === 'registo'
  const bloqueadoPeloPapel = !!obrigatorio && !!profile && PAPEIS_OBRIGADOS.has(profile.role)

  const handleComecar = async () => {
    const r = await comecar()
    if (r) setRegisto(r)
  }

  const handleVerificar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!registo) return
    if ((await verificar(registo.fatorId, codigo)) !== true) { setCodigo(''); return }
    void registarEvento('mfa_registado')
    toast.success('Verificação em dois passos ativada.')
    setRegisto(null)
    setCodigo('')
    setConcluido(true)
    recarregar()
    recarregarFatores()
  }

  const handleRemover = async () => {
    if (!fator) return
    const ok = (await remover(fator.id)) === true
    setConfirmarRemocao(false)
    if (!ok) return
    void registarEvento('mfa_removido')
    toast.success('Verificação em dois passos desativada.')
    recarregarFatores()
    recarregar()
  }

  const copiarSegredo = async () => {
    if (!registo) return
    try {
      await navigator.clipboard.writeText(registo.segredo)
      toast.success('Chave copiada.')
    } catch {
      toast.error('Não foi possível copiar. Escreve a chave à mão.')
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        {emRegistoObrigatorio && (
          <div role="alert" className="flex items-start gap-3 rounded-xl p-4 bg-warning text-warning-foreground text-sm">
            <ShieldAlert className="w-5 h-5 shrink-0" aria-hidden="true" />
            <p>A verificação em dois passos é obrigatória para o teu papel. Configura-a para continuar.</p>
          </div>
        )}

        <div className="bg-card border border-border rounded-xl shadow-sm p-6 sm:p-8 space-y-5">
          <div className="flex flex-col items-center text-center">
            <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <ShieldCheck className="w-7 h-7 text-primary" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">Verificação em dois passos</h1>
          </div>

          {aCarregar ? (
            <p className="text-sm text-muted-foreground text-center">A carregar…</p>
          ) : fator ? (
            <div className="space-y-4 text-center">
              <p className="text-sm">Ativa desde <span className="font-medium">{fmtData(fator.criadoEm)}</span>.</p>
              <button
                type="button"
                className={botaoSecCls}
                disabled={bloqueadoPeloPapel || aRemover}
                onClick={() => setConfirmarRemocao(true)}
              >
                Desativar
              </button>
              {bloqueadoPeloPapel && <p className="text-xs text-muted-foreground">Obrigatório para o teu papel.</p>}
            </div>
          ) : registo ? (
            <form onSubmit={handleVerificar} className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">Lê o código QR com a app autenticadora e escreve o código de 6 algarismos que ela mostra.</p>
              <img src={registo.qrSvg} alt="Código QR para a app autenticadora" className="w-48 h-48 bg-white p-2 rounded-lg mx-auto" />
              <div className="text-center space-y-1">
                <p className="text-xs text-muted-foreground">Sem câmara? Introduz esta chave na app:</p>
                <div className="flex items-center justify-center gap-2">
                  <code className="font-mono text-sm break-all">{registo.segredo}</code>
                  <button type="button" onClick={() => { void copiarSegredo() }} className="p-1.5 rounded-lg hover:bg-accent" aria-label="Copiar chave">
                    <Copy className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <label htmlFor="mfa-registo-codigo" className="sr-only">Código</label>
              <input
                id="mfa-registo-codigo"
                className={inputCls}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="\d{6}"
                value={codigo}
                onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))}
                required
              />
              {erroCodigo && <p role="alert" className="text-sm text-destructive text-center">{erroCodigo}</p>}
              <button type="submit" className={botaoCls} disabled={aVerificar}>{aVerificar ? 'A confirmar…' : 'Confirmar'}</button>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Instala uma app autenticadora — Google Authenticator, Microsoft Authenticator ou outra — e lê o código QR.
              </p>
              <button type="button" className={botaoCls} disabled={aComecar || concluido} onClick={() => { void handleComecar() }}>
                {aComecar ? 'A preparar…' : 'Começar'}
              </button>
            </div>
          )}

          <div className="pt-2 text-center">
            {emRegistoObrigatorio ? (
              <button type="button" onClick={() => { void signOut() }} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Sair
              </button>
            ) : (
              <Link to="/perfil" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Voltar ao perfil
              </Link>
            )}
          </div>
        </div>
      </div>

      {confirmarRemocao && (
        <ConfirmDialog
          title="Desativar a verificação em dois passos?"
          description="A conta passa a ficar protegida só pela palavra-passe."
          confirmLabel="Desativar"
          loading={aRemover}
          onConfirm={() => { void handleRemover() }}
          onCancel={() => setConfirmarRemocao(false)}
        />
      )}
    </div>
  )
}
