// Tem de corresponder à política de upload do bucket combustivel-taloes
// (public.foto_abastecimento_valida — migration 20260929000000):
//   <viatura>/<AAAA-MM-DD>_<pedido>_<n>.<jpg|png|webp|heic|heif>
const EXT_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg':  'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
}

export function destinoFotoAbastecimento(
  veiculoId: string,
  pedidoId:  string,
  tipoMime:  string,
  agora = new Date(),
): { caminho: string; contentType: string } {
  // Extensão pelo MIME e não pelo nome: há telemóveis que entregam ficheiros sem extensão
  const ext = EXT_POR_MIME[tipoMime] ?? 'jpg'
  const contentType = EXT_POR_MIME[tipoMime] ? tipoMime : 'image/jpeg'
  const dia = agora.toISOString().slice(0, 10)
  // Nome único por tentativa: o upload é sem upsert (o bucket não é legível por anon)
  return { caminho: `${veiculoId}/${dia}_${pedidoId}_${agora.getTime()}.${ext}`, contentType }
}
