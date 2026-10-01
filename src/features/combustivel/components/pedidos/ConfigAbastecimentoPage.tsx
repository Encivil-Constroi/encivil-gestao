import { useState } from 'react'
import { toast } from 'sonner'
import { ShieldCheck, Euro, Loader2 } from 'lucide-react'
import type { TipoCombustivel } from '../../db'
import { ROTULO_COMBUSTIVEL, formatarDataHora, lerNumero } from '../../lib/pedido'
import { useAprovadores, useDefinirAprovador, useDefinirPreco, usePrecos } from '../../hooks/usePedidos'
import { Aviso, Cabecalho, Cartao, botaoPrimario, inputCls } from './ui'

const PAPEL: Record<string, string> = {
  admin: 'Administrador', gestor: 'Gestor', armazem: 'Armazém', medicoes: 'Medições', mecanico: 'Mecânico', motorista: 'Motorista', leitura: 'Leitura',
}

// Só o admin chega aqui (RoleGuard na rota; as RPCs verificam de novo no servidor)
export function ConfigAbastecimentoPage({ embutido = false }: { embutido?: boolean } = {}) {
  return (
    <div className={embutido ? 'space-y-4' : 'max-w-2xl mx-auto space-y-4 pb-24'}>
      {!embutido && (
        <Cabecalho titulo="Abastecimento — configuração" subtitulo="Quem autoriza os pedidos e o preço por litro do combustível da empresa" />
      )}
      <Aprovadores />
      <Precos />
    </div>
  )
}

function Aprovadores() {
  const { aprovadores, utilizadores, loading, error } = useAprovadores()
  const { definir } = useDefinirAprovador()
  const [aGuardar, setAGuardar] = useState<string | null>(null)

  const alternar = async (id: string, nome: string) => {
    const aprova = !aprovadores.has(id)
    setAGuardar(id)
    const ok = await definir(id, aprova)
    setAGuardar(null)
    if (ok) toast.success(aprova ? `${nome} passa a autorizar abastecimentos.` : `${nome} deixa de autorizar abastecimentos.`)
  }

  return (
    <Cartao>
      <p className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" aria-hidden="true" /> Quem autoriza</p>
      <Aviso>
        {aprovadores.size === 0
          ? <>Ninguém designado: <strong>todos os administradores</strong> autorizam. Escolha o CEO (e quem ele designar) para que só eles autorizem.</>
          : <>Só as pessoas escolhidas autorizam e recebem os pedidos no telemóvel.</>}
      </Aviso>
      {error && <Aviso tipo="erro">{error}</Aviso>}
      {loading && utilizadores.length === 0 ? <p className="text-sm text-muted-foreground">A carregar…</p> : (
        <ul className="divide-y divide-border">
          {utilizadores.filter(u => u.role !== 'motorista' && u.role !== 'leitura').map(u => {
            const ativo = aprovadores.has(u.id)
            return (
              <li key={u.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{u.nome}</p>
                  <p className="text-xs text-muted-foreground">{PAPEL[u.role] ?? u.role}</p>
                </div>
                <button type="button" role="switch" aria-checked={ativo} aria-label={`${u.nome} autoriza abastecimentos`}
                  onClick={() => alternar(u.id, u.nome)} disabled={aGuardar === u.id}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${ativo ? 'bg-primary' : 'bg-muted'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${ativo ? 'translate-x-5' : ''}`} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Cartao>
  )
}

function Precos() {
  const { precos, loading } = usePrecos()
  return (
    <Cartao>
      <p className="text-sm font-semibold flex items-center gap-2"><Euro className="w-4 h-4 text-primary" aria-hidden="true" /> Preço por litro (Polo 2 e carrinha)</p>
      <p className="text-sm text-muted-foreground">
        Usado para calcular o custo de cada abastecimento com combustível da empresa. No posto de rua vale o valor do talão.
        Alterar o preço não mexe nos abastecimentos já registados.
      </p>
      {loading && precos.length === 0 ? <p className="text-sm text-muted-foreground">A carregar…</p> : (
        <div className="space-y-3">
          {(['gasoleo', 'gasolina'] as const).map(t => (
            <LinhaPreco key={t} tipo={t} atual={precos.find(p => p.tipo_combustivel === t) ?? null} />
          ))}
        </div>
      )}
    </Cartao>
  )
}

function LinhaPreco({ tipo, atual }: { tipo: TipoCombustivel; atual: { preco_litro: number; atualizado_em: string } | null }) {
  const [texto, setTexto] = useState(atual ? String(atual.preco_litro).replace('.', ',') : '')
  const { definir, loading, error } = useDefinirPreco()
  const valor = lerNumero(texto)
  const valido = valor != null && valor > 0 && valor < 10
  const mudou = valido && valor !== atual?.preco_litro

  const guardar = async () => {
    if (!valido) return
    if (await definir(tipo, valor)) toast.success(`Preço do ${ROTULO_COMBUSTIVEL[tipo].toLowerCase()} guardado.`)
  }

  return (
    <div>
      <label htmlFor={`preco-${tipo}`} className="block text-sm font-medium mb-1.5">{ROTULO_COMBUSTIVEL[tipo]}</label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input id={`preco-${tipo}`} inputMode="decimal" value={texto} onChange={e => setTexto(e.target.value)}
            className={`${inputCls} pr-14 tabular-nums`} placeholder="Ex.: 1,549" aria-invalid={!!texto && !valido} />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€/L</span>
        </div>
        <button type="button" onClick={guardar} disabled={!mudou || loading} className={botaoPrimario}>
          {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />} Guardar
        </button>
      </div>
      {texto && !valido && <p className="text-xs text-destructive mt-1">Indique um preço entre 0 e 10 €.</p>}
      {atual && <p className="text-xs text-muted-foreground mt-1">Atualizado em {formatarDataHora(atual.atualizado_em)}</p>}
      {!atual && <p className="text-xs text-warning mt-1">Sem preço: o custo destes abastecimentos fica a 0 €.</p>}
      {error && <p className="text-xs text-destructive mt-1" role="alert">{error}</p>}
    </div>
  )
}
