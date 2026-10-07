import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FotoPerfilInput } from '@/app/components/FotoPerfilInput'
import { useGuardarColaborador, useContasApp, useColaboradores, useNifColaborador } from '../hooks/useColaboradores'
import { camposNif } from '../lib/nif'
import { sincronizarConta } from '../services/contaFicha'
import { PermissoesSwitches } from './PermissoesSwitches'
import { useRole } from '@/features/auth/useRole'
import { useUtilizadores } from '@/features/auth/hooks/useUtilizadores'
import {
  PERMISSOES_INICIAIS, papelDasPermissoes, permissoesDoPapel, type PermissoesFicha,
} from '@/features/auth/lib/permissoes'
import { useObras } from '@/features/obras/hooks/useObras'
import type { Colaborador } from '@/app/types'

const inputCls = 'w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm'
const labelCls = 'block text-sm font-medium mb-1.5'
const TELEMOVEL_OK = /^\+?[0-9 ]{9,15}$/
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface ColaboradorFormProps {
  colaborador?: Colaborador | null
  onSaved: () => void
  onCancel: () => void
  // Na página (não na gaveta): usa a largura toda, com mais colunas em ecrãs grandes
  ampla?: boolean
}

export function ColaboradorForm({ colaborador, onSaved, onCancel, ampla = false }: ColaboradorFormProps) {
  const isEdit = !!colaborador
  const { criar, atualizar, loading } = useGuardarColaborador()
  const { obras } = useObras()
  const { isAdmin, isGestor } = useRole()
  const podeVerNif = isAdmin || isGestor
  const { nif: nifGuardado } = useNifColaborador(colaborador?.id, podeVerNif)
  const [nifAlterado, setNifAlterado] = useState(false)
  const { contas } = useContasApp(isAdmin)
  const { utilizadores } = useUtilizadores(isAdmin)
  const { colaboradores } = useColaboradores()

  // O caminho da foto só precisa de um id único (a ficha pode ainda não existir)
  const [donoFoto] = useState(() => colaborador?.id ?? crypto.randomUUID())
  const [form, setForm] = useState({
    nome: '', numeroMecan: '', cargo: '', setor: '', telemovel: '', email: '',
    nif: '', obraId: '', notas: '', userId: '', fotoPath: null as string | null,
  })
  const [permissoes, setPermissoes] = useState<PermissoesFicha>(PERMISSOES_INICIAIS)
  const [permissoesMexidas, setPermissoesMexidas] = useState(false)

  useEffect(() => {
    if (!colaborador) return
    setForm(f => ({
      nif:         f.nif,
      nome:        colaborador.nome,
      numeroMecan: colaborador.numeroMecan,
      cargo:       colaborador.cargo,
      setor:       colaborador.setor ?? '',
      telemovel:   colaborador.telemovel ?? '',
      email:       colaborador.email ?? '',
      obraId:      colaborador.obraId ?? '',
      notas:       colaborador.notas ?? '',
      userId:      colaborador.userId ?? '',
      fotoPath:    colaborador.fotoPath ?? null,
    }))
  }, [colaborador])

  // O NIF chega à parte; não sobrepõe o que o utilizador já escreveu
  useEffect(() => {
    if (nifGuardado == null || nifAlterado) return
    setForm(f => ({ ...f, nif: nifGuardado }))
  }, [nifGuardado, nifAlterado])

  // Conta ligada: as permissões mostradas são as que a conta tem de facto
  const utilizador = useMemo(() => utilizadores.find(u => u.id === form.userId), [utilizadores, form.userId])
  useEffect(() => {
    if (!utilizador || permissoesMexidas) return
    setPermissoes(permissoesDoPapel(utilizador.role, utilizador.ativo))
    setForm(f => f.email ? f : { ...f, email: utilizador.email })
  }, [utilizador, permissoesMexidas])

  const setores = useMemo(
    () => [...new Set(colaboradores.map(c => c.setor).filter((s): s is string => !!s))].sort(),
    [colaboradores],
  )

  const set = (patch: Partial<typeof form>) => setForm(prev => ({ ...prev, ...patch }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nome.trim())  { toast.error('O nome é obrigatório.'); return }
    if (!form.cargo.trim()) { toast.error('O cargo é obrigatório.'); return }
    if (form.nif && !/^\d{9}$/.test(form.nif)) { toast.error('O NIF deve ter exactamente 9 dígitos.'); return }
    if (form.telemovel.trim() && !TELEMOVEL_OK.test(form.telemovel.trim())) {
      toast.error('Telemóvel inválido. Ex.: 912 345 678 ou +351 912 345 678'); return
    }
    if (form.email.trim() && !EMAIL_OK.test(form.email.trim())) { toast.error('Email inválido.'); return }

    const payload = {
      nome:      form.nome,
      cargo:     form.cargo,
      ...camposNif(form.nif, nifAlterado),
      obraId:    form.obraId || undefined,
      notas:     form.notas || undefined,
      telemovel: form.telemovel,
      email:     form.email,
      setor:     form.setor,
      fotoPath:  form.fotoPath,
      ...(isAdmin ? { userId: form.userId || null } : {}),
    }

    const result = isEdit
      ? await atualizar(colaborador!.id, { ...payload, ...(form.numeroMecan.trim() ? { numeroMecan: form.numeroMecan } : {}) })
      : await criar({ ...payload, numeroMecan: form.numeroMecan || undefined })

    if (!result) { toast.error('Não foi possível guardar o colaborador.'); return }

    // Só o admin aplica permissões; sem mexer nelas, uma ficha existente não altera a conta
    let aviso: string | null = null
    if (isAdmin && (permissoesMexidas || (!isEdit && !form.userId))) {
      aviso = await sincronizarConta({
        colaboradorId: result.id,
        nome: form.nome.trim(),
        email: form.email,
        telemovel: form.telemovel,
        fotoPath: form.fotoPath,
        role: papelDasPermissoes(permissoes, utilizador?.role),
        contaAtiva: permissoes.contaAtiva,
        utilizador,
      })
    }
    if (aviso) toast.warning(aviso)
    else toast.success(isEdit ? 'Colaborador atualizado.' : 'Ficha criada.')
    onSaved()
  }

  const cheio = 'col-span-full'
  const grelha = ampla ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4' : 'grid grid-cols-1 sm:grid-cols-2 gap-4'

  return (
    <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
      <div className={`flex-1 overflow-y-auto ${ampla ? 'p-4 sm:p-6' : 'p-5'} space-y-6`}>
        <div className={grelha}>
          <div className={cheio}>
            <FotoPerfilInput dono={{ tipo: 'colaboradores', id: donoFoto }} valor={form.fotoPath} onChange={fotoPath => set({ fotoPath })} />
          </div>

          <div className={ampla ? 'sm:col-span-2 xl:col-span-1' : cheio}>
            <label htmlFor="colab-nome" className={labelCls}>Nome <span className="text-destructive">*</span></label>
            <input id="colab-nome" type="text" value={form.nome} onChange={e => set({ nome: e.target.value })}
              className={inputCls} placeholder="Nome completo" required />
          </div>
          <div>
            <label htmlFor="colab-cargo" className={labelCls}>Função / Cargo <span className="text-destructive">*</span></label>
            <input id="colab-cargo" type="text" value={form.cargo} onChange={e => set({ cargo: e.target.value })}
              className={inputCls} placeholder="Ex: Pedreiro, Encarregado…" required />
          </div>
          <div>
            <label htmlFor="colab-setor" className={labelCls}>Setor <span className="text-muted-foreground font-normal text-xs">(opcional)</span></label>
            <input id="colab-setor" type="text" list="colab-setores" value={form.setor} onChange={e => set({ setor: e.target.value })}
              className={inputCls} placeholder="Ex: Obra, Armazém…" />
            <datalist id="colab-setores">{setores.map(s => <option key={s} value={s} />)}</datalist>
          </div>

          <div>
            <label htmlFor="colab-tel" className={labelCls}>Telemóvel</label>
            <input id="colab-tel" type="tel" inputMode="tel" value={form.telemovel} onChange={e => set({ telemovel: e.target.value })}
              className={inputCls} placeholder="912 345 678" />
          </div>
          <div>
            <label htmlFor="colab-email" className={labelCls}>Email</label>
            <input id="colab-email" type="email" value={form.email} onChange={e => set({ email: e.target.value })}
              className={inputCls} placeholder="nome@empresa.pt" />
          </div>
          <div>
            <label htmlFor="colab-obra" className={labelCls}>Obra principal <span className="text-muted-foreground font-normal text-xs">(opcional)</span></label>
            <select id="colab-obra" value={form.obraId} onChange={e => set({ obraId: e.target.value })} className={inputCls}>
              <option value="">— Sem obra atribuída —</option>
              {obras.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="colab-mecan" className={labelCls}>N.º Mecanográfico <span className="text-muted-foreground font-normal text-xs">(automático se vazio)</span></label>
            <input id="colab-mecan" type="text" value={form.numeroMecan} onChange={e => set({ numeroMecan: e.target.value })}
              className={inputCls} placeholder={isEdit ? '' : 'ENC-0001'} />
          </div>
          <div>
            <label htmlFor="colab-nif" className={labelCls}>NIF <span className="text-muted-foreground font-normal text-xs">(opcional)</span></label>
            {podeVerNif ? (
              <input id="colab-nif" type="text" inputMode="numeric" value={form.nif}
                onChange={e => { set({ nif: e.target.value }); setNifAlterado(true) }}
                className={inputCls} placeholder="123456789" maxLength={9} pattern="\d{9}" />
            ) : (
              <input id="colab-nif" type="text" value="" disabled
                className={`${inputCls} opacity-60`} placeholder="Só visível para administração" />
            )}
          </div>
          <div className={cheio}>
            <label htmlFor="colab-notas" className={labelCls}>Notas <span className="text-muted-foreground font-normal text-xs">(opcional)</span></label>
            <textarea id="colab-notas" value={form.notas} onChange={e => set({ notas: e.target.value })}
              className={`${inputCls} resize-none`} rows={3} placeholder="Observações internas…" />
          </div>
        </div>

        {/* Conta e permissões — só o admin lê os perfis e gere contas */}
        {isAdmin && (
          <section className="space-y-4 pt-5 border-t border-border">
            <h3 className="text-sm font-semibold">Acesso à app</h3>
            <div className="max-w-md">
              <label htmlFor="colab-conta" className={labelCls}>Conta na app <span className="text-muted-foreground font-normal text-xs">(opcional)</span></label>
              <select id="colab-conta" value={form.userId} onChange={e => { set({ userId: e.target.value }); setPermissoesMexidas(false) }} className={inputCls}>
                <option value="">— Sem conta —</option>
                {contas.map(c => {
                  const ligada = colaboradores.find(x => x.userId === c.id && x.id !== colaborador?.id)
                  return <option key={c.id} value={c.id}>{c.nome}{ligada ? ` (já ligada a ${ligada.nome})` : ''}</option>
                })}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Com a conta ligada, o pedido de abastecimento abre com o nome deste colaborador e a viatura que lhe está atribuída na Frota.
              </p>
            </div>

            <PermissoesSwitches valor={permissoes} colunas={ampla} onChange={p => { setPermissoes(p); setPermissoesMexidas(true) }} />
            {!form.userId && permissoes.contaAtiva && (
              <p className="text-xs text-muted-foreground">
                Com email e conta ativa, a pessoa recebe um convite para definir a senha e só vê o que estas permissões permitem.
              </p>
            )}
          </section>
        )}
      </div>

      <div className={`px-5 py-4 border-t border-border flex gap-3 ${ampla ? 'sm:justify-end' : ''}`}>
        <button type="button" onClick={onCancel}
          className={`flex-1 ${ampla ? 'sm:flex-none sm:w-40' : ''} py-3 rounded-xl border border-border text-sm font-medium hover:bg-accent transition-colors`}>
          Cancelar
        </button>
        <button type="submit" disabled={loading}
          className={`flex-1 ${ampla ? 'sm:flex-none sm:w-48' : ''} py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60`}>
          {loading ? 'A guardar…' : isEdit ? 'Guardar Alterações' : 'Criar ficha'}
        </button>
      </div>
    </form>
  )
}
