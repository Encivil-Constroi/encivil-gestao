// Edge Function: admin-utilizadores
// Gestão de utilizadores via Supabase Admin API (service role key).
// Apenas acessível a utilizadores com papel 'admin'.
//
// Segredos necessários (injetados automaticamente pelo Supabase):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')!
const APP_URL       = Deno.env.get('APP_URL') ?? 'https://encivil-gestao.pages.dev'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json' }

function ok(data: unknown)    { return new Response(JSON.stringify(data),               { status: 200, headers: JSON_HEADERS }) }
function err(msg: string, s = 400) { return new Response(JSON.stringify({ erro: msg }), { status: s,   headers: JSON_HEADERS }) }

type Role = 'admin' | 'gestor' | 'armazem' | 'medicoes' | 'leitura'
const ROLES_VALIDOS: Role[] = ['admin', 'gestor', 'armazem', 'medicoes', 'leitura']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST')    return err('Method not allowed', 405)

  // ── Verificar autenticação ────────────────────────────────────────────
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!jwt) return err('Não autenticado', 401)

  // Verificar que o chamador é admin através da função auth_role()
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: papelChamador, error: roleErr } = await userClient.rpc('auth_role')
  if (roleErr || papelChamador !== 'admin') return err('Acesso negado — apenas administradores', 403)

  // ── Admin client (contorna RLS) ───────────────────────────────────────
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { action, payload } = await req.json().catch(() => ({}))

  // ── Listar utilizadores ───────────────────────────────────────────────
  if (action === 'listar') {
    const { data: authData, error: authErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
    if (authErr) return err(authErr.message, 500)

    const { data: profiles, error: pErr } = await admin.from('profiles').select('id, nome, role')
    if (pErr) return err(pErr.message, 500)

    const profileMap = new Map((profiles ?? []).map((p: { id: string; nome: string; role: string }) => [p.id, p]))

    const utilizadores = authData.users.map(u => {
      const p = profileMap.get(u.id)
      const banDate = (u as unknown as { banned_until?: string | null }).banned_until
      return {
        id:         u.id,
        email:      u.email ?? '',
        nome:       (p as { nome?: string } | undefined)?.nome ?? u.email?.split('@')[0] ?? '—',
        role:       (p as { role?: string } | undefined)?.role ?? 'gestor',
        ativo:      !banDate || new Date(banDate) < new Date(),
        ultimoLogin: u.last_sign_in_at ?? null,
        criadoEm:   u.created_at,
      }
    })

    return ok(utilizadores)
  }

  // ── Convidar utilizador ───────────────────────────────────────────────
  if (action === 'convidar') {
    const { email, nome, role } = payload ?? {}
    if (!email || typeof email !== 'string') return err('Email obrigatório')
    if (!nome  || typeof nome  !== 'string') return err('Nome obrigatório')
    if (!ROLES_VALIDOS.includes(role))       return err('Papel inválido')

    const { data, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data:       { nome },
      redirectTo: `${APP_URL}/login`,
    })
    if (inviteErr) {
      const msg = inviteErr.message.includes('already been registered')
        ? 'Este email já está registado no sistema.'
        : inviteErr.message
      return err(msg)
    }

    // O trigger handle_new_user cria o perfil com role='gestor'.
    // Actualizamos imediatamente para o papel pretendido.
    if (data?.user) {
      await admin.from('profiles').update({ nome, role }).eq('id', data.user.id)
    }

    return ok({ sucesso: true, userId: data?.user?.id })
  }

  // ── Alterar papel ─────────────────────────────────────────────────────
  if (action === 'alterarPapel') {
    const { userId, role } = payload ?? {}
    if (!userId) return err('userId obrigatório')
    if (!ROLES_VALIDOS.includes(role)) return err('Papel inválido')

    const { error: uErr } = await admin.from('profiles').update({ role }).eq('id', userId)
    if (uErr) return err(uErr.message, 500)
    return ok({ sucesso: true })
  }

  // ── Desativar (banir) ─────────────────────────────────────────────────
  if (action === 'desativar') {
    const { userId } = payload ?? {}
    if (!userId) return err('userId obrigatório')

    // Verificar que não é o próprio admin que se está a banir
    const { data: caller } = await userClient.auth.getUser()
    if (caller?.user?.id === userId) return err('Não pode desativar a sua própria conta')

    const { error: bErr } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: '87600h', // 10 anos — equivale a banimento permanente
    })
    if (bErr) return err(bErr.message, 500)
    return ok({ sucesso: true })
  }

  // ── Reativar ──────────────────────────────────────────────────────────
  if (action === 'reativar') {
    const { userId } = payload ?? {}
    if (!userId) return err('userId obrigatório')

    const { error: rErr } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: 'none',
    })
    if (rErr) return err(rErr.message, 500)
    return ok({ sucesso: true })
  }

  return err('Ação desconhecida')
})
