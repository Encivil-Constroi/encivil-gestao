// Semeia o Supabase LOCAL (Docker) com utilizadores e dados fictícios para validar fluxos com login.
// Lê API_URL e SERVICE_ROLE_KEY do ambiente (saída de `npx supabase status --workdir .supabase-local -o env`).
// Recusa correr contra qualquer coisa que não seja localhost: nunca toca em produção.
//   node supabase/scripts/semear-local.mjs
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'

const API_URL = (process.env.API_URL ?? '').trim()
const CHAVE = (process.env.SERVICE_ROLE_KEY ?? '').trim()
const CONTENTOR = process.env.DB_CONTAINER ?? 'supabase_db_encivil-local'

export function urlLocal(url) {
  return /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(url)
}

if (!urlLocal(API_URL)) {
  console.error(`Recusado: API_URL tem de começar por http://127.0.0.1 ou http://localhost (recebido: "${API_URL}")`)
  process.exit(1)
}
if (!CHAVE) {
  console.error('Falta SERVICE_ROLE_KEY no ambiente (ver npx supabase status --workdir .supabase-local -o env)')
  process.exit(1)
}

const UTILIZADORES = [
  { email: 'admin@local.test', nome: 'Admin Local', papel: 'admin' },
  { email: 'gestor@local.test', nome: 'Gestor Local', papel: 'gestor' },
  { email: 'armazem@local.test', nome: 'Armazém Local', papel: 'armazem' },
  { email: 'motorista@local.test', nome: 'Motorista Local', papel: 'motorista' },
]

const psql = sql => execFileSync('docker', ['exec', CONTENTOR, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], { encoding: 'utf8' }).trim()
const lit = s => `'${String(s).replace(/'/g, "''")}'`

async function admin(caminho, metodo, corpo) {
  const r = await fetch(`${API_URL}/auth/v1/admin/${caminho}`, {
    method: metodo,
    headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const json = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${metodo} ${caminho}: ${r.status} ${JSON.stringify(json)}`)
  return json
}

const lista = await admin('users?per_page=200', 'GET')
const existentes = new Map((lista.users ?? []).map(u => [u.email, u.id]))

for (const u of UTILIZADORES) {
  // Cumpre a política de senhas (12+, maiúsculas, minúsculas, dígitos)
  const password = `Local-${randomBytes(6).toString('hex')}-2026A`
  let id = existentes.get(u.email)
  if (id) {
    await admin(`users/${id}`, 'PUT', { password })
  } else {
    const criado = await admin('users', 'POST', { email: u.email, password, email_confirm: true, user_metadata: { nome: u.nome } })
    id = criado.id
  }
  psql(`UPDATE public.profiles SET role = ${lit(u.papel)}, nome = ${lit(u.nome)} WHERE id = ${lit(id)}`)
  console.log(`${u.papel.padEnd(10)} ${u.email.padEnd(24)} ${password}`)
}

const armazemId = psql(`SELECT id FROM public.profiles WHERE email = 'armazem@local.test'`)
psql(`
  INSERT INTO public.obras (nome, cliente) SELECT 'Obra Local Teste', 'Cliente Fictício'
   WHERE NOT EXISTS (SELECT 1 FROM public.obras WHERE nome = 'Obra Local Teste');
  INSERT INTO public.produtos (nome, categoria, unidade, stock_atual, stock_minimo, observacoes)
  SELECT v.nome, 'Teste', 'un', 0, 5, v.obs
    FROM (VALUES ('Cimento local', '=1+1'), ('Areia local', '-5 sacos')) AS v(nome, obs)
   WHERE NOT EXISTS (SELECT 1 FROM public.produtos p WHERE p.nome = v.nome);
  INSERT INTO public.colaboradores (nome, numero_mecan, nif, cargo, user_id)
  SELECT 'Colaborador Fictício', 'LOC-001', '123456789', 'Servente', NULL
   WHERE NOT EXISTS (SELECT 1 FROM public.colaboradores WHERE numero_mecan = 'LOC-001');
  INSERT INTO public.colaboradores (nome, numero_mecan, nif, cargo, user_id)
  SELECT 'Armazém Local', 'LOC-002', '987654321', 'Fiel de armazém', ${lit(armazemId)}
   WHERE NOT EXISTS (SELECT 1 FROM public.colaboradores WHERE numero_mecan = 'LOC-002');
`)
console.log('Dados fictícios: 1 obra, 2 produtos (observações "=1+1" e "-5 sacos"), 2 colaboradores com NIF')
