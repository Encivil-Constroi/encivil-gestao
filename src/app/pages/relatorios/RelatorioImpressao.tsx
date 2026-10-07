import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer, X, FileText, MessageCircle } from 'lucide-react'
import { PRINT, CabecalhoImpresso, RodapeImpresso, estiloPaginaImpressa } from '@/app/components/print'
import { EnviarWhatsAppDialog } from '@/app/components/EnviarWhatsAppDialog'

export type DadosImpressao = {
  titulo: string
  subtitulo?: string
  kpis: { label: string; value: string }[]
  tabelas: { titulo: string; colunas: string[]; linhas: string[][]; vazio?: string }[]
}

const ID = 'encivil-print-root-relatorio'
const ID_DOC = `${ID}-doc`

function textoResumo(d: DadosImpressao): string {
  return [
    `*ENCIVIL — ${d.titulo}*`,
    ...(d.subtitulo ? [d.subtitulo] : []),
    '',
    ...d.kpis.slice(0, 5).map(k => `• ${k.label}: ${k.value}`),
  ].join('\n')
}

// Documento A4 genérico (KPIs + tabelas) para os relatórios do CEO.
// A tinta fica fixa (papel branco): o PDF tem de sair igual em tema claro e escuro.
function Documento({ dados, onClose }: { dados: DadosImpressao; onClose: () => void }) {
  const [wa, setWa] = useState(false)
  useEffect(() => {
    const s = document.createElement('style')
    s.id = `${ID}-css`
    s.textContent = `
      ${estiloPaginaImpressa(ID)}
      @media print {
        body > *:not(#${ID}) { display: none !important; }
        #${ID} { display: block !important; position: static !important; overflow: visible !important; }
        #${ID} table { page-break-inside: auto; } #${ID} tr { page-break-inside: avoid; }
      }`
    document.head.appendChild(s)
    return () => { document.getElementById(`${ID}-css`)?.remove() }
  }, [])

  return createPortal(
    <div id={ID} style={{ position: 'fixed', inset: 0, background: 'white', color: PRINT.TINTA, fontFamily: PRINT.FONTE, zIndex: 9999, overflowY: 'auto' }}>
      <div className="no-print" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14, color: 'var(--foreground)' }}>
          <FileText style={{ width: 16, height: 16 }} /> Pré-visualização · {dados.titulo}
        </span>
        <span style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--card)', color: 'var(--foreground)', cursor: 'pointer' }}>
            <X style={{ width: 14, height: 14 }} /> Fechar
          </button>
          <button onClick={() => setWa(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--card)', color: 'var(--foreground)', cursor: 'pointer' }}>
            <MessageCircle style={{ width: 14, height: 14 }} /> WhatsApp
          </button>
          <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Printer style={{ width: 14, height: 14 }} /> Imprimir / Guardar PDF
          </button>
        </span>
      </div>

      <div id={ID_DOC} style={{ maxWidth: 794, margin: '0 auto', background: 'white', paddingBottom: 40 }}>
        <div style={{ padding: '24px 32px 0' }}>
          <CabecalhoImpresso titulo={dados.titulo} subtitulo={dados.subtitulo} />
        </div>

        <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {dados.kpis.map(k => (
              <div key={k.label} style={{ border: `1px solid ${PRINT.LINHA}`, borderRadius: 10, padding: '12px 14px', background: PRINT.FUNDO }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: PRINT.MARCA, lineHeight: 1.1 }}>{k.value}</div>
                <div style={{ fontSize: 11, color: PRINT.SUAVE, marginTop: 6, fontWeight: 500 }}>{k.label}</div>
              </div>
            ))}
          </div>

          {dados.tabelas.map(t => (
            <div key={t.titulo}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 4, height: 20, background: PRINT.MARCA, borderRadius: 2 }} />
                <span style={{ fontWeight: 700, fontSize: 13, color: PRINT.MARCA, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.titulo}</span>
              </div>
              {t.linhas.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', background: PRINT.FUNDO, border: `1px solid ${PRINT.LINHA}`, borderRadius: 10, color: PRINT.SUAVE, fontSize: 13 }}>{t.vazio ?? 'Sem dados'}</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: PRINT.MARCA, color: 'white' }}>
                      {t.colunas.map(c => <th key={c} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11 }}>{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {t.linhas.map((l, i) => (
                      <tr key={i} style={{ background: i % 2 ? PRINT.FUNDO : 'white' }}>
                        {l.map((c, j) => <td key={j} style={{ padding: '7px 10px', borderBottom: `1px solid ${PRINT.LINHA}`, color: '#1e293b' }}>{c}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>

        <div style={{ padding: '0 32px' }}>
          <RodapeImpresso />
        </div>
      </div>
      <EnviarWhatsAppDialog
        open={wa}
        onOpenChange={setWa}
        texto={textoResumo(dados)}
        nomePdf={dados.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}
        obterElementoPdf={() => document.getElementById(ID_DOC)}
      />
    </div>,
    document.body,
  )
}

// Botão + pré-visualização; `gerar` só corre quando o utilizador pede o PDF.
export function BotaoPdf({ gerar, desativado }: { gerar: () => DadosImpressao; desativado?: boolean }) {
  const [dados, setDados] = useState<DadosImpressao | null>(null)
  return (
    <>
      <button
        onClick={() => setDados(gerar())}
        disabled={desativado}
        className="flex items-center gap-2 px-3 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
      >
        <Printer className="w-4 h-4" /> <span className="hidden sm:inline">Exportar PDF</span>
      </button>
      {dados && <Documento dados={dados} onClose={() => setDados(null)} />}
    </>
  )
}
