import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, FileText } from 'lucide-react';
import { getToolCategoryLabel, getReturnConditionLabel } from '../data/mockData';
import type { Tool, ToolLoan } from '../types';
import type { Configuracoes } from '@/features/configuracoes/services/configuracoesService';
import { PRINT, CabecalhoImpresso, RodapeImpresso, estiloPaginaImpressa } from '@/app/components/print';

interface Props {
  loan: ToolLoan;
  tool: Tool | null;
  config: Configuracoes | null;
  onClose: () => void;
}

function fmtDate(d?: Date) {
  if (!d) return '—';
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function ToolLoanTermPrint({ loan, tool, config, onClose }: Props) {
  useEffect(() => {
    const s = document.createElement('style');
    s.id = 'encivil-termo-print-css';
    s.textContent = `
      @media print {
        body > *:not(#encivil-termo-print-root) { display: none !important; }
        #encivil-termo-print-root { display: block !important; position: static !important; overflow: visible !important; }
      }
      ${estiloPaginaImpressa('encivil-termo-print-root')}
    `;
    document.head.appendChild(s);
    return () => { document.getElementById('encivil-termo-print-css')?.remove(); };
  }, []);

  const NAVY   = PRINT.MARCA;
  const SLATE  = PRINT.SUAVE;
  const BORDER = PRINT.LINHA;
  const LIGHT  = PRINT.FUNDO;

  const sectionTitle = (text: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 12px' }}>
      <div style={{ width: 4, height: 16, background: NAVY, borderRadius: 2, flexShrink: 0 }} />
      <span style={{ fontWeight: 700, fontSize: 12, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {text}
      </span>
    </div>
  );

  const field = (label: string, value: string) => (
    <div>
      <div style={{ fontSize: 10, color: SLATE, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: PRINT.TINTA, fontWeight: 600 }}>{value}</div>
    </div>
  );

  const signatureBlock = (name: string, role: string, signature?: string) => (
    <div style={{ textAlign: 'center' }}>
      <div style={{ height: 56, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        {signature && (
          <img src={signature} alt="" style={{ maxHeight: 54, maxWidth: '100%', objectFit: 'contain' }} />
        )}
      </div>
      <div style={{ borderTop: '1px solid #1e293b', marginBottom: 6 }} />
      <div style={{ fontSize: 12, fontWeight: 600 }}>{name}</div>
      <div style={{ fontSize: 10, color: SLATE, marginTop: 2 }}>{role}</div>
    </div>
  );

  const isDevolvido = loan.status === 'devolvido';

  return createPortal(
    <div
      id="encivil-termo-print-root"
      style={{ position: 'fixed', inset: 0, background: 'white', zIndex: 9999, overflowY: 'auto' }}
    >
      {/* Barra de controlo (oculta na impressão) */}
      <div
        className="no-print"
        style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: 'white', borderBottom: `1px solid ${BORDER}`,
          padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText style={{ width: 16, height: 16, color: NAVY }} />
          <span style={{ fontWeight: 600, fontSize: 14, color: PRINT.TINTA }}>
            Termo de Responsabilidade · {tool?.name ?? loan.toolName}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#b45309', background: '#fef3c7', padding: '4px 10px', borderRadius: 8 }}>
            Texto gerado automaticamente — recomenda-se validação jurídica antes do uso regular
          </span>
          <button
            onClick={onClose}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13, background: 'white', cursor: 'pointer', color: PRINT.TINTA }}
          >
            <X style={{ width: 14, height: 14 }} /> Fechar
          </button>
          <button
            onClick={() => window.print()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', background: NAVY, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            <Printer style={{ width: 14, height: 14 }} /> Imprimir / Salvar PDF
          </button>
        </div>
      </div>

      {/* Documento A4 */}
      <div style={{ maxWidth: 740, margin: '0 auto', background: 'white', padding: '36px 8px 60px', fontFamily: PRINT.FONTE }}>

        <CabecalhoImpresso
          titulo="Termo de Responsabilidade"
          subtitulo={[config?.nomeEmpresa ?? 'ENCIVIL', config?.nifEmpresa ? `NIF ${config.nifEmpresa}` : '', config?.sedeEmpresa ?? ''].filter(Boolean).join(' · ')}
        />

        <p style={{ fontSize: 12, color: SLATE, textAlign: 'center', margin: '12px 0 0' }}>
          Empréstimo e guarda de ferramenta / equipamento
        </p>

        <p style={{ fontSize: 12.5, color: PRINT.TINTA, lineHeight: 1.6, marginTop: 18 }}>
          Pelo presente termo, <strong>{config?.nomeEmpresa ?? 'ENCIVIL'}</strong>
          {config?.nifEmpresa ? <>, NIF {config.nifEmpresa}</> : null}
          {config?.sedeEmpresa ? <>, com sede em {config.sedeEmpresa}</> : null}, doravante designada por
          "Empresa", entrega ao(à) trabalhador(a) abaixo identificado(a), doravante designado(a) por
          "Utilizador", a ferramenta/equipamento infra descrito(a), nos termos e condições seguintes.
        </p>

        {sectionTitle('Identificação do Utilizador')}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, background: LIGHT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px' }}>
          {field('Nome Completo', loan.employeeName)}
          {field('Doc. Identificação (CC/NIF)', loan.employeeDocument || '—')}
        </div>

        {sectionTitle('Identificação da Ferramenta / Equipamento')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 16, background: LIGHT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px' }}>
          {field('Código', loan.toolCode || tool?.code || '—')}
          {field('Designação', loan.toolName || tool?.name || '—')}
          {field('Categoria', tool ? getToolCategoryLabel(tool.category) : '—')}
          {field('Nº de Série', tool?.serialNumber || '—')}
          {field('Valor Estimado', tool?.estimatedValue ? `${tool.estimatedValue.toFixed(2)} €` : '—')}
          {field('Estado na Entrega', loan.deliveryCondition || 'Bom estado')}
        </div>

        {sectionTitle('Condições do Empréstimo')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, background: LIGHT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px' }}>
          {field('Data de Entrega', fmtDate(loan.loanDate))}
          {field('Devolução Prevista', fmtDate(loan.expectedReturnDate))}
          {field('Destino / Obra', loan.destination || '—')}
        </div>

        {sectionTitle('Declaração de Responsabilidade')}
        <ol style={{ fontSize: 11.5, color: PRINT.TINTA, lineHeight: 1.7, paddingLeft: 18, margin: 0 }}>
          <li style={{ marginBottom: 8 }}>
            O Utilizador declara ter recebido a ferramenta/equipamento acima identificado(a) no estado
            descrito, assumindo a partir desta data a sua guarda, conservação e utilização adequada.
          </li>
          <li style={{ marginBottom: 8 }}>
            O Utilizador compromete-se a utilizar a ferramenta/equipamento exclusivamente para fins
            profissionais relacionados com a atividade da Empresa, observando as instruções de utilização
            e as normas de segurança aplicáveis.
          </li>
          <li style={{ marginBottom: 8 }}>
            O Utilizador compromete-se a devolver a ferramenta/equipamento à Empresa na data prevista de
            devolução, ou sempre que para tal seja solicitado, em bom estado de conservação e
            funcionamento, salvo o desgaste normal resultante do uso adequado.
          </li>
          <li style={{ marginBottom: 8 }}>
            Em caso de avaria, dano, extravio ou furto, o Utilizador deve comunicar de imediato o facto à
            Empresa. A eventual responsabilidade pelo sucedido, incluindo reposição ou indemnização, será
            apurada nos termos da lei geral aplicável e do regulamento interno da Empresa, sem prejuízo das
            disposições do Código do Trabalho em vigor.
          </li>
          <li style={{ marginBottom: 8 }}>
            O Utilizador não pode ceder, emprestar a terceiros ou utilizar a ferramenta/equipamento fora do
            âmbito das suas funções sem autorização prévia e expressa da Empresa.
          </li>
          <li>
            O presente termo não confere ao Utilizador qualquer direito de propriedade sobre a
            ferramenta/equipamento, que se mantém, em todas as circunstâncias, propriedade da Empresa.
          </li>
        </ol>

        {/* Assinaturas — Entrega */}
        {sectionTitle('Assinatura na Entrega')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
          {signatureBlock(loan.employeeName, 'O Utilizador', loan.deliverySignature)}
          {signatureBlock(loan.deliveredBy, 'Pela Empresa', loan.deliveredBySignature)}
        </div>

        {/* Secção de devolução — só aparece se já tiver sido devolvida */}
        {isDevolvido && (
          <>
            {sectionTitle('Confirmação de Devolução')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, background: LIGHT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px' }}>
              {field('Data de Devolução', fmtDate(loan.returnDate))}
              {field('Estado na Devolução', loan.returnCondition ? getReturnConditionLabel(loan.returnCondition) : '—')}
              {field('Recebido por', loan.receivedBy || '—')}
            </div>
            {loan.returnNotes && (
              <p style={{ fontSize: 11.5, color: PRINT.TINTA, marginTop: 10 }}>
                <strong>Observações da devolução:</strong> {loan.returnNotes}
              </p>
            )}

            <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
              {signatureBlock(loan.employeeName, 'O Utilizador (Devolução)', loan.returnSignature)}
              {signatureBlock(loan.receivedBy ?? '—', 'Pela Empresa (Devolução)', loan.receivedBySignature)}
            </div>
          </>
        )}

        <RodapeImpresso nota="Termo de responsabilidade" />
      </div>
    </div>,
    document.body
  );
}
