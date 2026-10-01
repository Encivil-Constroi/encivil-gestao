import { supabase } from '@/integrations/supabase/client'
import { reduzirFoto } from '@/app/lib/reduzirFoto'

// Bucket "frota-docs": viaturas/<viatura>/<seguro_|ipo_><n>.<ext> (política foto_frota_doc_valida).
// A viatura pode ainda não existir: o id gera-se no browser e é o mesmo do INSERT.
const BUCKET = 'frota-docs'

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
}

export type DocumentoFoto = 'seguro' | 'ipo'

export function caminhoFotoDocumento(viaturaId: string, doc: DocumentoFoto, mime: string, agora = Date.now()): { caminho: string; contentType: string } {
  const ext = EXT[mime] ?? 'jpg'
  return { caminho: `viaturas/${viaturaId}/${doc}_${agora}.${ext}`, contentType: EXT[mime] ? mime : 'image/jpeg' }
}

export function urlFotoDocumento(caminho: string | null | undefined): string | null {
  return caminho ? supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl : null
}

export async function enviarFotoDocumento(viaturaId: string, doc: DocumentoFoto, foto: File): Promise<string> {
  const envio = await reduzirFoto(foto)
  const { caminho, contentType } = caminhoFotoDocumento(viaturaId, doc, envio.type)
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, envio, { contentType, upsert: false })
  if (error) throw new Error('Não foi possível enviar a foto. Verifique a ligação e tente outra vez.')
  return caminho
}
