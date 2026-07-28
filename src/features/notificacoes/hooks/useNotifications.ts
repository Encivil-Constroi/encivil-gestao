import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { getUnitLabel } from '@/app/data/mockData'
import { useRole } from '@/features/auth/useRole'

export type NotificationKind = 'stock' | 'tool-overdue' | 'pending'
export type NotificationSeverity = 'danger' | 'warning' | 'info'

export type AppNotification = {
  id: string
  kind: NotificationKind
  title: string
  subtitle: string
  severity: NotificationSeverity
  link: string
}

export function useNotifications() {
  const { podeValidar, podeCombustivel } = useRole()
  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    const today = new Date().toISOString().split('T')[0]

    const [produtosRes, atrasoRes, subsPend, autosPend, combustPend] = await Promise.all([
      // RPC filtra no servidor — devolve só produtos com stock_atual <= stock_minimo
      supabase.rpc('produtos_em_alerta'),
      supabase
        .from('emprestimos_ferramentas')
        .select('id, ferramenta_id, funcionario_nome, data_prevista_devolucao, ferramentas(nome, codigo)')
        .eq('estado', 'ativo')
        .not('data_prevista_devolucao', 'is', null)
        .lt('data_prevista_devolucao', today),
      podeValidar
        ? supabase.from('subempreiteiros').select('id, nome').eq('estado', 'rascunho')
        : Promise.resolve({ data: [] }),
      podeValidar
        ? supabase.from('autos_medicao').select('id, numero, subempreiteiros(nome)').eq('estado', 'rascunho')
        : Promise.resolve({ data: [] }),
      podeCombustivel
        ? supabase.from('comb_abastecimentos_pendentes').select('id', { count: 'exact', head: true })
        : Promise.resolve({ data: null, count: 0 }),
    ])

    const notifs: AppNotification[] = []

    // 1. Stock baixo / sem stock — RPC já filtra e ordena no servidor
    type ProdRow = { id: string; nome: string; unidade: string; stock_atual: number; stock_minimo: number }
    ;((produtosRes.data ?? []) as ProdRow[])
      .forEach(p => {
        const semStock = p.stock_atual <= 0
        notifs.push({
          id: `stock-${p.id}`,
          kind: 'stock',
          title: p.nome,
          subtitle: `${semStock ? 'Sem stock' : 'Stock baixo'} · ${p.stock_atual} / ${p.stock_minimo} ${getUnitLabel(p.unidade)}`,
          severity: semStock ? 'danger' : 'warning',
          link: `/produtos/${p.id}`,
        })
      })

    // 2. Ferramentas em atraso
    type LoanRow = { id: string; ferramenta_id: string; funcionario_nome: string; data_prevista_devolucao: string; ferramentas: { nome: string } | null }
    ;((atrasoRes.data ?? []) as LoanRow[]).forEach(l => {
      notifs.push({
        id: `tool-${l.id}`,
        kind: 'tool-overdue',
        title: l.ferramentas?.nome ?? 'Ferramenta',
        subtitle: `Em atraso · ${l.funcionario_nome} · desde ${new Date(l.data_prevista_devolucao).toLocaleDateString('pt-PT')}`,
        severity: 'danger',
        link: `/ferramentas/${l.ferramenta_id}`,
      })
    })

    // 3. Validações pendentes (só admin) — uma notificação por item,
    //    cada uma a apontar para o ecrã exato onde se valida.
    type SubPendRow = { id: string; nome: string }
    ;((subsPend.data ?? []) as SubPendRow[]).forEach(s => {
      notifs.push({
        id: `sub-pend-${s.id}`,
        kind: 'pending',
        title: 'Contrato por validar',
        subtitle: s.nome,
        severity: 'info',
        link: `/subempreiteiros/${s.id}`,
      })
    })

    type AutoPendRow = { id: string; numero: number; subempreiteiros: { nome: string } | null }
    ;((autosPend.data ?? []) as AutoPendRow[]).forEach(a => {
      notifs.push({
        id: `auto-pend-${a.id}`,
        kind: 'pending',
        title: 'Auto de medição por validar',
        subtitle: `Auto Nº ${a.numero}${a.subempreiteiros?.nome ? ` · ${a.subempreiteiros.nome}` : ''}`,
        severity: 'info',
        link: `/autos/${a.id}`,
      })
    })

    // 4. Abastecimentos pendentes (quem pode escrever em combustível)
    const pendCount = combustPend.count ?? 0
    if (pendCount > 0) {
      notifs.push({
        id: 'comb-pendentes',
        kind: 'pending',
        title: `${pendCount} abastecimento${pendCount !== 1 ? 's' : ''} por aprovar`,
        subtitle: 'Via QR code · aguarda validação',
        severity: 'info',
        link: '/combustivel',
      })
    }

    if (produtosRes.error || atrasoRes.error) setError(true)

    setItems(notifs)
    setLoading(false)
  }, [podeValidar, podeCombustivel])

  useEffect(() => {
    load()
    const interval = setInterval(load, 60_000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

  return { notifications: items, count: items.length, loading, error, reload: load }
}
