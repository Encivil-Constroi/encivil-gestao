import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import {
  ArrowLeft, FileText, Loader2, AlertCircle,
  CheckCircle, ExternalLink, Tag, Bot,
  Package, Hammer, Wrench, CircleHelp, Send,
  ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAsync }   from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import type { LinhaFatura, DestinoLinha } from '@/app/types'
import {
  buscarFatura,
  lancarFatura,
  classificarFatura,
  type ClassificarLinhaInput,
} from '../services/faturasService'

// ── Produtos disponíveis para selecionar ─────────────────────────────────────
// Importamos diretamente o serviço de produtos para o autocomplete
import { supabase } from '@/integrations/supabase/client'

async function listarProdutosSimples(): Promise<{ id: string; nome: string; codigo: string }[]> {
  const { data, error } = await supabase
    .from('produtos')
    .select('id, nome, codigo')
    .eq('ativo', true)
    .order('nome', { ascending: true })
  if (error) throw error
  return (data as { id: string; nome: string; codigo: string }[])
}

// ── Destino badge/select ──────────────────────────────────────────────────────

const DESTINO_META: Record<DestinoLinha, { label: string; icon: typeof Package; cls: string }> = {
  ARMAZEM:     { label: 'Armazém',     icon: Package,     cls: 'text-blue-600 dark:text-blue-400'   },
  OBRA:        { label: 'Obra',        icon: Hammer,      cls: 'text-orange-600 dark:text-orange-400' },
  SERVICO:     { label: 'Serviço',     icon: Wrench,      cls: 'text-violet-600 dark:text-violet-400' },
  DESCONHECIDO:{ label: 'Desconhecido',icon: CircleHelp,  cls: 'text-muted-foreground'              },
}

// ── Estado local de cada linha editável ──────────────────────────────────────

type LinhaState = {
  id:       string
  destino:  DestinoLinha
  artigoId: string
  confianca: number
}

function confiancaLabel(c?: number): { label: string; cls: string } {
  if (c == null)  return { label: 'Sem regra',   cls: 'text-muted-foreground' }
  if (c >= 0.8)   return { label: 'Alta',         cls: 'text-success'          }
  if (c >= 0.5)   return { label: 'Média',        cls: 'text-amber-600 dark:text-amber-400' }
  return            { label: 'Baixa',        cls: 'text-destructive'      }
}

// ── Linha individual ──────────────────────────────────────────────────────────

function LinhaRow({ linha, state, produtos, onChange, readonly }: {
  linha:    LinhaFatura
  state:    LinhaState
  produtos: { id: string; nome: string; codigo: string }[]
  onChange: (patch: Partial<LinhaState>) => void
  readonly: boolean
}) {
  const metaDest = DESTINO_META[state.destino]
  const DestIcon = metaDest.icon
  const conf     = confiancaLabel(linha.confianca)

  return (
    <div className={`bg-card border rounded-xl p-3.5 transition-all ${
      linha.lancado ? 'border-success/30 bg-success/3' : 'border-border'
    }`}>
      {/* Descrição + confiança */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{linha.descricao}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {linha.quantidade != null && `${linha.quantidade} ${linha.unidade ?? ''}`}
            {linha.totalLinha != null && (
              <span className="ml-2 font-medium text-foreground">
                {new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(linha.totalLinha)}
              </span>
            )}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          {linha.lancado && <CheckCircle className="w-4 h-4 text-success" />}
          <span className={`text-[10px] font-medium ${conf.cls}`}>{conf.label}</span>
        </div>
      </div>

      {/* Controlos de classificação */}
      {!readonly && (
        <div className="flex gap-2">
          {/* Destino */}
          <div className="relative">
            <select
              value={state.destino}
              onChange={e => onChange({ destino: e.target.value as DestinoLinha })}
              className="appearance-none pl-7 pr-6 py-1.5 text-xs border border-input rounded-lg bg-input-background focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >
              {(Object.keys(DESTINO_META) as DestinoLinha[]).map(d => (
                <option key={d} value={d}>{DESTINO_META[d].label}</option>
              ))}
            </select>
            <DestIcon className={`absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none ${metaDest.cls}`} />
            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none text-muted-foreground" />
          </div>

          {/* Artigo — só quando ARMAZEM */}
          {state.destino === 'ARMAZEM' && (
            <select
              value={state.artigoId}
              onChange={e => onChange({ artigoId: e.target.value })}
              className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-input rounded-lg bg-input-background focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">— Selecionar artigo —</option>
              {produtos.map(p => (
                <option key={p.id} value={p.id}>[{p.codigo}] {p.nome}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Artigo selecionado (só leitura quando lançado) */}
      {readonly && state.artigoId && (
        <p className="text-xs text-muted-foreground mt-1">
          {DESTINO_META[state.destino].label}
          {state.artigoId && ` · ${produtos.find(p => p.id === state.artigoId)?.nome ?? state.artigoId}`}
        </p>
      )}
    </div>
  )
}

// ── Painel lateral de linhas ──────────────────────────────────────────────────

function LinhasPanel({ fatura, produtos, states, onChange, onGuardar, onLancar, guardando, lancando }: {
  fatura:     Awaited<ReturnType<typeof buscarFatura>>
  produtos:   { id: string; nome: string; codigo: string }[]
  states:     LinhaState[]
  onChange:   (id: string, patch: Partial<LinhaState>) => void
  onGuardar:  () => void
  onLancar:   () => void
  guardando:  boolean
  lancando:   boolean
}) {
  const readonly = fatura.estado === 'LANCADA'
  const linhas   = fatura.linhas ?? []

  const nDesconhecidas = states.filter(s => s.destino === 'DESCONHECIDO').length
  const nArmazemSemArtigo = states.filter(s => s.destino === 'ARMAZEM' && !s.artigoId).length
  const canLancar = fatura.estado === 'CLASSIFICADA' && nDesconhecidas === 0

  // Estatísticas rápidas
  const contagens = states.reduce<Record<DestinoLinha, number>>(
    (a, s) => { a[s.destino]++; return a },
    { ARMAZEM: 0, OBRA: 0, SERVICO: 0, DESCONHECIDO: 0 }
  )

  return (
    <div className="flex flex-col h-full">
      {/* Resumo */}
      <div className="p-4 border-b border-border bg-accent/30">
        <div className="flex flex-wrap gap-2 text-xs">
          {(Object.entries(contagens) as [DestinoLinha, number][]).filter(([,n]) => n > 0).map(([dest, n]) => {
            const m = DESTINO_META[dest]
            const I = m.icon
            return (
              <span key={dest} className={`flex items-center gap-1 font-medium ${m.cls}`}>
                <I className="w-3 h-3" />{n} {m.label}
              </span>
            )
          })}
        </div>
        {nDesconhecidas > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">
            {nDesconhecidas} linha{nDesconhecidas !== 1 ? 's' : ''} por classificar
          </p>
        )}
      </div>

      {/* Lista de linhas */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {linhas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Bot className="w-8 h-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma linha extraída</p>
          </div>
        ) : (
          linhas.map(l => {
            const s = states.find(x => x.id === l.id)
            if (!s) return null
            return (
              <LinhaRow
                key={l.id}
                linha={l}
                state={s}
                produtos={produtos}
                onChange={patch => onChange(l.id, patch)}
                readonly={readonly}
              />
            )
          })
        )}
      </div>

      {/* Acções */}
      {!readonly && linhas.length > 0 && (
        <div className="p-4 border-t border-border space-y-2">
          {nArmazemSemArtigo > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
              {nArmazemSemArtigo} linha{nArmazemSemArtigo !== 1 ? 's' : ''} ARMAZEM sem artigo selecionado
            </p>
          )}
          <button
            onClick={onGuardar}
            disabled={guardando}
            className="w-full flex items-center justify-center gap-2 py-2.5 border border-border rounded-xl text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
          >
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Tag className="w-4 h-4" />}
            {guardando ? 'A guardar…' : 'Guardar Classificação'}
          </button>
          {fatura.estado === 'CLASSIFICADA' && (
            <button
              onClick={onLancar}
              disabled={lancando || !canLancar}
              title={nDesconhecidas > 0 ? 'Classifica todas as linhas antes de lançar' : undefined}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-success text-white rounded-xl text-sm font-medium hover:bg-success/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {lancando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {lancando ? 'A lançar em stock…' : 'Lançar em Stock'}
            </button>
          )}
        </div>
      )}

      {readonly && (
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-2 justify-center text-sm text-success">
            <CheckCircle className="w-4 h-4" />
            Fatura lançada em stock
          </div>
        </div>
      )}
    </div>
  )
}

// ── Painel de PDF/imagem ──────────────────────────────────────────────────────

function DocumentPanel({ url, path }: { url?: string; path?: string }) {
  const ext = path?.split('.').pop()?.toLowerCase()
  const isImage = ext && ['jpg', 'jpeg', 'png', 'webp'].includes(ext)

  if (!url) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Documento não disponível</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 bg-black/60 hover:bg-black/80 text-white rounded-lg text-xs transition-colors"
      >
        <ExternalLink className="w-3 h-3" /> Abrir
      </a>
      {isImage ? (
        <img
          src={url}
          alt="Fatura"
          className="w-full h-full object-contain bg-muted/30"
        />
      ) : (
        <iframe
          src={url}
          title="Fatura PDF"
          className="w-full h-full border-0"
          allow="fullscreen"
        />
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export function ClassificarFaturaPage() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [mobileTab, setMobileTab] = useState<'doc' | 'linhas'>('linhas')
  const [linhaStates, setLinhaStates] = useState<LinhaState[]>([])
  const [inicializado, setInicializado] = useState(false)

  const { data: fatura, loading, error } = useAsync(
    () => buscarFatura(id!),
    [id],
    { enabled: !!id, errorMsg: 'Erro ao carregar fatura' }
  )

  const { data: produtos } = useAsync(
    listarProdutosSimples, [],
    { errorMsg: 'Erro ao carregar produtos' }
  )

  const { mutate: guardarMut, loading: guardando } = useMutation(
    (linhas: ClassificarLinhaInput[]) => classificarFatura(id!, linhas),
    'Erro ao guardar classificação'
  )

  const { mutate: lancarMut, loading: lancando } = useMutation(
    (responsavel: string) => lancarFatura(id!, responsavel),
    'Erro ao lançar fatura'
  )

  // Inicializar estado local das linhas quando a fatura carrega
  useEffect(() => {
    if (!fatura?.linhas || inicializado) return
    setLinhaStates(fatura.linhas.map(l => ({
      id:        l.id,
      destino:   l.destino,
      artigoId:  l.artigoId ?? '',
      confianca: l.confianca ?? 0,
    })))
    setInicializado(true)
  }, [fatura, inicializado])

  const handleChange = (id: string, patch: Partial<LinhaState>) => {
    setLinhaStates(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
  }

  const handleGuardar = async () => {
    const linhas: ClassificarLinhaInput[] = linhaStates.map(s => ({
      id:         s.id,
      destino:    s.destino,
      artigo_id:  s.artigoId || undefined,
      confianca:  s.destino !== 'DESCONHECIDO' ? 0.9 : 0.1,
    }))
    const result = await guardarMut(linhas)
    if (result !== null) {
      toast.success('Classificação guardada e regras de aprendizagem actualizadas.')
    }
  }

  const handleLancar = async () => {
    if (!confirm('Lançar as linhas ARMAZEM em stock? Esta acção cria movimentos de entrada e não pode ser desfeita.')) return
    const { data: { user } } = await (await import('@/integrations/supabase/client')).supabase.auth.getUser()
    const responsavel = user?.email ?? 'Sistema'
    const result = await lancarMut(responsavel)
    if (result !== null) {
      toast.success('Fatura lançada em stock com sucesso!')
      navigate('/faturas')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !fatura) {
    return (
      <div className="space-y-4">
        <Link to="/faturas" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar às faturas
        </Link>
        <div className="flex items-center gap-2 p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error ?? 'Fatura não encontrada'}
        </div>
      </div>
    )
  }

  const estadoMeta = {
    RECEBIDA:     'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    EXTRAIDA:     'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    CLASSIFICADA: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
    LANCADA:      'bg-success/15 text-success',
  }[fatura.estado]

  const produtosLista = produtos ?? []

  return (
    <div className="flex flex-col h-[calc(100dvh-8rem)] md:h-[calc(100dvh-7rem)] -m-4 md:-m-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-border bg-background shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link to="/faturas" className="p-1.5 rounded-lg hover:bg-accent transition-colors shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold truncate text-sm md:text-base">{fatura.fornecedor}</p>
              <span className={`hidden sm:inline text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${estadoMeta}`}>
                {fatura.estado}
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {fatura.numeroFatura && `Nº ${fatura.numeroFatura} · `}
              {fatura.totalFatura != null && new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(fatura.totalFatura)}
            </p>
          </div>
        </div>

        {/* Tabs mobile */}
        <div className="flex md:hidden gap-1 shrink-0">
          <button
            onClick={() => setMobileTab('doc')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              mobileTab === 'doc' ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground'
            }`}
          >
            PDF
          </button>
          <button
            onClick={() => setMobileTab('linhas')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
              mobileTab === 'linhas' ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground'
            }`}
          >
            Linhas
            {linhaStates.filter(s => s.destino === 'DESCONHECIDO').length > 0 && (
              <span className="w-4 h-4 bg-amber-500 text-white rounded-full text-[10px] flex items-center justify-center leading-none">
                {linhaStates.filter(s => s.destino === 'DESCONHECIDO').length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Corpo: split-view */}
      <div className="flex flex-1 min-h-0">
        {/* Painel PDF — desktop: sempre visível; mobile: tab 'doc' */}
        <div className={`${mobileTab === 'doc' ? 'flex' : 'hidden'} md:flex flex-col md:w-[55%] border-r border-border`}>
          <DocumentPanel url={fatura.ficheiroUrl} path={fatura.ficheiroPatch} />
        </div>

        {/* Painel linhas — desktop: sempre visível; mobile: tab 'linhas' */}
        <div className={`${mobileTab === 'linhas' ? 'flex' : 'hidden'} md:flex flex-col flex-1 min-h-0`}>
          {fatura.estado === 'RECEBIDA' ? (
            <div className="flex items-center justify-center h-full p-6 text-center">
              <div>
                <Bot className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Esta fatura ainda não foi extraída. Usa o botão "Extrair com IA" na lista de faturas.
                </p>
              </div>
            </div>
          ) : (
            <LinhasPanel
              fatura={fatura}
              produtos={produtosLista}
              states={linhaStates}
              onChange={handleChange}
              onGuardar={handleGuardar}
              onLancar={handleLancar}
              guardando={guardando}
              lancando={lancando}
            />
          )}
        </div>
      </div>
    </div>
  )
}
