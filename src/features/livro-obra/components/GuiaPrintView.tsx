import { useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Printer } from 'lucide-react'
import type { GuiaTransporte } from '../services/guiasTransporteService'

// Vista de impressão para uma guia de transporte.
// Dispara window.print() automaticamente quando autoprint=true.

interface Props {
  guia:      GuiaTransporte
  obraNome?: string
  autoprint?: boolean
  onClose:   () => void
}

export function GuiaPrintView({ guia, obraNome, autoprint = false, onClose }: Props) {
  const guiaUrl = `${window.location.origin}/obras/${guia.obraId ?? ''}/guias`

  useEffect(() => {
    if (!autoprint) return
    const t = setTimeout(() => {
      requestAnimationFrame(() => { requestAnimationFrame(() => { window.print() }) })
    }, 400)
    return () => clearTimeout(t)
  }, [autoprint])

  const fmtData = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat('pt-PT').format(new Date(iso + 'T00:00:00')) : '—'

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-white flex items-center justify-center p-6 print:p-0 print:inset-auto print:relative">
      {/* Controlos (ocultados na impressão) */}
      <div className="print:hidden fixed top-4 right-4 z-50 flex gap-2">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-700 transition-colors shadow-lg"
        >
          <Printer className="w-4 h-4" />
          Imprimir
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
        >
          Fechar
        </button>
      </div>

      {/* Folha A4 */}
      <div className="bg-white text-gray-900 w-full max-w-2xl mx-auto space-y-6 print:space-y-4">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between border-b-2 border-gray-900 pb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">ENCIVIL · Construção Civil</p>
            <h1 className="text-2xl font-black text-gray-900 mt-0.5">Guia de Transporte</h1>
            <p className="text-3xl font-black text-blue-600 mt-1">{guia.numero}</p>
          </div>
          <div className="p-3 bg-white border-2 border-gray-900 rounded-xl">
            <QRCodeSVG
              value={guiaUrl}
              size={90}
              level="M"
              marginSize={1}
            />
          </div>
        </div>

        {/* Dados gerais */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Obra" value={obraNome ?? guia.obraId ?? '—'} />
          <Field label="Data de Carga" value={fmtData(guia.dataCarga)} />
          <Field label="Origem" value={guia.origem ?? '—'} />
          <Field label="Destino" value={guia.destino ?? '—'} />
          <Field label="Estado" value={guia.estado} />
        </div>

        {/* Linhas */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Materiais / Artigos</p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-gray-900">
                <th className="text-left py-1.5 pr-4 font-bold">Descrição</th>
                <th className="text-right py-1.5 pr-4 font-bold w-20">Qtd</th>
                <th className="text-left py-1.5 font-bold w-16">Unid</th>
              </tr>
            </thead>
            <tbody>
              {guia.linhas.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-3 text-gray-400 text-xs italic">Sem artigos registados.</td>
                </tr>
              ) : (
                guia.linhas.map((linha, i) => (
                  <tr key={i} className="border-b border-gray-200">
                    <td className="py-1.5 pr-4">{linha.descricao}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums">{linha.quantidade}</td>
                    <td className="py-1.5">{linha.unidade}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Assinaturas */}
        <div className="grid grid-cols-2 gap-8 pt-4 border-t border-gray-200">
          <SignBox label="Motorista" />
          <SignBox label="Responsável na Entrega" />
        </div>

        {/* Rodapé */}
        <p className="text-[9px] text-gray-300 text-center">
          Documento gerado em {new Date().toLocaleString('pt-PT')} · {guiaUrl}
        </p>
      </div>

      <style>{`
        @media print {
          body { margin: 0; background: white; }
          @page { size: A4; margin: 15mm; }
        }
      `}</style>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-900 mt-0.5">{value}</p>
    </div>
  )
}

function SignBox({ label }: { label: string }) {
  return (
    <div>
      <div className="h-16 border-b border-gray-400" />
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  )
}
