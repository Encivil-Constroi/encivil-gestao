import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import { useAuth } from '../AuthContext'
import { listarFatores, verificarCodigo } from '../services/mfaService'
import { registarEvento } from '../services/eventosSegurancaService'

const inputCls = 'w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-center text-2xl tracking-[0.5em] font-mono'

export function MfaDesafio({ onConcluido }: { onConcluido: () => void }) {
  const { signOut } = useAuth()
  const [codigo, setCodigo] = useState('')
  const { data: fatores, loading: aCarregar, error: erroFatores } = useAsync(listarFatores, [], { errorMsg: 'Não foi possível carregar a verificação em dois passos' })
  const { mutate: verificar, loading: aVerificar, error } = useMutation(verificarCodigo, 'Código inválido')
  const fator = fatores?.[0]

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fator) return
    if ((await verificar(fator.id, codigo)) === true) onConcluido()
    else { setCodigo(''); void registarEvento('mfa_falhado') }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-card border border-border rounded-xl shadow-sm p-6 sm:p-8">
          <div className="flex flex-col items-center mb-6 text-center">
            <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <ShieldCheck className="w-7 h-7 text-primary" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-semibold text-foreground mb-1">Verificação em dois passos</h1>
            <p className="text-sm text-muted-foreground">Introduz o código de 6 algarismos da tua app autenticadora.</p>
          </div>
          <form onSubmit={confirmar} className="space-y-5">
            <label htmlFor="mfa-codigo" className="sr-only">Código</label>
            <input
              id="mfa-codigo"
              className={inputCls}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="\d{6}"
              value={codigo}
              onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))}
              autoFocus
              required
            />
            {(error || erroFatores) && <p role="alert" className="text-sm text-destructive text-center">{error ?? erroFatores}</p>}
            <button
              type="submit"
              disabled={aVerificar || aCarregar || !fator}
              className="w-full py-3 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {aVerificar ? 'A confirmar…' : 'Confirmar'}
            </button>
          </form>
          <div className="mt-5 text-center">
            <button type="button" onClick={() => { void signOut() }} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Sair
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
