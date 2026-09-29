// Função e não objeto em manualChunks: na forma objeto o Rollup mete no chunk
// nomeado também as dependências partilhadas (React, clsx…) e o recharts
// (~550 KB) passava a ser carregado no arranque de todas as páginas, incluindo
// a página pública do motorista. Aqui só entram os pacotes listados; as
// dependências partilhadas ficam onde o Rollup as puser.
// O React tem chunk próprio para os vendor-* não o irem buscar à entrada
// (import circular entrada ↔ vendor).
const VENDOR_CHUNKS: ReadonlyArray<readonly [string, RegExp]> = [
  ['vendor-react', /^(react|react-dom|scheduler)$/],
  ['vendor-charts', /^(recharts|recharts-scale|react-smooth|victory-vendor|d3-.+|internmap|decimal\.js-light)$/],
  ['vendor-qrcode', /^qrcode\.react$/],
  ['vendor-radix', /^@radix-ui\//],
  ['vendor-supabase', /^@supabase\//],
]

const NM = '/node_modules/'

function pacote(id: string): string | undefined {
  const caminho = id.replace(/\\/g, '/')
  const i = caminho.lastIndexOf(NM)
  if (i < 0) return undefined
  const partes = caminho.slice(i + NM.length).split('/')
  return partes[0].startsWith('@') ? `${partes[0]}/${partes[1]}` : partes[0]
}

export function vendorChunk(id: string): string | undefined {
  const nome = pacote(id)
  if (!nome) return undefined
  return VENDOR_CHUNKS.find(([, re]) => re.test(nome))?.[0]
}
