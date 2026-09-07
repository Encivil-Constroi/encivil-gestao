import { useState } from 'react';
import {
  BookOpen, Package, Wrench, Fuel, Building2,
  Users, BarChart2, Shield, Settings,
  ChevronRight, AlertTriangle, CheckCircle2, Info, GitBranch,
  FileText, Database, Layout, Lock,
} from 'lucide-react';

type DocSection = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  category?: string;
  content: React.ReactNode;
};

// ── Componentes de layout ─────────────────────────────────────────────────────

function H1({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl font-bold text-foreground mb-4 pb-2 border-b border-border">{children}</h2>;
}
function H2({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold text-foreground mt-6 mb-3">{children}</h3>;
}
function Para({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground leading-relaxed mb-3">{children}</p>;
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
function Table({ headers, rows }: { headers: string[]; rows: (string | React.ReactNode)[][] }) {
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
function Alert({ type, children }: { type: 'info' | 'warning' | 'danger'; children: React.ReactNode }) {
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
function Steps({ items }: { items: { t: string; d: string }[] }) {
  return (
    <div className="space-y-3 mb-4">
      {items.map((s, i) => (
        <div key={i} className="flex gap-3 p-3 bg-accent/40 rounded-lg border border-border">
          <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center shrink-0 font-bold">{i + 1}</span>
          <div>
            <div className="text-sm font-medium text-foreground">{s.t}</div>
            <div className="text-xs text-muted-foreground">{s.d}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Secções ───────────────────────────────────────────────────────────────────

const sections: DocSection[] = [

  // ──────────────── GUIA DO UTILIZADOR ─────────────────────────────────────

  {
    id: 'inicio',
    label: 'Início Rápido',
    icon: BookOpen,
    category: 'Guia do Utilizador',
    content: (
      <div>
        <H1>Início Rápido</H1>
        <Para>O ENCIVIL Gestão é o sistema ERP interno da empresa. Centraliza o controlo de armazém, ferramentas, combustível, obras, subempreiteiros e recursos humanos.</Para>

        <H2>Como aceder</H2>
        <Steps items={[
          { t: 'Abrir o browser', d: 'Chrome, Edge ou Firefox — o sistema funciona em qualquer dispositivo.' },
          { t: 'Ir a encivil-gestao.pages.dev', d: 'URL oficial. Marque nos favoritos.' },
          { t: 'Introduzir email e palavra-passe', d: 'Credenciais fornecidas pelo administrador.' },
          { t: 'Pronto', d: 'Será encaminhado para o Dashboard automaticamente.' },
        ]} />

        <H2>Navegação</H2>
        <Para>A barra lateral esquerda organiza as funcionalidades por área. Apenas vê as secções que o seu papel permite aceder.</Para>
        <Table
          headers={['Secção', 'O que encontra aqui']}
          rows={[
            ['Dashboard', 'Resumo geral — stock, alertas, obras activas'],
            ['Produtos', 'Inventário do armazém — consultar e registar movimentos'],
            ['Histórico', 'Todos os movimentos de stock com filtros'],
            ['Ferramentas', 'Catálogo e empréstimos de ferramentas'],
            ['Combustível', 'Abastecimentos e viaturas'],
            ['Obras', 'Lista de obras e respetivos detalhes'],
            ['Subempreiteiros', 'Contratações e autos de medição'],
            ['Colaboradores', 'Registo de pessoal (gestores)'],
            ['Horários / Faltas', 'Gestão de horários e ausências (gestores)'],
            ['Relatórios', 'Relatórios por período, produto e obra'],
            ['Auditoria', 'Registo de ações sensíveis (admin)'],
          ]}
        />

        <Alert type="info">
          Se não vir uma secção no menu, é porque o seu papel não tem acesso. Fale com o administrador se precisar de acesso adicional.
        </Alert>
      </div>
    ),
  },

  {
    id: 'papeis',
    label: 'Papéis e Permissões',
    icon: Lock,
    category: 'Guia do Utilizador',
    content: (
      <div>
        <H1>Papéis e Permissões</H1>
        <Para>O sistema tem três papéis. Cada utilizador tem exatamente um papel, atribuído pelo administrador.</Para>

        <H2>Operador</H2>
        <Para>Regista o trabalho do dia-a-dia — movimentos, abastecimentos, empréstimos. Não gere dados de referência.</Para>
        <Checklist items={[
          { done: true,  text: 'Ver produtos e stock atual' },
          { done: true,  text: 'Registar entrada, saída e ajuste de stock' },
          { done: true,  text: 'Ver histórico de movimentos' },
          { done: true,  text: 'Registar abastecimento (via QR code público ou login)' },
          { done: true,  text: 'Ver ferramentas disponíveis' },
          { done: false, text: 'Criar/editar produtos, ferramentas ou viaturas' },
          { done: false, text: 'Gerir obras, subempreiteiros ou colaboradores' },
          { done: false, text: 'Aceder a Relatórios, Auditoria ou Configurações' },
        ]} />

        <H2>Gestor</H2>
        <Para>Gere e aprova. Acede a tudo o que o Operador acede, mais gestão de referências e recursos humanos.</Para>
        <Checklist items={[
          { done: true, text: 'Tudo o que o Operador pode fazer' },
          { done: true, text: 'Criar e editar produtos, ferramentas, viaturas' },
          { done: true, text: 'Registar e devolver empréstimos de ferramentas' },
          { done: true, text: 'Gerir obras e subempreiteiros' },
          { done: true, text: 'Validar autos de medição' },
          { done: true, text: 'Gerir colaboradores, horários e faltas' },
          { done: true, text: 'Aprovar abastecimentos pendentes' },
          { done: true, text: 'Ver relatórios e alertas' },
          { done: false, text: 'Eliminar registos permanentemente' },
          { done: false, text: 'Aceder à Auditoria ou Configurações' },
        ]} />

        <H2>Administrador</H2>
        <Para>Acesso total ao sistema. Deve ser uma conta pessoal, nunca partilhada.</Para>
        <Checklist items={[
          { done: true, text: 'Tudo o que o Gestor pode fazer' },
          { done: true, text: 'Eliminar registos permanentemente' },
          { done: true, text: 'Ver o Dashboard de Auditoria (ações sensíveis)' },
          { done: true, text: 'Configurações globais da empresa' },
          { done: true, text: 'Gerir utilizadores e papéis' },
        ]} />

        <Alert type="warning">
          A senha do administrador deve ser forte e única. Nunca partilhe credenciais.
        </Alert>
      </div>
    ),
  },

  {
    id: 'armazem',
    label: 'Armazém',
    icon: Package,
    category: 'Guia do Utilizador',
    content: (
      <div>
        <H1>Armazém — Produtos e Movimentos</H1>

        <H2>Registar um movimento (saída, entrada ou ajuste)</H2>
        <Steps items={[
          { t: 'Clique em "Novo Movimento" no menu lateral', d: 'Ou no botão de atalho no Dashboard.' },
          { t: 'Escolha o tipo', d: 'Saída (material a usar em obra), Entrada (reposição de stock), Ajuste (correção após contagem).' },
          { t: 'Selecione o produto', d: 'Pesquise por nome ou código. O stock atual é mostrado em tempo real.' },
          { t: 'Introduza a quantidade', d: 'Para saídas: o sistema bloqueia se não houver stock suficiente.' },
          { t: 'Preencha os campos obrigatórios', d: 'Destino/obra é obrigatório em saídas. Motivo é obrigatório em ajustes.' },
          { t: 'Submeta', d: 'O stock é atualizado imediatamente. Aparece uma confirmação verde no topo.' },
        ]} />

        <H2>Alertas de stock</H2>
        <Table
          headers={['Estado', 'Significado', 'Ação recomendada']}
          rows={[
            [<Tag color="red">Sem stock</Tag>, 'Stock = 0', 'Encomendar imediatamente'],
            [<Tag color="yellow">Stock baixo</Tag>, 'Stock ≤ mínimo definido', 'Planear encomenda'],
            [<Tag color="green">Normal</Tag>, 'Stock acima do mínimo', 'Sem ação necessária'],
          ]}
        />

        <H2>Regras imutáveis</H2>
        <Rule code="RN-01" text="O histórico de movimentos nunca é apagado." highlight />
        <Rule code="RN-02" text="Stock não pode ficar negativo — saída é bloqueada se insuficiente." highlight />
        <Rule code="RN-03" text="Correções fazem-se por novo ajuste, nunca editando o histórico." />
        <Rule code="RN-04" text="A data/hora é registada automaticamente pelo sistema (Europe/Lisbon)." />
      </div>
    ),
  },

  {
    id: 'ferramentas-guia',
    label: 'Ferramentas',
    icon: Wrench,
    category: 'Guia do Utilizador',
    content: (
      <div>
        <H1>Ferramentas — Empréstimos e Devoluções</H1>
        <Alert type="info">
          Todo o empréstimo gera um <strong>Termo de Responsabilidade</strong> assinado digitalmente pelo funcionário e pelo responsável. O sistema guarda as assinaturas.
        </Alert>

        <H2>Registar um empréstimo</H2>
        <Steps items={[
          { t: 'Ir a Ferramentas → selecionar a ferramenta', d: 'Só aparecem ferramentas com estado "Disponível".' },
          { t: 'Clicar em "Emprestar"', d: 'Ou ir a Ferramentas → Novo Empréstimo.' },
          { t: 'Preencher os dados do funcionário', d: 'Nome, documento de identificação (opcional), destino/obra.' },
          { t: 'Recolher a assinatura do funcionário', d: 'No campo de assinatura digital — o funcionário assina com o dedo ou rato.' },
          { t: 'Confirmar', d: 'A ferramenta passa ao estado "Emprestada". O termo é gerado automaticamente.' },
        ]} />

        <H2>Registar uma devolução</H2>
        <Steps items={[
          { t: 'Ir a Ferramentas → Histórico ou detalhe da ferramenta', d: 'Encontre o empréstimo ativo.' },
          { t: 'Clicar em "Registar Devolução"', d: '' },
          { t: 'Indicar a condição de devolução', d: 'Bom estado, danificada, ou perdida.' },
          { t: 'Recolher a assinatura do responsável', d: 'Quem recebe a ferramenta assina.' },
          { t: 'Confirmar', d: 'A ferramenta volta ao estado "Disponível".' },
        ]} />

        <Alert type="warning">
          Ferramentas em estado <strong>danificada</strong> ou <strong>perdida</strong> ficam marcadas e não voltam automaticamente ao estado disponível. O gestor deve decidir o que fazer.
        </Alert>
      </div>
    ),
  },

  {
    id: 'combustivel-guia',
    label: 'Combustível',
    icon: Fuel,
    category: 'Guia do Utilizador',
    content: (
      <div>
        <H1>Combustível — Abastecimentos e Viaturas</H1>

        <H2>Registar um abastecimento</H2>
        <Para>Há duas formas de registar:</Para>
        <Table
          headers={['Método', 'Quando usar', 'Como aceder']}
          rows={[
            ['QR Code (público)', 'Motorista regista no local sem login', 'Digitalizar QR code impresso na viatura'],
            ['Interface normal', 'Gestor regista em nome de outrem', 'Combustível → Novo Abastecimento'],
          ]}
        />

        <H2>Abastecimentos por QR Code</H2>
        <Steps items={[
          { t: 'Motorista digitaliza o QR da viatura', d: 'Abre diretamente o formulário para aquela viatura.' },
          { t: 'Preenche litros, custo total e contador', d: 'Contador (km ou horas) é opcional mas recomendado.' },
          { t: 'Submete', d: 'O abastecimento fica com estado "Pendente" até aprovação do gestor.' },
          { t: 'Gestor aprova no separador Pendentes', d: 'Pode editar antes de aprovar se houver erro.' },
        ]} />

        <H2>Imprimir QR codes das viaturas</H2>
        <Steps items={[
          { t: 'Combustível → Viaturas', d: '' },
          { t: 'Clicar no ícone de QR Code da viatura', d: 'Ou ir a Imprimir QR Code no menu.' },
          { t: 'Imprimir e plastificar', d: 'Colocar no interior da viatura em local visível.' },
        ]} />
      </div>
    ),
  },

  {
    id: 'obras-guia',
    label: 'Obras e Subempreiteiros',
    icon: Building2,
    category: 'Guia do Utilizador',
    content: (
      <div>
        <H1>Obras e Subempreiteiros</H1>

        <H2>Ciclo de vida de uma obra</H2>
        <Table
          headers={['Estado', 'Significado']}
          rows={[
            ['Planeamento', 'Obra criada mas não iniciada'],
            ['Activa', 'Obra em curso — aceita movimentos, abastecimentos e ferramentas'],
            ['Concluída', 'Obra terminada — dados históricos visíveis, sem novos registos'],
          ]}
        />

        <H2>Autos de medição</H2>
        <Steps items={[
          { t: 'Ir a Subempreiteiros → selecionar a contratação', d: 'Cada contratação pertence a uma obra.' },
          { t: 'Clicar em "Novo Auto"', d: 'Introduzir data, percentagem ou valor do período.' },
          { t: 'Adicionar linhas de medição', d: 'Para contratos unitários: artigo, unidade, quantidade e preço.' },
          { t: 'Guardar como rascunho', d: 'Pode editar até validar.' },
          { t: 'Validar o auto', d: 'Após validação o auto fica imutável. Soma ao executado do subempreiteiro.' },
        ]} />

        <Alert type="warning">
          Um auto <strong>validado</strong> não pode ser editado. Verifique os valores antes de validar.
        </Alert>
      </div>
    ),
  },

  {
    id: 'rh-guia',
    label: 'Recursos Humanos',
    icon: Users,
    category: 'Guia do Utilizador',
    content: (
      <div>
        <H1>Recursos Humanos — Colaboradores, Horários e Faltas</H1>
        <Alert type="info">Esta secção é visível apenas para <strong>Gestores</strong> e <strong>Administradores</strong>.</Alert>

        <H2>Colaboradores</H2>
        <Para>Registo de pessoal da empresa: nome, categoria profissional, contacto, NIF e data de admissão. Colaboradores inativos ficam arquivados mas o histórico é preservado.</Para>

        <H2>Horários de trabalho</H2>
        <Para>Defina os tipos de horário praticados na empresa (ex: "Horário Geral Obra", "Turno Noturno"). Cada horário define:</Para>
        <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 mb-4">
          <li>Hora de entrada e hora de saída</li>
          <li>Dias da semana</li>
          <li>Horas por dia e por semana</li>
          <li>Tolerância de entrada (minutos)</li>
          <li>Intervalo de almoço (opcional)</li>
        </ul>
        <Para>Cada colaborador pode ter um horário atribuído com data de início e, opcionalmente, data de fim.</Para>

        <H2>Gestão de faltas</H2>
        <Steps items={[
          { t: 'Faltas → Nova Falta', d: 'Selecionar colaborador, datas e tipo de falta.' },
          { t: 'Estado inicial: "Comunicada"', d: 'A falta está registada mas ainda não aprovada.' },
          { t: 'Colaborador entrega comprovativo', d: 'O gestor passa para "Com comprovativo".' },
          { t: 'Gestor decide', d: '"Justificada" ou "Injustificada". A decisão fica registada com data e responsável.' },
        ]} />

        <Table
          headers={['Estado da falta', 'Descrição']}
          rows={[
            ['Comunicada', 'Registada — aguarda comprovativo ou decisão'],
            ['Com comprovativo', 'Comprovativo entregue — aguarda decisão'],
            ['Justificada', 'Aprovada com justificação válida'],
            ['Injustificada', 'Falta não justificada'],
          ]}
        />
      </div>
    ),
  },

  // ──────────────── REFERÊNCIA TÉCNICA ─────────────────────────────────────

  {
    id: 'stack',
    label: 'Stack e Deploy',
    icon: Layout,
    category: 'Referência Técnica',
    content: (
      <div>
        <H1>Stack e Deploy</H1>
        <Table
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
        <Table
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
        <Rule code="useAsync" text="Todos os fetches usam useAsync — sem useEffect+useState manual." />
        <Rule code="useMutation" text="Todas as mutações usam useMutation — loading/error automáticos." />
        <Rule code="SELECT" text="Constante SELECT no topo de cada service — sem N+1 queries." />
        <Rule code="GRANT" text="Toda migration nova inclui GRANTs explícitos para authenticated." />
        <Rule code="types.ts" text="Nunca editar src/integrations/supabase/types.ts manualmente." highlight />
      </div>
    ),
  },

  {
    id: 'seguranca',
    label: 'Segurança',
    icon: Shield,
    category: 'Referência Técnica',
    content: (
      <div>
        <H1>Segurança e Controlo de Acesso</H1>

        <H2>RBAC — 3 papéis</H2>
        <Table
          headers={['Papel', 'Eliminar permanentemente', 'Gestão', 'Registo']}
          rows={[
            ['admin',    '✅', '✅', '✅'],
            ['gestor',   '❌', '✅', '✅'],
            ['operador', '❌', '❌', '✅'],
          ]}
        />
        <Alert type="danger">
          As políticas RLS usam <code>public.auth_role()</code> (SECURITY DEFINER). Nunca usar <code>auth.jwt() -&gt;&gt; 'role'</code> diretamente — não é seguro.
        </Alert>

        <H2>Chaves Supabase</H2>
        <Rule code="sb_publishable_*" text="Chave pública — pode ir em variáveis VITE_. É a chave anon." />
        <Rule code="sb_secret_*" text="Chave secreta — NUNCA no frontend, NUNCA em VITE_." highlight />

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
    category: 'Referência Técnica',
    content: (
      <div>
        <H1>Modelo de Dados</H1>
        <Table
          headers={['Tabela', 'Módulo', 'Apagável?']}
          rows={[
            ['profiles', 'Auth', 'Não (cascade de auth.users)'],
            ['produtos', 'Armazém', 'Não (desativação lógica)'],
            ['movimentos_stock', 'Armazém', '❌ NUNCA'],
            ['audit_log', 'Auditoria', 'Não'],
            ['ferramentas', 'Ferramentas', 'Não (desativação lógica)'],
            ['emprestimos_ferramentas', 'Ferramentas', 'Não'],
            ['obras', 'Obras', 'Gestor pode arquivar'],
            ['subempreiteiros', 'Subempreiteiros', 'Rascunho pode ser apagado'],
            ['autos_medicao', 'Autos', 'Só rascunhos'],
            ['comb_veiculos', 'Combustível', 'Não (desativação lógica)'],
            ['comb_abastecimentos', 'Combustível', 'Admin pode eliminar'],
            ['colaboradores', 'RH', 'Não (desativação lógica)'],
            ['horarios', 'RH', 'Não (arquivação lógica)'],
            ['faltas', 'RH', 'Admin pode eliminar'],
          ]}
        />

        <H2>RPCs atómicas (não duplicar)</H2>
        <Table
          headers={['RPC', 'Propósito']}
          rows={[
            ['registar_movimento', 'Movimento de stock com advisory lock e audit log'],
            ['criar_auto_rpc', 'Numeração de autos sem race condition'],
            ['custos_materiais_por_obra', 'Custos agregados server-side'],
            ['produtos_em_alerta', 'Stock baixo/sem-stock sem full table scan'],
          ]}
        />
      </div>
    ),
  },

  {
    id: 'regras-negocio',
    label: 'Regras de Negócio',
    icon: FileText,
    category: 'Referência Técnica',
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
    category: 'Referência Técnica',
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
    category: 'Referência Técnica',
    content: (
      <div>
        <H1>Migrations e Manutenção</H1>

        <H2>Aplicar uma migration</H2>
        <Steps items={[
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

        <Alert type="danger">
          Sem GRANTs explícitos, os utilizadores autenticados não conseguem aceder à nova tabela — RLS ativa mas sem GRANT bloqueia tudo.
        </Alert>
      </div>
    ),
  },

  {
    id: 'relatorios',
    label: 'Relatórios',
    icon: BarChart2,
    category: 'Referência Técnica',
    content: (
      <div>
        <H1>Relatórios</H1>
        <Alert type="info">
          <strong>Regra fundamental:</strong> Todos os relatórios de stock são calculados de <code>movimentos_stock</code>, nunca apenas de <code>produtos.stock_atual</code>.
        </Alert>

        <H2>Disponíveis</H2>
        <Table
          headers={['Relatório', 'Filtros', 'Exportação']}
          rows={[
            ['Histórico de movimentos', 'Produto, tipo, data, responsável', 'PDF + Excel'],
            ['Relatório semanal', 'Semana', 'Excel'],
            ['Relatório mensal', 'Mês/Ano, produto, categoria, obra', 'Impressão'],
            ['Relatório anual', 'Ano', 'Impressão'],
            ['Consumo por obra', 'Obra + período', 'Impressão'],
            ['Top produtos consumidos', 'Período', 'Impressão'],
            ['Ferramentas em atraso', 'Automático', '–'],
            ['Custos por obra', 'Obra (RPC server-side)', 'Impressão'],
          ]}
        />

        <H2>Exportar para PDF</H2>
        <Steps items={[
          { t: 'Abrir o relatório pretendido', d: '' },
          { t: 'Clicar no botão com ícone de impressora', d: 'Abre o diálogo de impressão do browser.' },
          { t: 'Selecionar "Guardar como PDF"', d: 'Em Chrome/Edge: Destino → Guardar como PDF.' },
        ]} />
      </div>
    ),
  },
];

const categories = ['Guia do Utilizador', 'Referência Técnica'];

export function DocsPage() {
  const [activeId, setActiveId] = useState('inicio');
  const active = sections.find((s) => s.id === activeId)!;

  return (
    <div className="flex h-[calc(100vh-64px)] -mt-6 -mx-6 overflow-hidden">
      {/* Sidebar da documentação */}
      <aside className="w-56 border-r border-border bg-muted/30 flex flex-col overflow-y-auto shrink-0">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Documentação</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">ENCIVIL Gestão v3.0</p>
        </div>

        <nav className="flex-1 p-3">
          {categories.map((cat) => {
            const catSections = sections.filter((s) => s.category === cat);
            if (!catSections.length) return null;
            return (
              <div key={cat} className="mb-4">
                <p className="text-xs font-medium text-muted-foreground uppercase px-2 mb-1">{cat}</p>
                <ul className="space-y-0.5">
                  {catSections.map((s) => {
                    const Icon = s.icon;
                    const isActive = s.id === activeId;
                    return (
                      <li key={s.id}>
                        <button
                          onClick={() => setActiveId(s.id)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs transition-colors ${
                            isActive
                              ? 'bg-primary text-white'
                              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span>{s.label}</span>
                          {isActive && <ChevronRight className="w-3 h-3 ml-auto" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Conteúdo */}
      <main className="flex-1 overflow-y-auto p-8 bg-background">
        <div className="max-w-3xl mx-auto">
          {active.content}
        </div>
      </main>
    </div>
  );
}
