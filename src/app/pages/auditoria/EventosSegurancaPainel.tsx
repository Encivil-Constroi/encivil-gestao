import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useAsync } from '@/app/lib/useAsync'
import { fetchEventosSeguranca, contarLoginsFalhados24h } from '@/features/auth/services/eventosSegurancaService'

const ROTULOS: Record<string, string> = {
  login_ok:           'Login com sucesso',
  login_falhado:      'Login falhado',
  mfa_registado:      'MFA ativado',
  mfa_removido:       'MFA desativado',
  mfa_removido_admin: 'MFA removido por administrador',
  mfa_falhado:        'Código MFA errado',
  rate_limit:         'Limite de pedidos atingido',
  link_recuperacao_admin: 'Link de recuperação gerado pelo administrador',
  senha_redefinida_admin: 'Senha redefinida pelo administrador',
}

const LIMIAR_ALERTA = 10

type Periodo = 'hoje' | 'semana' | 'mes' | 'todos'
const PERIODOS: { value: Periodo; label: string }[] = [
  { value: 'hoje',   label: 'Hoje' },
  { value: 'semana', label: 'Últimos 7 dias' },
  { value: 'mes',    label: 'Últimos 30 dias' },
  { value: 'todos',  label: 'Todos' },
]

export function rotuloEvento(tipo: string): string {
  return ROTULOS[tipo] ?? tipo
}

function inicioPeriodo(p: Periodo): string | undefined {
  if (p === 'todos') return undefined
  const d = new Date()
  if (p === 'hoje') d.setHours(0, 0, 0, 0)
  else d.setDate(d.getDate() - (p === 'semana' ? 7 : 30))
  return d.toISOString()
}

const selectCls = 'px-3 py-2 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm'
const labelCls = 'block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5'

export function EventosSegurancaPainel() {
  const [tipo, setTipo] = useState('')
  const [periodo, setPeriodo] = useState<Periodo>('semana')

  const { data: falhados } = useAsync(contarLoginsFalhados24h, [], { errorMsg: 'Erro ao contar logins falhados' })
  const { data: eventos, loading, error } = useAsync(
    () => fetchEventosSeguranca({ tipo: tipo || undefined, desde: inicioPeriodo(periodo) }),
    [tipo, periodo],
    { errorMsg: 'Erro ao carregar eventos de segurança' },
  )

  const alerta = (falhados ?? 0) >= LIMIAR_ALERTA
  const lista = eventos ?? []

  return (
    <div className="space-y-4">
      {falhados !== null && (
        <p className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold ${alerta ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-foreground'}`}>
          Logins falhados (24 h): {falhados}
        </p>
      )}

      <div className="bg-card rounded-2xl border border-border p-4 flex flex-col sm:flex-row gap-3">
        <div>
          <label htmlFor="eventos-periodo" className={labelCls}>Período</label>
          <select id="eventos-periodo" value={periodo} onChange={e => setPeriodo(e.target.value as Periodo)} className={selectCls}>
            {PERIODOS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="eventos-tipo" className={labelCls}>Tipo</label>
          <select id="eventos-tipo" value={tipo} onChange={e => setTipo(e.target.value)} className={selectCls}>
            <option value="">Todos</option>
            {Object.entries(ROTULOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {loading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">A carregar…</p>
        ) : error ? (
          <p role="alert" className="p-8 text-center text-sm text-destructive">{error}</p>
        ) : lista.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            <ShieldAlert className="w-10 h-10 mx-auto mb-3 opacity-30" aria-hidden="true" />
            Sem eventos neste período.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {lista.map(ev => {
              const extra = Object.keys(ev.detalhe).length > 0 ? JSON.stringify(ev.detalhe) : null
              return (
                <li key={ev.id} className="px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-lg border border-border text-xs font-semibold">{rotuloEvento(ev.tipo)}</span>
                    <span className="text-xs text-muted-foreground font-mono">{ev.tipo}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span>{new Date(ev.criadoEm).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    {ev.email && <span className="font-medium text-foreground">{ev.email}</span>}
                    {!ev.email && ev.utilizadorId && <span className="font-mono">{ev.utilizadorId.slice(0, 8)}…</span>}
                    {extra && <span className="font-mono break-all">{extra}</span>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
