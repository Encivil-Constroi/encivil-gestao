import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { History, TriangleAlert } from 'lucide-react'
import { useRole } from '@/features/auth/useRole'
import { formatarData } from '@/app/lib/prazoFrota'
import { useResumoFrota, useCatalogo } from '../hooks/useFrota'
import { useContextoViatura, useGravarManutencao, useManutencaoParaEditar } from '../hooks/useManutencao'
import { agruparPorCategoria, numeroOuNulo, ordenar, rotuloCategoria, textoIntervalo, hojeIso } from '../lib/frota'
import { diferencas, formatarDataHora, formatarLeitura, semAcentos } from '../lib/manutencao'
import type { ManutencaoParaEditar } from '../services/manutencaoService'
import type { ItemCatalogoRow } from '../db'
import { ViaturaCombobox, ehMaquina, type OpcaoViatura } from './ViaturaCombobox'
import { Cabecalho, Seccao, inputCls, botaoPrimario } from './ui'

const OUTRO = 'outro'

type Linha = { descricao: string; custo: string }

type Campos = {
  itemId: string; descricao: string; data: string; km: string; custo: string; oficina: string
  observacoes: string; atualiza: boolean; proximaData: string
}

function camposIniciais(m?: ManutencaoParaEditar['manutencao']): Campos {
  return {
    itemId: m ? (m.item_id ?? OUTRO) : '',
    descricao: m?.descricao ?? '',
    data: m?.data ?? hojeIso(),
    km: m?.km_na_altura != null ? String(m.km_na_altura) : '',
    custo: m?.custo != null ? String(m.custo).replace('.', ',') : '',
    oficina: m?.oficina ?? '',
    observacoes: m?.observacoes ?? '',
    atualiza: true,
    proximaData: '',
  }
}

const rotuloDe = (n: number) => (n === 1 ? '1 trabalho' : `${n} trabalhos`)

function Formulario({ editar, viaturaInicial, viaturas, catalogo }: {
  editar?: ManutencaoParaEditar
  viaturaInicial: string | null
  viaturas: OpcaoViatura[]
  catalogo: ItemCatalogoRow[]
}) {
  const navigate = useNavigate()
  const { registar, editar: gravarEdicao, loading } = useGravarManutencao()
  const [veiculoId, setVeiculoId] = useState<string | null>(editar?.manutencao.veiculo_id ?? viaturaInicial)
  const { contexto } = useContextoViatura(veiculoId ?? undefined)
  const [f, setF] = useState<Campos>(() => camposIniciais(editar?.manutencao))
  const [procura, setProcura] = useState('')
  // Registo novo: várias intervenções de uma só vez (uma por tipo escolhido, mais trabalhos avulsos)
  const [sel, setSel] = useState<Record<string, Linha>>({})
  const [outros, setOutros] = useState<Linha[]>([])
  const set = (p: Partial<Campos>) => setF(prev => ({ ...prev, ...p }))

  const viatura = viaturas.find(v => v.id === veiculoId)
  const maquina = viatura ? ehMaquina(viatura.tipo) : contexto ? ehMaquina(contexto.viatura.tipo) : false
  const unidade = contexto?.viatura.unidade_contador ?? (maquina ? 'horas' : 'km')
  const rotuloLeitura = unidade === 'horas' ? 'Horas' : 'Km'

  // O item já gravado fica sempre na lista, mesmo que entretanto tenha sido desativado
  const opcoes = useMemo(() => {
    const t = semAcentos(procura.trim())
    return ordenar(catalogo.filter(i =>
      (i.ativo && i.natureza === 'MANUTENCAO' && (!t || semAcentos(i.rotulo).includes(t))) || i.id === f.itemId))
  }, [catalogo, procura, f.itemId])
  const grupos = useMemo(() => agruparPorCategoria(opcoes), [opcoes])

  const itensEscolhidos = editar
    ? catalogo.filter(i => i.id === f.itemId)
    : catalogo.filter(i => i.id in sel)
  const item = itensEscolhidos.length === 1 ? itensEscolhidos[0] : undefined
  const intervaloDe = (i: ItemCatalogoRow) => {
    const c = contexto?.itens.find(x => x.item_id === i.id)
    return { km: c?.intervalo_km ?? i.intervalo_km_padrao ?? null, meses: c?.intervalo_meses ?? i.intervalo_meses_padrao ?? null }
  }
  const intervaloKm = item ? intervaloDe(item).km : null
  const intervaloMeses = item ? intervaloDe(item).meses : null
  const kmObrigatorio = !editar && f.atualiza && itensEscolhidos.some(i => intervaloDe(i).km !== null)
  const totalLinhas = Object.keys(sel).length + outros.length

  const alternar = (id: string) => setSel(prev => {
    const { [id]: existe, ...resto } = prev
    return existe ? resto : { ...prev, [id]: { descricao: '', custo: '' } }
  })
  const mudarLinha = (id: string, p: Partial<Linha>) => setSel(prev => ({ ...prev, [id]: { ...prev[id], ...p } }))
  const mudarOutro = (n: number, p: Partial<Linha>) => setOutros(prev => prev.map((l, i) => i === n ? { ...l, ...p } : l))

  const kmN = numeroOuNulo(f.km)
  const abaixoDoConhecido = !editar && kmN !== null && Number.isFinite(kmN) && contexto?.kmAtual != null && kmN < contexto.kmAtual

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!veiculoId) { toast.error('Escolha a viatura ou máquina.'); return }
    if (editar) {
      if (!f.itemId) { toast.error('Escolha o tipo de manutenção.'); return }
      if (f.itemId === OUTRO && !f.descricao.trim()) { toast.error('Descreva o trabalho feito.'); return }
    } else {
      if (totalLinhas === 0) { toast.error('Escolha pelo menos um tipo de manutenção.'); return }
      if (outros.some(l => !l.descricao.trim())) { toast.error('Descreva o trabalho feito.'); return }
    }
    if (!f.data) { toast.error('Indique a data da intervenção.'); return }
    if (f.data > hojeIso()) { toast.error('A data da intervenção não pode ser futura.'); return }
    const custo = editar ? numeroOuNulo(f.custo) : null
    const custoLinha = (l: Linha) => numeroOuNulo(l.custo)
    const linhasCusto = editar ? [] : [...Object.values(sel), ...outros].map(custoLinha)
    if (linhasCusto.some(c => c !== null && (!Number.isFinite(c) || c < 0))) { toast.error('Custo inválido.'); return }
    if (kmN !== null && (!Number.isFinite(kmN) || kmN < 0)) { toast.error(`${rotuloLeitura} inválidos.`); return }
    if (custo !== null && (!Number.isFinite(custo) || custo < 0)) { toast.error('Custo inválido.'); return }
    if (kmObrigatorio && kmN === null) { toast.error('Indique os km: este item tem prazo em km.'); return }

    const comum = {
      itemId: f.itemId === OUTRO ? null : f.itemId,
      descricao: f.descricao.trim() || null,
      data: f.data, km: kmN, custo,
      oficina: f.oficina.trim() || null,
      observacoes: f.observacoes.trim() || null,
    }

    if (editar) {
      if (await gravarEdicao({ id: editar.manutencao.id, ...comum }) === true) {
        toast.success('Correção guardada.')
        navigate('/frota/manutencao?vista=historico')
      }
      return
    }
    const base = { veiculoId, data: f.data, km: kmN, oficina: comum.oficina, observacoes: comum.observacoes }
    const pedidos = [
      ...itensEscolhidos.map(i => ({
        chave: i.id, itemId: i.id as string | null, descricao: sel[i.id].descricao.trim() || null,
        custo: custoLinha(sel[i.id]), atualizaProxima: f.atualiza,
        proximaData: f.atualiza && f.proximaData && itensEscolhidos.length === 1 ? f.proximaData : null,
      })),
      ...outros.map((l, n) => ({
        chave: `outro-${n}`, itemId: null, descricao: l.descricao.trim(), custo: custoLinha(l), atualizaProxima: false, proximaData: null,
      })),
    ]
    const feitos = new Set<string>()
    for (const p of pedidos) {
      const novo = await registar({ ...base, itemId: p.itemId, descricao: p.descricao, custo: p.custo, atualizaProxima: p.atualizaProxima, proximaData: p.proximaData })
      if (!novo) break
      feitos.add(p.chave)
    }
    if (feitos.size === pedidos.length) {
      toast.success(pedidos.length === 1 ? 'Intervenção registada.' : `${pedidos.length} intervenções registadas.`)
      navigate(viaturaInicial ? `/frota/viatura/${veiculoId}` : '/frota/manutencao?vista=historico')
    } else if (feitos.size > 0) {
      // O que já ficou gravado sai da lista, para não duplicar ao tentar de novo
      setSel(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => !feitos.has(id))))
      setOutros(prev => prev.filter((_, n) => !feitos.has(`outro-${n}`)))
      toast.error(`Foram gravados ${rotuloDe(feitos.size)}; os restantes falharam — tente de novo.`)
    }
  }

  const rotuloItem = (id: string) => catalogo.find(i => i.id === id)?.rotulo ?? 'Item removido'

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-28">
      <Cabecalho titulo={editar ? 'Corrigir intervenção' : 'Registar manutenção'}
        subtitulo={editar ? 'A viatura não se pode mudar; o resto pode ser corrigido.' : 'Intervenção feita numa viatura ou máquina.'} />

      {editar && (
        <div className="rounded-2xl bg-warning/10 text-sm p-4 flex gap-3" role="note">
          <TriangleAlert className="w-5 h-5 text-warning shrink-0" aria-hidden="true" />
          <p>A correção fica registada com o seu nome e a data, com o antes e o depois.</p>
        </div>
      )}

      <form onSubmit={guardar} noValidate className="space-y-4">
        <Seccao titulo="Viatura ou máquina">
          <ViaturaCombobox viaturas={viaturas} valor={veiculoId} onChange={setVeiculoId} rotuloCampo="Matrícula"
            disabled={!!editar} />
          {viatura && (
            <p className="text-sm text-muted-foreground">
              {[viatura.nome, [viatura.marca, viatura.modelo].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
              {maquina && ' · máquina (conta em horas)'}
            </p>
          )}
          {veiculoId && contexto && (
            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-3 text-sm" aria-label="Ponto de partida">
              <div>
                <dt className="text-xs text-muted-foreground">Última revisão</dt>
                <dd className="font-medium">
                  {contexto.viatura.data_ultima_revisao
                    ? `${formatarData(contexto.viatura.data_ultima_revisao)}${contexto.viatura.km_ultima_revisao != null ? ` · ${formatarLeitura(contexto.viatura.km_ultima_revisao, unidade)}` : ''}`
                    : 'sem revisão registada'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{unidade === 'horas' ? 'Horas atuais' : 'Km atuais'}</dt>
                <dd className="font-medium">{contexto.kmAtual != null ? formatarLeitura(contexto.kmAtual, unidade) : 'desconhecido'}</dd>
              </div>
            </dl>
          )}
        </Seccao>

        <Seccao titulo="O que foi feito">
          {catalogo.filter(i => i.ativo && i.natureza === 'MANUTENCAO').length > 8 && (
            <input value={procura} onChange={e => setProcura(e.target.value)} className={inputCls}
              placeholder="Procurar na lista…" aria-label="Procurar tipo de manutenção" />
          )}
          {editar ? (
            <>
              <label className="block text-sm font-medium space-y-2">
                <span>Tipo de manutenção <span className="text-destructive">*</span></span>
                <select value={f.itemId} onChange={e => set({ itemId: e.target.value })} className={inputCls}>
                  <option value="">— Escolher —</option>
                  {grupos.map(g => (
                    <optgroup key={g.categoria} label={rotuloCategoria(g.categoria)}>
                      {g.itens.map(i => <option key={i.id} value={i.id}>{i.rotulo}</option>)}
                    </optgroup>
                  ))}
                  <option value={OUTRO}>Outro (especificar)</option>
                </select>
              </label>
              {(f.itemId === OUTRO || item) && (
                <label className="block text-sm font-medium space-y-2">
                  {f.itemId === OUTRO ? <>Descrição <span className="text-destructive">*</span></> : 'Descrição (opcional)'}
                  <input value={f.descricao} onChange={e => set({ descricao: e.target.value })} className={inputCls}
                    placeholder={f.itemId === OUTRO ? 'Ex: substituição da lâmpada do farol esquerdo' : 'Ex: óleo 5W30, filtro Mann'} />
                </label>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Marque tudo o que foi feito nesta passagem pela oficina.</p>
              {grupos.map(g => (
                <fieldset key={g.categoria} className="space-y-1">
                  <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{rotuloCategoria(g.categoria)}</legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {g.itens.map(i => (
                      <label key={i.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-muted/50 cursor-pointer">
                        <input type="checkbox" checked={i.id in sel} onChange={() => alternar(i.id)} className="w-4 h-4" />
                        {i.rotulo}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <button type="button" onClick={() => setOutros(prev => [...prev, { descricao: '', custo: '' }])}
                className="text-sm font-semibold text-primary hover:underline">
                + Outro trabalho (especificar)
              </button>

              {totalLinhas > 0 && (
                <div className="rounded-2xl bg-muted/40 p-3 space-y-3" aria-label="Trabalhos escolhidos">
                  <p className="text-xs font-semibold text-muted-foreground">{rotuloDe(totalLinhas)} a registar — descrição e custo são opcionais</p>
                  {itensEscolhidos.map(i => (
                    <div key={i.id} className="grid grid-cols-[1fr_6.5rem] gap-2 items-end">
                      <label className="block text-xs font-medium space-y-1">
                        {i.rotulo}
                        <input value={sel[i.id].descricao} onChange={e => mudarLinha(i.id, { descricao: e.target.value })}
                          className={inputCls} placeholder="Ex: óleo 5W30, filtro Mann" aria-label={`Descrição — ${i.rotulo}`} />
                      </label>
                      <input inputMode="decimal" value={sel[i.id].custo} onChange={e => mudarLinha(i.id, { custo: e.target.value })}
                        className={inputCls} placeholder="€" aria-label={`Custo — ${i.rotulo}`} />
                    </div>
                  ))}
                  {outros.map((l, n) => (
                    <div key={n} className="grid grid-cols-[1fr_6.5rem_auto] gap-2 items-end">
                      <label className="block text-xs font-medium space-y-1">
                        Outro <span className="text-destructive">*</span>
                        <input value={l.descricao} onChange={e => mudarOutro(n, { descricao: e.target.value })} className={inputCls}
                          placeholder="Ex: substituição da lâmpada do farol esquerdo" aria-label={`Outro trabalho ${n + 1}`} />
                      </label>
                      <input inputMode="decimal" value={l.custo} onChange={e => mudarOutro(n, { custo: e.target.value })}
                        className={inputCls} placeholder="€" aria-label={`Custo — outro trabalho ${n + 1}`} />
                      <button type="button" onClick={() => setOutros(prev => prev.filter((_, i) => i !== n))}
                        className="px-3 py-2 text-sm text-muted-foreground hover:text-destructive" aria-label={`Remover outro trabalho ${n + 1}`}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Seccao>

        <Seccao titulo="Dados da intervenção">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-sm font-medium space-y-2">
              <span>Data da intervenção <span className="text-destructive">*</span></span>
              <input type="date" value={f.data} max={hojeIso()} onChange={e => set({ data: e.target.value })} className={inputCls} required />
            </label>
            <label className="block text-sm font-medium space-y-2">
              <span>{rotuloLeitura} atuais {kmObrigatorio ? <span className="text-destructive">*</span> : <span className="text-muted-foreground font-normal text-xs">(opcional)</span>}</span>
              <input inputMode="numeric" value={f.km} onChange={e => set({ km: e.target.value })} className={inputCls}
                placeholder={contexto?.kmAtual != null ? `Última leitura: ${contexto.kmAtual}` : 'Ex: 125430'} />
            </label>
            {editar && (
              <label className="block text-sm font-medium space-y-2">
                <span>Custo (€) <span className="text-muted-foreground font-normal text-xs">(opcional)</span></span>
                <input inputMode="decimal" value={f.custo} onChange={e => set({ custo: e.target.value })} className={inputCls} placeholder="Ex: 85,50" />
              </label>
            )}
            <label className="block text-sm font-medium space-y-2">
              <span>Oficina <span className="text-muted-foreground font-normal text-xs">(opcional)</span></span>
              <input value={f.oficina} onChange={e => set({ oficina: e.target.value })} className={inputCls} placeholder="Ex: Polo 2 / oficina externa" />
            </label>
          </div>
          {abaixoDoConhecido && (
            <p role="alert" className="text-sm text-warning">
              Atenção: {kmN?.toLocaleString('pt-PT')} é menos do que a última leitura conhecida ({formatarLeitura(contexto?.kmAtual, unidade)}). Confirme antes de gravar.
            </p>
          )}
          <label className="block text-sm font-medium space-y-2">
            <span>Observações <span className="text-muted-foreground font-normal text-xs">(opcional)</span></span>
            <textarea value={f.observacoes} onChange={e => set({ observacoes: e.target.value })} className={`${inputCls} resize-none`} rows={2} />
          </label>
        </Seccao>

        {!editar && itensEscolhidos.length > 0 && (
          <div className="rounded-2xl bg-muted/40 p-4 space-y-3">
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={f.atualiza} onChange={e => set({ atualiza: e.target.checked })} className="mt-1 w-4 h-4" />
              <span>
                Atualizar o próximo prazo a partir desta manutenção
                <span className="block text-xs text-muted-foreground">
                  {itensEscolhidos.length > 1
                    ? 'Cada item recalcula o seu próprio prazo.'
                    : intervaloKm || intervaloMeses
                      ? `Próximo prazo calculado sozinho: ${textoIntervalo(intervaloKm, intervaloMeses)}.`
                      : 'Este item não tem intervalo — indique a próxima data abaixo.'}
                  {' '}Desligue para reparações que não reiniciam o prazo.
                </span>
              </span>
            </label>
            {f.atualiza && itensEscolhidos.length === 1 && (
              <label className="block text-xs font-medium space-y-1">
                Próxima data <span className="text-muted-foreground font-normal">(opcional — substitui o cálculo; ex.: seguro renovado até…)</span>
                <input type="date" value={f.proximaData} min={f.data} onChange={e => set({ proximaData: e.target.value })} className={inputCls} />
              </label>
            )}
          </div>
        )}

        {editar && editar.edicoes.length > 0 && (
          <Seccao titulo="Correções anteriores" icone={<History className="w-4 h-4 text-muted-foreground" aria-hidden="true" />}>
            <ul className="space-y-3">
              {editar.edicoes.map(c => (
                <li key={c.id} className="text-sm space-y-1">
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">{c.editado_por_nome}</strong> em {formatarDataHora(c.editado_em)}
                  </p>
                  {diferencas(c.antes, c.depois, rotuloItem).map(d => (
                    <p key={d.campo}><span className="text-muted-foreground">{d.campo}:</span> {d.antes} → <strong>{d.depois}</strong></p>
                  ))}
                </li>
              ))}
            </ul>
          </Seccao>
        )}

        <button type="submit" disabled={loading} className={`${botaoPrimario} w-full py-4 text-base`}>
          {loading ? 'A guardar…' : editar ? 'Guardar correção' : totalLinhas > 1 ? `Gravar ${totalLinhas} intervenções` : 'Gravar intervenção'}
        </button>
      </form>
    </div>
  )
}

export function ManutencaoFormPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { podeFrota } = useRole()
  const { viaturas } = useResumoFrota()
  const { catalogo } = useCatalogo()
  const { dados, loading, error } = useManutencaoParaEditar(id)

  if (!podeFrota) {
    return <p className="max-w-2xl mx-auto text-sm text-muted-foreground text-center py-12">Não tem permissão para registar manutenções.</p>
  }
  if (id && !dados) {
    return <p className="max-w-2xl mx-auto text-sm text-center py-12 text-muted-foreground">
      {loading ? 'A carregar…' : (error ?? 'Manutenção não encontrada.')}
    </p>
  }
  return <Formulario key={id ?? 'nova'} editar={dados ?? undefined} viaturaInicial={params.get('viatura')} viaturas={viaturas} catalogo={catalogo} />
}
