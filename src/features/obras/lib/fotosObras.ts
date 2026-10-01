import { supabase } from '@/integrations/supabase/client'
import { reduzirFoto } from '@/app/lib/reduzirFoto'
import type { FotoObra, PastaFotoObra } from '../db'

// Bucket público "obras": <obra_id>/<pasta>/<ts>-<rand>.<ext> (política foto_obra_valida).
// Contratos num bucket privado "obras-contratos": <subempreiteiro_id>/contrato-<ts>.<ext>,
// lidos por URL assinada de curta duração.
const BUCKET = 'obras'
const BUCKET_CONTRATOS = 'obras-contratos'
export const VALIDADE_URL_CONTRATO_S = 60

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
}
const EXT_CONTRATO: Record<string, string> = { 'application/pdf': 'pdf', ...EXT }

const aleatorio = () => Math.random().toString(36).slice(2, 8)

export function caminhoFotoObra(
  obraId: string, pasta: PastaFotoObra, mime: string, agora = Date.now(), rand = aleatorio(),
): { caminho: string; contentType: string } {
  const ext = EXT[mime] ?? 'jpg'
  return { caminho: `${obraId}/${pasta}/${agora}-${rand}.${ext}`, contentType: EXT[mime] ? mime : 'image/jpeg' }
}

export function urlFotoObra(caminho: string | null | undefined): string | null {
  return caminho ? supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl : null
}

// Reduz (1600 px) e envia; devolve a foto no formato guardado em jsonb
export async function enviarFotoObra(obraId: string, pasta: PastaFotoObra, foto: File, legenda: string | null = null): Promise<FotoObra> {
  const envio = await reduzirFoto(foto)
  const { caminho, contentType } = caminhoFotoObra(obraId, pasta, envio.type)
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, envio, { contentType, upsert: false })
  if (error) throw new Error('Não foi possível enviar a foto. Verifique a ligação e tente outra vez.')
  return { path: caminho, legenda }
}

export function caminhoContrato(
  subempreiteiroId: string, mime: string, agora = Date.now(),
): { caminho: string; contentType: string } {
  const ext = EXT_CONTRATO[mime]
  return { caminho: `${subempreiteiroId}/contrato-${agora}.${ext ?? 'pdf'}`, contentType: ext ? mime : 'application/pdf' }
}

export async function enviarContrato(subempreiteiroId: string, ficheiro: File): Promise<{ path: string; nome: string }> {
  if (ficheiro.size > 20 * 1024 * 1024) throw new Error('O contrato tem mais de 20 MB.')
  const { caminho, contentType } = caminhoContrato(subempreiteiroId, ficheiro.type)
  const { error } = await supabase.storage.from(BUCKET_CONTRATOS).upload(caminho, ficheiro, { contentType, upsert: false })
  if (error) throw new Error('Não foi possível enviar o contrato. Verifique a ligação e tente outra vez.')
  return { path: caminho, nome: ficheiro.name }
}

export async function urlAssinadaContrato(caminho: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET_CONTRATOS).createSignedUrl(caminho, VALIDADE_URL_CONTRATO_S)
  if (error || !data) throw new Error('Não foi possível abrir o contrato.')
  return data.signedUrl
}

export async function apagarFicheiroContrato(caminho: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET_CONTRATOS).remove([caminho])
  if (error) throw new Error('Não foi possível apagar o ficheiro do contrato.')
}
