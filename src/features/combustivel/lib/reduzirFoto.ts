// Fotos de telemóvel têm 3–6 MB: sobem devagar por 4G, a Edge Function tem de as
// descarregar e a Gemini de as processar. 1600 px no lado maior chega para ler
// um talão ou um contador. Em qualquer falha (ex.: HEIC que o browser não
// descodifica) envia a original — nunca fica pior do que sem redução.
export const LADO_MAX = 1600
const QUALIDADE = 0.85

export function dimensoesReduzidas(
  largura: number, altura: number, max = LADO_MAX,
): { largura: number; altura: number } | null {
  const maior = Math.max(largura, altura)
  if (!(maior > max)) return null
  const f = max / maior
  return { largura: Math.round(largura * f), altura: Math.round(altura * f) }
}

type Imagem = { largura: number; altura: number; fonte: CanvasImageSource; libertar: () => void }

// <img> e não createImageBitmap: o <img> aplica a orientação EXIF em todos os
// browsers atuais (sem isto a foto do telemóvel podia ficar deitada)
function carregarImagem(file: Blob): Promise<Imagem> {
  const url = URL.createObjectURL(file)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({
      largura: img.naturalWidth, altura: img.naturalHeight, fonte: img,
      libertar: () => URL.revokeObjectURL(url),
    })
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagem ilegível')) }
    img.src = url
  })
}

function paraJpeg(img: Imagem, largura: number, altura: number): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = largura
  canvas.height = altura
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(null)
  ctx.drawImage(img.fonte, 0, 0, largura, altura)
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', QUALIDADE))
}

export async function reduzirFoto(
  file: File,
  deps: { carregar?: typeof carregarImagem; converter?: typeof paraJpeg } = {},
): Promise<File> {
  const { carregar = carregarImagem, converter = paraJpeg } = deps
  let img: Imagem | null = null
  try {
    img = await carregar(file)
    const d = dimensoesReduzidas(img.largura, img.altura)
    if (!d) return file
    const blob = await converter(img, d.largura, d.altura)
    if (!blob || blob.size === 0 || blob.size >= file.size) return file
    return new File([blob], 'foto.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  } finally {
    img?.libertar()
  }
}
