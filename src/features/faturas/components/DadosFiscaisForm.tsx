import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useMutation } from '@/app/lib/useMutation'
import { nifValido } from '@/app/lib/validacoesFiscais'
import type { FaturaFornecedor } from '@/app/types'
import { atualizarDadosFiscaisFatura } from '../services/faturasService'

const INPUT = 'w-full px-3 py-2 rounded-lg border border-input bg-input-background text-sm focus:outline-none focus:ring-2 focus:ring-ring'

// Aceita "1 234,56" e "1234.56"
function lerValor(s: string): number | undefined | 'invalido' {
  const t = s.trim().replace(/\s/g, '').replace(',', '.')
  if (!t) return undefined
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : 'invalido'
}

const fmt = (n?: number) => (n != null ? String(n).replace('.', ',') : '')

interface Props { fatura: FaturaFornecedor; onSaved: () => void }

export function DadosFiscaisForm({ fatura, onSaved }: Props) {
  const [nif, setNif] = useState('')
  const [base, setBase] = useState('')
  const [iva, setIva] = useState('')
  const [erros, setErros] = useState<{ nif?: string; base?: string; iva?: string }>({})
  const { mutate: guardar, loading, error: erroGuardar } = useMutation(
    (d: Parameters<typeof atualizarDadosFiscaisFatura>[1]) => atualizarDadosFiscaisFatura(fatura.id, d),
    'Erro ao guardar dados fiscais',
  )

  useEffect(() => { if (erroGuardar) toast.error(erroGuardar) }, [erroGuardar])

  useEffect(() => {
    setNif(fatura.nifFornecedor ?? '')
    setBase(fmt(fatura.baseTributavel))
    setIva(fmt(fatura.valorIva))
  }, [fatura.id, fatura.nifFornecedor, fatura.baseTributavel, fatura.valorIva])

  const submeter = async () => {
    const e: { nif?: string; base?: string; iva?: string } = {}
    const nifLimpo = nif.replace(/\s/g, '')
    if (nifLimpo && !nifValido(nifLimpo)) e.nif = 'NIF inválido'
    const b = lerValor(base)
    const v = lerValor(iva)
    if (b === 'invalido') e.base = 'Valor inválido'
    if (v === 'invalido') e.iva = 'Valor inválido'
    setErros(e)
    if (e.nif || e.base || e.iva) return
    const r = await guardar({
      nifFornecedor: nifLimpo || undefined,
      baseTributavel: b === 'invalido' ? undefined : b,
      valorIva: v === 'invalido' ? undefined : v,
    })
    if (r) { toast.success('Dados fiscais guardados'); onSaved() }
  }

  return (
    <details className="border-b border-border bg-background shrink-0">
      <summary className="px-4 md:px-6 py-2 text-xs font-semibold cursor-pointer select-none hover:bg-accent/40">
        Dados fiscais (NIF, base tributável, IVA)
      </summary>
      <div className="px-4 md:px-6 pb-3 grid grid-cols-1 sm:grid-cols-4 gap-3 items-start">
        <div>
          <label htmlFor="ff-nif" className="block text-xs font-medium text-muted-foreground mb-1">NIF do fornecedor</label>
          <input id="ff-nif" inputMode="numeric" value={nif} onChange={ev => setNif(ev.target.value)} className={INPUT} />
          {erros.nif && <p className="text-xs text-destructive mt-1">{erros.nif}</p>}
        </div>
        <div>
          <label htmlFor="ff-base" className="block text-xs font-medium text-muted-foreground mb-1">Base tributável (€)</label>
          <input id="ff-base" inputMode="decimal" value={base} onChange={ev => setBase(ev.target.value)} className={INPUT} />
          {erros.base && <p className="text-xs text-destructive mt-1">{erros.base}</p>}
        </div>
        <div>
          <label htmlFor="ff-iva" className="block text-xs font-medium text-muted-foreground mb-1">IVA (€)</label>
          <input id="ff-iva" inputMode="decimal" value={iva} onChange={ev => setIva(ev.target.value)} className={INPUT} />
          {erros.iva && <p className="text-xs text-destructive mt-1">{erros.iva}</p>}
        </div>
        <button type="button" onClick={submeter} disabled={loading}
          className="sm:mt-5 py-2 px-4 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-60">
          Guardar
        </button>
      </div>
    </details>
  )
}
