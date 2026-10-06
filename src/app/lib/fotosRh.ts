import { supabase } from '@/integrations/supabase/client'
import { reduzirFoto } from './reduzirFoto'

// Bucket "rh" (migration 20261007000000). Caminhos aceites pela política:
//   perfis/<utilizador>/<n>.<ext>      colaboradores/<ficha>/<n>.<ext>
const BUCKET = 'rh'

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
}

export type DonoFotoRh = { tipo: 'perfis' | 'colaboradores'; id: string }

export function caminhoFotoRh(dono: DonoFotoRh, mime: string, agora = Date.now()): { caminho: string; contentType: string } {
  const ext = EXT[mime] ?? 'jpg'
  return { caminho: `${dono.tipo}/${dono.id}/${agora}.${ext}`, contentType: EXT[mime] ? mime : 'image/jpeg' }
}

export function urlFotoRh(caminho: string | null | undefined): string | null {
  return caminho ? supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl : null
}

export async function enviarFotoRh(dono: DonoFotoRh, foto: File): Promise<string> {
  const envio = await reduzirFoto(foto)
  const { caminho, contentType } = caminhoFotoRh(dono, envio.type)
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, envio, { contentType, upsert: false })
  if (error) throw new Error('Não foi possível enviar a foto. Verifique a ligação e tente outra vez.')
  return caminho
}
