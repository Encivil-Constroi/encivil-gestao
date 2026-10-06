import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { QRCodeSVG } from 'qrcode.react'
import { Fuel, Printer, AlertTriangle } from 'lucide-react'

// Página de impressão de QR code por viatura.
// URL: /pub/imprimir-qr?v=UUID&vn=Nome+da+Viatura&vc=ENC-01
// Abre numa nova aba e dispara automaticamente o diálogo de impressão.

export function ImprimirQrPage() {
  const [params] = useSearchParams()
  const vehicleId   = params.get('v')  ?? ''
  const vehicleName = params.get('vn') ?? 'Viatura'
  const vehicleCode = params.get('vc') ?? ''

  const formUrl = `${window.location.origin}/pub/combustivel?v=${vehicleId}&vn=${encodeURIComponent(vehicleName)}`

  useEffect(() => {
    if (!vehicleId) return
    // Espera 2 frames para garantir que o SVG do QR code está pintado antes de imprimir.
    // window.print() chama-se depois do segundo requestAnimationFrame — nesse ponto
    // o browser já fez layout + paint e o SVG aparece no PDF.
    const t = setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.print()
        })
      })
    }, 400)
    return () => clearTimeout(t)
  }, [vehicleId])

  if (!vehicleId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-3" />
          <p className="text-muted-foreground">Parâmetros inválidos. Aceda via Combustível → Viaturas.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Botão imprimir (esconde na impressão via print:hidden) */}
      <div className="print:hidden fixed top-4 right-4 z-50 flex gap-2">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors shadow-sm"
        >
          <Printer className="w-4 h-4" />
          Imprimir
        </button>
        <button
          onClick={() => window.close()}
          className="px-4 py-2.5 bg-secondary text-secondary-foreground rounded-xl font-medium hover:bg-secondary/80 transition-colors"
        >
          Fechar
        </button>
      </div>

      {/* Folha de impressão — A4 centrado */}
      <div className="min-h-screen bg-white text-[#04090F] flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-6 max-w-sm w-full">

          {/* Cabeçalho ENCIVIL */}
          <div className="flex items-center gap-3 w-full justify-center border-b border-gray-200 pb-5">
            <div className="w-10 h-10 bg-[#001C7D] rounded-xl flex items-center justify-center shrink-0">
              <Fuel className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest">ENCIVIL · Combustível</p>
              <p className="text-sm font-bold text-gray-500">Registo de Abastecimento</p>
            </div>
          </div>

          {/* Viatura */}
          <div className="text-center">
            <p className="text-3xl font-black text-gray-900">{vehicleName}</p>
            {vehicleCode && <p className="text-sm text-gray-400 font-medium mt-1">{vehicleCode}</p>}
          </div>

          {/* QR Code — sempre visível (sem opacity transition que quebra o PDF) */}
          <div className="p-5 bg-white border-4 border-gray-900 rounded-2xl">
            <QRCodeSVG
              value={formUrl}
              size={220}
              level="M"
              marginSize={1}
            />
          </div>

          {/* Instrução */}
          <div className="text-center space-y-1.5 border border-gray-200 rounded-xl p-4 w-full">
            <p className="text-sm font-bold text-gray-800">Como registar um abastecimento:</p>
            <ol className="text-sm text-gray-500 text-left space-y-1 list-decimal list-inside">
              <li>Aponte a câmara do telemóvel para o QR code</li>
              <li>Entre com a sua conta — a viatura fica escolhida</li>
              <li>Fotografe os km e carregue em <strong className="text-gray-700">Pedir autorização</strong></li>
            </ol>
          </div>

          {/* URL fallback pequenino */}
          <p className="text-[9px] text-gray-300 text-center break-all">{formUrl}</p>
        </div>
      </div>

      <style>{`
        @media print {
          body { margin: 0; }
          @page { size: A4; margin: 20mm; }
        }
      `}</style>
    </>
  )
}
