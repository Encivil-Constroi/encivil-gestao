import { useState, useEffect, useMemo } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { AlertTriangle, ArrowRight, ChevronLeft, Info } from 'lucide-react'
import { toast } from 'sonner'
import type { SubtipoMovimento } from '@/app/lib/armazemDb'
import { getUnitLabel } from '@/app/data/mockData'
import { fmtEuro, fmtNumber } from '@/app/lib/format'
import { useFormGuard } from '@/app/lib/useFormGuard'
import { useRole } from '@/features/auth/useRole'
import { useObras } from '@/features/obras/hooks/useObras'
import { useArtigosArmazem, useFornecedoresUsados, useRegistarMovimentoArmazem } from '@/features/movimentos/hooks/useArmazem'
import { ArtigoCombobox } from '@/features/movimentos/components/ArtigoCombobox'
import { visualMovimento } from '@/features/movimentos/components/movimentoVisual'
import {
  SUBTIPOS_ENTRADA, SUBTIPOS_SAIDA, ehSubtipoEntrada, ehSubtipoSaida, stockDepois, tipoDoSubtipo,
} from '@/features/movimentos/armazemRegras'

const campo = 'w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-base'
const rotulo = 'block text-sm font-medium mb-1.5'

function numero(v: string): number | null {
  const n = parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function MovimentoFormPage({ tipo }: { tipo: 'entrada' | 'saida' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const { nome, isAdmin, isGestor } = useRole()
  const { artigos, loading: aCarregarArtigos } = useArtigosArmazem()
  const { obras } = useObras(true)
  const fornecedores = useFornecedoresUsados()
  const { registar, loading: aGuardar, error } = useRegistarMovimentoArmazem()

  const entrada = tipo === 'entrada'
  const podeInventario = isAdmin || isGestor
  const opcoes = useMemo(
    () => entrada ? SUBTIPOS_ENTRADA.filter(o => o.valor !== 'INVENTARIO' || podeInventario) : SUBTIPOS_SAIDA,
    [entrada, podeInventario])

  const pedido = params.get('tipo')
  const inicial: SubtipoMovimento = entrada
    ? (ehSubtipoEntrada(pedido) && (pedido !== 'INVENTARIO' || podeInventario) ? pedido : 'COMPRA')
    : (ehSubtipoSaida(pedido) ? pedido : 'OBRA')

  const [subtipo, setSubtipo] = useState<SubtipoMovimento>(inicial)
  const [produtoId, setProdutoId] = useState(params.get('produto') ?? '')
  const [obraId, setObraId] = useState(params.get('obra') ?? '')
  const [quantidade, setQuantidade] = useState('')
  const [fornecedor, setFornecedor] = useState('')
  const [cliente, setCliente] = useState('')
  const [preco, setPreco] = useState('')
  const [fatura, setFatura] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [responsavel, setResponsavel] = useState(nome)

  useEffect(() => { if (nome) setResponsavel(r => r || nome) }, [nome])
  useEffect(() => { setSubtipo(inicial); setObraId(params.get('obra') ?? '') }, [tipo]) // eslint-disable-line react-hooks/exhaustive-deps

  const artigo = artigos.find(a => a.id === produtoId)
  const qtd = numero(quantidade)
  const qtdValida = qtd !== null && qtd > 0
  const ehContagem = subtipo === 'INVENTARIO'
  const saida = tipoDoSubtipo(subtipo) === 'saida'
  const precisaObra = subtipo === 'OBRA' || subtipo === 'DEVOLUCAO_OBRA'
  const obrasEscolha = subtipo === 'OBRA' ? obras.filter(o => o.status === 'ativa') : obras
  const depois = artigo && qtdValida ? stockDepois(subtipo, artigo.stockAtual, qtd) : null
  const acimaDoStock = !!artigo && qtdValida && saida && qtd > artigo.stockAtual
  const precoNum = numero(preco)
  const unidade = artigo ? getUnitLabel(artigo.unidade) : ''

  const falta: string | null =
    !produtoId ? 'Escolha o artigo.'
    : !qtdValida ? 'Indique a quantidade.'
    : acimaDoStock ? `Stock insuficiente: há ${fmtNumber(artigo?.stockAtual)} ${unidade}.`
    : subtipo === 'COMPRA' && !fornecedor.trim() ? 'Indique o fornecedor (ou ENCIVIL).'
    : subtipo === 'VENDA' && !cliente.trim() ? 'Indique o cliente da venda.'
    : precisaObra && !obraId ? 'Escolha a obra.'
    : !responsavel.trim() ? 'Indique o responsável.'
    : null

  const submeter = useFormGuard(async (e: React.FormEvent) => {
    e.preventDefault()
    if (falta || qtd === null) { toast.error(falta ?? 'Verifique os campos.'); return }
    const resultado = await registar({
      produtoId, subtipo, quantidade: qtd, responsavel: responsavel.trim(),
      obraId: precisaObra ? obraId : null,
      fornecedor: subtipo === 'COMPRA' ? fornecedor.trim() : null,
      numeroFatura: fatura.trim() || null,
      cliente: subtipo === 'VENDA' ? cliente.trim() : null,
      precoUnitario: (subtipo === 'COMPRA' || subtipo === 'VENDA') ? precoNum : null,
      observacoes: observacoes.trim() || null,
    })
    if (resultado === null) return
    toast.success(resultado === 'ok'
      ? 'Movimento registado.'
      : 'Sem ligação — movimento guardado e será enviado automaticamente.')
    if (params.get('produto')) navigate(`/armazem/produto/${produtoId}`)
    else if (location.key === 'default') navigate('/armazem/movimentos')
    else navigate(-1)
  })

  const mostraFatura = subtipo === 'COMPRA' || subtipo === 'VENDA' || subtipo === 'DEVOLUCAO_OBRA'

  return (
    <form onSubmit={submeter} className="max-w-2xl mx-auto space-y-5 pb-28" noValidate>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} aria-label="Voltar" className="p-2 hover:bg-accent rounded-lg shrink-0">
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        <div>
          <h2 className="text-lg font-semibold">{entrada ? 'Nova entrada' : 'Nova saída'}</h2>
          <p className="text-sm text-muted-foreground">{entrada ? 'Material que entra no armazém' : 'Material que sai do armazém'}</p>
        </div>
      </div>

      <fieldset>
        <legend className="text-sm font-semibold mb-2">{entrada ? 'Tipo de entrada' : 'Destino'}</legend>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" role="radiogroup">
          {opcoes.map(o => {
            const v = visualMovimento(tipoDoSubtipo(o.valor), o.valor)
            const ativo = subtipo === o.valor
            return (
              <button key={o.valor} type="button" role="radio" aria-checked={ativo} onClick={() => setSubtipo(o.valor)}
                className={`rounded-2xl border-2 p-3 text-left transition-all active:scale-[0.98] ${ativo ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'}`}>
                <span className={`inline-flex p-1.5 rounded-lg ${v.fundo} ${v.cor}`}><v.Icone className="w-4 h-4" aria-hidden="true" /></span>
                <span className="block text-sm font-semibold mt-1.5 leading-tight">{o.rotulo}</span>
                <span className="block text-xs text-muted-foreground mt-0.5 leading-snug">{o.descricao}</span>
              </button>
            )
          })}
        </div>
      </fieldset>

      <section className="bg-card rounded-2xl border border-border p-4 space-y-4">
        <div>
          <span className={rotulo} id="lbl-artigo">Artigo</span>
          <ArtigoCombobox artigos={artigos} valor={produtoId} onChange={setProdutoId} carregando={aCarregarArtigos} />
        </div>

        {artigo && (
          <div className="grid grid-cols-2 gap-2 p-3 bg-accent/50 rounded-xl text-center" data-testid="stock-resumo">
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Stock atual</p>
              <p className="text-xl font-bold tabular-nums" data-testid="stock-atual">{fmtNumber(artigo.stockAtual)} <span className="text-xs font-medium text-muted-foreground">{unidade}</span></p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Stock depois</p>
              <p className={`text-xl font-bold tabular-nums flex items-center justify-center gap-1.5 ${depois !== null && depois < 0 ? 'text-destructive' : ''}`} data-testid="stock-depois">
                {depois === null ? '—' : <><ArrowRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />{fmtNumber(depois)}</>}
              </p>
            </div>
          </div>
        )}

        {precisaObra && (
          <div>
            <label className={rotulo} htmlFor="mov-obra">{subtipo === 'OBRA' ? 'Obra em execução' : 'Obra de onde volta'}</label>
            <select id="mov-obra" value={obraId} onChange={e => setObraId(e.target.value)} className={campo}>
              <option value="">Escolha a obra</option>
              {obrasEscolha.map(o => <option key={o.id} value={o.id}>{o.name}{o.status !== 'ativa' ? ' (concluída)' : ''}</option>)}
            </select>
            {subtipo === 'OBRA' && obrasEscolha.length === 0 && <p className="text-xs text-warning mt-1.5">Não há obras em execução.</p>}
          </div>
        )}

        <div>
          <label className={rotulo} htmlFor="mov-qtd">{ehContagem ? 'Stock contado' : 'Quantidade'}{unidade && <span className="text-muted-foreground font-normal"> ({unidade})</span>}</label>
          <input id="mov-qtd" type="number" inputMode="decimal" min="0" step="any" value={quantidade}
            onChange={e => setQuantidade(e.target.value)} placeholder="0" className={`${campo} text-2xl font-bold text-center`} />
          {ehContagem && artigo && qtdValida && (
            <p className="mt-2 text-sm text-center" data-testid="diferenca">
              Diferença: <strong className={qtd - artigo.stockAtual < 0 ? 'text-destructive' : 'text-success'}>{qtd - artigo.stockAtual > 0 ? '+' : ''}{fmtNumber(qtd - artigo.stockAtual)} {unidade}</strong>
            </p>
          )}
          {acimaDoStock && (
            <div role="alert" className="mt-2 p-3 bg-destructive/10 border border-destructive/20 rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-sm text-destructive">Stock insuficiente: há {fmtNumber(artigo?.stockAtual)} {unidade} e quer retirar {fmtNumber(qtd)}.</p>
            </div>
          )}
          {ehContagem && <p className="text-xs text-muted-foreground mt-1.5">A contagem substitui o stock atual; tem de ser superior a zero (para zerar, use Quebra / perda).</p>}
        </div>

        {subtipo === 'COMPRA' && (
          <>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium" htmlFor="mov-forn">Fornecedor <span className="text-destructive">*</span></label>
                <button type="button" onClick={() => setFornecedor('ENCIVIL')} className="text-xs font-semibold text-primary hover:underline">ENCIVIL</button>
              </div>
              <input id="mov-forn" list="lista-fornecedores" value={fornecedor} onChange={e => setFornecedor(e.target.value)} className={campo} placeholder="Nome do fornecedor" autoComplete="off" />
              <datalist id="lista-fornecedores">{fornecedores.map(f => <option key={f} value={f} />)}</datalist>
            </div>
            <div>
              <label className={rotulo} htmlFor="mov-preco">Preço unitário <span className="text-muted-foreground font-normal">(opcional)</span></label>
              <input id="mov-preco" type="number" inputMode="decimal" min="0" step="any" value={preco} onChange={e => setPreco(e.target.value)} className={campo} placeholder="0,00" />
              {precoNum !== null && precoNum >= 0 && preco !== '' && (
                <p className="mt-1.5 text-xs text-muted-foreground flex items-start gap-1.5"><Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />Atualiza o custo do artigo para {fmtEuro(precoNum)} (usado no custo das obras).</p>
              )}
            </div>
          </>
        )}

        {subtipo === 'VENDA' && (
          <>
            <div>
              <label className={rotulo} htmlFor="mov-cli">Cliente <span className="text-destructive">*</span></label>
              <input id="mov-cli" value={cliente} onChange={e => setCliente(e.target.value)} className={campo} placeholder="Nome do cliente" />
            </div>
            <div>
              <label className={rotulo} htmlFor="mov-pv">Preço de venda unitário <span className="text-muted-foreground font-normal">(opcional)</span></label>
              <input id="mov-pv" type="number" inputMode="decimal" min="0" step="any" value={preco} onChange={e => setPreco(e.target.value)} className={campo} placeholder="0,00" />
              {precoNum !== null && qtdValida && preco !== '' && (
                <p className="mt-1.5 text-sm font-semibold" data-testid="total-venda">Total: {fmtEuro(precoNum * qtd)}</p>
              )}
            </div>
          </>
        )}

        {mostraFatura && (
          <div>
            <label className={rotulo} htmlFor="mov-fat">N.º de fatura <span className="text-muted-foreground font-normal">(opcional)</span></label>
            <input id="mov-fat" value={fatura} onChange={e => setFatura(e.target.value)} className={campo} />
          </div>
        )}

        <div>
          <label className={rotulo} htmlFor="mov-resp">Responsável</label>
          <input id="mov-resp" value={responsavel} onChange={e => setResponsavel(e.target.value)} className={campo} />
        </div>

        <div>
          <label className={rotulo} htmlFor="mov-obs">Observações <span className="text-muted-foreground font-normal">(opcional)</span></label>
          <textarea id="mov-obs" rows={3} value={observacoes} onChange={e => setObservacoes(e.target.value)} className={`${campo} resize-none`} />
        </div>
      </section>

      {error && <p role="alert" className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl p-3">{error}</p>}

      <div className="sticky bottom-20 md:bottom-0 py-3 bg-background/90 backdrop-blur-sm">
        <div className="flex gap-3">
          <button type="submit" disabled={aGuardar || !!falta} title={falta ?? undefined}
            className={`flex-1 py-3.5 rounded-xl font-bold active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md ${entrada ? 'bg-success text-success-foreground hover:bg-success/90' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}>
            {aGuardar ? 'A guardar…' : entrada ? 'Registar entrada' : 'Registar saída'}
          </button>
          <Link to={params.get('produto') ? `/armazem/produto/${params.get('produto')}` : '/armazem/movimentos'}
            className="px-5 py-3.5 bg-secondary text-secondary-foreground rounded-xl font-medium hover:bg-secondary/90 text-center">Cancelar</Link>
        </div>
      </div>
    </form>
  )
}
