// Edge Function: enviar-resumo-alertas
// Envia email diário com resumo de alertas activos via Resend.
// Agendado por pg_cron às 07:00 UTC via net.http_post().
//
// Segredos necessários (Dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY            — obter em resend.com
//   EMAIL_ALERTAS_DESTINATARIO — ex: gestor@encivil.pt (pode ser lista separada por vírgulas)
//   EDGE_FUNCTION_SECRET      — string aleatória para autenticar chamadas do pg_cron

import { createClient } from 'jsr:@supabase/supabase-js@2'

const RESEND_KEY    = Deno.env.get('RESEND_API_KEY') ?? ''
const DESTINATARIO  = Deno.env.get('EMAIL_ALERTAS_DESTINATARIO') ?? ''
const EDGE_SECRET   = Deno.env.get('EDGE_FUNCTION_SECRET') ?? ''
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

type AlertaRow = {
  id: string
  estado: string
  severidade: string
  valor_atual: number | null
  valor_limiar: number | null
  criado_em: string
  regra_tipo: string | null
  entidade_nome: string | null
  entidade_detalhe: string | null
}

function labelTipo(tipo: string | null): string {
  switch (tipo) {
    case 'REVISAO_KM':         return 'Revisão (km)'
    case 'REVISAO_DATA':       return 'Revisão (data)'
    case 'SEGURO':             return 'Seguro'
    case 'IPO':                return 'IPO'
    case 'SUPLEMENTAR':        return 'Suplementar'
    case 'VALIDADE_DOC':       return 'Validade Doc.'
    case 'EPI_VALIDADE':       return 'EPI'
    case 'FORMACAO_VALIDADE':  return 'Formação'
    default: return tipo ?? '—'
  }
}

function buildEmail(urgentes: AlertaRow[], atencao: AlertaRow[], reconhecidos: AlertaRow[]): string {
  const hoje = new Date().toLocaleDateString('pt-PT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const rowHtml = (a: AlertaRow, cor: string) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;font-weight:600;color:#1a1a2e">${a.entidade_nome ?? '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#555">${a.entidade_detalhe ?? ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#555">${labelTipo(a.regra_tipo)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">
        <span style="background:${cor};color:#fff;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700">
          ${a.severidade === 'URGENTE' ? 'URGENTE' : 'ATENÇÃO'}
        </span>
      </td>
    </tr>`

  const tabela = (rows: AlertaRow[], cor: string) => rows.length === 0 ? '' : `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px">
      <thead>
        <tr style="background:#f8f8f8">
          <th style="padding:10px 12px;text-align:left;font-size:12px;color:#888;font-weight:600;text-transform:uppercase">Entidade</th>
          <th style="padding:10px 12px;text-align:left;font-size:12px;color:#888;font-weight:600;text-transform:uppercase">Detalhe</th>
          <th style="padding:10px 12px;text-align:left;font-size:12px;color:#888;font-weight:600;text-transform:uppercase">Tipo</th>
          <th style="padding:10px 12px;text-align:left;font-size:12px;color:#888;font-weight:600;text-transform:uppercase">Nível</th>
        </tr>
      </thead>
      <tbody>${rows.map(r => rowHtml(r, cor)).join('')}</tbody>
    </table>`

  return `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">

        <!-- Cabeçalho -->
        <tr><td style="background:#1a1a2e;padding:28px 32px">
          <p style="margin:0;font-size:11px;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:1px">ENCIVIL Gestão</p>
          <h1 style="margin:8px 0 4px;font-size:22px;color:#fff;font-weight:700">Resumo de Alertas</h1>
          <p style="margin:0;font-size:13px;color:rgba(255,255,255,.6)">${hoje}</p>
        </td></tr>

        <!-- Resumo numérico -->
        <tr><td style="padding:24px 32px;border-bottom:1px solid #f0f0f0">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="padding:12px;background:#fff0f0;border-radius:8px;width:30%">
                <p style="margin:0;font-size:28px;font-weight:800;color:#dc2626">${urgentes.length}</p>
                <p style="margin:4px 0 0;font-size:11px;color:#dc2626;font-weight:600;text-transform:uppercase">Urgentes</p>
              </td>
              <td width="16"></td>
              <td align="center" style="padding:12px;background:#fffbeb;border-radius:8px;width:30%">
                <p style="margin:0;font-size:28px;font-weight:800;color:#d97706">${atencao.length}</p>
                <p style="margin:4px 0 0;font-size:11px;color:#d97706;font-weight:600;text-transform:uppercase">Atenção</p>
              </td>
              <td width="16"></td>
              <td align="center" style="padding:12px;background:#f0f9ff;border-radius:8px;width:30%">
                <p style="margin:0;font-size:28px;font-weight:800;color:#0369a1">${reconhecidos.length}</p>
                <p style="margin:4px 0 0;font-size:11px;color:#0369a1;font-weight:600;text-transform:uppercase">Reconhecidos</p>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Corpo -->
        <tr><td style="padding:24px 32px">
          ${urgentes.length > 0 ? `<h2 style="margin:0 0 12px;font-size:15px;color:#dc2626;font-weight:700">⚠️ Alertas Urgentes</h2>${tabela(urgentes, '#dc2626')}` : ''}
          ${atencao.length > 0 ? `<h2 style="margin:0 0 12px;font-size:15px;color:#d97706;font-weight:700">⚡ Alertas de Atenção</h2>${tabela(atencao, '#d97706')}` : ''}
          ${reconhecidos.length > 0 ? `<h2 style="margin:0 0 12px;font-size:15px;color:#0369a1;font-weight:700">👁 Reconhecidos (em acompanhamento)</h2>${tabela(reconhecidos, '#0369a1')}` : ''}

          <div style="margin-top:24px;padding:16px;background:#f8f9fa;border-radius:8px;text-align:center">
            <a href="https://encivil-gestao.pages.dev/alertas"
               style="display:inline-block;padding:12px 28px;background:#1a1a2e;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">
              Ver todos os alertas →
            </a>
          </div>
        </td></tr>

        <!-- Rodapé -->
        <tr><td style="padding:20px 32px;background:#f8f8f8;border-top:1px solid #f0f0f0;text-align:center">
          <p style="margin:0;font-size:12px;color:#aaa">
            Este email é enviado automaticamente pelo ENCIVIL Gestão todos os dias às 07:00.<br>
            Para desactivar, contacte o administrador do sistema.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

Deno.serve(async (req) => {
  // Só aceita POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Verifica segredo partilhado (protege de chamadas não autorizadas)
  const auth = req.headers.get('Authorization') ?? ''
  if (EDGE_SECRET && auth !== `Bearer ${EDGE_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Variáveis obrigatórias
  if (!RESEND_KEY || !DESTINATARIO) {
    return new Response(
      JSON.stringify({ erro: 'RESEND_API_KEY ou EMAIL_ALERTAS_DESTINATARIO não configurados' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Buscar alertas com service role (contorna RLS)
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  const { data, error } = await supabase
    .from('alertas_detalhados')
    .select('id, estado, severidade, valor_atual, valor_limiar, criado_em, regra_tipo, entidade_nome, entidade_detalhe')
    .in('estado', ['ATIVO', 'RECONHECIDO'])
    .order('severidade', { ascending: true })  // URGENTE primeiro (U < A alfabeticamente no desc)

  if (error) {
    return new Response(JSON.stringify({ erro: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  const alertas = (data ?? []) as AlertaRow[]
  const urgentes     = alertas.filter(a => a.severidade === 'URGENTE' && a.estado === 'ATIVO')
  const atencao      = alertas.filter(a => a.severidade === 'ATENCAO'  && a.estado === 'ATIVO')
  const reconhecidos = alertas.filter(a => a.estado === 'RECONHECIDO')

  // Não enviar se não houver alertas activos
  if (urgentes.length === 0 && atencao.length === 0) {
    return new Response(
      JSON.stringify({ enviado: false, motivo: 'sem alertas activos' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const assunto = urgentes.length > 0
    ? `[ENCIVIL] ⚠️ ${urgentes.length} alerta(s) urgente(s) — ${new Date().toLocaleDateString('pt-PT')}`
    : `[ENCIVIL] Resumo de alertas — ${new Date().toLocaleDateString('pt-PT')}`

  // Enviar via Resend
  const destinatarios = DESTINATARIO.split(',').map(e => e.trim()).filter(Boolean)

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'ENCIVIL Gestão <alertas@encivil.pt>',
      to: destinatarios,
      subject: assunto,
      html: buildEmail(urgentes, atencao, reconhecidos),
    }),
  })

  if (!resendRes.ok) {
    const corpo = await resendRes.text()
    return new Response(JSON.stringify({ erro: `Resend: ${corpo}` }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  return new Response(
    JSON.stringify({ enviado: true, urgentes: urgentes.length, atencao: atencao.length, reconhecidos: reconhecidos.length }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})
