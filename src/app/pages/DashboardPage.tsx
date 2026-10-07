import { useMemo } from 'react'
import { Link } from 'react-router'
import { ArrowDownCircle, ArrowUpCircle, Fuel, Building2, Wallet, Banknote, ShieldAlert, RefreshCw } from 'lucide-react'
import { useAsync, invalidateCache } from '../lib/useAsync'
import { fmtEuro } from '../lib/format'
import { analiseObras } from '../lib/relatorios/obrasAnalise'
import { construirAtencao } from '../lib/relatorios/atencao'
import { construirDecisoes, obrasEmRisco, saudacao } from '../lib/dashboard/resumo'
import { useRole } from '@/features/auth/useRole'
import { AlertasWidget } from '@/features/alertas'
import { KpiCard } from './relatorios/KpiCard'
import { carregarDashboard } from './dashboard/dados'
import { ArmazemSecao } from './dashboard/ArmazemSecao'
import { AvisoIncompleto, PainelAtencao, PainelDecisoes, ObrasEmRisco } from './dashboard/ExecutivoSecoes'

const CACHE_KEY = 'dashboard-executivo'
const valor = <T,>(b: { ok: true; data: T } | { ok: false; erro: string }): T | undefined => (b.ok ? b.data : undefined)

const NOMES = {
  obras: 'Obras', subs: 'Subempreitadas', frota: 'Frota', artigosEmAlerta: 'Armazém (alertas)', ferramentasEmAtraso: 'Ferramentas',
  contratosPorValidar: 'Contratos por validar', autosPorValidar: 'Autos por validar', pedidosCombustivel: 'Pedidos de combustível', faltasPorDecidir: 'Faltas',
} as const

export function DashboardPage() {
  const { data, loading, error, reload } = useAsync(carregarDashboard, [], { cacheKey: CACHE_KEY, cacheTtl: 30_000, errorMsg: 'Erro ao carregar o dashboard' })
  const { role } = useRole()
  const podePedirCombustivel = role != null && role !== 'leitura'

  const r = useMemo(() => {
    if (!data) return null
    const { visao, decisoes } = data
    const obras = valor(visao.obras), subs = valor(visao.subs)
    const analise = obras ? analiseObras(obras.filter(o => o.estado !== 'concluida')) : null
    const atencao = construirAtencao({
      obras, subs, frota: valor(visao.frota),
      artigosEmAlerta: valor(visao.artigosEmAlerta), ferramentasEmAtraso: valor(visao.ferramentasEmAtraso),
    })
    const falhas = [
      ...(Object.keys(visao) as (keyof typeof visao)[]).filter(k => !visao[k].ok).map(k => NOMES[k]),
      ...(Object.keys(decisoes) as (keyof typeof decisoes)[]).filter(k => !decisoes[k].ok).map(k => NOMES[k]),
    ]
    return {
      ativas: obras?.filter(o => o.estado === 'ativa').length,
      analise, atencao, falhas,
      porPagar: subs?.totais.por_pagar,
      urgentes: atencao.filter(i => i.gravidade === 'alta').length,
      risco: obras ? obrasEmRisco(obras) : null,
      decisoes: construirDecisoes({
        contratosPorValidar: valor(decisoes.contratosPorValidar), autosPorValidar: valor(decisoes.autosPorValidar),
        pedidosCombustivel: valor(decisoes.pedidosCombustivel), faltasPorDecidir: valor(decisoes.faltasPorDecidir),
      }),
    }
  }, [data])

  // Invalida também a cache partilhada com a Visão Geral e a do armazém: o botão atualiza tudo
  const atualizar = () => { invalidateCache(CACHE_KEY, 'relatorio-visao-geral', 'dashboard') }

  const hoje = new Date()
  const margem = r?.analise?.totalMargem
  const aCarregar = loading && !data

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">{saudacao(hoje)}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 capitalize">
            {hoje.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Lisbon' })} · ENCIVIL Gestão
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
          {data && <span className="hidden sm:inline">Atualizado às {data.atualizadoEm.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' })}</span>}
          <button onClick={atualizar} disabled={loading} aria-label="Atualizar dashboard" className="p-2 rounded-lg border border-border hover:bg-accent disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className={`grid gap-3 enc-fade-up ${podePedirCombustivel ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <Link to="/armazem/movimento/saida" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2 py-4 text-xs sm:text-sm text-center bg-destructive text-destructive-foreground rounded-xl hover:bg-destructive/90 active:scale-95 transition-all font-medium shadow-sm">
          <ArrowUpCircle className="w-5 h-5 shrink-0" /><span>Registar Saída</span>
        </Link>
        <Link to="/armazem/movimento/entrada" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2 py-4 text-xs sm:text-sm text-center bg-success text-success-foreground rounded-xl hover:bg-success/90 active:scale-95 transition-all font-medium shadow-sm">
          <ArrowDownCircle className="w-5 h-5 shrink-0" /><span>Registar Entrada</span>
        </Link>
        {podePedirCombustivel && (
          <Link to="/abastecimento/pedir" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2 py-4 text-xs sm:text-sm text-center bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 active:scale-95 transition-all font-medium shadow-sm">
            <Fuel className="w-5 h-5 shrink-0" /><span>Pedir combustível</span>
          </Link>
        )}
      </div>

      {error && !data && (
        <div className="rounded-xl border border-destructive/40 bg-card p-4 flex items-center gap-3" role="alert">
          <p className="text-sm flex-1">{error}</p>
          <button onClick={reload} className="px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-accent">Tentar de novo</button>
        </div>
      )}
      {r && <AvisoIncompleto modulos={r.falhas} onRetry={atualizar} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <KpiCard label="Obras ativas" value={r?.ativas ?? '—'} icon={Building2} iconBg="bg-primary/10" valueColor="text-primary" to="/obras" loading={aCarregar} />
        <KpiCard label="Margem (obras com orçamento)" value={margem != null ? fmtEuro(margem) : '—'} icon={Wallet}
          iconBg={margem != null && margem < 0 ? 'bg-destructive/10' : 'bg-success/10'} valueColor={margem != null && margem < 0 ? 'text-destructive' : 'text-success'} to="/obras" loading={aCarregar} />
        <KpiCard label="Por pagar a subempreiteiros" value={r?.porPagar != null ? fmtEuro(r.porPagar) : '—'} icon={Banknote} iconBg="bg-warning/10" valueColor="text-warning" to="/obras/subempreitadas" loading={aCarregar} />
        <KpiCard label="Situações urgentes" value={r ? r.urgentes : '—'} icon={ShieldAlert}
          iconBg={r && r.urgentes > 0 ? 'bg-destructive/10' : 'bg-success/10'} valueColor={r && r.urgentes > 0 ? 'text-destructive' : 'text-success'} loading={aCarregar} />
      </div>

      {r && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <PainelDecisoes itens={r.decisoes} />
          <div className="lg:col-span-2"><PainelAtencao itens={r.atencao} /></div>
        </div>
      )}
      {r?.risco && <ObrasEmRisco obras={r.risco} />}

      <ArmazemSecao />
      <AlertasWidget />
    </div>
  )
}
