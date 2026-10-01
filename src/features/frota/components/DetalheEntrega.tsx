import { X } from 'lucide-react'
import type { EntregaRow } from '../db'
import {
  ITENS_INVENTARIO, OPCOES_ADBLUE, OPCOES_LIMPEZA, OPCOES_OLEO, OPCOES_PNEUS, ROTULO_COMBUSTIVEL,
  danosNovos, formatarContador, formatarData,
} from '../lib/entregas'
import { MapaDanos } from './MapaDanos'

const rotuloDe = (opcoes: { valor: string; rotulo: string }[], v: string) => opcoes.find(o => o.valor === v)?.rotulo ?? v

function linhasEstado(e: EntregaRow): [string, string][] {
  return [
    ['Combustível', ROTULO_COMBUSTIVEL[e.combustivel]],
    ['AdBlue', rotuloDe(OPCOES_ADBLUE, e.adblue)],
    ['Nível do óleo', rotuloDe(OPCOES_OLEO, e.oleo)],
    ['Líq. refrigeração', rotuloDe(OPCOES_OLEO, e.refrigeracao)],
    ['Pneus', rotuloDe(OPCOES_PNEUS, e.pneus)],
    ['Limpeza', rotuloDe(OPCOES_LIMPEZA, e.limpeza)],
  ]
}

export function DetalheEntrega({ entrega, referencia, unidade, onFechar }: {
  entrega: EntregaRow
  /** A entrega a que esta devolução corresponde (se estiver carregada) */
  referencia: EntregaRow | null
  unidade: string
  onFechar: () => void
}) {
  const devolucao = entrega.tipo === 'DEVOLUCAO'
  const estado = linhasEstado(entrega)
  const refEstado = referencia ? linhasEstado(referencia) : null
  const novos = devolucao ? danosNovos(entrega, referencia) : []
  const existentes = devolucao ? entrega.danos.slice(0, entrega.danos.length - novos.length) : []
  const percorridos = devolucao && referencia ? entrega.km - referencia.km : null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onFechar}>
      <div role="dialog" aria-modal="true" aria-label={`${devolucao ? 'Devolução' : 'Entrega'} de ${entrega.veiculo_nome}`}
        onClick={e => e.stopPropagation()}
        className="bg-card w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-border p-4 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold">{devolucao ? 'Devolução' : 'Entrega'} · {entrega.identificacao ?? entrega.veiculo_nome}</h2>
            <p className="text-sm text-muted-foreground">{entrega.veiculo_nome} · {formatarData(entrega.data)}</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="p-2 rounded-lg hover:bg-accent shrink-0">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div><dt className="text-muted-foreground">Colaborador</dt><dd className="font-medium">{entrega.colaborador_nome}</dd></div>
          <div><dt className="text-muted-foreground">Obra</dt><dd className="font-medium">{entrega.obra_nome ?? '—'}</dd></div>
          <div><dt className="text-muted-foreground">{unidade === 'horas' ? 'Horas' : 'Km'}</dt><dd className="font-medium">{formatarContador(entrega.km, unidade)}</dd></div>
          <div><dt className="text-muted-foreground">Registado por</dt><dd className="font-medium">{entrega.registado_por}</dd></div>
          {entrega.para_oficina && <div className="col-span-2 text-warning font-semibold">Enviada para a oficina</div>}
        </dl>

        {devolucao && (
          <section aria-label="Comparação com a entrega" className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr><th className="p-2 font-semibold">Comparação</th><th className="p-2 font-semibold">Entrega</th><th className="p-2 font-semibold">Devolução</th></tr>
              </thead>
              <tbody>
                {estado.map(([rotulo, valor], i) => (
                  <tr key={rotulo} className="border-t border-border">
                    <td className="p-2 text-muted-foreground">{rotulo}</td>
                    <td className="p-2">{refEstado ? refEstado[i][1] : '—'}</td>
                    <td className={`p-2 font-medium ${refEstado && refEstado[i][1] !== valor ? 'text-warning' : ''}`}>{valor}</td>
                  </tr>
                ))}
                <tr className="border-t border-border">
                  <td className="p-2 text-muted-foreground">{unidade === 'horas' ? 'Horas' : 'Km'}</td>
                  <td className="p-2">{referencia ? formatarContador(referencia.km, unidade) : '—'}</td>
                  <td className="p-2 font-medium">{formatarContador(entrega.km, unidade)}</td>
                </tr>
                <tr className="border-t border-border">
                  <td className="p-2 text-muted-foreground">{unidade === 'horas' ? 'Horas feitas' : 'Km percorridos'}</td>
                  <td className="p-2" colSpan={2}><strong>{percorridos == null ? '—' : formatarContador(percorridos, unidade)}</strong></td>
                </tr>
                <tr className="border-t border-border">
                  <td className="p-2 text-muted-foreground">Danos novos</td>
                  <td className="p-2" colSpan={2}>
                    <strong className={novos.length > 0 ? 'text-destructive' : ''}>{novos.length}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        )}

        {!devolucao && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {estado.map(([rotulo, valor]) => (
              <div key={rotulo}><dt className="text-muted-foreground">{rotulo}</dt><dd className="font-medium">{valor}</dd></div>
            ))}
          </dl>
        )}

        <section aria-label="Inventário de segurança">
          <h3 className="text-sm font-semibold mb-1">Inventário de segurança</h3>
          <ul className="grid grid-cols-2 gap-1 text-sm">
            {ITENS_INVENTARIO.map(i => (
              <li key={i.chave} className={entrega.inventario?.[i.chave] ? '' : 'text-destructive'}>
                {entrega.inventario?.[i.chave] ? 'Sim' : 'Não'} — {i.rotulo.replace('?', '')}
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Mapa de danos">
          <h3 className="text-sm font-semibold mb-2">Mapa de danos</h3>
          <MapaDanos value={devolucao ? novos : entrega.danos} existentes={existentes} readOnly />
        </section>

        {entrega.observacoes && (
          <section>
            <h3 className="text-sm font-semibold mb-1">Observações</h3>
            <p className="text-sm whitespace-pre-wrap">{entrega.observacoes}</p>
          </section>
        )}
      </div>
    </div>
  )
}
