import { useEffect, useState } from 'react'
import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import { toast } from 'sonner'
import { nissValido, ibanValido, formatarIban } from '@/app/lib/validacoesFiscais'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { buscarDadosLaborais, guardarDadosLaborais } from '../services/dadosLaboraisService'
import type { TipoContrato } from '../db'

const TIPOS: { valor: TipoContrato; rotulo: string; temFim: boolean }[] = [
  { valor: 'SEM_TERMO', rotulo: 'Sem termo', temFim: false },
  { valor: 'TERMO_CERTO', rotulo: 'Termo certo', temFim: true },
  { valor: 'TERMO_INCERTO', rotulo: 'Termo incerto', temFim: true },
  { valor: 'TEMPORARIO', rotulo: 'Temporário', temFim: true },
  { valor: 'ESTAGIO', rotulo: 'Estágio', temFim: true },
  { valor: 'OUTRO', rotulo: 'Outro', temFim: false },
]

const INPUT = 'w-full px-3 py-2 rounded-lg border border-input bg-input-background text-sm focus:outline-none focus:ring-2 focus:ring-ring'

interface Props { colaboradorId: string }

// Dados pessoais sensíveis (RGPD): a RLS só deixa admin/gestor ler e escrever.
export function DadosLaboraisSecao({ colaboradorId }: Props) {
  const { data, loading, error: erroLeitura, reload } = useAsync(
    () => buscarDadosLaborais(colaboradorId), [colaboradorId],
    { errorMsg: 'Erro ao carregar dados laborais' },
  )
  const { mutate: guardar, loading: aGuardar, error: erroGuardar } = useMutation(guardarDadosLaborais, 'Erro ao guardar dados laborais')

  const [niss, setNiss] = useState('')
  const [iban, setIban] = useState('')
  const [admissao, setAdmissao] = useState('')
  const [tipo, setTipo] = useState<TipoContrato | ''>('')
  const [fim, setFim] = useState('')
  const [categoria, setCategoria] = useState('')
  const [erros, setErros] = useState<{ niss?: string; iban?: string; fim?: string }>({})

  useEffect(() => { if (erroGuardar) toast.error(erroGuardar) }, [erroGuardar])

  useEffect(() => {
    if (!data) return
    setNiss(data.niss ?? '')
    setIban(data.iban ? formatarIban(data.iban) : '')
    setAdmissao(data.data_admissao ?? '')
    setTipo(data.tipo_contrato ?? '')
    setFim(data.data_fim_contrato ?? '')
    setCategoria(data.categoria_profissional ?? '')
  }, [data])

  const temFim = TIPOS.find(t => t.valor === tipo)?.temFim ?? false

  const submeter = async () => {
    if (erroLeitura) return
    const e: { niss?: string; iban?: string; fim?: string } = {}
    if (niss.trim() && !nissValido(niss)) e.niss = 'NISS inválido'
    if (iban.trim() && !ibanValido(iban)) e.iban = 'IBAN inválido'
    if (temFim && admissao && fim && fim < admissao) e.fim = 'A data de fim não pode ser anterior à admissão'
    setErros(e)
    if (e.niss || e.iban || e.fim) return
    const r = await guardar({
      colaborador_id: colaboradorId,
      niss: niss.replace(/\s/g, '') || null,
      iban: iban.replace(/\s/g, '').toUpperCase() || null,
      data_admissao: admissao || null,
      tipo_contrato: tipo || null,
      data_fim_contrato: temFim ? (fim || null) : null,
      categoria_profissional: categoria.trim() || null,
    })
    if (r) toast.success('Dados laborais guardados')
  }

  return (
    <details className="border-b border-border">
      <summary className="px-5 py-3 text-sm font-semibold cursor-pointer select-none hover:bg-accent/40">
        Dados laborais (NISS, IBAN, contrato)
      </summary>
      <div className="px-5 pb-4 space-y-3 max-h-[45vh] overflow-y-auto">
        {loading && <p className="text-xs text-muted-foreground">A carregar…</p>}
        {erroLeitura && (
          <div role="alert" className="flex items-center justify-between gap-2 rounded-lg bg-destructive/10 px-3 py-2">
            <p className="text-xs text-destructive">{erroLeitura}</p>
            <button type="button" onClick={reload} className="text-xs font-semibold underline shrink-0">Tentar novamente</button>
          </div>
        )}
        <div>
          <label htmlFor="dl-niss" className="block text-xs font-medium text-muted-foreground mb-1">NISS</label>
          <input id="dl-niss" inputMode="numeric" value={niss} onChange={ev => setNiss(ev.target.value)} className={INPUT} />
          {erros.niss && <p className="text-xs text-destructive mt-1">{erros.niss}</p>}
        </div>
        <div>
          <label htmlFor="dl-iban" className="block text-xs font-medium text-muted-foreground mb-1">IBAN</label>
          <input id="dl-iban" value={iban} onChange={ev => setIban(ev.target.value)} className={INPUT} />
          {erros.iban && <p className="text-xs text-destructive mt-1">{erros.iban}</p>}
        </div>
        <div>
          <label htmlFor="dl-adm" className="block text-xs font-medium text-muted-foreground mb-1">Data de admissão</label>
          <input id="dl-adm" type="date" value={admissao} onChange={ev => setAdmissao(ev.target.value)} className={INPUT} />
        </div>
        <div>
          <span className="block text-xs font-medium text-muted-foreground mb-1">Tipo de contrato</span>
          <Select value={tipo || undefined} onValueChange={v => setTipo(v as TipoContrato)}>
            <SelectTrigger aria-label="Tipo de contrato"><SelectValue placeholder="Selecionar…" /></SelectTrigger>
            <SelectContent>
              {TIPOS.map(t => <SelectItem key={t.valor} value={t.valor}>{t.rotulo}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {temFim && (
          <div>
            <label htmlFor="dl-fim" className="block text-xs font-medium text-muted-foreground mb-1">Data de fim do contrato</label>
            <input id="dl-fim" type="date" value={fim} onChange={ev => setFim(ev.target.value)} className={INPUT} />
            {erros.fim && <p className="text-xs text-destructive mt-1">{erros.fim}</p>}
          </div>
        )}
        <div>
          <label htmlFor="dl-cat" className="block text-xs font-medium text-muted-foreground mb-1">Categoria profissional</label>
          <input id="dl-cat" value={categoria} onChange={ev => setCategoria(ev.target.value)} className={INPUT} />
        </div>
        <button type="button" onClick={submeter} disabled={aGuardar || loading || !!erroLeitura}
          className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-60">
          Guardar dados laborais
        </button>
      </div>
    </details>
  )
}
