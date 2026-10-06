import { useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { Droplets, Truck, Store, Loader2, User, AlertTriangle } from 'lucide-react'
import type { TipoCombustivel, TipoFonte } from '../../db'
import { ROTULO_COMBUSTIVEL, formatarNumero } from '../../lib/pedido'
import { useContextoAbastecimento, useCriarPedido, useViaturasAtivas } from '../../hooks/usePedidos'
import { useEstadoBomba } from '../../hooks/useBombaPolo2'
import { libertarSaida, useProtegerSaida } from '@/app/lib/protegerSaida'
import { LeituraPorFoto, type LeituraConfirmada } from './LeituraPorFoto'
import { AtivarNotificacoes } from './AtivarNotificacoes'
import { Aviso, Cabecalho, Cartao, inputCls } from './ui'

const FONTES: { valor: TipoFonte; rotulo: string; desc: string; Icone: typeof Droplets }[] = [
  { valor: 'POLO2',     rotulo: 'Bomba Polo 2', desc: 'Depósito da empresa', Icone: Droplets },
  { valor: 'CARRINHA',  rotulo: 'Carrinha',     desc: 'Depósito móvel',      Icone: Truck },
  { valor: 'POSTO_RUA', rotulo: 'Posto de rua', desc: 'Com talão',           Icone: Store },
]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function NovoPedidoPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // QR colado na viatura (/pub/combustivel?v=… → /abastecimento/pedir?v=…)
  const viaturaQr = params.get('v') && UUID.test(params.get('v')!) ? params.get('v')! : null

  const { contexto, loading, error } = useContextoAbastecimento()
  const { viaturas } = useViaturasAtivas()
  const { criar, loading: aEnviar, error: erroEnvio } = useCriarPedido()
  // Um id por ecrã: a foto dos km é guardada com ele antes de o pedido existir
  const [pedidoId] = useState(() => crypto.randomUUID())

  const [viaturaEscolhida, setViaturaEscolhida] = useState<string | null>(null)
  const [fonte, setFonte] = useState<TipoFonte>('POLO2')
  const [combustivel, setCombustivel] = useState<TipoCombustivel | null>(null)
  const [obs, setObs] = useState('')

  useProtegerSaida(!!viaturaEscolhida || !!combustivel || obs.trim() !== '', 'O pedido ainda não foi enviado. Se sair agora, perde o que preencheu.')

  const veiculoId = viaturaEscolhida ?? viaturaQr ?? contexto?.veiculo_id ?? null
  const viatura = useMemo(() => viaturas.find(v => v.id === veiculoId) ?? null, [viaturas, veiculoId])
  const combustivelViatura = (viatura?.tipo_combustivel === 'gasolina' || viatura?.tipo_combustivel === 'gasoleo')
    ? viatura.tipo_combustivel : null
  const tipoCombustivel = combustivel ?? combustivelViatura
  const kmAtual = veiculoId && veiculoId === contexto?.veiculo_id ? contexto.km_atual : null

  const { estado: bomba } = useEstadoBomba(fonte === 'POLO2')
  const bombaBloqueada = fonte === 'POLO2' ? bomba?.bloqueioMotivo ?? null : null

  if (contexto?.pedido_aberto_id) return <Navigate to={`/abastecimento/pedido/${contexto.pedido_aberto_id}`} replace />

  const enviar = async (l: LeituraConfirmada) => {
    if (!veiculoId || !tipoCombustivel) return
    const id = await criar({
      id: pedidoId, veiculoId, tipoFonte: fonte, tipoCombustivel,
      km: Math.round(l.valor), fotoKmPath: l.fotoPath, observacoes: obs.trim() || null,
    })
    if (id) libertarSaida()
    if (id) navigate(`/abastecimento/pedido/${id}`, { replace: true })
  }

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-24">
      <Cabecalho titulo="Pedir abastecimento"
        subtitulo="Preencha, fotografe os km e o pedido segue logo para aprovação." />

      <AtivarNotificacoes motivo="para saber logo quando o pedido for aprovado" />

      {error && <Aviso tipo="erro">{error}</Aviso>}

      <Cartao>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <User className="w-5 h-5 text-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Motorista</p>
            <p className="font-semibold truncate">{loading ? 'A carregar…' : contexto?.nome ?? '—'}</p>
          </div>
        </div>
        {!loading && !contexto?.nome && (
          <Aviso tipo="alerta">A sua conta não tem nome. Peça ao administrador para o completar antes de pedir.</Aviso>
        )}

        <div>
          <label htmlFor="viatura" className="block text-sm font-medium mb-1.5">Viatura</label>
          <select id="viatura" value={veiculoId ?? ''} onChange={e => setViaturaEscolhida(e.target.value || null)} className={inputCls}>
            <option value="">Escolha a viatura…</option>
            {viaturas.map(v => (
              <option key={v.id} value={v.id}>{v.nome}{v.identificacao ? ` · ${v.identificacao}` : ''}</option>
            ))}
          </select>
          {veiculoId && veiculoId === contexto?.veiculo_id && !viaturaQr && (
            <p className="text-xs text-muted-foreground mt-1">A viatura que lhe está atribuída.</p>
          )}
          {kmAtual != null && <p className="text-xs text-muted-foreground mt-1">Últimos km conhecidos: {formatarNumero(kmAtual, 0)} km</p>}
        </div>
      </Cartao>

      <Cartao>
        <p className="text-sm font-medium">Onde vai abastecer?</p>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Onde vai abastecer">
          {FONTES.map(({ valor, rotulo, desc, Icone }) => (
            <button key={valor} type="button" role="radio" aria-checked={fonte === valor} onClick={() => setFonte(valor)}
              className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-center transition-colors ${
                fonte === valor ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'}`}>
              <Icone className={`w-6 h-6 ${fonte === valor ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden="true" />
              <span className="text-sm font-semibold leading-tight">{rotulo}</span>
              <span className="text-[11px] text-muted-foreground leading-tight">{desc}</span>
            </button>
          ))}
        </div>
        {bombaBloqueada && (
          <Aviso tipo="erro">
            <span className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />{bombaBloqueada}</span>
          </Aviso>
        )}

        <p className="text-sm font-medium pt-1">Combustível</p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Combustível">
          {(['gasoleo', 'gasolina'] as const).map(t => (
            <button key={t} type="button" role="radio" aria-checked={tipoCombustivel === t} onClick={() => setCombustivel(t)}
              className={`py-3 rounded-xl border-2 text-base font-semibold transition-colors ${
                tipoCombustivel === t ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:bg-accent'}`}>
              {ROTULO_COMBUSTIVEL[t]}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor="obs" className="block text-sm font-medium mb-1.5">Observações <span className="text-muted-foreground font-normal">(opcional)</span></label>
          <input id="obs" value={obs} onChange={e => setObs(e.target.value)} maxLength={300} className={inputCls}
            placeholder="Ex.: depósito na reserva" />
        </div>
      </Cartao>

      <Cartao>
        {!veiculoId || !tipoCombustivel || !contexto?.nome || bombaBloqueada ? (
          <p className="text-sm text-muted-foreground">
            {!veiculoId ? 'Escolha a viatura' : !tipoCombustivel ? 'Escolha o combustível' : !contexto?.nome ? 'Conta sem nome' : 'Bomba indisponível — escolha outro local'}
            {' '}para continuar.
          </p>
        ) : (
          <LeituraPorFoto
            key={`${veiculoId}`}
            veiculoId={veiculoId} pedidoId={pedidoId} leitura="KM"
            titulo="Foto dos km"
            instrucao="Fotografe o conta-quilómetros agora. A IA lê o valor; confirme antes de enviar."
            rotuloValor="Km atuais" unidade="km"
            textoConfirmar="Pedir autorização"
            validar={v => (v < 0 || v >= 10_000_000 ? 'Km inválidos' : null)}
            resumo={v => kmAtual != null && (v < kmAtual || v > kmAtual + 3000) ? (
              <Aviso tipo="alerta">Os km parecem fora do normal (últimos: {formatarNumero(kmAtual, 0)}). Confirme — o responsável vai ver este aviso.</Aviso>
            ) : null}
            aGuardar={aEnviar}
            onConfirmar={enviar}
          />
        )}
        {aEnviar && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> A enviar o pedido…
          </p>
        )}
        {erroEnvio && <Aviso tipo="erro">{erroEnvio}</Aviso>}
      </Cartao>
    </div>
  )
}
