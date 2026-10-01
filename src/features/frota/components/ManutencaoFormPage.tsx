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

  const item = catalogo.find(i => i.id === f.itemId)
  const config = contexto?.itens.find(c => c.item_id === f.itemId)
  const intervaloKm = config?.intervalo_km ?? item?.intervalo_km_padrao ?? null
  const intervaloMeses = config?.intervalo_meses ?? item?.intervalo_meses_padrao ?? null
  const kmObrigatorio = !editar && !!item && f.atualiza && intervaloKm !== null

  const kmN = numeroOuNulo(f.km)
  const abaixoDoConhecido = !editar && kmN !== null && Number.isFinite(kmN) && contexto?.kmAtual != null && kmN < contexto.kmAtual

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!veiculoId) { toast.error('Escolha a viatura ou máquina.'); return }
    if (!f.itemId) { toast.error('Escolha o tipo de manutenção.'); return }
    if (f.itemId === OUTRO && !f.descricao.trim()) { toast.error('Descreva o trabalho feito.'); return }
    if (!f.data) { toast.error('Indique a data da intervenção.'); return }
    if (f.data > hojeIso()) { toast.error('A data da intervenção não pode ser futura.'); return }
    const custo = numeroOuNulo(f.custo)
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
    const atualiza = f.itemId !== OUTRO && f.atualiza
    const novo = await registar({
      veiculoId, ...comum, atualizaProxima: atualiza, proximaData: atualiza && f.proximaData ? f.proximaData : null,
    })
    if (novo) {
      toast.success('Intervenção registada.')
      navigate(viaturaInicial ? `/frota/viatura/${veiculoId}` : '/frota/manutencao?vista=historico')
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
            <label className="block text-sm font-medium space-y-2">
              <span>Custo (€) <span className="text-muted-foreground font-normal text-xs">(opcional)</span></span>
              <input inputMode="decimal" value={f.custo} onChange={e => set({ custo: e.target.value })} className={inputCls} placeholder="Ex: 85,50" />
            </label>
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

        {!editar && item && (
          <div className="rounded-2xl bg-muted/40 p-4 space-y-3">
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={f.atualiza} onChange={e => set({ atualiza: e.target.checked })} className="mt-1 w-4 h-4" />
              <span>
                Atualizar o próximo prazo a partir desta manutenção
                <span className="block text-xs text-muted-foreground">
                  {intervaloKm || intervaloMeses
                    ? `Próximo prazo calculado sozinho: ${textoIntervalo(intervaloKm, intervaloMeses)}.`
                    : 'Este item não tem intervalo — indique a próxima data abaixo.'}
                  {' '}Desligue para reparações que não reiniciam o prazo.
                </span>
              </span>
            </label>
            {f.atualiza && (
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
          {loading ? 'A guardar…' : editar ? 'Guardar correção' : 'Gravar intervenção'}
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
