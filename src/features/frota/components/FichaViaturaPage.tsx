import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import {
  ClipboardCheck, Wrench, Settings2, Printer, User, CalendarClock, History, Pencil, QrCode, Fuel,
} from 'lucide-react'
import { toast } from 'sonner'
import { useRole } from '@/features/auth/useRole'
import { formatarData } from '@/app/lib/prazoFrota'
import { useFichaViatura, useCatalogo, useColaboradoresAtivos, useAtribuirCondutor } from '../hooks/useFrota'
import { prazosDaViatura, textoIntervalo, hojeIso, type Severidade } from '../lib/frota'
import { urlFotoChecklist } from '../services/frotaService'
import {
  Cabecalho, BadgeSeveridade, BadgeEstado, Seccao, Vazio, inputCls,
  botaoPrimario, botaoSecundario, formatarEuros, formatarKm,
} from './ui'

function Condutor({ veiculoId, atualId, atualNome, desde, podeEditar }: {
  veiculoId: string; atualId: string | null; atualNome: string | null; desde: string | null; podeEditar: boolean
}) {
  const [editar, setEditar] = useState(false)
  const [colab, setColab] = useState(atualId ?? '')
  const [data, setData] = useState(hojeIso())
  const { colaboradores } = useColaboradoresAtivos()
  const { atribuir, loading } = useAtribuirCondutor()

  const guardar = async () => {
    if (await atribuir(veiculoId, colab || null, data)) {
      toast.success(colab ? 'Condutor atribuído.' : 'Viatura sem condutor.')
      setEditar(false)
    }
  }

  return (
    <Seccao titulo="Condutor responsável" icone={<User className="w-4 h-4 text-primary" aria-hidden="true" />}
      acao={podeEditar && !editar ? <button onClick={() => setEditar(true)} className="text-sm text-primary font-medium">Alterar</button> : undefined}>
      {!editar ? (
        atualNome
          ? <p className="text-sm"><strong>{atualNome}</strong> <span className="text-muted-foreground">desde {formatarData(desde!)}</span></p>
          : <Vazio>Sem condutor atribuído.</Vazio>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
          <select value={colab} onChange={e => setColab(e.target.value)} className={inputCls} aria-label="Condutor">
            <option value="">— Sem condutor (viatura devolvida) —</option>
            {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <input type="date" value={data} max={hojeIso()} onChange={e => setData(e.target.value)} className={inputCls} aria-label="Desde" />
          <div className="flex gap-2 sm:col-span-2">
            <button onClick={guardar} disabled={loading || !data} className={botaoPrimario}>{loading ? 'A guardar…' : 'Guardar'}</button>
            <button onClick={() => setEditar(false)} className={botaoSecundario}>Cancelar</button>
          </div>
        </div>
      )}
    </Seccao>
  )
}

export function FichaViaturaPage() {
  const { id } = useParams()
  const { ficha, loading, error, reload } = useFichaViatura(id)
  const { catalogo } = useCatalogo()
  const { podeFrota, podeCombustivel, isMecanico } = useRole()

  const porItem = useMemo(() => new Map(catalogo.map(i => [i.id, i])), [catalogo])
  const prazos = useMemo(() => {
    if (!ficha) return []
    const sev = new Map<string, Severidade>(ficha.alertas.map(a => [a.entidade_id, a.severidade]))
    return prazosDaViatura(catalogo, ficha.itens, sev, ficha.kmAtual)
  }, [ficha, catalogo])

  if (loading && !ficha) return <div className="max-w-3xl mx-auto p-8 text-center text-sm text-muted-foreground">A carregar…</div>
  if (error || !ficha) return (
    <div className="max-w-3xl mx-auto p-8 text-center space-y-3">
      <p className="text-sm text-destructive">{error ?? 'Viatura não encontrada.'}</p>
      <button onClick={reload} className={botaoSecundario}>Tentar de novo</button>
    </div>
  )

  const { viatura } = ficha
  const atual = ficha.atribuicoes.find(a => a.ate === null) ?? null
  const nome = (colabId: string | null) => (colabId ? ficha.colaboradores.get(colabId) ?? '—' : '—')
  // Nova janela: a página do QR abre o diálogo de impressão e não deve tirar o utilizador da ficha
  const imprimirQr = () => window.open(
    `/pub/imprimir-qr?v=${viatura.id}&vn=${encodeURIComponent(viatura.nome)}&vc=${encodeURIComponent(viatura.codigo)}`,
    '_blank',
  )

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-24">
      <Cabecalho
        titulo={viatura.nome}
        subtitulo={`${viatura.identificacao ?? viatura.codigo} · ${formatarKm(ficha.kmAtual)}`}
        acoes={
          <>
            {podeCombustivel && (
              <>
                <Link to={`/frota/viatura/${viatura.id}/editar`} className={botaoSecundario}>
                  <Pencil className="w-4 h-4" aria-hidden="true" /> Editar
                </Link>
                <button type="button" onClick={imprimirQr} className={botaoSecundario} title="Imprimir o QR do abastecimento">
                  <QrCode className="w-4 h-4" aria-hidden="true" /> QR
                </button>
              </>
            )}
            {!isMecanico && (
              <Link to={`/abastecimento/analise?viatura=${viatura.id}`} className={botaoSecundario}>
                <Fuel className="w-4 h-4" aria-hidden="true" /> Consumo
              </Link>
            )}
            <Link to={`/frota/viatura/${viatura.id}/imprimir`} className={botaoSecundario}>
              <Printer className="w-4 h-4" aria-hidden="true" /> Imprimir ficha
            </Link>
          </>
        }
      />

      {podeFrota && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Link to={`/frota/viatura/${viatura.id}/checklist`} className={botaoPrimario}>
            <ClipboardCheck className="w-4 h-4" aria-hidden="true" /> Novo checklist
          </Link>
          <Link to={`/frota/viatura/${viatura.id}/manutencao`} className={botaoPrimario}>
            <Wrench className="w-4 h-4" aria-hidden="true" /> Registar manutenção
          </Link>
          <Link to={`/frota/viatura/${viatura.id}/configurar`} className={botaoSecundario}>
            <Settings2 className="w-4 h-4" aria-hidden="true" /> Itens e prazos
          </Link>
        </div>
      )}

      <Condutor veiculoId={viatura.id} atualId={atual?.colaborador_id ?? null} atualNome={atual ? nome(atual.colaborador_id) : null}
        desde={atual?.desde ?? null} podeEditar={podeFrota} />

      <Seccao titulo="Prazos" icone={<CalendarClock className="w-4 h-4 text-primary" aria-hidden="true" />}>
        {prazos.length === 0 ? (
          <Vazio>Nenhum prazo acompanhado nesta viatura.{podeFrota && ' Use "Itens e prazos" para escolher o que acompanhar (revisão, seguro, IPO…).'}</Vazio>
        ) : (
          <ul className="divide-y divide-border">
            {prazos.map(p => (
              <li key={p.config.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{p.item.rotulo}</p>
                  <BadgeSeveridade severidade={p.severidade} />
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {p.textoKm && <p>Próxima: {p.textoKm}</p>}
                  {p.textoData && <p>Próxima: {p.textoData}</p>}
                  {!p.textoKm && !p.textoData && <p>Sem próxima data definida</p>}
                  <p>
                    {textoIntervalo(p.intervaloKm, p.intervaloMeses)}
                    {p.config.ultima_data && ` · última ${formatarData(p.config.ultima_data)}${p.config.ultima_km != null ? ` aos ${formatarKm(p.config.ultima_km)}` : ''}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Seccao>

      <Seccao titulo="Checklists" icone={<ClipboardCheck className="w-4 h-4 text-primary" aria-hidden="true" />}>
        {ficha.checklists.length === 0 ? <Vazio>Ainda sem checklists.</Vazio> : (
          <ul className="divide-y divide-border">
            {ficha.checklists.map(c => {
              const problemas = c.itens.filter(i => i.estado !== 'OK')
              return (
                <li key={c.id} className="py-3 first:pt-0 last:pb-0 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-medium">{formatarData(c.data)}
                      <span className="text-muted-foreground font-normal"> · {c.itens.length} itens · condutor {nome(c.condutor_id)}
                        {c.km_na_altura != null && ` · ${formatarKm(c.km_na_altura)}`}</span>
                    </p>
                    <BadgeEstado estado={c.estado_geral} />
                  </div>
                  {problemas.length > 0 && (
                    <ul className="text-xs space-y-0.5">
                      {problemas.map(p => (
                        <li key={p.item_id} className="flex gap-2 items-start">
                          <BadgeEstado estado={p.estado} />
                          <span>{p.rotulo}{p.observacao && <span className="text-muted-foreground"> — {p.observacao}</span>}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {c.observacoes && <p className="text-xs text-muted-foreground">{c.observacoes}</p>}
                  {c.foto_keys.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {c.foto_keys.map(k => (
                        <a key={k} href={urlFotoChecklist(k)} target="_blank" rel="noopener noreferrer"
                          className="w-16 h-16 rounded-lg overflow-hidden border border-border bg-muted flex items-center justify-center">
                          <img src={urlFotoChecklist(k)} alt="Foto do checklist" loading="lazy" className="w-full h-full object-cover"
                            onError={e => { e.currentTarget.style.display = 'none' }} />
                        </a>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Seccao>

      <Seccao titulo="Histórico de manutenções" icone={<Wrench className="w-4 h-4 text-primary" aria-hidden="true" />}>
        {ficha.manutencoes.length === 0 ? <Vazio>Ainda sem manutenções registadas.</Vazio> : (
          <ul className="divide-y divide-border">
            {ficha.manutencoes.map(m => (
              <li key={m.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex justify-between gap-2">
                  <p className="text-sm font-medium">{m.item_id ? porItem.get(m.item_id)?.rotulo ?? 'Item' : m.descricao}</p>
                  {m.custo != null && <p className="text-sm font-semibold shrink-0">{formatarEuros(Number(m.custo))}</p>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatarData(m.data)}
                  {m.km_na_altura != null && ` · ${formatarKm(m.km_na_altura)}`}
                  {m.oficina && ` · ${m.oficina}`}
                  {m.condutor_id && ` · condutor ${nome(m.condutor_id)}`}
                </p>
                {m.item_id && m.descricao && <p className="text-xs text-muted-foreground">{m.descricao}</p>}
                {m.observacoes && <p className="text-xs text-muted-foreground">{m.observacoes}</p>}
              </li>
            ))}
          </ul>
        )}
      </Seccao>

      {ficha.atribuicoes.length > 1 && (
        <Seccao titulo="Condutores anteriores" icone={<History className="w-4 h-4 text-primary" aria-hidden="true" />}>
          <ul className="text-sm space-y-1">
            {ficha.atribuicoes.filter(a => a.ate !== null).map(a => (
              <li key={a.id}>{nome(a.colaborador_id)} <span className="text-muted-foreground">— {formatarData(a.desde)} a {formatarData(a.ate!)}</span></li>
            ))}
          </ul>
        </Seccao>
      )}
    </div>
  )
}
