import { useState, useEffect } from 'react'
import { X, User } from 'lucide-react'
import { toast } from 'sonner'
import { useGuardarColaborador } from '../hooks/useColaboradores'
import { useObras } from '@/features/obras/hooks/useObras'
import type { Colaborador } from '@/app/types'

const inputCls = 'w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm'
const labelCls = 'block text-sm font-medium mb-1.5'

interface ColaboradorDrawerProps {
  colaborador?: Colaborador | null
  onClose: () => void
  onSaved: () => void
}

export function ColaboradorDrawer({ colaborador, onClose, onSaved }: ColaboradorDrawerProps) {
  const isEdit = !!colaborador
  const { criar, atualizar, loading } = useGuardarColaborador()
  const { obras } = useObras()

  const [form, setForm] = useState({
    nome: '',
    numeroMecan: '',
    cargo: '',
    nif: '',
    obraId: '',
    notas: '',
  })

  useEffect(() => {
    if (!colaborador) return
    setForm({
      nome:        colaborador.nome,
      numeroMecan: colaborador.numeroMecan,
      cargo:       colaborador.cargo,
      nif:         colaborador.nif ?? '',
      obraId:      colaborador.obraId ?? '',
      notas:       colaborador.notas ?? '',
    })
  }, [colaborador])

  const set = (patch: Partial<typeof form>) => setForm(prev => ({ ...prev, ...patch }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nome.trim())        { toast.error('O nome é obrigatório.'); return }
    if (!form.numeroMecan.trim()) { toast.error('O número mecanográfico é obrigatório.'); return }
    if (!form.cargo.trim())       { toast.error('O cargo é obrigatório.'); return }
    if (form.nif && !/^\d{9}$/.test(form.nif)) { toast.error('O NIF deve ter exactamente 9 dígitos.'); return }

    const payload = {
      nome:        form.nome,
      numeroMecan: form.numeroMecan,
      cargo:       form.cargo,
      nif:         form.nif || undefined,
      obraId:      form.obraId || undefined,
      notas:       form.notas || undefined,
    }

    const result = isEdit
      ? await atualizar(colaborador!.id, payload)
      : await criar(payload)

    if (result) {
      toast.success(isEdit ? 'Colaborador atualizado.' : 'Colaborador criado.')
      onSaved()
    } else {
      toast.error('Não foi possível guardar o colaborador.')
    }
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Editar colaborador' : 'Novo colaborador'}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-background shadow-xl flex flex-col"
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <User className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold">
                {isEdit ? 'Editar Colaborador' : 'Novo Colaborador'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {isEdit ? colaborador!.numeroMecan : 'Preencha os dados do colaborador'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-accent transition-colors"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário */}
        <form id="colab-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Nome + N.º Mecanográfico */}
          <div>
            <label className={labelCls}>Nome <span className="text-destructive">*</span></label>
            <input
              type="text"
              value={form.nome}
              onChange={e => set({ nome: e.target.value })}
              className={inputCls}
              placeholder="Nome completo"
              autoFocus
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>N.º Mecanográfico <span className="text-destructive">*</span></label>
              <input
                type="text"
                value={form.numeroMecan}
                onChange={e => set({ numeroMecan: e.target.value })}
                className={inputCls}
                placeholder="Ex: ENC-001"
                required
              />
            </div>
            <div>
              <label className={labelCls}>NIF <span className="text-muted-foreground font-normal text-xs">(opcional)</span></label>
              <input
                type="text"
                inputMode="numeric"
                value={form.nif}
                onChange={e => set({ nif: e.target.value })}
                className={inputCls}
                placeholder="123456789"
                maxLength={9}
                pattern="\d{9}"
              />
            </div>
          </div>

          {/* Cargo */}
          <div>
            <label className={labelCls}>Cargo / Função <span className="text-destructive">*</span></label>
            <input
              type="text"
              value={form.cargo}
              onChange={e => set({ cargo: e.target.value })}
              className={inputCls}
              placeholder="Ex: Pedreiro, Encarregado, Servente…"
              required
            />
          </div>

          {/* Obra principal */}
          <div>
            <label className={labelCls}>Obra principal <span className="text-muted-foreground font-normal text-xs">(opcional)</span></label>
            <select
              value={form.obraId}
              onChange={e => set({ obraId: e.target.value })}
              className={inputCls}
            >
              <option value="">— Sem obra atribuída —</option>
              {obras.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>

          {/* Notas */}
          <div>
            <label className={labelCls}>Notas <span className="text-muted-foreground font-normal text-xs">(opcional)</span></label>
            <textarea
              value={form.notas}
              onChange={e => set({ notas: e.target.value })}
              className={`${inputCls} resize-none`}
              rows={3}
              placeholder="Observações internas…"
            />
          </div>
        </form>

        {/* Rodapé */}
        <div className="px-5 py-4 border-t border-border">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-border text-sm font-medium hover:bg-accent transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="colab-form"
              disabled={loading}
              className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {loading ? 'A guardar…' : isEdit ? 'Guardar Alterações' : 'Criar Colaborador'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
