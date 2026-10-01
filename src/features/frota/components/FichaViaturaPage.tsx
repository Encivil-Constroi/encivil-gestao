import { useMemo, useState, type ComponentType } from 'react'
import { Link, useParams } from 'react-router'
import {
  ClipboardCheck, Wrench, Settings2, Printer, CalendarClock, History, Pencil, QrCode, Fuel, KeyRound, Undo2,
  Power, FilePlus2, FileText, ShieldCheck, Gauge, User, MapPin, Maximize2, ImageOff,
} from 'lucide-react'
import { toast } from 'sonner'
import { useRole } from '@/features/auth/useRole'
import { formatarData, diasAte, textoFaltamDias } from '@/app/lib/prazoFrota'
import { useFichaViatura, useCatalogo, useLinhaTempo, useDefinirEstadoViatura } from '../hooks/useFrota'
import { prazosDaViatura, textoIntervalo, type Severidade } from '../lib/frota'
import {
  nivelPrazo, textoLeitura, marcaModelo, rotuloViatura, percorridoDesdeRegisto, filtrarLinhaTempo, FILTROS_TEMPO,
  type FiltroTempo,
} from '../lib/viaturas'
import { urlFotoDocumento } from '../lib/fotosFrota'
import { urlFotoChecklist } from '../services/frotaService'
import type { LinhaTempoRow } from '../db'
import { Cabecalho, BadgeSeveridade, BadgeEstado, Seccao, Vazio, botaoPrimario, botaoSecundario } from './ui'
import { BadgeEstadoViatura, BadgeDocumento, IconeTipoViatura } from './estado'
import { VisorDocumento } from './VisorDocumento'

const LIMITE_INICIAL = 25

const TEMPO_ESTILO: Record<LinhaTempoRow['tipo'], { Icone: ComponentType<{ className?: string }>; cor: string }> = {
  REGISTO:       { Icone: FilePlus2,     cor: 'bg-primary/10 text-primary' },
  ENTREGA:       { Icone: KeyRound,      cor: 'bg-warning/15 text-warning' },
  DEVOLUCAO:     { Icone: Undo2,         cor: 'bg-success/10 text-success' },
  MANUTENCAO:    { Icone: Wrench,        cor: 'bg-destructive/10 text-destructive' },
  EDICAO:        { Icone: Pencil,        cor: 'bg-muted text-muted-foreground' },
  CHECKLIST:     { Icone: ClipboardCheck, cor: 'bg-primary/10 text-primary' },
  ABASTECIMENTO: { Icone: Fuel,          cor: 'bg-secondary/30 text-foreground' },
}

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function Documento({ rotulo, data, caminho, onAbrir }: { rotulo: string; data: string | null; caminho: string | null; onAbrir: (url: string) => void }) {
  const url = urlFotoDocumento(caminho)
  const nivel = nivelPrazo(data)
  return (
    <div className="rounded-xl border border-border p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{rotulo}</p>
        <BadgeDocumento nivel={nivel} />
      </div>
      <p className="text-sm text-muted-foreground">
        {data ? <>Válido até <strong className="text-foreground">{formatarData(data)}</strong> · {textoFaltamDias(diasAte(data))}</> : 'Data não registada'}
      </p>
      {url ? (
        <button type="button" onClick={() => onAbrir(url)} aria-label={`Mostrar ${rotulo.toLowerCase()} em ecrã inteiro`}
          className="relative block w-full rounded-lg overflow-hidden bg-muted group">
          <img src={url} alt={`Foto: ${rotulo}`} loading="lazy" className="w-full h-36 object-cover" />
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/65 text-white text-xs font-medium">
            <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" /> Mostrar ao agente
          </span>
        </button>
      ) : (
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><ImageOff className="w-4 h-4" aria-hidden="true" /> Sem foto</p>
      )}
    </div>
  )
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  )
}

export function FichaViaturaPage() {
  const { id } = useParams()
  const { ficha, loading, error, reload } = useFichaViatura(id)
  const { catalogo } = useCatalogo()
  const { eventos, loading: aCarregarTempo } = useLinhaTempo(id)
  const { definir, loading: aMudarEstado } = useDefinirEstadoViatura()
  const { podeFrota, podeCombustivel, isMecanico } = useRole()
  const [filtro, setFiltro] = useState<FiltroTempo>('TODOS')
  const [mostrarTudo, setMostrarTudo] = useState(false)
  const [visor, setVisor] = useState<{ titulo: string; subtitulo?: string; url: string } | null>(null)

  const prazos = useMemo(() => {
    if (!ficha) return []
    const sev = new Map<string, Severidade>(ficha.alertas.map(a => [a.entidade_id, a.severidade]))
    return prazosDaViatura(catalogo, ficha.itens, sev, ficha.kmAtual)
  }, [ficha, catalogo])

  const filtrados = useMemo(() => filtrarLinhaTempo(eventos, filtro), [eventos, filtro])
  const ultimaEntrega = useMemo(() => eventos.find(e => e.tipo === 'ENTREGA' || e.tipo === 'DEVOLUCAO'), [eventos])

  if (loading && !ficha) return <div className="max-w-3xl mx-auto p-8 text-center text-sm text-muted-foreground">A carregar…</div>
  if (error || !ficha) return (
    <div className="max-w-3xl mx-auto p-8 text-center space-y-3">
      <p className="text-sm text-destructive">{error ?? 'Viatura não encontrada.'}</p>
      <button onClick={reload} className={botaoSecundario}>Tentar de novo</button>
    </div>
  )

  const { viatura, detalhe } = ficha
  const un = detalhe.unidade_contador
  const atual = ficha.atribuicoes.find(a => a.ate === null) ?? null
  const nomeColab = (colabId: string | null) => (colabId ? ficha.colaboradores.get(colabId) ?? '—' : '—')
  const percorrido = percorridoDesdeRegisto(ficha.kmAtual, detalhe.km_registo)
  const proximasRevisoes = prazos.filter(p => p.item.categoria === 'REVISAO_PERIODICA' && (p.textoKm || p.textoData))
  const estado = detalhe.estado_operacional
  const podeEditar = podeFrota || podeCombustivel
  const visiveis = mostrarTudo ? filtrados : filtrados.slice(0, LIMITE_INICIAL)

  // Nova janela: a página do QR abre o diálogo de impressão e não deve tirar o utilizador da ficha
  const imprimirQr = () => window.open(
    `/pub/imprimir-qr?v=${viatura.id}&vn=${encodeURIComponent(viatura.nome)}&vc=${encodeURIComponent(viatura.codigo)}`,
    '_blank',
  )

  const alternarOficina = async () => {
    const alvo = estado === 'OFICINA' ? 'LIVRE' : 'OFICINA'
    if (await definir(viatura.id, alvo)) toast.success(alvo === 'OFICINA' ? 'Viatura na oficina.' : 'Viatura de novo disponível.')
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-24">
      <Cabecalho titulo={rotuloViatura(viatura)} subtitulo={marcaModelo(detalhe)}
        acoes={
          <>
            {podeEditar && (
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

      <section className="bg-card rounded-2xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <IconeTipoViatura tipo={detalhe.tipo} className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <BadgeEstadoViatura estado={estado} />
            <p className="text-sm flex items-center gap-1.5 flex-wrap">
              <User className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              {atual
                ? <><strong>{nomeColab(atual.colaborador_id)}</strong><span className="text-muted-foreground">desde {formatarData(atual.desde)}</span></>
                : <span className="text-muted-foreground">Sem colaborador</span>}
              {ficha.obraNome && <span className="inline-flex items-center gap-1 text-muted-foreground"><MapPin className="w-3.5 h-3.5" aria-hidden="true" />{ficha.obraNome}</span>}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xl font-bold">{textoLeitura(ficha.kmAtual, un)}</p>
            {!detalhe.ativo && <p className="text-xs font-semibold text-destructive">Arquivada</p>}
          </div>
        </div>

        {podeFrota && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {estado === 'LIVRE' && (
              <Link to={`/frota/entregar?viatura=${viatura.id}`} className={botaoPrimario}>
                <KeyRound className="w-4 h-4" aria-hidden="true" /> Entregar
              </Link>
            )}
            {estado === 'EM_USO' && (
              <Link to={`/frota/devolver?viatura=${viatura.id}`} className={botaoPrimario}>
                <Undo2 className="w-4 h-4" aria-hidden="true" /> Devolver
              </Link>
            )}
            <Link to={`/frota/manutencao/nova?viatura=${viatura.id}`} className={botaoPrimario}>
              <Wrench className="w-4 h-4" aria-hidden="true" /> Registar manutenção
            </Link>
            <Link to={`/frota/viatura/${viatura.id}/checklist`} className={botaoSecundario}>
              <ClipboardCheck className="w-4 h-4" aria-hidden="true" /> Checklist
            </Link>
            {estado !== 'EM_USO' && (
              <button type="button" onClick={alternarOficina} disabled={aMudarEstado} className={botaoSecundario}>
                <Power className="w-4 h-4" aria-hidden="true" /> {estado === 'OFICINA' ? 'Tirar da oficina' : 'Pôr na oficina'}
              </button>
            )}
            <Link to={`/frota/viatura/${viatura.id}/configurar`} className={botaoSecundario}>
              <Settings2 className="w-4 h-4" aria-hidden="true" /> Itens e prazos
            </Link>
          </div>
        )}
      </section>

      <Seccao titulo="Documentos" icone={<ShieldCheck className="w-4 h-4 text-primary" aria-hidden="true" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Documento rotulo="Seguro" data={detalhe.data_fim_seguro} caminho={detalhe.seguro_foto_path}
            onAbrir={url => setVisor({ titulo: `Seguro · ${rotuloViatura(viatura)}`, subtitulo: detalhe.data_fim_seguro ? `Válido até ${formatarData(detalhe.data_fim_seguro)}` : undefined, url })} />
          <Documento rotulo="IPO" data={detalhe.data_proxima_ipo} caminho={detalhe.ipo_foto_path}
            onAbrir={url => setVisor({ titulo: `IPO · ${rotuloViatura(viatura)}`, subtitulo: detalhe.data_proxima_ipo ? `Próxima IPO ${formatarData(detalhe.data_proxima_ipo)}` : undefined, url })} />
        </div>
      </Seccao>

      <Seccao titulo="Estado à chegada e atual" icone={<Gauge className="w-4 h-4 text-primary" aria-hidden="true" />}>
        <dl className="divide-y divide-border">
          <Linha rotulo="Registada em">{formatarData(detalhe.created_at.slice(0, 10))}</Linha>
          <Linha rotulo={un === 'horas' ? 'Horas à chegada' : 'Km à chegada'}>{textoLeitura(detalhe.km_registo, un)}</Linha>
          <Linha rotulo={un === 'horas' ? 'Horas atuais' : 'Km atuais'}>{textoLeitura(ficha.kmAtual, un)}</Linha>
          <Linha rotulo={un === 'horas' ? 'Trabalhou desde a chegada' : 'Percorreu desde a chegada'}>{percorrido == null ? '—' : textoLeitura(percorrido, un)}</Linha>
          <Linha rotulo="Última revisão">
            {detalhe.data_ultima_revisao
              ? <>{formatarData(detalhe.data_ultima_revisao)}{detalhe.km_ultima_revisao != null && ` · ${textoLeitura(detalhe.km_ultima_revisao, un)}`}</>
              : 'Sem registo'}
          </Linha>
          <Linha rotulo="Próxima revisão">
            {proximasRevisoes.length === 0 ? '—' : proximasRevisoes.slice(0, 2).map(p => (
              <span key={p.config.id} className="block">{p.textoData ?? p.textoKm}</span>
            ))}
          </Linha>
        </dl>
      </Seccao>

      <Seccao titulo="Itens e prazos" icone={<CalendarClock className="w-4 h-4 text-primary" aria-hidden="true" />}>
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
                    {p.config.ultima_data && ` · última ${formatarData(p.config.ultima_data)}${p.config.ultima_km != null ? ` aos ${textoLeitura(p.config.ultima_km, un)}` : ''}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Seccao>

      <Seccao titulo="Entregas e devoluções" icone={<KeyRound className="w-4 h-4 text-primary" aria-hidden="true" />}
        acao={<Link to={`/frota/entregas?viatura=${viatura.id}`} className="text-sm text-primary font-medium">Ver todas</Link>}>
        {ultimaEntrega ? (
          <p className="text-sm">
            <span className="text-muted-foreground">Último registo: </span>
            <strong>{ultimaEntrega.titulo}</strong>
            <span className="text-muted-foreground"> · {dataHora(ultimaEntrega.quando)}</span>
          </p>
        ) : <Vazio>Ainda sem entregas nem devoluções.</Vazio>}
      </Seccao>

      <Seccao titulo="Linha do tempo" icone={<History className="w-4 h-4 text-primary" aria-hidden="true" />}>
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="group" aria-label="Filtrar eventos">
          {FILTROS_TEMPO.map(f => (
            <button key={f.valor} type="button" onClick={() => { setFiltro(f.valor); setMostrarTudo(false) }} aria-pressed={filtro === f.valor}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
                filtro === f.valor ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
              {f.rotulo}
            </button>
          ))}
        </div>
        {aCarregarTempo && eventos.length === 0 ? <Vazio>A carregar…</Vazio>
          : visiveis.length === 0 ? <Vazio>Sem eventos.</Vazio> : (
          <ol className="space-y-3">
            {visiveis.map(e => {
              const { Icone, cor } = TEMPO_ESTILO[e.tipo]
              return (
                <li key={`${e.tipo}-${e.ref_id}-${e.quando}`} className="flex gap-3">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${cor}`}><Icone className="w-4 h-4" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{e.titulo}</p>
                    {e.detalhe && <p className="text-xs text-muted-foreground">{e.detalhe}</p>}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {dataHora(e.quando)}
                      {e.leitura != null && ` · ${textoLeitura(e.leitura, un)}`}
                      {e.utilizador && ` · por ${e.utilizador}`}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
        {!mostrarTudo && filtrados.length > LIMITE_INICIAL && (
          <button type="button" onClick={() => setMostrarTudo(true)} className={`${botaoSecundario} w-full`}>
            Mostrar mais ({filtrados.length - LIMITE_INICIAL})
          </button>
        )}
      </Seccao>

      {ficha.checklists.length > 0 && (
        <Seccao titulo="Checklists" icone={<FileText className="w-4 h-4 text-primary" aria-hidden="true" />}>
          <ul className="divide-y divide-border">
            {ficha.checklists.slice(0, 5).map(c => {
              const problemas = c.itens.filter(i => i.estado !== 'OK')
              return (
                <li key={c.id} className="py-3 first:pt-0 last:pb-0 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-medium">{formatarData(c.data)}
                      <span className="text-muted-foreground font-normal"> · {c.itens.length} itens · condutor {nomeColab(c.condutor_id)}
                        {c.km_na_altura != null && ` · ${textoLeitura(c.km_na_altura, un)}`}</span>
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
        </Seccao>
      )}

      {visor && <VisorDocumento {...visor} aoFechar={() => setVisor(null)} />}
    </div>
  )
}
