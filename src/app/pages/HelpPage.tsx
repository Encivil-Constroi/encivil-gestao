import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowUpCircle, ArrowDownCircle, AlertTriangle, Smartphone,
  ChevronDown, ChevronRight, CheckCircle2, BookOpen, CircleHelp,
  Info, Shield, Database, FileText, GitBranch, Settings, BarChart2, Layout,
} from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';
import { useRole } from '@/features/auth/useRole';

/* ─── Tipos (guias) ──────────────────────────────────── */
type Step = { text: string; note?: string };

type Guide = {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  color: string;
  iconColor: string;
  borderColor: string;
  steps: Step[];
  tip?: string;
};

/* ─── Dados dos guias ────────────────────────────────── */
const guides: Guide[] = [
  {
    id: 'saida',
    icon: ArrowUpCircle,
    title: 'Registar uma Saída',
    subtitle: 'Enviar material para uma obra ou destino',
    color: 'bg-destructive/10',
    iconColor: 'text-destructive',
    borderColor: 'border-l-destructive',
    steps: [
      { text: 'No menu inferior toque em  +  (Movimento)' },
      { text: 'Selecione o tipo  Saída' },
      { text: 'Escolha o produto na lista suspensa' },
      { text: 'Introduza a quantidade a saír', note: 'O sistema alerta se o stock for insuficiente' },
      { text: 'Preencha o campo  Destino / Obra  (obrigatório)' },
      { text: 'Toque em  Guardar Movimento' },
    ],
    tip: 'O stock é atualizado imediatamente após guardar.',
  },
  {
    id: 'entrada',
    icon: ArrowDownCircle,
    title: 'Registar uma Entrada',
    subtitle: 'Receber material de um fornecedor',
    color: 'bg-success/10',
    iconColor: 'text-success',
    borderColor: 'border-l-success',
    steps: [
      { text: 'No menu inferior toque em  +  (Movimento)' },
      { text: 'Selecione o tipo  Entrada' },
      { text: 'Escolha o produto na lista suspensa' },
      { text: 'Introduza a quantidade recebida' },
      { text: 'Indique o fornecedor no campo  Fornecedor  (opcional)' },
      { text: 'Toque em  Guardar Movimento' },
    ],
    tip: 'Pode adicionar observações como número de fatura ou nota de entrega.',
  },
  {
    id: 'alertas',
    icon: AlertTriangle,
    title: 'Alertas de Stock',
    subtitle: 'Como interpretar os estados dos produtos',
    color: 'bg-warning/10',
    iconColor: 'text-warning',
    borderColor: 'border-l-warning',
    steps: [
      { text: 'Verde  —  Stock Normal', note: 'Quantidade acima do mínimo definido' },
      { text: 'Laranja  —  Stock Baixo', note: 'Quantidade abaixo do mínimo — encomendar brevemente' },
      { text: 'Vermelho  —  Sem Stock', note: 'Stock esgotado — encomendar com urgência' },
    ],
    tip: 'O Dashboard mostra um painel de alertas com todos os produtos em risco. Verifique-o diariamente.',
  },
  {
    id: 'iphone',
    icon: Smartphone,
    title: 'Instalar no iPhone',
    subtitle: 'Aceder como app nativa, sem App Store',
    color: 'bg-primary/10',
    iconColor: 'text-primary',
    borderColor: 'border-l-primary',
    steps: [
      { text: 'Abra este sistema no  Safari  (não Chrome)', note: 'Apenas o Safari suporta instalação PWA no iPhone' },
      { text: 'Toque no botão  Partilhar  (ícone de caixa com seta)' },
      { text: 'Percorra a lista e selecione  Adicionar ao Ecrã Inicial' },
      { text: 'Confirme tocando em  Adicionar' },
    ],
    tip: 'Após instalar, a app abre sem barra de URL — idêntica a uma app nativa.',
  },
  {
    id: 'android',
    icon: Smartphone,
    title: 'Instalar no Android',
    subtitle: 'Aceder como app nativa, sem Play Store',
    color: 'bg-success/10',
    iconColor: 'text-success',
    borderColor: 'border-l-success',
    steps: [
      { text: 'Abra este sistema no  Chrome', note: 'Outros browsers Android também podem suportar, mas o Chrome é o mais fiável' },
      { text: 'Toque no menu  ⋮  (três pontos) no canto superior direito' },
      { text: 'Selecione  Instalar aplicação  ou  Adicionar ao ecrã principal' },
      { text: 'Confirme tocando em  Instalar' },
    ],
    tip: 'O Chrome também pode mostrar um banner automático "Instalar app" — basta tocar nele.',
  },
];

/* ─── Componente de card de guia ─────────────────────── */
function GuideCard({ guide }: { guide: Guide }) {
  const [open, setOpen] = useState(guide.id === 'saida');
  const Icon = guide.icon;

  return (
    <div className={`bg-card rounded-2xl border border-border border-l-4 ${guide.borderColor} shadow-sm overflow-hidden`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full p-5 flex items-center gap-4 text-left hover:bg-accent/30 active:bg-accent/50 transition-colors"
      >
        <div className={`${guide.color} p-3 rounded-xl shrink-0`}>
          <Icon className={`w-6 h-6 ${guide.iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-sm md:text-base">{guide.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{guide.subtitle}</p>
        </div>
        <ChevronDown className={`w-5 h-5 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-5 pb-5">
          <div className="pt-1 pb-4 space-y-3">
            {guide.steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className={`${guide.color} ${guide.iconColor} w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold mt-0.5`}>
                  {i + 1}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-foreground leading-snug"
                     dangerouslySetInnerHTML={{ __html: step.text.replace(/ {2}(.+?) {2}/g, ' <strong class="text-foreground">$1</strong> ') }}
                  />
                  {step.note && (
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{step.note}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          {guide.tip && (
            <div className={`${guide.color} rounded-xl p-3 flex items-start gap-2.5`}>
              <CheckCircle2 className={`w-4 h-4 ${guide.iconColor} shrink-0 mt-0.5`} />
              <p className="text-xs text-foreground leading-snug">{guide.tip}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Sub-componentes de documentação técnica ────────── */
function H1({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-bold text-foreground mb-4 pb-2 border-b border-border">{children}</h2>;
}
function H2({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold text-foreground mt-5 mb-2">{children}</h3>;
}
function Rule({ code, text, highlight }: { code: string; text: string; highlight?: boolean }) {
  return (
    <div className={`flex gap-3 p-3 rounded-lg mb-2 text-sm ${highlight ? 'bg-destructive/10 border border-destructive/20' : 'bg-accent/40 border border-border'}`}>
      <span className="font-mono text-xs text-primary shrink-0 pt-0.5">{code}</span>
      <span className="text-foreground">{text}</span>
    </div>
  );
}
function Tag({ children, color }: { children: React.ReactNode; color: 'blue' | 'green' | 'red' | 'yellow' | 'gray' }) {
  const colors = {
    blue:   'bg-primary/10 text-primary',
    green:  'bg-success/10 text-success',
    red:    'bg-destructive/10 text-destructive',
    yellow: 'bg-warning/10 text-warning',
    gray:   'bg-muted text-muted-foreground',
  };
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colors[color]} mr-1 mb-1`}>{children}</span>;
}
function DocTable({ headers, rows }: { headers: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto mb-4">
      <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
        <thead className="bg-muted/50">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase border-b border-border">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-accent/30 transition-colors">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2 text-foreground text-xs">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Checklist({ items }: { items: { done: boolean; text: string }[] }) {
  return (
    <ul className="space-y-2 mb-4">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          {item.done
            ? <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
            : <div className="w-4 h-4 rounded-full border-2 border-border shrink-0 mt-0.5" />}
          <span className={item.done ? 'text-foreground' : 'text-muted-foreground'}>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}
function DocAlert({ type, children }: { type: 'info' | 'warning' | 'danger'; children: React.ReactNode }) {
  const styles = {
    info:    'bg-primary/10 border-primary/30 text-primary',
    warning: 'bg-warning/10 border-warning/30 text-warning',
    danger:  'bg-destructive/10 border-destructive/30 text-destructive',
  };
  const Icon = type === 'info' ? Info : AlertTriangle;
  return (
    <div className={`flex gap-3 p-4 rounded-lg border mb-4 ${styles[type]}`}>
      <Icon className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="text-sm">{children}</div>
    </div>
  );
}
function DocSteps({ items }: { items: { t: string; d: string }[] }) {
  return (
    <div className="space-y-3 mb-4">
      {items.map((s, i) => (
        <div key={i} className="flex gap-3 p-3 bg-accent/40 rounded-lg border border-border">
          <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center shrink-0 font-bold">{i + 1}</span>
          <div>
            <div className="text-sm font-medium text-foreground">{s.t}</div>
            {s.d && <div className="text-xs text-muted-foreground">{s.d}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Secções de referência técnica ──────────────────── */
type TechSection = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  content: React.ReactNode;
};

const techSections: TechSection[] = [
  {
    id: 'stack',
    label: 'Stack e Deploy',
    icon: Layout,
    content: (
      <div>
        <H1>Stack e Deploy</H1>
        <DocTable
          headers={['Componente', 'Tecnologia']}
          rows={[
            ['Frontend', 'React 18 + TypeScript (strict) + Vite'],
            ['Estilização', 'Tailwind CSS v4'],
            ['Roteamento', 'React Router v7'],
            ['Backend / Auth', 'Supabase (PostgreSQL + Auth + Storage + RLS)'],
            ['Deploy', 'Cloudflare Pages (push para main → deploy automático)'],
            ['Observabilidade', 'Sentry (erros em produção)'],
            ['Email', 'Resend via Supabase Edge Function'],
            ['Testes', 'Vitest (unitários, sem Supabase real)'],
            ['CI', 'GitHub Actions (typecheck + build + tests)'],
          ]}
        />
        <H2>Arquitetura de pastas</H2>
        <DocTable
          headers={['Camada', 'Responsabilidade']}
          rows={[
            ['src/app/pages/', 'UI e navegação — sem lógica de negócio'],
            ['src/app/lib/', 'Hooks base: useAsync, useMutation, parseSupabaseError'],
            ['src/features/*/services/', 'Lógica de negócio + chamadas Supabase'],
            ['src/features/*/hooks/', 'Estado React + mutações (wrappam os services)'],
            ['src/integrations/supabase/', 'Cliente + tipos gerados (não editar manualmente)'],
          ]}
        />
        <H2>Padrões obrigatórios</H2>
        <Rule code="useAsync"    text="Todos os fetches usam useAsync — sem useEffect+useState manual." />
        <Rule code="useMutation" text="Todas as mutações usam useMutation — loading/error automáticos." />
        <Rule code="SELECT"      text="Constante SELECT no topo de cada service — sem N+1 queries." />
        <Rule code="GRANT"       text="Toda migration nova inclui GRANTs explícitos para authenticated." />
        <Rule code="types.ts"    text="Nunca editar src/integrations/supabase/types.ts manualmente." highlight />
      </div>
    ),
  },
  {
    id: 'seguranca',
    label: 'Segurança',
    icon: Shield,
    content: (
      <div>
        <H1>Segurança e Controlo de Acesso</H1>
        <H2>RBAC — 3 papéis</H2>
        <DocTable
          headers={['Papel', 'Eliminar permanentemente', 'Gestão', 'Registo']}
          rows={[
            ['admin',    '✅', '✅', '✅'],
            ['gestor',   '❌', '✅', '✅'],
            ['operador', '❌', '❌', '✅'],
          ]}
        />
        <DocAlert type="danger">
          As políticas RLS usam <code>public.auth_role()</code> (SECURITY DEFINER). Nunca usar <code>{"auth.jwt() ->> 'role'"}</code> diretamente — não é seguro.
        </DocAlert>
        <H2>Chaves Supabase</H2>
        <Rule code="sb_publishable_*" text="Chave pública — pode ir em variáveis VITE_. É a chave anon." />
        <Rule code="sb_secret_*"      text="Chave secreta — NUNCA no frontend, NUNCA em VITE_." highlight />
        <H2>Checklist de segurança</H2>
        <Checklist items={[
          { done: true,  text: 'RLS ativa em todas as tabelas' },
          { done: true,  text: 'Nenhuma secret key no código frontend' },
          { done: true,  text: 'HTTPS forçado (Cloudflare Pages)' },
          { done: true,  text: 'Sem policy DELETE em movimentos_stock' },
          { done: true,  text: 'Pre-commit hook bloqueia commits com sb_secret_' },
          { done: true,  text: 'Auth testado com credenciais inválidas' },
          { done: true,  text: 'Roles definidas via JWT custom claim (app_metadata)' },
        ]} />
      </div>
    ),
  },
  {
    id: 'modelo-dados',
    label: 'Modelo de Dados',
    icon: Database,
    content: (
      <div>
        <H1>Modelo de Dados</H1>
        <DocTable
          headers={['Tabela', 'Módulo', 'Apagável?']}
          rows={[
            ['profiles',                'Auth',            'Não (cascade de auth.users)'],
            ['produtos',                'Armazém',         'Não (desativação lógica)'],
            ['movimentos_stock',        'Armazém',         '❌ NUNCA'],
            ['audit_log',               'Auditoria',       'Não'],
            ['ferramentas',             'Ferramentas',     'Não (desativação lógica)'],
            ['emprestimos_ferramentas', 'Ferramentas',     'Não'],
            ['obras',                   'Obras',           'Gestor pode arquivar'],
            ['subempreiteiros',         'Subempreiteiros', 'Rascunho pode ser apagado'],
            ['autos_medicao',           'Autos',           'Só rascunhos'],
            ['comb_veiculos',           'Combustível',     'Não (desativação lógica)'],
            ['comb_abastecimentos',     'Combustível',     'Admin pode eliminar'],
            ['colaboradores',           'RH',              'Não (desativação lógica)'],
            ['horarios',                'RH',              'Não (arquivação lógica)'],
            ['faltas',                  'RH',              'Admin pode eliminar'],
          ]}
        />
        <H2>RPCs atómicas (não duplicar)</H2>
        <DocTable
          headers={['RPC', 'Propósito']}
          rows={[
            ['registar_movimento',       'Movimento de stock com advisory lock e audit log'],
            ['criar_auto_rpc',           'Numeração de autos sem race condition'],
            ['custos_materiais_por_obra','Custos agregados server-side'],
            ['produtos_em_alerta',       'Stock baixo/sem-stock sem full table scan'],
          ]}
        />
      </div>
    ),
  },
  {
    id: 'regras-negocio',
    label: 'Regras de Negócio',
    icon: FileText,
    content: (
      <div>
        <H1>Regras de Negócio</H1>
        <H2>Stock</H2>
        <Rule code="RN-01" text="Entrada: novo_stock = stock_atual + quantidade" />
        <Rule code="RN-02" text="Saída: novo_stock = stock_atual − quantidade" />
        <Rule code="RN-03" text="Ajuste: stock corrigido para o valor definido" />
        <Rule code="RN-04" text="Saída que resulte em stock negativo é BLOQUEADA" highlight />
        <Rule code="RN-05" text="Histórico de movimentos NUNCA é apagado" highlight />
        <Rule code="RN-06" text="Stock atual nunca é editado diretamente — apenas via movimentos" highlight />
        <H2>Ferramentas</H2>
        <Rule code="RN-FERR-01" text="Empréstimo requer assinatura do funcionário e do responsável" />
        <Rule code="RN-FERR-02" text="Ferramenta emprestada não pode ser emprestada novamente" highlight />
        <Rule code="RN-FERR-03" text="Condição de devolução é registada mas não desconta no salário" />
        <H2>Autos de medição</H2>
        <Rule code="RN-AUTO-01" text="Numeração sequencial por subempreiteiro (advisory lock)" />
        <Rule code="RN-AUTO-02" text="Auto validado é imutável" highlight />
        <Rule code="RN-AUTO-03" text="Valor executado = soma dos autos validados" />
        <H2>Combustível</H2>
        <Rule code="RN-COMB-01" text="Abastecimento via QR fica pendente até aprovação do gestor" />
        <Rule code="RN-COMB-02" text="Unique index impede duplicados (veiculo+data+litros+custo)" />
      </div>
    ),
  },
  {
    id: 'adrs',
    label: 'ADRs',
    icon: GitBranch,
    content: (
      <div>
        <H1>Decisões Arquiteturais (ADRs)</H1>
        {[
          {
            id: 'ADR-001',
            title: 'Supabase como BaaS',
            decision: 'Backend gerido — sem servidor dedicado.',
            why: 'ENCIVIL não tem infraestrutura própria e a equipa técnica é pequena.',
            tradeoff: 'Vendor lock-in vs zero gestão de infraestrutura.',
          },
          {
            id: 'ADR-002',
            title: 'Cloudflare Pages para deploy',
            decision: 'Deploy automático a cada push para main.',
            why: 'Plano gratuito robusto, CDN global, HTTPS automático.',
            tradeoff: 'Builds limitados no plano gratuito vs simplicidade de CI/CD.',
          },
          {
            id: 'ADR-003',
            title: 'movimentos_stock como fonte de verdade',
            decision: 'Relatórios calculados exclusivamente de movimentos_stock.',
            why: 'Auditabilidade total; stock_atual pode ser corrigido sem perder histórico.',
            tradeoff: 'Queries mais complexas mas dados sempre fiáveis.',
          },
          {
            id: 'ADR-004',
            title: 'RBAC via app_metadata (3 papéis)',
            decision: 'admin, gestor, operador definidos em JWT custom claims.',
            why: 'RLS type-safe com public.auth_role() SECURITY DEFINER.',
            tradeoff: 'Requer Edge Function ou SQL para alterar papéis (não self-service).',
          },
          {
            id: 'ADR-005',
            title: 'useAsync / useMutation como hooks base',
            decision: 'Toda a lógica de fetch/mutação centralizada em dois hooks.',
            why: 'Elimina 8+ linhas de boilerplate por hook; loading/error automáticos.',
            tradeoff: 'Abstracto para novos devs, mas padrão bem documentado.',
          },
          {
            id: 'ADR-006',
            title: 'Advisory locks para operações atómicas',
            decision: 'registar_movimento e criar_auto_rpc usam pg_advisory_xact_lock.',
            why: 'Evita race conditions em movimentos de stock e numeração de autos.',
            tradeoff: 'Possível contenção sob carga alta — aceitável no contexto da empresa.',
          },
          {
            id: 'ADR-007',
            title: 'supabase as any para tabelas pendentes de geração de tipos',
            decision: 'Novas tabelas (antes de npx supabase gen types) usam const db = supabase as any.',
            why: 'Permite desenvolver sem bloquear no typecheck; TODO claro para limpar.',
            tradeoff: 'Perde type-safety temporariamente — deve ser removido após gen types.',
          },
          {
            id: 'ADR-008',
            title: 'parseSupabaseError centraliza mensagens de erro',
            decision: 'Todos os erros passam por parseSupabaseError antes de mostrar ao utilizador.',
            why: 'Mensagens PostgreSQL cruas (23505, PGRST116) não são legíveis para utilizadores.',
            tradeoff: 'Mapeamento pode ficar desatualizado; P0001 (RPCs) passam diretamente.',
          },
          {
            id: 'ADR-009',
            title: 'Skeleton loaders em vez de texto "A carregar…"',
            decision: 'Componentes Skeletons.tsx substituem os spinners/textos de loading.',
            why: 'Reduz layout shift e dá feedback visual imediato enquanto os dados carregam.',
            tradeoff: 'Skeletons são aproximações visuais — podem não corresponder ao layout real.',
          },
        ].map((adr) => (
          <div key={adr.id} className="p-4 bg-accent/40 rounded-lg border border-border mb-3">
            <div className="flex items-center gap-2 mb-2">
              <Tag color="blue">{adr.id}</Tag>
              <span className="text-sm font-medium text-foreground">{adr.title}</span>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div><span className="font-medium text-foreground">Decisão:</span> {adr.decision}</div>
              <div><span className="font-medium text-foreground">Motivo:</span> {adr.why}</div>
              <div><span className="font-medium text-foreground">Trade-off:</span> {adr.tradeoff}</div>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'migrations',
    label: 'Migrations',
    icon: Settings,
    content: (
      <div>
        <H1>Migrations e Manutenção</H1>
        <H2>Aplicar uma migration</H2>
        <DocSteps items={[
          { t: 'Abrir o Supabase Dashboard', d: 'project: wuruhxmbueeyhiqgvlxu' },
          { t: 'SQL Editor → Nova query', d: 'Copiar o conteúdo do ficheiro supabase/migrations/*.sql' },
          { t: 'Executar', d: 'Verificar que não há erros.' },
          { t: 'Regenerar tipos', d: 'npx supabase gen types typescript --local > src/integrations/supabase/types.ts' },
          { t: 'Commit', d: 'Incluir o ficheiro de migration e os tipos gerados no mesmo commit.' },
        ]} />
        <H2>Checklist de nova migration</H2>
        <Checklist items={[
          { done: false, text: 'Ficheiro com formato YYYYMMDDHHMMSS_nome.sql' },
          { done: false, text: 'Todos os CREATE TABLE têm IF NOT EXISTS' },
          { done: false, text: 'RLS ativada: ALTER TABLE ... ENABLE ROW LEVEL SECURITY' },
          { done: false, text: 'Políticas usam public.auth_role() não auth.jwt()' },
          { done: false, text: 'GRANT SELECT, INSERT, UPDATE ON TABLE ... TO authenticated' },
          { done: false, text: 'GRANT EXECUTE ON FUNCTION ... TO authenticated (se RPC)' },
          { done: false, text: 'Tipos regenerados após aplicar' },
          { done: false, text: 'Typecheck passa (npm run typecheck)' },
        ]} />
        <DocAlert type="danger">
          Sem GRANTs explícitos, os utilizadores autenticados não conseguem aceder à nova tabela — RLS ativa mas sem GRANT bloqueia tudo.
        </DocAlert>
      </div>
    ),
  },
  {
    id: 'relatorios',
    label: 'Relatórios',
    icon: BarChart2,
    content: (
      <div>
        <H1>Relatórios</H1>
        <DocAlert type="info">
          <strong>Regra fundamental:</strong> Todos os relatórios de stock são calculados de <code>movimentos_stock</code>, nunca apenas de <code>produtos.stock_atual</code>.
        </DocAlert>
        <H2>Disponíveis</H2>
        <DocTable
          headers={['Relatório', 'Filtros', 'Exportação']}
          rows={[
            ['Histórico de movimentos', 'Produto, tipo, data, responsável', 'PDF + Excel'],
            ['Relatório semanal',       'Semana',                           'Excel'],
            ['Relatório mensal',        'Mês/Ano, produto, categoria, obra','Impressão'],
            ['Relatório anual',         'Ano',                              'Impressão'],
            ['Consumo por obra',        'Obra + período',                   'Impressão'],
            ['Top produtos consumidos', 'Período',                          'Impressão'],
            ['Ferramentas em atraso',   'Automático',                       '–'],
            ['Custos por obra',         'Obra (RPC server-side)',            'Impressão'],
          ]}
        />
        <H2>Exportar para PDF</H2>
        <DocSteps items={[
          { t: 'Abrir o relatório pretendido', d: '' },
          { t: 'Clicar no botão com ícone de impressora', d: 'Abre o diálogo de impressão do browser.' },
          { t: 'Selecionar "Guardar como PDF"', d: 'Em Chrome/Edge: Destino → Guardar como PDF.' },
        ]} />
      </div>
    ),
  },
];

/* ─── Secção de referência técnica expansível ────────── */
function TechnicalRefSection() {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState('stack');
  const active = techSections.find((s) => s.id === activeId)!;

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full p-5 flex items-center gap-4 text-left hover:bg-accent/30 active:bg-accent/50 transition-colors"
      >
        <div className="bg-primary/10 p-3 rounded-xl shrink-0">
          <BookOpen className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-sm">Referência Técnica</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">Stack, modelo de dados, regras de negócio e decisões arquiteturais</p>
        </div>
        <ChevronDown className={`w-5 h-5 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-border">
          <div className="flex flex-col md:flex-row">
            {/* Mini sidebar — horizontal scroll em mobile, vertical em desktop */}
            <aside className="md:w-44 border-b md:border-b-0 md:border-r border-border bg-muted/30 p-3 flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible shrink-0">
              {techSections.map((s) => {
                const Icon = s.icon;
                const isActive = s.id === activeId;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveId(s.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left whitespace-nowrap md:whitespace-normal transition-colors shrink-0 ${
                      isActive
                        ? 'bg-primary text-white'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{s.label}</span>
                  </button>
                );
              })}
            </aside>

            {/* Conteúdo */}
            <div className="flex-1 p-6 overflow-x-auto">
              <div className="max-w-2xl">
                {active.content}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Página principal ───────────────────────────────── */
export function HelpPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = useRole();

  const firstName = user?.email?.split('@')[0]
    ?.split('.')[0]
    ?.replace(/\d+/g, '')
    ?? 'utilizador';

  const displayName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-6">

      {/* ── Hero ─────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-primary to-primary/80 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center gap-4">
          <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-3 shrink-0">
            <img
              src="/icone_oficial.png"
              alt="ENCIVIL"
              className="w-12 h-12 object-contain"
              draggable={false}
            />
          </div>
          <div>
            <p className="text-white/80 text-sm font-medium">Bem-vindo, {displayName}</p>
            <h1 className="text-xl font-bold leading-tight">Centro de Ajuda</h1>
            <p className="text-white/70 text-xs mt-0.5">Tudo o que precisa para usar o sistema</p>
          </div>
        </div>
      </div>

      {/* ── Ações rápidas ─────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
          Ações rápidas
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate('/novo-movimento')}
            className="bg-card rounded-2xl border border-border p-4 flex flex-col items-center gap-2 hover:border-destructive/50 hover:bg-destructive/5 active:scale-95 transition-all shadow-sm"
          >
            <div className="bg-destructive/10 p-2.5 rounded-xl">
              <ArrowUpCircle className="w-6 h-6 text-destructive" />
            </div>
            <span className="text-xs font-semibold text-foreground">Registar Saída</span>
          </button>
          <button
            onClick={() => navigate('/novo-movimento')}
            className="bg-card rounded-2xl border border-border p-4 flex flex-col items-center gap-2 hover:border-success/50 hover:bg-success/5 active:scale-95 transition-all shadow-sm"
          >
            <div className="bg-success/10 p-2.5 rounded-xl">
              <ArrowDownCircle className="w-6 h-6 text-success" />
            </div>
            <span className="text-xs font-semibold text-foreground">Registar Entrada</span>
          </button>
        </div>
      </div>

      {/* ── Guias ─────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
          Guias passo a passo
        </p>
        <div className="space-y-3">
          {guides.map((guide) => (
            <GuideCard key={guide.id} guide={guide} />
          ))}
        </div>
      </div>

      {/* ── Contacto / Suporte ────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <div className="bg-primary/10 p-2.5 rounded-xl">
            <CircleHelp className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm">Precisa de ajuda adicional?</p>
            <p className="text-xs text-muted-foreground">Contacte o administrador do sistema</p>
          </div>
        </div>
        <a
          href="mailto:mickael.encivil@hotmail.com"
          className="flex items-center justify-between w-full py-3 px-4 bg-accent rounded-xl hover:bg-accent/80 active:scale-[0.98] transition-all"
        >
          <span className="text-sm font-medium text-foreground">mickael.encivil@hotmail.com</span>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </a>
      </div>

      {/* ── Referência Técnica (admin only) ───────────── */}
      {isAdmin && <TechnicalRefSection />}

    </div>
  );
}
