import { useState } from 'react'
import { toast } from 'sonner'
import { useDestinatarios, useAlterarDestinatario } from '../hooks/useFrota'
import { Cabecalho, Seccao } from './ui'

const PAPEL: Record<string, string> = {
  admin: 'Administrador', gestor: 'Gestor', armazem: 'Armazém', medicoes: 'Medições', mecanico: 'Mecânico', leitura: 'Leitura',
}

// Só o admin chega aqui (RoleGuard na rota; a RLS também só deixa o admin escrever)
export function DestinatariosPage() {
  const { destinatarios, utilizadores, loading, error } = useDestinatarios(true)
  const { alterar } = useAlterarDestinatario()
  const [aGuardar, setAGuardar] = useState<string | null>(null)

  const alternar = async (id: string, nome: string) => {
    const receber = !destinatarios.has(id)
    setAGuardar(id)
    const ok = await alterar(id, receber)
    setAGuardar(null)
    if (ok) toast.success(receber ? `${nome} passa a receber os alertas da frota.` : `${nome} deixa de receber os alertas da frota.`)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-24">
      <Cabecalho titulo="Notificações da frota" subtitulo="Quem recebe no telemóvel os alertas de revisões, seguro, IPO e outros prazos" />

      <div className="rounded-2xl bg-primary/5 p-4 text-sm space-y-1">
        <p>Cada pessoa escolhida tem de <strong>aceitar as notificações</strong> no telemóvel dela (a app pergunta ao entrar).</p>
        <p className="text-muted-foreground">Os alertas chegam uma vez por prazo, e outra vez se passar a urgente.</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Seccao titulo="Utilizadores">
        {loading && utilizadores.length === 0 ? <p className="text-sm text-muted-foreground">A carregar…</p> : (
          <ul className="divide-y divide-border">
            {utilizadores.map(u => {
              const ativo = destinatarios.has(u.id)
              return (
                <li key={u.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{u.nome}</p>
                    <p className="text-xs text-muted-foreground">{PAPEL[u.role] ?? u.role}</p>
                  </div>
                  <button type="button" role="switch" aria-checked={ativo} aria-label={`Alertas da frota para ${u.nome}`}
                    onClick={() => alternar(u.id, u.nome)} disabled={aGuardar === u.id}
                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${ativo ? 'bg-primary' : 'bg-muted'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${ativo ? 'translate-x-5' : ''}`} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Seccao>
    </div>
  )
}
