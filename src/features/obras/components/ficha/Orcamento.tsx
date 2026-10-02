import { useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, CheckCircle2, ShieldAlert, Settings } from 'lucide-react'
import { fmtEuro, fmtNumber } from '@/app/lib/format'
import { useRole } from '@/features/auth/useRole'
import type { EstadoOrcamentoItem, OrcamentoItemRow, OrcamentoResumoRow } from '../../db'
import { useApagarItemOrcamento, useGuardarItemOrcamento, useItensOrcamento, useResumoOrcamento } from '../../hooks/useSubsControlo'
import { Seccao, Vazio, botaoPrimario, botaoSecundario, inputCls } from '../ui'
import { ConfigSubsDialog } from '../subempreitadas/ConfigSubsDialog'
import type { SecaoProps } from './tipos'

const ESTADO_INFO: Record<EstadoOrcamentoItem, { rotulo: string; cls: string; Icone: typeof CheckCircle2 }> = {
  ok: { rotulo: 'Dentro do orçamento', cls: 'bg-success/10 text-success', Icone: CheckCircle2 },
  atencao: { rotulo: 'Atenção (≥ 90 %)', cls: 'bg-warning/10 text-warning', Icone: AlertTriangle },
  excedido: { rotulo: 'Excedido', cls: 'bg-destructive/10 text-destructive', Icone: ShieldAlert },
}

export function capituloDe(codigo: string): string {
  const i = codigo.indexOf('.')
  return i === -1 ? codigo : codigo.slice(0, i)
}

export function agruparPorCapitulo(linhas: OrcamentoResumoRow[]): { capitulo: string; linhas: OrcamentoResumoRow[] }[] {
  const mapa = new Map<string, OrcamentoResumoRow[]>()
  for (const l of [...linhas].sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt', { numeric: true }))) {
    const cap = capituloDe(l.codigo)
    mapa.set(cap, [...(mapa.get(cap) ?? []), l])
  }
  return [...mapa.entries()].map(([capitulo, ls]) => ({ capitulo, linhas: ls }))
}

function SeloEstado({ estado }: { estado: EstadoOrcamentoItem }) {
  const { rotulo, cls, Icone } = ESTADO_INFO[estado]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${cls}`}>
      <Icone className="w-3 h-3" aria-hidden="true" /> {rotulo}
    </span>
  )
}

type FormItem = { id: string | null; codigo: string; descricao: string; unidade: string; quantidade: string; preco: string; tolerancia: string }
const FORM_VAZIO: FormItem = { id: null, codigo: '', descricao: '', unidade: 'm²', quantidade: '', preco: '', tolerancia: '0' }

export function Orcamento({ obraId }: SecaoProps) {
  const { isAdmin, podeObras } = useRole()
  const { resumo, loading, error, reload } = useResumoOrcamento(obraId)
  const { itens } = useItensOrcamento(obraId)
  const { guardar, loading: aGuardar, error: erroGuardar } = useGuardarItemOrcamento()
  const { apagar, loading: aApagar, error: erroApagar } = useApagarItemOrcamento()
  const [form, setForm] = useState<FormItem | null>(null)
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const [configAberta, setConfigAberta] = useState(false)

  const grupos = useMemo(() => agruparPorCapitulo(resumo), [resumo])
  const totais = useMemo(() => resumo.reduce(
    (t, r) => ({ orcado: t.orcado + r.orcado_valor, contratado: t.contratado + r.contratado_valor, medido: t.medido + r.medido_valor }),
    { orcado: 0, contratado: 0, medido: 0 },
  ), [resumo])

  const editar = (itemId: string) => {
    const it: OrcamentoItemRow | undefined = itens.find(i => i.id === itemId)
    const r = resumo.find(x => x.item_id === itemId)
    if (!it && !r) return
    setErroLocal(null)
    setForm({
      id: itemId,
      codigo: it?.codigo ?? r!.codigo,
      descricao: it?.descricao ?? r!.descricao,
      unidade: it?.unidade ?? r!.unidade,
      quantidade: String(it?.quantidade ?? r!.orcado_qtd),
      preco: String(it?.preco_unitario ?? (r && r.orcado_qtd > 0 ? r.orcado_valor / r.orcado_qtd : 0)),
      tolerancia: String(it?.tolerancia_pct ?? 0),
    })
  }

  const submeter = async (e: FormEvent) => {
    e.preventDefault()
    if (!form) return
    const quantidade = Number(form.quantidade)
    const preco = Number(form.preco)
    const tolerancia = Number(form.tolerancia || '0')
    if (!form.codigo.trim() || !form.descricao.trim() || !form.unidade.trim()) { setErroLocal('Indique o código, a descrição e a unidade.'); return }
    if (!Number.isFinite(quantidade) || quantidade < 0 || !Number.isFinite(preco) || preco < 0) { setErroLocal('A quantidade e o preço não podem ser negativos.'); return }
    if (!Number.isFinite(tolerancia) || tolerancia < 0 || tolerancia > 20) { setErroLocal('A tolerância deve estar entre 0 e 20 %.'); return }
    setErroLocal(null)
    const id = await guardar({
      p_obra_id: obraId, p_id: form.id, p_codigo: form.codigo.trim(), p_descricao: form.descricao.trim(),
      p_unidade: form.unidade.trim(), p_quantidade: quantidade, p_preco_unitario: preco, p_tolerancia_pct: tolerancia,
    })
    if (id !== null) { setForm(null); reload() }
  }

  const remover = async (itemId: string, codigo: string) => {
    if (!window.confirm(`Apagar o item ${codigo} do orçamento?`)) return
    if (await apagar(itemId)) reload()
  }

  const acoes = (
    <div className="flex gap-2">
      {isAdmin && (
        <button type="button" className={botaoSecundario} onClick={() => setConfigAberta(true)} aria-label="Configuração das subempreitadas">
          <Settings className="w-4 h-4" aria-hidden="true" /> <span className="hidden sm:inline">Configuração</span>
        </button>
      )}
      {podeObras && <button type="button" className={botaoPrimario} onClick={() => { setErroLocal(null); setForm({ ...FORM_VAZIO }) }}>Novo item</button>}
    </div>
  )

  return (
    <div className="space-y-4">
      <Seccao titulo="Orçamento de controlo (EAP)" acao={acoes}>
        <p className="text-xs text-muted-foreground">
          Quantidades orçadas por item. Nenhuma contratação validada pode exceder o orçado (com a tolerância definida). Valores sem IVA.
        </p>

        {form && podeObras && (
          <form onSubmit={e => void submeter(e)} className="rounded-xl border border-border p-4 grid gap-3 sm:grid-cols-2">
            <h3 className="font-semibold sm:col-span-2">{form.id ? 'Editar item' : 'Novo item'}</h3>
            <label className="text-sm">Código EAP<input className={inputCls} required placeholder="02.03" value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} /></label>
            <label className="text-sm">Unidade<input className={inputCls} required value={form.unidade} onChange={e => setForm({ ...form, unidade: e.target.value })} /></label>
            <label className="text-sm sm:col-span-2">Descrição<input className={inputCls} required value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} /></label>
            <label className="text-sm">Quantidade orçada<input className={inputCls} type="number" inputMode="decimal" min="0" step="0.001" required value={form.quantidade} onChange={e => setForm({ ...form, quantidade: e.target.value })} /></label>
            <label className="text-sm">Preço unitário orçado (€)<input className={inputCls} type="number" inputMode="decimal" min="0" step="0.0001" required value={form.preco} onChange={e => setForm({ ...form, preco: e.target.value })} /></label>
            <label className="text-sm">Tolerância (%)<input className={inputCls} type="number" inputMode="decimal" min="0" max="20" step="0.5" value={form.tolerancia} onChange={e => setForm({ ...form, tolerancia: e.target.value })} /></label>
            <div className="sm:col-span-2 flex gap-2">
              <button className={botaoPrimario} disabled={aGuardar}>{aGuardar ? 'A guardar…' : 'Guardar item'}</button>
              <button type="button" className={botaoSecundario} onClick={() => setForm(null)}>Cancelar</button>
            </div>
            {(erroLocal || erroGuardar) && <p role="alert" className="text-sm text-destructive sm:col-span-2">{erroLocal || erroGuardar}</p>}
          </form>
        )}

        {loading && resumo.length === 0 && <p role="status" className="text-sm text-muted-foreground">A carregar orçamento…</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error} <button type="button" className="underline" onClick={reload}>Tentar de novo</button></p>}
        {erroApagar && <p role="alert" className="text-sm text-destructive">{erroApagar}</p>}
        {!loading && !error && resumo.length === 0 && <Vazio>Ainda não há itens no orçamento desta obra.</Vazio>}

        {grupos.map(g => (
          <div key={g.capitulo} className="rounded-xl border border-border overflow-hidden">
            <div className="px-3 py-2 bg-muted/40 text-xs font-semibold uppercase tracking-wide">Capítulo {g.capitulo}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    {['Item', 'Un.', 'Orçado', 'Contratado', 'Medido', 'Estado', ''].map(h => <th key={h || 'acoes'} scope="col" className="px-3 py-2 font-semibold whitespace-nowrap">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {g.linhas.map(r => (
                    <tr key={r.item_id}>
                      <td className="px-3 py-2.5 min-w-48">
                        <span className="font-semibold">{r.codigo}</span> {r.descricao}
                        {r.n_artigos > 0 && <span className="block text-xs text-muted-foreground">{r.n_artigos} artigo(s) ligado(s)</span>}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.unidade}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{fmtNumber(r.orcado_qtd)}<span className="block text-xs text-muted-foreground">{fmtEuro(r.orcado_valor)}</span></td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{fmtNumber(r.contratado_qtd)}<span className="block text-xs text-muted-foreground">{fmtEuro(r.contratado_valor)} · {fmtNumber(r.perc_contratado)} %</span></td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{fmtNumber(r.medido_qtd)}<span className="block text-xs text-muted-foreground">{fmtEuro(r.medido_valor)} · {fmtNumber(r.perc_medido)} %</span></td>
                      <td className="px-3 py-2.5"><SeloEstado estado={r.estado} /></td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-right">
                        {podeObras && (
                          <>
                            <button type="button" className="text-sm text-primary mr-3" aria-label={`Editar ${r.codigo}`} onClick={() => editar(r.item_id)}>Editar</button>
                            <button type="button" className="text-sm text-destructive" aria-label={`Apagar ${r.codigo}`} disabled={aApagar} onClick={() => void remover(r.item_id, r.codigo)}>Apagar</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {resumo.length > 0 && (
          <dl className="grid grid-cols-3 gap-3 text-center" aria-label="Totais do orçamento">
            {[['Orçado', totais.orcado], ['Contratado', totais.contratado], ['Medido', totais.medido]].map(([rotulo, valor]) => (
              <div key={rotulo as string} className="rounded-xl border border-border p-3">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{rotulo}</dt>
                <dd className="text-sm md:text-base font-bold mt-1">{fmtEuro(valor as number)}</dd>
              </div>
            ))}
          </dl>
        )}
      </Seccao>
      {isAdmin && <ConfigSubsDialog aberto={configAberta} onFechar={() => setConfigAberta(false)} />}
    </div>
  )
}
