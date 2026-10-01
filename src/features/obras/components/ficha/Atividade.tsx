import { fmtDataHora } from '@/app/lib/format'
import { useEventosObra } from '../../hooks/useFichaObra'
import { Seccao, Vazio, botaoSecundario } from '../ui'
import type { SecaoProps } from './tipos'

export function Atividade({ obraId }: SecaoProps) {
  const { eventos, loading, error, reload } = useEventosObra(obraId)
  return <Seccao titulo="Atividade da obra">
    {loading && !eventos.length && <p role="status">A carregar atividade…</p>}
    {error && <p role="alert">{error} <button type="button" className={botaoSecundario} onClick={reload}>Tentar de novo</button></p>}
    {!loading && !error && !eventos.length && <Vazio>Sem atividade registada.</Vazio>}
    <ol className="border-l-2 border-border ml-2 space-y-5">{eventos.map(evento => <li key={evento.id} className="relative pl-5 text-sm before:absolute before:-left-[5px] before:top-1.5 before:w-2 before:h-2 before:rounded-full before:bg-primary"><strong>{evento.titulo}</strong>{evento.detalhe && <p>{evento.detalhe}</p>}<p className="text-xs text-muted-foreground">{fmtDataHora(evento.criado_em)}{evento.autor_nome && ` · ${evento.autor_nome}`}</p></li>)}</ol>
  </Seccao>
}
