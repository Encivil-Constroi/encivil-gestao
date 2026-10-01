import { useEffect } from 'react'
import { Link } from 'react-router'
import { X, Pencil, User } from 'lucide-react'
import { useDiaDaViatura } from '../../hooks/useManutencao'
import { diferencas, formatarDataHora, formatarLeitura, nomeDoDia, tituloManutencao, totalCusto } from '../../lib/manutencao'
import type { ItemCatalogoRow } from '../../db'
import { botaoSecundario, formatarEuros } from '../ui'

// Tudo o que foi feito a uma viatura num dia: quem registou, a que horas e as correções
export function DetalheDia({ veiculoId, nomeViatura, data, catalogo, podeEditar, aoFechar }: {
  veiculoId: string
  nomeViatura: string
  data: string
  catalogo: ItemCatalogoRow[]
  podeEditar: boolean
  aoFechar: () => void
}) {
  const { dia, loading, error } = useDiaDaViatura(veiculoId, data)

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  const rotuloItem = (id: string) => catalogo.find(i => i.id === id)?.rotulo ?? 'Item removido'
  const manutencoes = dia?.manutencoes ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={aoFechar}>
      <div role="dialog" aria-modal="true" aria-label={`Manutenções de ${nomeViatura} em ${data}`}
        onClick={e => e.stopPropagation()}
        className="bg-background w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-border shadow-xl">
        <div className="sticky top-0 bg-background/95 backdrop-blur-sm flex items-start gap-3 p-4 border-b border-border">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold truncate">{nomeViatura}</h2>
            <p className="text-sm text-muted-foreground capitalize">{nomeDoDia(data)}</p>
          </div>
          <button onClick={aoFechar} aria-label="Fechar" className="p-2 hover:bg-accent rounded-lg shrink-0">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {loading && !dia && <p className="text-sm text-muted-foreground text-center py-6">A carregar…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}

          {manutencoes.map(m => {
            const correcoes = (dia?.edicoes ?? []).filter(e => e.manutencao_id === m.id)
            return (
              <article key={m.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold">{tituloManutencao(m)}</h3>
                    {m.item_rotulo && m.descricao && <p className="text-sm text-muted-foreground">{m.descricao}</p>}
                  </div>
                  {podeEditar && (
                    <Link to={`/frota/manutencao/${m.id}/editar`} className={`${botaoSecundario} !py-2 shrink-0`}>
                      <Pencil className="w-4 h-4" aria-hidden="true" /> Editar
                    </Link>
                  )}
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div><dt className="text-xs text-muted-foreground">{m.unidade_contador === 'horas' ? 'Horas' : 'Quilómetros'}</dt>
                    <dd>{formatarLeitura(m.km_na_altura, m.unidade_contador)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Custo</dt>
                    <dd>{m.custo != null ? formatarEuros(Number(m.custo)) : '—'}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Oficina</dt><dd>{m.oficina ?? '—'}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Condutor</dt><dd>{m.condutor_nome ?? '—'}</dd></div>
                </dl>

                {m.observacoes && (
                  <p className="text-sm bg-muted/40 rounded-xl p-3 whitespace-pre-wrap">{m.observacoes}</p>
                )}

                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  Registado por <strong className="text-foreground">{m.registado_por}</strong> em {formatarDataHora(m.registado_em)}
                </p>

                {correcoes.length > 0 && (
                  <div className="space-y-2 border-t border-border pt-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Correções</h4>
                    <ul className="space-y-2">
                      {correcoes.map(c => (
                        <li key={c.id} className="text-sm space-y-1">
                          <p className="text-xs text-muted-foreground">
                            Corrigido por <strong className="text-foreground">{c.editado_por_nome}</strong> em {formatarDataHora(c.editado_em)}
                          </p>
                          <ul className="space-y-0.5">
                            {diferencas(c.antes, c.depois, rotuloItem).map(d => (
                              <li key={d.campo}>
                                <span className="text-muted-foreground">{d.campo}:</span> {d.antes} <span aria-hidden="true">→</span><span className="sr-only">passou a</span> <strong>{d.depois}</strong>
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            )
          })}

          {dia && manutencoes.length === 0 && <p className="text-sm text-muted-foreground">Sem manutenções nesse dia.</p>}

          {manutencoes.length > 1 && (
            <p className="text-sm text-right">Total do dia: <strong>{formatarEuros(totalCusto(manutencoes))}</strong></p>
          )}
        </div>
      </div>
    </div>
  )
}
