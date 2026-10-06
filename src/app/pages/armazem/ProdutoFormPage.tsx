import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Info, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { FotoInput } from '@/app/components/FotoInput'
import { useRole } from '@/features/auth/useRole'
import {
  useAtualizarProduto, useCodigoProdutoPreview, useCriarProduto, useProduto,
} from '@/features/produtos/hooks/useProdutos'
import { CATEGORIAS, UNIDADES } from '@/features/produtos/components/produtoUi'
import type { ProductCategory, Unit } from '@/app/types'

type Form = {
  name: string
  category: ProductCategory
  unit: Unit
  initialStock: string
  minStock: string
  unitCost: string
  localizacao: string
  notes: string
  fotoPath: string | null
}

const VAZIO: Form = {
  name: '', category: 'outro', unit: 'unidade', initialStock: '', minStock: '', unitCost: '',
  localizacao: '', notes: '', fotoPath: null,
}

type Erros = Partial<Record<'name' | 'initialStock' | 'minStock' | 'unitCost', string>>

function numero(valor: string): number | null {
  if (valor.trim() === '') return 0
  const n = Number(valor.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function validarProduto(f: Form, aCriar: boolean): Erros {
  const erros: Erros = {}
  if (!f.name.trim()) erros.name = 'Indique o nome do artigo.'
  if (aCriar) {
    const s = numero(f.initialStock)
    if (s == null || s < 0) erros.initialStock = 'O stock inicial não pode ser negativo.'
  }
  const m = numero(f.minStock)
  if (m == null || m < 0) erros.minStock = 'O stock mínimo não pode ser negativo.'
  const c = numero(f.unitCost)
  if (c == null || c < 0) erros.unitCost = 'O custo não pode ser negativo.'
  return erros
}

export function ProdutoFormPage() {
  const { id: idRota } = useParams()
  const aEditar = !!idRota
  const navigate = useNavigate()
  const { podeArmazem } = useRole()

  // Ao criar, o id nasce aqui para a foto ir logo para produtos/<id>/ (a política do bucket exige-o)
  const [idNovo] = useState(() => crypto.randomUUID())
  const id = idRota ?? idNovo

  const { product, loading: aCarregar } = useProduto(idRota)
  const { codigo, loading: aGerarCodigo } = useCodigoProdutoPreview(!aEditar)
  const { criar, loading: aCriar } = useCriarProduto()
  const { atualizar, loading: aAtualizar } = useAtualizarProduto()

  const [form, setForm] = useState<Form>(VAZIO)
  const [erros, setErros] = useState<Erros>({})
  const [carregado, setCarregado] = useState(false)

  // Preenche o formulário uma única vez, para não apagar o que já se escreveu se a ficha recarregar
  useEffect(() => {
    if (!product || carregado) return
    setForm({
      name: product.name,
      category: product.category,
      unit: product.unit,
      initialStock: '',
      minStock: String(product.minStock),
      unitCost: String(product.unitCost ?? 0),
      localizacao: product.localizacao ?? '',
      notes: product.notes ?? '',
      fotoPath: product.fotoPath,
    })
    setCarregado(true)
  }, [product, carregado])

  const a = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm(f => ({ ...f, [k]: v }))
    if (k in erros) setErros(e => ({ ...e, [k]: undefined }))
  }

  const voltar = aEditar ? `/armazem/produto/${idRota}` : '/armazem/inventario'
  const aGuardar = aCriar || aAtualizar

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    const encontrados = validarProduto(form, !aEditar)
    setErros(encontrados)
    if (Object.values(encontrados).some(Boolean)) return

    const comum = {
      name: form.name.trim(),
      category: form.category,
      unit: form.unit,
      minStock: numero(form.minStock) ?? 0,
      unitCost: numero(form.unitCost) ?? 0,
      localizacao: form.localizacao.trim() || null,
      fotoPath: form.fotoPath,
    }
    const resultado = aEditar
      ? await atualizar(id, { ...comum, notes: form.notes.trim() })
      : await criar({ ...comum, id, currentStock: numero(form.initialStock) ?? 0, notes: form.notes.trim() || undefined })

    if (resultado) {
      toast.success(aEditar ? 'Artigo atualizado.' : 'Artigo criado.')
      navigate(`/armazem/produto/${resultado.id}`)
    } else {
      toast.error(aEditar ? 'Não foi possível guardar as alterações.' : 'Não foi possível criar o artigo. Verifique a ligação e tente outra vez.')
    }
  }

  if (!podeArmazem) {
    return (
      <div className="max-w-2xl mx-auto bg-card rounded-2xl border border-border p-8 text-center">
        <p className="font-semibold">Sem permissão</p>
        <p className="text-sm text-muted-foreground mt-1">Só o armazém e a gestão podem criar ou alterar artigos.</p>
        <Link to="/armazem/inventario" className="inline-block mt-4 text-sm text-primary hover:underline">Voltar ao inventário</Link>
      </div>
    )
  }

  if (aEditar && aCarregar && !carregado) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" aria-label="A carregar" />
      </div>
    )
  }

  if (aEditar && !aCarregar && !product) {
    return (
      <div className="max-w-2xl mx-auto bg-card rounded-2xl border border-border p-8 text-center">
        <p className="font-semibold">Artigo não encontrado</p>
        <Link to="/armazem/inventario" className="inline-block mt-4 text-sm text-primary hover:underline">Voltar ao inventário</Link>
      </div>
    )
  }

  const campo = 'w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-base'
  const rotulo = 'block text-sm font-medium mb-1.5'
  const erroCls = 'text-xs text-destructive mt-1'
  const opcional = <span className="text-muted-foreground font-normal text-xs">(opcional)</span>

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-28 md:pb-8">
      <div className="flex items-center gap-3">
        <Link to={voltar} aria-label="Voltar" className="p-2 -ml-2 rounded-xl hover:bg-accent transition-colors">
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold truncate">{aEditar ? 'Editar artigo' : 'Novo artigo'}</h1>
          <p className="text-sm text-muted-foreground truncate">{aEditar ? product?.name : 'Adicionar um artigo ao armazém'}</p>
        </div>
      </div>

      <form onSubmit={guardar} noValidate className="space-y-4">
        <section className="bg-card rounded-2xl border border-border p-4 sm:p-5">
          <FotoInput dono={{ tipo: 'produtos', id }} valor={form.fotoPath} onChange={c => a('fotoPath', c)} rotulo="Foto do artigo" desativado={aGuardar} />
        </section>

        <section className="bg-card rounded-2xl border border-border p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="pf-codigo" className={rotulo}>
                Código <span className="text-muted-foreground font-normal text-xs">({aEditar ? 'fixo' : 'gerado automaticamente'})</span>
              </label>
              <input id="pf-codigo" type="text" readOnly disabled
                value={aEditar ? product?.code ?? '' : aGerarCodigo ? 'A gerar…' : codigo}
                className={`${campo} bg-muted text-muted-foreground cursor-not-allowed`} />
            </div>
            <div>
              <label htmlFor="pf-nome" className={rotulo}>Nome <span className="text-destructive">*</span></label>
              <input id="pf-nome" type="text" value={form.name} onChange={e => a('name', e.target.value)}
                className={campo} placeholder="Ex.: Cimento Portland 25 kg" aria-invalid={!!erros.name} autoComplete="off" />
              {erros.name && <p role="alert" className={erroCls}>{erros.name}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="pf-categoria" className={rotulo}>Categoria</label>
              <select id="pf-categoria" value={form.category} onChange={e => a('category', e.target.value as ProductCategory)} className={campo}>
                {CATEGORIAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="pf-unidade" className={rotulo}>Unidade</label>
              <select id="pf-unidade" value={form.unit} onChange={e => a('unit', e.target.value as Unit)} className={campo}>
                {UNIDADES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
        </section>

        <section className="bg-card rounded-2xl border border-border p-4 sm:p-5 space-y-4">
          {aEditar ? (
            <div className="flex items-start gap-3 p-3.5 bg-info/5 border border-info/20 rounded-xl">
              <Info className="w-4 h-4 text-info shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-info leading-relaxed">
                <strong>Stock atual: {product?.currentStock}</strong> — o stock só muda com uma entrada, saída ou acerto de inventário.
              </p>
            </div>
          ) : null}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {!aEditar && (
              <div>
                <label htmlFor="pf-stock" className={rotulo}>Stock inicial</label>
                <input id="pf-stock" type="number" inputMode="decimal" min="0" step="0.01" value={form.initialStock}
                  onChange={e => a('initialStock', e.target.value)} className={campo} placeholder="0" aria-invalid={!!erros.initialStock} />
                {erros.initialStock && <p role="alert" className={erroCls}>{erros.initialStock}</p>}
              </div>
            )}
            <div>
              <label htmlFor="pf-minimo" className={rotulo}>Stock mínimo</label>
              <input id="pf-minimo" type="number" inputMode="decimal" min="0" step="0.01" value={form.minStock}
                onChange={e => a('minStock', e.target.value)} className={campo} placeholder="0" aria-invalid={!!erros.minStock} />
              {erros.minStock ? <p role="alert" className={erroCls}>{erros.minStock}</p> : <p className="text-xs text-muted-foreground mt-1">Abaixo disto, o artigo fica em alerta.</p>}
            </div>
            <div>
              <label htmlFor="pf-custo" className={rotulo}>Custo unitário (€)</label>
              <input id="pf-custo" type="number" inputMode="decimal" min="0" step="0.0001" value={form.unitCost}
                onChange={e => a('unitCost', e.target.value)} className={campo} placeholder="0,00" aria-invalid={!!erros.unitCost} />
              {erros.unitCost && <p role="alert" className={erroCls}>{erros.unitCost}</p>}
            </div>
          </div>
        </section>

        <section className="bg-card rounded-2xl border border-border p-4 sm:p-5 space-y-4">
          <div>
            <label htmlFor="pf-local" className={rotulo}>Localização no armazém {opcional}</label>
            <input id="pf-local" type="text" value={form.localizacao} onChange={e => a('localizacao', e.target.value)}
              className={campo} placeholder="Ex.: Corredor B · Prateleira 3" autoComplete="off" />
          </div>
          <div>
            <label htmlFor="pf-obs" className={rotulo}>Observações {opcional}</label>
            <textarea id="pf-obs" value={form.notes} onChange={e => a('notes', e.target.value)} rows={3}
              className={`${campo} resize-none`} placeholder="Fornecedor habitual, referência, etc." />
          </div>
        </section>

        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
          <Link to={voltar}
            className="sm:flex-1 inline-flex items-center justify-center py-3.5 rounded-xl border border-border font-medium hover:bg-accent transition-colors">
            Cancelar
          </Link>
          <button type="submit" disabled={aGuardar || (!aEditar && aGerarCodigo)}
            className="sm:flex-[2] inline-flex items-center justify-center gap-2 py-3.5 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60">
            {aGuardar && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {aGuardar ? 'A guardar…' : aEditar ? 'Guardar alterações' : 'Criar artigo'}
          </button>
        </div>
      </form>
    </div>
  )
}
