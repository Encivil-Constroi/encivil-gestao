import { supabase } from '@/integrations/supabase/client'
import { reduzirFoto } from '@/app/lib/reduzirFoto'
import { destinoFotoAbastecimento } from '../lib/fotoAbastecimento'

const BUCKET = 'combustivel-taloes'

export function urlFotoCombustivel(caminho: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl
}

// Reduz (1600 px) e envia; devolve o caminho no bucket
export async function enviarFotoAbastecimento(veiculoId: string, pedidoId: string, foto: File): Promise<string> {
  const envio = await reduzirFoto(foto)
  const { caminho, contentType } = destinoFotoAbastecimento(veiculoId, pedidoId, envio.type)
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, envio, { contentType, upsert: false })
  if (error) throw new Error('Não foi possível enviar a foto. Verifique a ligação e tente outra vez.')
  return caminho
}

export type TipoLeitura = 'KM' | 'CONTADOR' | 'MEDIDOR' | 'TALAO'
export type LeituraIA = { valor: number | null; custo: number | null; confianca: 'alta' | 'media' | 'baixa' }

const numeroValido = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null

// Edge Function ler-foto-abastecimento. Nunca lança: sem leitura, a app pede o valor à mão
export async function lerFotoComIA(caminho: string, leitura: TipoLeitura): Promise<LeituraIA | null> {
  try {
    const { data, error } = await supabase.functions.invoke('ler-foto-abastecimento', {
      body: { foto_path: caminho, leitura },
    })
    if (error || !data || typeof data !== 'object') return null
    const r = data as { valor?: unknown; custo_total?: unknown; confianca?: unknown }
    const valor = numeroValido(r.valor)
    const confianca = r.confianca === 'alta' || r.confianca === 'media' ? r.confianca : 'baixa'
    return { valor, custo: numeroValido(r.custo_total), confianca: valor == null ? 'baixa' : confianca }
  } catch {
    return null
  }
}
