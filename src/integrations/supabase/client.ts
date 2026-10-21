import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'
import { selecionarConfiguracaoSupabase } from './config'

// Valores de produção — públicos por natureza: vão embutidos no bundle que
// qualquer utilizador descarrega. A segurança real é a RLS no Postgres.
// Env vars (quando válidas) têm prioridade, para dev/staging apontarem a outro projeto.
const PROD_URL = 'https://wuruhxmbueeyhiqgvlxu.supabase.co'
const PROD_KEY = 'sb_publishable_b2Zjbv0hhxxORNxjemsGZA_bMtFaDJa'

const config = selecionarConfiguracaoSupabase(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  import.meta.env.DEV,
  { url: PROD_URL, chave: PROD_KEY },
)
if (config.usaFallback) console.warn('[supabase] env vars ausentes ou inválidas — a usar credenciais de produção embutidas')

export const supabase = createClient<Database>(config.url, config.chave, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
