import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  Plus, Search, LayoutGrid, List, Archive, RotateCcw, ArrowDownCircle, ArrowUpCircle,
  MapPin, FileSpreadsheet, Package,
} from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState } from '@/app/components/EmptyState'
import { ConfirmDialog } from '@/app/components/ConfirmDialog'
import { getCategoryLabel, getUnitLabel } from '@/app/data/mockData'
import { exportarXlsx } from '@/app/lib/exportXlsx'
import { useRole } from '@/features/auth/useRole'
import { useProdutos, useProdutosArquivados, useRestaurarProduto } from '@/features/produtos/hooks/useProdutos'
import type { ProdutoArmazem } from '@/features/produtos/services/produtosService'
import { CATEGORIAS, ESTADO_STOCK, EstadoStock, BarraStock, FotoProduto } from '@/features/produtos/components/produtoUi'
import type { ProductCategory, StockStatus } from '@/app/types'

type FiltroEstado = 'todos' | Exclude<StockStatus, 'normal'>
type Vista = 'grelha' | 'lista'

const VISTA_KEY = 'armazem.inventario.vista'

function lerVista(): Vista {
  try { return localStorage.getItem(VISTA_KEY) === 'lista' ? 'lista' : 'grelha' } catch { return 'grelha' }
}

const FILTROS_ESTADO: { valor: FiltroEstado; rotulo: string; cor: string }[] = [
  { valor: 'todos', rotulo: 'Todos', cor: 'text-foreground' },
  { valor: 'baixo', rotulo: 'Stock baixo', cor: 'text-warning' },
  { valor: 'sem-stock', rotulo: 'Sem stock', cor: 'text-destructive' },
]

export function InventarioPage() {
  const navigate = useNavigate()
  const { podeArmazem } = useRole()
  const [pesquisa, setPesquisa] = useState('')
  const [categoria, setCategoria] = useState<'todas' | ProductCategory>('todas')
  const [estado, setEstado] = useState<FiltroEstado>('todos')
  const [vista, setVistaEstado] = useState<Vista>(lerVista)
  const [verArquivados, setVerArquivados] = useState(false)
  const [restaurarId, setRestaurarId] = useState<string | null>(null)

  const { products: ativos, loading, reload } = useProdutos()
  // Arquivados só carregam quando se pedem
  const { products: arquivados, loading: aCarregarArq, reload: recarregarArq } = useProdutosArquivados(verArquivados)
  const { restaurar, loading: aRestaurar } = useRestaurarProduto()

  const setVista = (v: Vista) => {
    setVistaEstado(v)
    try { localStorage.setItem(VISTA_KEY, v) } catch { /* sem armazenamento: vale só nesta visita */ }
  }

  const fonte: ProdutoArmazem[] = verArquivados ? arquivados : ativos
  const filtrados = useMemo(() => {
    const termo = pesquisa.trim().toLowerCase()
    return fonte.filter(p =>
      (!termo || p.name.toLowerCase().includes(termo) || p.code.toLowerCase().includes(termo)) &&
      (categoria === 'todas' || p.category === categoria) &&
      (verArquivados || estado === 'todos' || p.status === estado))
  }, [fonte, pesquisa, categoria, estado, verArquivados])

  const contagem = useMemo(() => ({
    todos: ativos.length,
    baixo: ativos.filter(p => p.status === 'baixo').length,
    'sem-stock': ativos.filter(p => p.status === 'sem-stock').length,
  }), [ativos])

  const aCarregar = verArquivados ? aCarregarArq : loading

  const exportar = async () => {
    await exportarXlsx(filtrados.map(p => ({
      'Código': p.code,
      'Artigo': p.name,
      'Categoria': getCategoryLabel(p.category),
      'Unidade': getUnitLabel(p.unit),
      'Stock atual': p.currentStock,
      'Stock mínimo': p.minStock,
      'Estado': ESTADO_STOCK[p.status].rotulo,
      'Custo unitário (€)': p.unitCost,
      'Valor em stock (€)': Math.round(p.currentStock * p.unitCost * 100) / 100,
      'Localização': p.localizacao ?? '',
    })), verArquivados ? 'inventario_arquivados' : 'inventario', 'Inventário')
  }

  const confirmarRestauro = async () => {
    if (!restaurarId) return
    const nome = arquivados.find(p => p.id === restaurarId)?.name
    if (await restaurar(restaurarId)) {
      toast.success(`"${nome}" restaurado.`)
      setRestaurarId(null)
      recarregarArq()
      reload()
    } else {
      toast.error('Erro ao restaurar o artigo.')
    }
  }

  const campo = 'w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm'
  const botaoVista = (ativo: boolean) =>
    `p-2.5 rounded-lg transition-colors ${ativo ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`
  const filtrosAtivos = pesquisa !== '' || categoria !== 'todas' || estado !== 'todos'

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-2xl border border-border p-3 sm:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <input type="search" value={pesquisa} onChange={e => setPesquisa(e.target.value)}
              placeholder="Pesquisar por nome ou código…" aria-label="Pesquisar artigos" className={`${campo} pl-10`} />
          </div>
          <select value={categoria} onChange={e => setCategoria(e.target.value as 'todas' | ProductCategory)}
            aria-label="Categoria" className={`${campo} sm:w-52`}>
            <option value="todas">Todas as categorias</option>
            {CATEGORIAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {!verArquivados && (
            <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Estado do stock">
              {FILTROS_ESTADO.map(f => {
                const ativo = estado === f.valor
                return (
                  <button key={f.valor} type="button" onClick={() => setEstado(f.valor)} aria-pressed={ativo}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold border transition-colors ${
                      ativo ? 'border-primary bg-primary/10 text-primary' : `border-border hover:bg-accent ${f.cor}`}`}>
                    {f.rotulo}
                    <span className="px-1.5 rounded-full bg-muted text-[10px] text-muted-foreground">{contagem[f.valor]}</span>
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {podeArmazem && (
              <button type="button" onClick={() => setVerArquivados(v => !v)} aria-pressed={verArquivados}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  verArquivados ? 'border-warning bg-warning/10 text-warning' : 'border-border text-muted-foreground hover:bg-accent'}`}>
                <Archive className="w-4 h-4" aria-hidden="true" /> Arquivados
              </button>
            )}
            <button type="button" onClick={() => void exportar()} disabled={filtrados.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-border text-muted-foreground hover:bg-accent disabled:opacity-50">
              <FileSpreadsheet className="w-4 h-4" aria-hidden="true" /> Excel
            </button>
            <div className="flex bg-muted rounded-xl p-1" role="group" aria-label="Vista">
              <button type="button" onClick={() => setVista('grelha')} aria-pressed={vista === 'grelha'} aria-label="Ver em grelha" className={botaoVista(vista === 'grelha')}>
                <LayoutGrid className="w-4 h-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => setVista('lista')} aria-pressed={vista === 'lista'} aria-label="Ver em lista" className={botaoVista(vista === 'lista')}>
                <List className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {aCarregar ? 'A carregar…' : `${filtrados.length} ${verArquivados ? 'arquivado' : 'artigo'}${filtrados.length !== 1 ? 's' : ''}`}
        </p>
        {podeArmazem && !verArquivados && (
          <Link to="/armazem/produto/novo"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all">
            <Plus className="w-4 h-4" aria-hidden="true" /> Novo produto
          </Link>
        )}
      </div>

      {aCarregar ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-64 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      ) : filtrados.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border">
          <EmptyState
            icon={verArquivados ? Archive : Package}
            title={verArquivados ? 'Nenhum artigo arquivado' : 'Nenhum artigo encontrado'}
            description={filtrosAtivos
              ? 'Tente alterar a pesquisa ou os filtros.'
              : verArquivados ? 'Os artigos arquivados aparecem aqui.' : 'Adicione o primeiro artigo ao armazém.'}
          />
        </div>
      ) : vista === 'grelha' ? (
        <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtrados.map(p => (
            <li key={p.id} className={`bg-card rounded-2xl border border-border overflow-hidden flex flex-col ${verArquivados ? 'opacity-75' : ''}`}>
              <button type="button" onClick={() => navigate(`/armazem/produto/${p.id}`)} aria-label={`Abrir ${p.name}`}
                className="text-left flex-1 flex flex-col hover:bg-accent/30 transition-colors">
                <div className="relative">
                  <FotoProduto fotoPath={p.fotoPath} categoria={p.category} nome={p.name} className="w-full aspect-[4/3]" />
                  {!verArquivados && <span className="absolute top-2 left-2"><EstadoStock estado={p.status} /></span>}
                </div>
                <div className="p-3 flex-1 flex flex-col gap-1">
                  <p className="text-sm font-semibold leading-tight line-clamp-2">{p.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    <span className="font-mono">{p.code}</span> · {getCategoryLabel(p.category)}
                  </p>
                  {p.localizacao && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                      <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" /> {p.localizacao}
                    </p>
                  )}
                  <div className="mt-auto pt-1.5 space-y-1.5">
                    <p className="text-sm">
                      <span className={`text-lg font-bold ${ESTADO_STOCK[p.status].texto}`}>{p.currentStock}</span>{' '}
                      <span className="text-muted-foreground text-xs">{getUnitLabel(p.unit)} · mín. {p.minStock}</span>
                    </p>
                    <BarraStock atual={p.currentStock} minimo={p.minStock} estado={p.status} />
                  </div>
                </div>
              </button>
              <AcoesArtigo p={p} podeArmazem={podeArmazem} arquivado={verArquivados} onRestaurar={setRestaurarId} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="bg-card rounded-2xl border border-border divide-y divide-border overflow-hidden">
          {filtrados.map(p => (
            <li key={p.id} className={`flex flex-col sm:flex-row sm:items-center ${verArquivados ? 'opacity-75' : ''}`}>
              <button type="button" onClick={() => navigate(`/armazem/produto/${p.id}`)} aria-label={`Abrir ${p.name}`}
                className="flex-1 min-w-0 flex items-center gap-3 p-3 text-left hover:bg-accent/30 transition-colors">
                <FotoProduto fotoPath={p.fotoPath} categoria={p.category} nome={p.name} className="w-14 h-14 rounded-xl shrink-0" tamanhoIcone="w-6 h-6" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    <span className="font-mono">{p.code}</span> · {getCategoryLabel(p.category)}{p.localizacao ? ` · ${p.localizacao}` : ''}
                  </p>
                  <div className="mt-1.5 max-w-48"><BarraStock atual={p.currentStock} minimo={p.minStock} estado={p.status} /></div>
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <p className={`text-base font-bold ${ESTADO_STOCK[p.status].texto}`}>
                    {p.currentStock} <span className="text-xs font-normal text-muted-foreground">{getUnitLabel(p.unit)}</span>
                  </p>
                  {!verArquivados && <EstadoStock estado={p.status} />}
                </div>
              </button>
              <div className="sm:w-60 shrink-0">
                <AcoesArtigo p={p} podeArmazem={podeArmazem} arquivado={verArquivados} onRestaurar={setRestaurarId} compacto />
              </div>
            </li>
          ))}
        </ul>
      )}

      {restaurarId && (
        <ConfirmDialog
          title={`Restaurar "${arquivados.find(p => p.id === restaurarId)?.name}"?`}
          description="O artigo volta a aparecer no inventário."
          confirmLabel="Restaurar"
          variant="warning"
          loading={aRestaurar}
          onConfirm={confirmarRestauro}
          onCancel={() => setRestaurarId(null)}
        />
      )}
    </div>
  )
}

function AcoesArtigo({ p, podeArmazem, arquivado, onRestaurar, compacto = false }: {
  p: ProdutoArmazem; podeArmazem: boolean; arquivado: boolean; onRestaurar: (id: string) => void; compacto?: boolean
}) {
  if (!podeArmazem) return null
  const base = 'flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold active:scale-[0.98] transition-all'
  const caixa = compacto ? 'px-3 pb-3 sm:p-3' : 'p-2 border-t border-border'
  if (arquivado) {
    return (
      <div className={caixa}>
        <button type="button" onClick={() => onRestaurar(p.id)} className={`${base} w-full bg-primary/10 text-primary hover:bg-primary/20`}>
          <RotateCcw className="w-4 h-4" aria-hidden="true" /> Restaurar
        </button>
      </div>
    )
  }
  return (
    <div className={`flex gap-2 ${caixa}`}>
      <Link to={`/armazem/movimento/entrada?produto=${p.id}`} aria-label={`Entrada de ${p.name}`}
        className={`${base} bg-success/10 text-success hover:bg-success/20`}>
        <ArrowDownCircle className="w-4 h-4" aria-hidden="true" /> Entrada
      </Link>
      <Link to={`/armazem/movimento/saida?produto=${p.id}`} aria-label={`Saída de ${p.name}`}
        className={`${base} bg-primary/10 text-primary hover:bg-primary/20`}>
        <ArrowUpCircle className="w-4 h-4" aria-hidden="true" /> Saída
      </Link>
    </div>
  )
}
