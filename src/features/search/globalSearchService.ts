import { supabase } from '@/integrations/supabase/client'

export type SearchResultKind = 'obra' | 'produto' | 'subempreiteiro' | 'ferramenta'

export type SearchResult = {
  id: string
  kind: SearchResultKind
  title: string
  subtitle?: string
  link: string
}

const LIMIT = 5

export async function pesquisarGlobal(termo: string): Promise<SearchResult[]> {
  if (termo.trim().length < 2) return []
  const q = `%${termo.trim()}%`

  const [obras, produtos, subs, ferramentas] = await Promise.all([
    supabase
      .from('obras')
      .select('id, nome, cliente, estado')
      .or(`nome.ilike.${q},cliente.ilike.${q}`)
      .eq('ativo', true)
      .limit(LIMIT),
    supabase
      .from('produtos')
      .select('id, nome, codigo, categoria')
      .or(`nome.ilike.${q},codigo.ilike.${q}`)
      .eq('ativo', true)
      .limit(LIMIT),
    supabase
      .from('subempreiteiros')
      .select('id, nome, obras(nome)')
      .ilike('nome', q)
      .limit(LIMIT),
    supabase
      .from('ferramentas')
      .select('id, nome, codigo, estado')
      .or(`nome.ilike.${q},codigo.ilike.${q}`)
      .eq('ativo', true)
      .limit(LIMIT),
  ])

  const results: SearchResult[] = []

  type ObraRow = { id: string; nome: string; cliente: string | null; estado: string }
  ;((obras.data ?? []) as ObraRow[]).forEach(r =>
    results.push({
      id: r.id, kind: 'obra',
      title: r.nome,
      subtitle: [r.cliente, r.estado === 'concluida' ? 'Concluída' : 'Ativa'].filter(Boolean).join(' · '),
      link: `/obras/${r.id}`,
    })
  )

  type ProdRow = { id: string; nome: string; codigo: string; categoria: string }
  ;((produtos.data ?? []) as ProdRow[]).forEach(r =>
    results.push({
      id: r.id, kind: 'produto',
      title: r.nome,
      subtitle: `${r.codigo} · ${r.categoria}`,
      link: `/produtos/${r.id}`,
    })
  )

  type SubRow = { id: string; nome: string; obras: { nome: string } | null }
  ;((subs.data ?? []) as SubRow[]).forEach(r =>
    results.push({
      id: r.id, kind: 'subempreiteiro',
      title: r.nome,
      subtitle: r.obras?.nome ?? undefined,
      link: `/subempreiteiros/${r.id}`,
    })
  )

  type FerrRow = { id: string; nome: string; codigo: string; estado: string }
  ;((ferramentas.data ?? []) as FerrRow[]).forEach(r =>
    results.push({
      id: r.id, kind: 'ferramenta',
      title: r.nome,
      subtitle: `${r.codigo} · ${r.estado === 'disponivel' ? 'Disponível' : r.estado === 'emprestado' ? 'Emprestado' : r.estado}`,
      link: `/ferramentas/${r.id}`,
    })
  )

  return results
}
