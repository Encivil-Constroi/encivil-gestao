import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  ArrowLeft, ArrowDownCircle, ArrowUpCircle, Pencil, Archive, Trash2, MapPin, Loader2, Package, MessageCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/app/components/ConfirmDialog'
import { getCategoryLabel, getUnitLabel } from '@/app/data/mockData'
import { fmtEuro, fmtDataHora } from '@/app/lib/format'
import { useRole } from '@/features/auth/useRole'
import {
  useProduto, useMovimentosProduto, useDesativarProduto, useDeletarProduto,
} from '@/features/produtos/hooks/useProdutos'
import type { MovimentoArtigo } from '@/features/produtos/services/produtosService'
import {
  BarraStock, COR_TIPO, ESTADO_STOCK, EstadoStock, FotoProduto, rotuloMovimento,
} from '@/features/produtos/components/produtoUi'

type Dialogo = 'arquivar' | 'eliminar' | null

// Quem/onde: obra, fornecedor ou cliente conforme o tipo detalhado
function origemDestino(m: MovimentoArtigo): string {
  return m.obraNome ?? m.destino ?? m.cliente ?? m.fornecedor ?? '—'
}

export function ProdutoDetalhePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { podeArmazem } = useRole()
  const { product, loading } = useProduto(id)
  const { movimentos, loading: aCarregarMov } = useMovimentosProduto(id)
  const { desativar, loading: aArquivar } = useDesativarProduto()
  const { deletar, loading: aEliminar } = useDeletarProduto()
  const [dialogo, setDialogo] = useState<Dialogo>(null)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" aria-label="A carregar" />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="bg-card rounded-2xl border border-border p-8 text-center">
        <p className="font-semibold">Artigo não encontrado</p>
        <Link to="/armazem/inventario" className="inline-block mt-4 text-sm text-primary hover:underline">Voltar ao inventário</Link>
      </div>
    )
  }

  const unidade = getUnitLabel(product.unit)
  const estado = ESTADO_STOCK[product.status]
  const semMovimentos = !aCarregarMov && movimentos.length === 0

  const arquivar = async () => {
    const ok = await desativar(product.id)
    if (ok) {
      toast.success(`"${product.name}" arquivado.`)
      navigate('/armazem/inventario')
    } else {
      toast.error('Erro ao arquivar o artigo.')
    }
    setDialogo(null)
  }

  const eliminar = async () => {
    const ok = await deletar(product.id)
    if (ok) {
      toast.success(`"${product.name}" eliminado permanentemente.`)
      navigate('/armazem/inventario')
    } else {
      toast.error('Erro ao eliminar. Verifique as permissões.')
    }
    setDialogo(null)
  }

  const pedirReposicao = () => {
    const falta = Math.max(product.minStock - product.currentStock, 0)
    const msg = [
      '*Pedido de Reposição — ENCIVIL*', '',
      `Produto: ${product.name} (${product.code})`,
      `Stock atual: ${product.currentStock} ${unidade}`,
      `Stock mínimo: ${product.minStock} ${unidade}`,
      `Em falta: ${falta} ${unidade}`, '',
      'Por favor, repor o mais brevemente possível.',
    ].join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const acao = 'flex-1 inline-flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold active:scale-[0.98] transition-all'

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Link to="/armazem/inventario" aria-label="Voltar ao inventário" className="p-2 -ml-2 rounded-xl hover:bg-accent transition-colors mt-0.5">
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl md:text-2xl font-semibold leading-tight">{product.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            <span className="font-mono">{product.code}</span> · {getCategoryLabel(product.category)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="md:col-span-2 bg-card rounded-2xl border border-border overflow-hidden self-start">
          <FotoProduto fotoPath={product.fotoPath} categoria={product.category} nome={product.name}
            className="w-full aspect-square" tamanhoIcone="w-20 h-20" />
        </div>

        <div className="md:col-span-3 space-y-4">
          <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stock atual</p>
              <EstadoStock estado={product.status} />
            </div>
            <p className={`text-4xl font-bold ${estado.texto}`} data-testid="stock-atual">
              {product.currentStock} <span className="text-base font-medium text-muted-foreground">{unidade}</span>
            </p>
            <BarraStock atual={product.currentStock} minimo={product.minStock} estado={product.status} />
            <dl className="grid grid-cols-3 gap-3 pt-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Mínimo</dt>
                <dd className="font-semibold">{product.minStock} {unidade}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Custo unitário</dt>
                <dd className="font-semibold">{fmtEuro(product.unitCost)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Valor em stock</dt>
                <dd className="font-semibold">{fmtEuro(product.currentStock * product.unitCost)}</dd>
              </div>
            </dl>
            {product.localizacao && (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground pt-1">
                <MapPin className="w-4 h-4 shrink-0" aria-hidden="true" /> {product.localizacao}
              </p>
            )}
            {product.notes && <p className="text-sm text-muted-foreground leading-relaxed border-t border-border pt-3">{product.notes}</p>}
          </div>

          {podeArmazem && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Link to={`/armazem/movimento/entrada?produto=${product.id}`} className={`${acao} bg-success text-success-foreground hover:bg-success/90`}>
                  <ArrowDownCircle className="w-5 h-5" aria-hidden="true" /> Entrada
                </Link>
                <Link to={`/armazem/movimento/saida?produto=${product.id}`} className={`${acao} bg-primary text-primary-foreground hover:bg-primary/90`}>
                  <ArrowUpCircle className="w-5 h-5" aria-hidden="true" /> Saída
                </Link>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Link to={`/armazem/produto/${product.id}/editar`} className={`${acao} border border-border hover:bg-accent`}>
                  <Pencil className="w-4 h-4" aria-hidden="true" /> Editar
                </Link>
                <button type="button" onClick={() => setDialogo('arquivar')} className={`${acao} border border-warning/40 text-warning hover:bg-warning/10`}>
                  <Archive className="w-4 h-4" aria-hidden="true" /> Arquivar
                </button>
                {semMovimentos && (
                  <button type="button" onClick={() => setDialogo('eliminar')} className={`${acao} border border-destructive/40 text-destructive hover:bg-destructive/10`}>
                    <Trash2 className="w-4 h-4" aria-hidden="true" /> Eliminar
                  </button>
                )}
              </div>
              {product.status !== 'normal' && (
                <button type="button" onClick={pedirReposicao} className={`${acao} w-full bg-[#25D366] text-[#04090F] hover:bg-[#1ebe5a]`}>
                  <MessageCircle className="w-5 h-5" aria-hidden="true" /> Pedir reposição
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <section className="bg-card rounded-2xl border border-border overflow-hidden" aria-labelledby="hist-titulo">
        <div className="p-4 sm:p-5 border-b border-border flex items-start justify-between gap-2">
          <div>
            <h2 id="hist-titulo" className="font-semibold">Histórico de movimentos</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {aCarregarMov ? 'A carregar…' : `${movimentos.length} movimento${movimentos.length !== 1 ? 's' : ''} (últimos 50)`}
            </p>
          </div>
          <Link to={`/armazem/movimentos?produto=${product.id}`} className="text-xs text-primary hover:underline whitespace-nowrap mt-0.5">
            Ver todos →
          </Link>
        </div>

        {aCarregarMov ? (
          <div className="p-8 text-center text-sm text-muted-foreground">A carregar…</div>
        ) : semMovimentos ? (
          <div className="p-10 text-center">
            <Package className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Ainda não existem movimentos para este artigo.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {movimentos.map(m => (
              <li key={m.id} className="p-4 space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${COR_TIPO[m.tipo]}`}>
                      {rotuloMovimento(m.tipo, m.subtipo)}
                    </span>
                    <span className="text-sm font-bold">
                      {m.tipo === 'entrada' ? '+' : m.tipo === 'saida' ? '−' : ''}{m.quantidade} {unidade}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">{fmtDataHora(m.data)}</span>
                </div>
                <div className="flex gap-x-4 gap-y-0.5 text-xs text-muted-foreground flex-wrap">
                  <span>{origemDestino(m)}</span>
                  {m.numeroFatura && <span>Fatura {m.numeroFatura}</span>}
                  <span>Stock: <strong className="text-foreground">{m.stockDepois}</strong></span>
                  <span>{m.responsavel}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="h-16 md:hidden" aria-hidden="true" />

      {dialogo === 'arquivar' && (
        <ConfirmDialog
          title={`Arquivar "${product.name}"?`}
          description="O artigo deixa de aparecer no inventário. Pode ser restaurado em Inventário › Arquivados."
          confirmLabel="Arquivar"
          variant="warning"
          loading={aArquivar}
          onConfirm={arquivar}
          onCancel={() => setDialogo(null)}
        />
      )}
      {dialogo === 'eliminar' && (
        <ConfirmDialog
          title={`Eliminar "${product.name}" permanentemente?`}
          description="Esta ação é irreversível. O artigo é apagado da base de dados."
          confirmLabel="Eliminar permanentemente"
          variant="danger"
          loading={aEliminar}
          onConfirm={eliminar}
          onCancel={() => setDialogo(null)}
        />
      )}
    </div>
  )
}
