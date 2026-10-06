// Validação de entrada das Edge Functions, sem dependências. Campos fora do
// esquema são descartados; mensagens em pt-PT.
export type Regra =
  | { tipo: 'texto'; obrigatorio?: boolean; min?: number; max?: number; padrao?: RegExp }
  | { tipo: 'email'; obrigatorio?: boolean }
  | { tipo: 'uuid'; obrigatorio?: boolean }
  | { tipo: 'enum'; valores: readonly string[]; obrigatorio?: boolean }
  | { tipo: 'numero'; obrigatorio?: boolean; min?: number; max?: number }
  | { tipo: 'booleano'; obrigatorio?: boolean }
export type Esquema = Record<string, Regra>
export type ResultadoValidacao = { ok: true; valor: Record<string, unknown> } | { ok: false; erro: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/

function valido(r: Regra, v: unknown): boolean {
  switch (r.tipo) {
    case 'texto':
      return typeof v === 'string' && v.length >= (r.min ?? 0) && v.length <= (r.max ?? 1000) && (!r.padrao || r.padrao.test(v))
    case 'email': return typeof v === 'string' && v.length <= 254 && EMAIL.test(v)
    case 'uuid': return typeof v === 'string' && UUID.test(v)
    case 'enum': return typeof v === 'string' && r.valores.includes(v)
    case 'numero':
      return typeof v === 'number' && Number.isFinite(v) && v >= (r.min ?? -Infinity) && v <= (r.max ?? Infinity)
    case 'booleano': return typeof v === 'boolean'
  }
}

export function validar(esquema: Esquema, entrada: unknown): ResultadoValidacao {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return { ok: false, erro: 'Pedido inválido.' }
  const obj = entrada as Record<string, unknown>
  const valor: Record<string, unknown> = {}
  for (const [campo, regra] of Object.entries(esquema)) {
    const v = obj[campo]
    if (v === undefined || v === null) {
      if (regra.obrigatorio) return { ok: false, erro: `Campo "${campo}" obrigatório.` }
      continue
    }
    if (!valido(regra, v)) return { ok: false, erro: `Campo "${campo}" inválido.` }
    valor[campo] = v
  }
  return { ok: true, valor }
}
