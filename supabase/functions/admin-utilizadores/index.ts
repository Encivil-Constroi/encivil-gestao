// Edge Function: admin-utilizadores
// Gestão de utilizadores via Supabase Admin API (service role key).
// Apenas acessível a utilizadores com papel 'admin'.
//
// Segredos necessários (injetados automaticamente pelo Supabase):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { emailEfetivo, loginDeEmail, senhaValida, SENHA_MIN, traduzErroAuth } from './regras.ts'

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

type Role = 'admin' | 'gestor' | 'armazem' | 'medicoes' | 'mecanico' | 'motorista' | 'leitura'
const ROLES_VALIDOS: Role[] = ['admin', 'gestor', 'armazem', 'medicoes', 'mecanico', 'motorista', 'leitura']

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
        login:      loginDeEmail(u.email ?? ''),
        semEmail:   loginDeEmail(u.email ?? '') !== null,
        ultimoLogin: u.last_sign_in_at ?? null,
        criadoEm:   u.created_at,
      }
    })

    return ok(utilizadores)
  }

  // ── Convidar utilizador ───────────────────────────────────────────────
  if (action === 'convidar') {
    const { email, nome, role, colaboradorId, telemovel, fotoPath } = payload ?? {}
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
      const extra: Record<string, string> = {}
      if (typeof telemovel === 'string' && telemovel.trim()) extra.telemovel = telemovel.trim()
      if (typeof fotoPath === 'string' && fotoPath.trim())   extra.foto_path = fotoPath.trim()
      await admin.from('profiles').update({ nome, role, ...extra }).eq('id', data.user.id)
      // Liga a ficha de pessoal à conta recém-criada
      if (typeof colaboradorId === 'string' && colaboradorId) {
        await admin.from('colaboradores').update({ user_id: data.user.id }).eq('id', colaboradorId)
      }
    }

    return ok({ sucesso: true, userId: data?.user?.id })
  }

  // ── Criar utilizador com senha (email opcional) ───────────────────────
  if (action === 'criar') {
    const { email, login, senha, nome, role, colaboradorId, telemovel, fotoPath } = payload ?? {}
    if (!nome || typeof nome !== 'string' || !nome.trim()) return err('Nome obrigatório')
    if (!ROLES_VALIDOS.includes(role)) return err('Papel inválido')
    if (!senhaValida(senha)) return err(`A senha tem de ter pelo menos ${SENHA_MIN} caracteres`)
    const emailFinal = emailEfetivo(typeof email === 'string' ? email : '', typeof login === 'string' ? login : '')
    if (!emailFinal) return err('Indique um email válido ou um utilizador (3 a 40 letras, números, ponto, hífen)')

    const { data, error: cErr } = await admin.auth.admin.createUser({
      email: emailFinal, password: senha, email_confirm: true, user_metadata: { nome: nome.trim() },
    })
    if (cErr || !data?.user) {
      return err(traduzErroAuth(cErr?.message ?? 'Erro ao criar a conta'))
    }
    const userId = data.user.id
    const extra: Record<string, string> = {}
    if (typeof telemovel === 'string' && telemovel.trim()) extra.telemovel = telemovel.trim()
    if (typeof fotoPath === 'string' && fotoPath.trim())   extra.foto_path = fotoPath.trim()
    const { error: pErr } = await admin.from('profiles').update({ nome: nome.trim(), role, ...extra }).eq('id', userId)
    let falha = pErr?.message ?? null
    if (!falha && typeof colaboradorId === 'string' && colaboradorId) {
      const { data: lig, error: lErr } = await admin.from('colaboradores').update({ user_id: userId }).eq('id', colaboradorId).select('id')
      falha = lErr?.message ?? (lig && lig.length > 0 ? null : 'Ficha de colaborador não encontrada')
    }
    if (falha) {
      // Sem perfil correto a conta ficaria com o papel por defeito do trigger — apaga-se.
      const { error: dErr } = await admin.auth.admin.deleteUser(userId)
      if (dErr) {
        // Não foi possível apagar: bloqueia-se para não ficar uma conta ativa com papel errado.
        await admin.auth.admin.updateUserById(userId, { ban_duration: '87600h' })
        return err(`Conta criada com erro e bloqueada por segurança: ${falha}. Elimine-a na gestão de utilizadores.`, 500)
      }
      return err(`Conta não criada: ${falha}`, 500)
    }
    return ok({ sucesso: true, userId, email: emailFinal })
  }

  // ── Redefinir senha ───────────────────────────────────────────────────
  if (action === 'redefinirSenha') {
    const { userId, senha } = payload ?? {}
    if (!userId) return err('userId obrigatório')
    if (!senhaValida(senha)) return err(`A senha tem de ter pelo menos ${SENHA_MIN} caracteres`)
    const { error: sErr } = await admin.auth.admin.updateUserById(userId, { password: senha })
    if (sErr) return err(traduzErroAuth(sErr.message), 500)
    return ok({ sucesso: true })
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
