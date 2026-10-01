import { supabase } from '@/integrations/supabase/client'
import { reduzirFoto } from './reduzirFoto'

// Bucket "armazem" (migration 20261001000000). Caminhos aceites pela política:
//   produtos/<produto>/<n>.<ext>      ferramentas/<ferramenta>/<prefixo><n>.<ext>
// O artigo pode ainda não existir (a foto tira-se no formulário de criação):
// gera-se o id no browser e usa-se o mesmo id no INSERT.
const BUCKET = 'armazem'

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
}

export type DonoFoto = { tipo: 'produtos' | 'ferramentas'; id: string; prefixo?: 'entrega_' | 'devolucao_' | '' }

export function caminhoFotoArmazem(dono: DonoFoto, mime: string, agora = Date.now()): { caminho: string; contentType: string } {
  const ext = EXT[mime] ?? 'jpg'
  const contentType = EXT[mime] ? mime : 'image/jpeg'
  const prefixo = dono.tipo === 'ferramentas' ? dono.prefixo ?? '' : ''
  return { caminho: `${dono.tipo}/${dono.id}/${prefixo}${agora}.${ext}`, contentType }
}

export function urlFotoArmazem(caminho: string | null | undefined): string | null {
  return caminho ? supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl : null
}

// Reduz (1600 px) e envia; devolve o caminho no bucket
export async function enviarFotoArmazem(dono: DonoFoto, foto: File): Promise<string> {
  const envio = await reduzirFoto(foto)
  const { caminho, contentType } = caminhoFotoArmazem(dono, envio.type)
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, envio, { contentType, upsert: false })
  if (error) throw new Error('Não foi possível enviar a foto. Verifique a ligação e tente outra vez.')
  return caminho
}
