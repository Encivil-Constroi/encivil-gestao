import { X, User } from 'lucide-react'
import { ColaboradorForm } from './ColaboradorForm'
import { DadosLaboraisSecao } from './DadosLaboraisSecao'
import { useRole } from '@/features/auth/useRole'
import type { Colaborador } from '@/app/types'

interface ColaboradorDrawerProps {
  colaborador?: Colaborador | null
  onClose: () => void
  onSaved: () => void
}

export function ColaboradorDrawer({ colaborador, onClose, onSaved }: ColaboradorDrawerProps) {
  const isEdit = !!colaborador
  const { isAdmin, isGestor } = useRole()

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Editar colaborador' : 'Novo colaborador'}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-background shadow-xl flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <User className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold">{isEdit ? 'Editar Colaborador' : 'Novo Colaborador'}</h2>
              <p className="text-xs text-muted-foreground">
                {isEdit ? colaborador!.numeroMecan : 'Preencha os dados do colaborador'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-accent transition-colors" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isEdit && (isAdmin || isGestor) && <DadosLaboraisSecao colaboradorId={colaborador!.id} />}

        <ColaboradorForm colaborador={colaborador} onSaved={onSaved} onCancel={onClose} />
      </div>
    </>
  )
}
