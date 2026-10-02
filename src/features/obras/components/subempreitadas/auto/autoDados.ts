import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'
import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import { reduzirFoto } from '@/app/lib/reduzirFoto'
import { obrasDb, type AutoLinhaMedicaoRow, type WorkflowAuto } from '../../../db'
import { caminhoFotoObra } from '../../../lib/fotosObras'

// Acesso a dados que a fundação (T3) e o serviço legado ainda não cobrem:
// `qtd_pedida`/`justificacao` das linhas, uploads com hash e a fatura do
// subempreiteiro. A mover para `legacy/autosService` na integração (T8).

const BUCKET_FOTOS = 'obras'
const BUCKET_PRIVADO = 'obras-contratos'
const MAX_FATURA_BYTES = 20 * 1024 * 1024
const EXT_FATURA: Record<string, string> = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
}

export const WORKFLOW_CONTA_ACUMULADO: WorkflowAuto[] = ['submetido', 'verificado', 'validado']

// ── Linhas do auto (com quantidade pedida e justificação) ───────────────────
type LinhaInsert = {
  auto_id: string
  artigo_id: string | null
  descricao: string
  unidade: string
  preco_unitario: number
  quantidade: number
  is_extra: boolean
  qtd_pedida: number | null
  justificacao: string | null
}

// Os tipos gerados ainda não têm as colunas da Migration B; declarado no
// mesmo formato que `obrasDb` para não recorrer a `as any`.
type LinhasDatabase = {
  __InternalSupabase: { PostgrestVersion: '14.5' }
  public: {
    Tables: { auto_linhas: { Row: AutoLinhaMedicaoRow; Insert: LinhaInsert; Update: never; Relationships: [] } }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
const linhasDb = supabase as unknown as SupabaseClient<LinhasDatabase>

export type LinhaGravar = {
  artigoId: string | null
  descricao: string
  unidade: string
  precoUnitario: number
  quantidade: number
  qtdPedida: number | null
  isExtra: boolean
  justificacao: string | null
}

export async function guardarLinhasAuto(autoId: string, linhas: LinhaGravar[]): Promise<true> {
  const { error: delError } = await linhasDb.from('auto_linhas').delete().eq('auto_id', autoId)
  if (delError) throw delError
  if (linhas.length > 0) {
    const { error } = await linhasDb.from('auto_linhas').insert(linhas.map(l => ({
      auto_id: autoId,
      artigo_id: l.artigoId,
      descricao: l.descricao,
      unidade: l.unidade,
      preco_unitario: l.precoUnitario,
      quantidade: l.quantidade,
      is_extra: l.isExtra,
      qtd_pedida: l.qtdPedida,
      justificacao: l.justificacao,
    })))
    if (error) throw error
  }
  return true
}

export async function listarLinhasMedicao(autoId: string): Promise<AutoLinhaMedicaoRow[]> {
  const { data, error } = await obrasDb.from('auto_linhas').select('*').eq('auto_id', autoId)
  if (error) throw error
  return data ?? []
}

export function useLinhasMedicao(autoId: string | undefined) {
  const { data, loading, error } = useAsync(
    () => listarLinhasMedicao(autoId!), [autoId],
    { enabled: !!autoId, errorMsg: 'Erro ao carregar as linhas do auto', cacheKey: autoId ? `auto-linhas-${autoId}` : undefined },
  )
  return { linhas: data ?? [], loading, error }
}

export function useGuardarLinhasAuto() {
  const m = useMutation(guardarLinhasAuto, 'Erro ao guardar as linhas do auto', {
    invalidates: ['auto-*', 'autos-*', 'subs-resumo-*', 'sub-painel-*', 'subs-ceo-*', 'subs-fluxo-*', 'orcamento-*'],
  })
  const guardar = async (autoId: string, linhas: LinhaGravar[]) => (await m.mutate(autoId, linhas)) === true
  return { guardar, loading: m.loading, error: m.error }
}

type AutoParaAcumulado = { id: string; workflow: WorkflowAuto; lines?: { itemId?: string; quantity: number; isExtra: boolean }[] }

/** Quantidade já medida por artigo noutros autos que já saíram do rascunho (espelha `auto_submeter`). */
export function acumuladoOutrosAutos(autos: AutoParaAcumulado[], excluirId: string | undefined): Record<string, number> {
  const mapa: Record<string, number> = {}
  for (const a of autos) {
    if (a.id === excluirId || !WORKFLOW_CONTA_ACUMULADO.includes(a.workflow)) continue
    for (const l of a.lines ?? []) {
      if (l.itemId && !l.isExtra) mapa[l.itemId] = (mapa[l.itemId] ?? 0) + l.quantity
    }
  }
  return mapa
}

// ── Evidências: GPS, hash e envio ───────────────────────────────────────────
export type PosicaoGps = { lat: number; lon: number; precisaoM: number }

export function obterGps(): Promise<PosicaoGps | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null)
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: Math.round(pos.coords.latitude * 1e6) / 1e6,
        lon: Math.round(pos.coords.longitude * 1e6) / 1e6,
        precisaoM: Math.round(pos.coords.accuracy * 100) / 100,
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  })
}

export async function hashSha256(ficheiro: Blob): Promise<string> {
  const buffer = await ficheiro.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** O hash é da imagem reduzida — é exatamente o ficheiro que fica guardado. */
export async function prepararEvidencia(foto: File): Promise<{ ficheiro: File; hash: string }> {
  const ficheiro = await reduzirFoto(foto)
  return { ficheiro, hash: await hashSha256(ficheiro) }
}

export async function enviarEvidencia(obraId: string, ficheiro: File): Promise<string> {
  const { caminho, contentType } = caminhoFotoObra(obraId, 'autos', ficheiro.type)
  const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(caminho, ficheiro, { contentType, upsert: false })
  if (error) throw new Error('Não foi possível enviar a fotografia. Verifique a ligação e tente outra vez.')
  return caminho
}

// ── Fatura do subempreiteiro (guardada, nunca emitida) ──────────────────────
export function caminhoFatura(subId: string, mime: string, agora = Date.now()): { caminho: string; contentType: string } | null {
  const ext = EXT_FATURA[mime]
  return ext ? { caminho: `${subId}/fatura-${agora}.${ext}`, contentType: mime } : null
}

export async function enviarFatura(subId: string, ficheiro: File): Promise<{ path: string; nome: string }> {
  if (ficheiro.size > MAX_FATURA_BYTES) throw new Error('O ficheiro da fatura tem mais de 20 MB.')
  const destino = caminhoFatura(subId, ficheiro.type)
  if (!destino) throw new Error('A fatura tem de ser um PDF ou uma fotografia.')
  const { error } = await supabase.storage.from(BUCKET_PRIVADO).upload(destino.caminho, ficheiro, { contentType: destino.contentType, upsert: false })
  if (error) throw new Error('Não foi possível enviar a fatura. Verifique a ligação e tente outra vez.')
  return { path: destino.caminho, nome: ficheiro.name }
}

export async function urlAssinadaFatura(caminho: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET_PRIVADO).createSignedUrl(caminho, 60)
  if (error || !data) throw new Error('Não foi possível abrir a fatura.')
  return data.signedUrl
}
