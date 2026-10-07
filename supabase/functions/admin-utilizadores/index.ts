// Edge Function: admin-utilizadores
// Gestão de utilizadores via Supabase Admin API (service role key).
// Apenas acessível a utilizadores com papel 'admin'.
//
// Segredos necessários (injetados automaticamente pelo Supabase):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { cabecalhosCors, respostaPreflight, origemRecusada } from '../_shared/cors.ts'
import { dentroDoLimite, respostaLimite } from '../_shared/limite.ts'
import { validar, type Esquema } from '../_shared/validar.ts'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')!
const APP_URL       = Deno.env.get('APP_URL') ?? 'https://encivil-gestao.pages.dev'

type Role = 'admin' | 'gestor' | 'armazem' | 'medicoes' | 'mecanico' | 'motorista' | 'leitura'
const ROLES_VALIDOS: Role[] = ['admin', 'gestor', 'armazem', 'medicoes', 'mecanico', 'motorista', 'leitura']

// Dígitos, espaços, + e separadores usuais (912-345-678, (+351) 912 345 678)
export const PADRAO_TELEMOVEL = /^[+0-9 ()-]+$/

const ACOES = ['listar', 'convidar', 'alterarPapel', 'desativar', 'reativar', 'removerMfa'] as const

export function temMfaVerificado(u: { factors?: { status: string }[] | null }): boolean {
  return (u.factors ?? []).some(f => f.status === 'verified')
}

// A listagem da Admin API (GET /admin/users) não traz `factors`: a fonte é a RPC
// utilizadores_com_mfa. Sem a RPC (migration por aplicar) usa os `factors`, se vierem.
export function mfaAtivo(u: { id: string; factors?: { status: string }[] | null }, comMfa: Set<string> | null): boolean {
  return comMfa ? comMfa.has(u.id) : temMfaVerificado(u)
}

const ESQUEMA_ACAO: Esquema = { action: { tipo: 'enum', valores: ACOES, obrigatorio: true } }
const ESQUEMAS_PAYLOAD: Record<string, Esquema> = {
  convidar: {
    email:         { tipo: 'email', obrigatorio: true },
    nome:          { tipo: 'texto', max: 120 },
    role:          { tipo: 'enum', valores: ROLES_VALIDOS, obrigatorio: true },
    colaboradorId: { tipo: 'uuid' },
    telemovel:     { tipo: 'texto', max: 30, padrao: PADRAO_TELEMOVEL },
    fotoPath:      { tipo: 'texto', max: 300 },
  },
  alterarPapel: {
    userId: { tipo: 'uuid', obrigatorio: true },
    role:   { tipo: 'enum', valores: ROLES_VALIDOS, obrigatorio: true },
  },
  desativar:  { userId: { tipo: 'uuid', obrigatorio: true } },
  reativar:   { userId: { tipo: 'uuid', obrigatorio: true } },
  removerMfa: { userId: { tipo: 'uuid', obrigatorio: true } },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return respostaPreflight(req)
  const cors = cabecalhosCors(req)
  const JSON_HEADERS = { ...cors, 'Content-Type': 'application/json' }
  const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: JSON_HEADERS })
  const err = (msg: string, s = 400) => new Response(JSON.stringify({ erro: msg }), { status: s, headers: JSON_HEADERS })
  if (origemRecusada(req)) return err('Origem não permitida', 403)
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

  const { data: dadosUser } = await userClient.auth.getUser(jwt)
  if (!dadosUser?.user) return err('Sessão inválida', 401)
  if (!await dentroDoLimite(admin, `admin-utilizadores:${dadosUser.user.id}`, 600, 60)) return respostaLimite(cors, 600)

  const corpo = await req.json().catch(() => null)
  const vAcao = validar(ESQUEMA_ACAO, corpo)
  if (!vAcao.ok) return err(vAcao.erro)
  const action = vAcao.valor.action as typeof ACOES[number]
  const esquemaPayload = ESQUEMAS_PAYLOAD[action]
  let payload: Record<string, unknown> = {}
  if (esquemaPayload) {
    const vPayload = validar(esquemaPayload, (corpo as { payload?: unknown }).payload)
    if (!vPayload.ok) return err(vPayload.erro)
    payload = vPayload.valor
  }

  // ── Listar utilizadores ───────────────────────────────────────────────
  if (action === 'listar') {
    const { data: authData, error: authErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
    if (authErr) return err(authErr.message, 500)

    const { data: profiles, error: pErr } = await admin.from('profiles').select('id, nome, role')
    if (pErr) return err(pErr.message, 500)

    const { data: idsMfa, error: mfaErr } = await admin.rpc('utilizadores_com_mfa')
    if (mfaErr) console.warn('[admin-utilizadores] utilizadores_com_mfa indisponível:', mfaErr.message)
    const comMfa = mfaErr ? null : new Set((idsMfa ?? []) as string[])

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
        mfa:        mfaAtivo(u, comMfa),
      }
    })

    return ok(utilizadores)
  }

  // ── Convidar utilizador ───────────────────────────────────────────────
  if (action === 'convidar') {
    const { email, nome, role, colaboradorId, telemovel, fotoPath } = payload as {
      email: string; nome?: string; role: Role; colaboradorId?: string; telemovel?: string; fotoPath?: string
    }
    if (!nome) return err('Nome obrigatório')

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

  // ── Alterar papel ─────────────────────────────────────────────────────
  if (action === 'alterarPapel') {
    const { userId, role } = payload as { userId: string; role: Role }

    const { error: uErr } = await admin.from('profiles').update({ role }).eq('id', userId)
    if (uErr) return err(uErr.message, 500)
    return ok({ sucesso: true })
  }

  // ── Desativar (banir) ─────────────────────────────────────────────────
  if (action === 'desativar') {
    const { userId } = payload as { userId: string }

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
    const { userId } = payload as { userId: string }

    const { error: rErr } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: 'none',
    })
    if (rErr) return err(rErr.message, 500)
    return ok({ sucesso: true })
  }

  // ── Remover MFA (perda do telemóvel) ──────────────────────────────────
  if (action === 'removerMfa') {
    const { userId } = payload as { userId: string }
    const { data: fatores, error: lErr } = await admin.auth.admin.mfa.listFactors({ userId })
    if (lErr) return err(lErr.message, 500)
    const removidos = fatores?.factors?.length ?? 0
    for (const f of fatores?.factors ?? []) {
      const { error: dErr } = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId })
      if (dErr) return err(dErr.message, 500)
    }
    // Evento de segurança: se a migration ainda não existir, não bloqueia a remoção
    await admin.rpc('_registar_evento', {
      p_tipo: 'mfa_removido_admin', p_utilizador: userId, p_detalhe: { removidos },
    }).then(() => {}, () => {})
    return ok({ removidos })
  }

  return err('Ação desconhecida')
})
