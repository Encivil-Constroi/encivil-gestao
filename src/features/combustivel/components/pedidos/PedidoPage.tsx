import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router'
import {
  Hourglass, XCircle, CheckCircle2, Power, Loader2, AlertTriangle, Ban, Camera, Gauge, ImageIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/AuthContext'
import type { PedidoRow } from '../../db'
import {
  BOMBA_MAX_SEGUNDOS, LITROS_MAX, ROTULO_COMBUSTIVEL, ROTULO_FONTE, fasePedido, formatarDataHora, formatarEuros,
  formatarHora, formatarNumero, litrosPorDiferenca, minutosDesde, textoDuracao,
} from '../../lib/pedido'
import {
  useCancelarPedido, useConcluirPedido, useContadorInicial, useLigarBomba, usePedido, usePodeAprovar, usePrecos,
} from '../../hooks/usePedidos'
import { useEstadoPedidoBomba } from '../../hooks/useBombaPolo2'
import { urlFotoCombustivel } from '../../services/fotosService'
import { BombaAtiva } from '../BombaAtiva'
import { AcoesAprovador } from './AcoesAprovador'
import { AtivarNotificacoes } from './AtivarNotificacoes'
import { LeituraPorFoto } from './LeituraPorFoto'
import { Aviso, BadgeEspera, BadgeEstado, Cabecalho, Cartao, botaoSecundario } from './ui'

function useAgora(ms = 1_000) {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return agora
}

export function PedidoPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { pedido, loading, error } = usePedido(id)
  const { podeAprovar } = usePodeAprovar()

  if (loading && !pedido) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" aria-label="A carregar" /></div>
  }
  if (!pedido) {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <Cabecalho titulo="Pedido" />
        <Aviso tipo="erro">{error ?? 'Pedido não encontrado'}</Aviso>
        <Link to="/abastecimento" className={botaoSecundario}>Ver os pedidos</Link>
      </div>
    )
  }

  const souDono = pedido.solicitante_id === user?.id
  return (
    <div className="max-w-lg mx-auto space-y-4 pb-24">
      <Cabecalho titulo={pedido.veiculo_nome}
        subtitulo={`${pedido.tipo_fonte ? ROTULO_FONTE[pedido.tipo_fonte] : '—'}${pedido.tipo_combustivel ? ` · ${ROTULO_COMBUSTIVEL[pedido.tipo_combustivel]}` : ''}`}
        acoes={<BadgeEstado estado={pedido.estado} />} />

      {souDono && <Execucao pedido={pedido} />}

      {podeAprovar && !souDono && (pedido.estado === 'AGUARDA_AUTORIZACAO' || pedido.estado === 'AUTORIZADO' || pedido.estado === 'AGUARDA_APROVACAO') && (
        <Cartao>
          <p className="text-sm font-semibold">Decisão</p>
          {pedido.estado === 'AGUARDA_AUTORIZACAO' && <BadgeEspera minutos={minutosDesde(pedido.criado_em)} />}
          <AcoesAprovador pedido={pedido} />
        </Cartao>
      )}
      {/* O aprovador que pede para si próprio também decide (ex.: o CEO a abastecer) */}
      {podeAprovar && souDono && pedido.estado === 'AGUARDA_AUTORIZACAO' && (
        <Cartao><AcoesAprovador pedido={pedido} /></Cartao>
      )}

      <Detalhes pedido={pedido} />
    </div>
  )
}

// ── Execução (só o motorista que pediu) ──────────────────────────────────────
function Execucao({ pedido }: { pedido: PedidoRow }) {
  const agora = useAgora()
  const polo2Autorizado = pedido.tipo_fonte === 'POLO2' && pedido.estado === 'AUTORIZADO'
  const estadoBomba = useEstadoPedidoBomba(pedido.id, polo2Autorizado)
  const fase = fasePedido(pedido, estadoBomba ? estadoBomba.sessaoAtiva : null, agora)

  const { cancelar, loading: aCancelar } = useCancelarPedido()
  const { registar, loading: aRegistar, error: erroRegisto } = useContadorInicial()
  const { ligar, loading: aLigar, error: erroLigar } = useLigarBomba()
  const { concluir, loading: aConcluir, error: erroConcluir } = useConcluirPedido()
  const { precos } = usePrecos()
  const preco = precos.find(p => p.tipo_combustivel === pedido.tipo_combustivel)?.preco_litro ?? null

  const aoCancelar = async () => {
    if (await cancelar(pedido.id)) toast.success('Pedido cancelado.')
  }

  switch (fase) {
    case 'ESPERA': {
      const min = minutosDesde(pedido.criado_em, agora)
      return (
        <Cartao className="border-warning/40">
          <div className="flex flex-col items-center text-center gap-2 py-4">
            <div className="w-16 h-16 rounded-full bg-warning/15 flex items-center justify-center">
              <Hourglass className="w-8 h-8 text-warning animate-pulse" aria-hidden="true" />
            </div>
            <p className="text-lg font-bold">À espera de aprovação</p>
            <p className="text-sm text-muted-foreground">Enviado às {formatarHora(pedido.criado_em)} · há {textoDuracao(min)}</p>
            <p className="text-sm">Recebe uma notificação assim que for decidido. Pode fechar a app.</p>
          </div>
          <AtivarNotificacoes motivo="para saber logo quando for aprovado" />
          <button type="button" onClick={aoCancelar} disabled={aCancelar} className={`w-full ${botaoSecundario}`}>
            <Ban className="w-4 h-4" aria-hidden="true" /> Cancelar pedido
          </button>
        </Cartao>
      )
    }
    case 'RECUSADO':
      return (
        <Cartao className="border-destructive/40">
          <div className="flex flex-col items-center text-center gap-2 py-3">
            <XCircle className="w-12 h-12 text-destructive" aria-hidden="true" />
            <p className="text-lg font-bold">Pedido recusado</p>
            <p className="text-sm">{pedido.motivo_recusa ? <>Motivo: <strong>{pedido.motivo_recusa}</strong></> : 'Fale com o responsável.'}</p>
          </div>
          <Link to="/abastecimento/pedir" className={`w-full ${botaoSecundario}`}>Fazer outro pedido</Link>
        </Cartao>
      )
    case 'CANCELADO':
      return <Aviso>Pedido cancelado{pedido.cancelado_em ? ` às ${formatarHora(pedido.cancelado_em)}` : ''}.</Aviso>
    case 'ANTIGO':
      return <Aviso>Registo do sistema anterior, à espera da aprovação final.</Aviso>
    case 'CONCLUIDO':
      return (
        <Cartao className="border-success/40">
          <div className="flex flex-col items-center text-center gap-2 py-4">
            <CheckCircle2 className="w-14 h-14 text-success" aria-hidden="true" />
            <p className="text-lg font-bold">Abastecimento registado</p>
            <p className="text-3xl font-bold tabular-nums">{formatarNumero(pedido.litros ?? 0)} L</p>
            {pedido.custo_total != null && pedido.custo_total > 0 && (
              <p className="text-sm text-muted-foreground">{formatarEuros(pedido.custo_total)}</p>
            )}
          </div>
        </Cartao>
      )
    case 'CONTADOR_INICIAL':
      return (
        <Cartao className="border-primary/40">
          <Aviso tipo="ok"><strong>Autorizado!</strong> Siga os passos na bomba.</Aviso>
          <Passos atual={1} />
          <LeituraPorFoto
            veiculoId={pedido.veiculo_id} pedidoId={pedido.id} leitura="CONTADOR"
            titulo="1. Foto do contador da bomba"
            instrucao="Antes de ligar: fotografe o contador da bomba Polo 2 (o número total de litros)."
            rotuloValor="Leitura do contador" unidade="L"
            textoConfirmar="Confirmar leitura"
            validar={v => (v >= 100_000_000 ? 'Leitura inválida' : null)}
            aGuardar={aRegistar}
            onConfirmar={async l => { await registar(pedido.id, l.valor, l.fotoPath, l.origem) }}
          />
          {erroRegisto && <Aviso tipo="erro">{erroRegisto}</Aviso>}
        </Cartao>
      )
    case 'LIGAR':
      return (
        <Cartao className="border-success/40">
          <Passos atual={2} />
          <p className="text-sm">Contador inicial: <strong className="tabular-nums">{formatarNumero(pedido.contador_inicial ?? 0)}</strong></p>
          {estadoBomba?.bloqueioMotivo && <Aviso tipo="erro">{estadoBomba.bloqueioMotivo}</Aviso>}
          <button type="button" onClick={() => ligar(pedido.id)} disabled={aLigar || !!estadoBomba?.bloqueioMotivo}
            className="w-full flex items-center justify-center gap-3 py-6 bg-success text-success-foreground rounded-2xl text-2xl font-extrabold tracking-wide shadow-lg active:scale-[0.98] transition-transform disabled:opacity-60">
            {aLigar ? <Loader2 className="w-7 h-7 animate-spin" aria-hidden="true" /> : <Power className="w-8 h-8" aria-hidden="true" />}
            LIGAR BOMBA
          </button>
          <p className="text-xs text-muted-foreground text-center">
            A bomba fica ligada no máximo {BOMBA_MAX_SEGUNDOS / 60} minutos. Quando acabar, carregue em “Terminei”.
          </p>
          {pedido.bomba_ligada_em && (
            <Aviso tipo="alerta">A bomba não chegou a ligar. Confirme que o quadro está ligado e carregue outra vez.</Aviso>
          )}
          {erroLigar && <Aviso tipo="erro">{erroLigar}</Aviso>}
        </Cartao>
      )
    case 'A_LIGAR':
      return (
        <Cartao className="border-success/40">
          <Passos atual={2} />
          <div role="status" className="flex flex-col items-center text-center gap-2 py-4">
            <Loader2 className="w-10 h-10 animate-spin text-success" aria-hidden="true" />
            <p className="text-lg font-bold">A ligar a bomba…</p>
            <p className="text-sm text-muted-foreground">
              {estadoBomba?.bombaOcupada
                ? 'A bomba está a ser usada. Liga assim que ficar livre.'
                : 'Demora até 5 segundos.'}
            </p>
            {estadoBomba?.bloqueioMotivo && <Aviso tipo="erro">{estadoBomba.bloqueioMotivo}</Aviso>}
          </div>
        </Cartao>
      )
    case 'A_ABASTECER':
      return (
        <Cartao className="border-primary/40">
          <Passos atual={3} />
          <BombaAtiva ativadaEm={pedido.pump_activated_at!} maxSegundos={pedido.pump_max_seconds ?? BOMBA_MAX_SEGUNDOS} pedidoId={pedido.id} />
        </Cartao>
      )
    case 'CONTADOR_FINAL': {
      const inicial = pedido.contador_inicial ?? 0
      return (
        <Cartao className="border-primary/40">
          <Passos atual={4} />
          <BombaAtiva ativadaEm={pedido.pump_activated_at!} maxSegundos={pedido.pump_max_seconds ?? BOMBA_MAX_SEGUNDOS} pedidoId={pedido.id} />
          <LeituraPorFoto
            veiculoId={pedido.veiculo_id} pedidoId={pedido.id} leitura="CONTADOR"
            titulo="4. Foto do contador no fim"
            instrucao={`Fotografe outra vez o contador da bomba. Leitura inicial: ${formatarNumero(inicial)}.`}
            rotuloValor="Leitura final do contador" unidade="L"
            textoConfirmar="Concluir abastecimento"
            validar={v => { const r = litrosPorDiferenca(inicial, v); return r && 'erro' in r ? r.erro : null }}
            resumo={v => {
              const r = litrosPorDiferenca(inicial, v)
              if (!r || 'erro' in r) return null
              return (
                <div className="flex items-baseline justify-between p-3 rounded-xl bg-primary/5">
                  <span className="text-sm text-muted-foreground">Abastecido</span>
                  <span className="text-right">
                    <strong className="text-2xl tabular-nums">{formatarNumero(r.litros)} L</strong>
                    {preco != null && <span className="block text-xs text-muted-foreground">≈ {formatarEuros(r.litros * preco)}</span>}
                  </span>
                </div>
              )
            }}
            aGuardar={aConcluir}
            onConfirmar={async l => {
              const ok = await concluir(pedido.id, { leituraFinal: l.valor, litros: null, custo: null, fotoPath: l.fotoPath, origem: l.origem })
              if (ok) toast.success('Abastecimento registado.')
            }}
          />
          {erroConcluir && <Aviso tipo="erro">{erroConcluir}</Aviso>}
        </Cartao>
      )
    }
    case 'REGISTO': {
      const talao = pedido.tipo_fonte === 'POSTO_RUA'
      return (
        <Cartao className="border-primary/40">
          <Aviso tipo="ok"><strong>Autorizado!</strong> {talao ? 'Abasteça no posto e guarde o talão.' : 'Abasteça na carrinha.'}</Aviso>
          <LeituraPorFoto
            veiculoId={pedido.veiculo_id} pedidoId={pedido.id} leitura={talao ? 'TALAO' : 'MEDIDOR'}
            titulo={talao ? 'Foto do talão' : 'Foto do medidor'}
            instrucao={talao ? 'Fotografe o talão inteiro, com os litros e o total bem visíveis.' : 'Fotografe o medidor da carrinha com os litros abastecidos.'}
            rotuloValor="Litros abastecidos" unidade="L" pedirCusto={talao}
            textoConfirmar="Concluir abastecimento"
            validar={v => (v <= 0 || v > LITROS_MAX ? `Indique entre 0 e ${LITROS_MAX} litros` : null)}
            resumo={v => (!talao && preco != null ? <p className="text-sm text-muted-foreground">≈ {formatarEuros(v * preco)}</p> : null)}
            aGuardar={aConcluir}
            onConfirmar={async l => {
              const ok = await concluir(pedido.id, { leituraFinal: null, litros: l.valor, custo: l.custo, fotoPath: l.fotoPath, origem: l.origem })
              if (ok) toast.success('Abastecimento registado.')
            }}
          />
          {erroConcluir && <Aviso tipo="erro">{erroConcluir}</Aviso>}
        </Cartao>
      )
    }
  }
}

const PASSOS = ['Contador antes', 'Ligar bomba', 'Abastecer', 'Contador depois']

function Passos({ atual }: { atual: number }) {
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label="Passos na bomba">
      {PASSOS.map((p, i) => {
        const n = i + 1
        const estado = n < atual ? 'feito' : n === atual ? 'atual' : 'depois'
        return (
          <li key={p} aria-current={estado === 'atual' ? 'step' : undefined} className="flex flex-col items-center gap-1 text-center">
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
              estado === 'feito' ? 'bg-success text-success-foreground' : estado === 'atual' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              {estado === 'feito' ? '✓' : n}
            </span>
            <span className={`text-[11px] leading-tight ${estado === 'atual' ? 'font-semibold' : 'text-muted-foreground'}`}>{p}</span>
          </li>
        )
      })}
    </ol>
  )
}

// ── Detalhes (todos os que veem o pedido) ────────────────────────────────────
function Detalhes({ pedido }: { pedido: PedidoRow }) {
  const fotos = [
    { rotulo: 'Km', path: pedido.foto_km_path },
    { rotulo: 'Contador antes', path: pedido.foto_contador_inicial_path },
    { rotulo: pedido.tipo_fonte === 'POSTO_RUA' ? 'Talão' : pedido.tipo_fonte === 'CARRINHA' ? 'Medidor' : 'Contador depois', path: pedido.foto_final_path },
  ].filter((f): f is { rotulo: string; path: string } => !!f.path)
  const fotoAntiga = pedido.foto_medidor_url ?? pedido.foto_url

  const linhas: [string, string | null][] = [
    ['Motorista', pedido.funcionario_nome],
    ['Pedido', formatarDataHora(pedido.criado_em)],
    ['Km', pedido.contador != null ? `${formatarNumero(pedido.contador, 0)} km` : null],
    ['Decisão', pedido.decisao_em ? formatarDataHora(pedido.decisao_em) : null],
    ['Bomba ligou', pedido.pump_activated_at ? formatarHora(pedido.pump_activated_at) : null],
    ['Contador', pedido.contador_inicial != null
      ? `${formatarNumero(pedido.contador_inicial)}${pedido.contador_final != null ? ` → ${formatarNumero(pedido.contador_final)}` : ''}` : null],
    ['Litros', pedido.litros != null ? `${formatarNumero(pedido.litros)} L` : null],
    ['Custo', pedido.custo_total != null && pedido.estado === 'CONCLUIDO' ? formatarEuros(pedido.custo_total) : null],
    ['Concluído', pedido.concluido_em ? formatarDataHora(pedido.concluido_em) : null],
    ['Observações', pedido.observacoes],
  ]

  return (
    <Cartao>
      <p className="text-sm font-semibold flex items-center gap-2"><Gauge className="w-4 h-4 text-muted-foreground" aria-hidden="true" /> Detalhes</p>
      {pedido.km_suspeito && (
        <Aviso tipo="alerta">
          <span className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            Km fora do normal{pedido.km_anterior != null ? ` — últimos conhecidos: ${formatarNumero(pedido.km_anterior, 0)} km` : ''}. Confira a foto.
          </span>
        </Aviso>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {linhas.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-medium text-right tabular-nums break-words">{v}</dd>
          </div>
        ))}
      </dl>
      {(fotos.length > 0 || fotoAntiga) && (
        <div className="grid grid-cols-3 gap-2 pt-1">
          {fotos.map(f => (
            <a key={f.rotulo} href={urlFotoCombustivel(f.path)} target="_blank" rel="noopener noreferrer" className="block space-y-1">
              <img src={urlFotoCombustivel(f.path)} alt={`Foto: ${f.rotulo}`} loading="lazy"
                className="w-full aspect-square object-cover rounded-xl border border-border bg-muted" />
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Camera className="w-3 h-3" aria-hidden="true" />{f.rotulo}</span>
            </a>
          ))}
          {fotoAntiga && (
            <a href={fotoAntiga} target="_blank" rel="noopener noreferrer" className="block space-y-1">
              <img src={fotoAntiga} alt="Foto do registo" loading="lazy" className="w-full aspect-square object-cover rounded-xl border border-border bg-muted" />
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><ImageIcon className="w-3 h-3" aria-hidden="true" />Foto</span>
            </a>
          )}
        </div>
      )}
    </Cartao>
  )
}
