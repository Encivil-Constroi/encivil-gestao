import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  Plus, Search, Wrench, ChevronRight, RotateCcw, Archive,
  History, FileText, Undo2,
} from 'lucide-react';
import { SkeletonList } from '../components/Skeletons';
import { toast } from 'sonner';
import { ToolStatusBadge } from '../components/ToolStatusBadge';
import { EmptyState } from '../components/EmptyState';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ToolLoanTermPrint } from '../components/ToolLoanTermPrint';
import { getToolCategoryLabel } from '../data/mockData';
import {
  useFerramentas,
  useFerramentasArquivadas,
  useRestaurarFerramenta,
} from '@/features/ferramentas/hooks/useFerramentas';
import { useEmprestimos } from '@/features/ferramentas/hooks/useEmprestimos';
import { useConfiguracoes } from '@/features/configuracoes/hooks/useConfiguracoes';
import { useRole } from '@/features/auth/useRole';
import type { ToolStatus, ToolLoan } from '../types';

type Tab = 'catalogo' | 'historico' | 'arquivadas';
type StatusFilter = 'todos' | ToolStatus;
type LoanFilter = 'todos' | 'ativo' | 'devolvido';

const statusFilters: { value: StatusFilter; label: string; cls: string }[] = [
  { value: 'todos',      label: 'Todas',          cls: 'bg-accent text-foreground hover:bg-accent/80' },
  { value: 'disponivel', label: '✓ Disponível',   cls: 'bg-success/10 text-success hover:bg-success/20 border-success/30' },
  { value: 'emprestada', label: '⏱ Emprestada',   cls: 'bg-warning/10 text-warning hover:bg-warning/20 border-warning/30' },
  { value: 'manutencao', label: '✕ Manutenção',   cls: 'bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/30' },
];

export function ToolsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { podeFerramentas } = useRole();
  const canOperate = podeFerramentas;

  const [tab, setTab] = useState<Tab>('catalogo');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
  const [loanFilter, setLoanFilter] = useState<LoanFilter>('ativo');
  const [employeeSearch, setEmployeeSearch] = useState('');

  const [termLoan, setTermLoan] = useState<ToolLoan | null>(
    (location.state as { termLoan?: ToolLoan } | null)?.termLoan ?? null
  );
  const [restoreId, setRestoreId] = useState<string | null>(null);

  const { tools, loading, reload } = useFerramentas();
  const { tools: archived, loading: loadingArchived, error: archivedError, reload: reloadArchived } = useFerramentasArquivadas();
  const { restaurar, loading: restoring } = useRestaurarFerramenta();
  const { config } = useConfiguracoes();

  const loanLoadFiltros = loanFilter === 'todos' ? {} : { estado: loanFilter };
  const { loans, loading: loadingLoans, reload: reloadLoans } = useEmprestimos(loanLoadFiltros);
  const { loans: activeLoans, reload: reloadActiveLoans } = useEmprestimos({ estado: 'ativo' });

  const reloadAll = () => { reload(); reloadLoans(); reloadActiveLoans(); };

  // Limpa o state da navegação para o termo não reabrir num "voltar" do browser
  useEffect(() => {
    if (location.state) {
      reloadAll();
      window.history.replaceState({}, '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loanByTool = new Map(activeLoans.map(l => [l.toolId, l]));

  const filteredActive = tools.filter(t => {
    const matchSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'todos' || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const filteredArchived = archived.filter(t =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredLoans = loans.filter(l =>
    employeeSearch.trim() === '' || l.employeeName.toLowerCase().includes(employeeSearch.toLowerCase())
  );

  const counts = {
    disponivel: tools.filter(t => t.status === 'disponivel').length,
    emprestada: tools.filter(t => t.status === 'emprestada').length,
    manutencao: tools.filter(t => t.status === 'manutencao').length,
  };

  const isAtrasado = (l: ToolLoan) =>
    l.status === 'ativo' && l.expectedReturnDate && l.expectedReturnDate.getTime() < Date.now();

  const handleRestore = async () => {
    if (!restoreId) return;
    const name = archived.find(t => t.id === restoreId)?.name;
    const ok = await restaurar(restoreId);
    if (ok) {
      toast.success(`"${name}" restaurada com sucesso.`);
      setRestoreId(null);
      reloadArchived();
      reload();
    } else {
      toast.error('Erro ao restaurar ferramenta.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Ferramentas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tab === 'catalogo'
              ? (loading ? 'A carregar…' : `${tools.length} ferramenta${tools.length !== 1 ? 's' : ''} no inventário`)
              : tab === 'historico'
              ? (loadingLoans ? 'A carregar…' : `${loans.length} empréstimo${loans.length !== 1 ? 's' : ''}`)
              : (loadingArchived ? 'A carregar…' : `${archived.length} arquivada${archived.length !== 1 ? 's' : ''}`)}
          </p>
        </div>
        {podeFerramentas && tab === 'catalogo' && (
          <button
            onClick={() => navigate('/ferramentas/nova')}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 active:scale-95 transition-all text-sm font-semibold shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nova Ferramenta</span>
            <span className="sm:hidden">Nova</span>
          </button>
        )}
        {canOperate && tab === 'catalogo' && (
          <button
            onClick={() => navigate('/ferramentas/emprestimo')}
            className="flex items-center gap-2 px-4 py-2.5 bg-warning text-white rounded-xl hover:bg-warning/90 active:scale-95 transition-all text-sm font-semibold shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Emprestar</span>
            <span className="sm:hidden">Emprestar</span>
          </button>
        )}
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">

        {/* Tabs */}
        <div className="flex border-b border-border px-4 pt-3 overflow-x-auto">
          <button
            onClick={() => setTab('catalogo')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-colors border-b-2 -mb-px whitespace-nowrap ${
              tab === 'catalogo' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Wrench className="w-4 h-4" />
            Catálogo
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${tab === 'catalogo' ? 'bg-primary/10' : 'bg-muted'}`}>{tools.length}</span>
          </button>
          <button
            onClick={() => setTab('historico')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-colors border-b-2 -mb-px whitespace-nowrap ${
              tab === 'historico' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <History className="w-4 h-4" />
            Histórico de Empréstimos
          </button>
          {podeFerramentas && (
            <button
              onClick={() => setTab('arquivadas')}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-colors border-b-2 -mb-px whitespace-nowrap ${
                tab === 'arquivadas' ? 'border-warning text-warning' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Archive className="w-4 h-4" />
              Arquivadas
              {archived.length > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${tab === 'arquivadas' ? 'bg-warning/10' : 'bg-muted'}`}>{archived.length}</span>
              )}
            </button>
          )}
        </div>

        {/* ── Tab: Catálogo ──────────────────────── */}
        {tab === 'catalogo' && (
          <>
            <div className="p-4 border-b border-border space-y-3">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Pesquisar por nome ou código…"
                  className="w-full pl-10 pr-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {statusFilters.map(f => {
                  const count = f.value !== 'todos' ? counts[f.value as keyof typeof counts] : tools.length;
                  const isActive = statusFilter === f.value;
                  return (
                    <button
                      key={f.value}
                      onClick={() => setStatusFilter(f.value)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        isActive ? `${f.cls} border-current ring-2 ring-current/20` : `${f.cls} border-transparent`
                      }`}
                    >
                      {f.label}
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${isActive ? 'bg-current/20' : 'bg-muted/50 text-muted-foreground'}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {loading ? (
              <SkeletonList rows={6} cols={4} />
            ) : filteredActive.length === 0 ? (
              <EmptyState
                icon={Wrench}
                title="Nenhuma ferramenta encontrada"
                description={searchTerm || statusFilter !== 'todos' ? 'Tente alterar a pesquisa ou o filtro.' : 'Adicione a primeira ferramenta ao inventário.'}
              />
            ) : (
              <>
                <div className="md:hidden divide-y divide-border">
                  {filteredActive.map(t => {
                    const loan = loanByTool.get(t.id);
                    return (
                      <div key={t.id} className="p-4 flex items-center gap-3">
                        <div onClick={() => navigate(`/ferramentas/${t.id}`)} className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                          <div className="rounded-xl p-2.5 shrink-0 bg-accent">
                            <Wrench className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{t.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{t.code} · {getToolCategoryLabel(t.category)}</p>
                            {loan && <p className="text-xs text-warning mt-1">Com: {loan.employeeName}</p>}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <ToolStatusBadge status={t.status} />
                          {canOperate && t.status === 'disponivel' && (
                            <button onClick={() => navigate(`/ferramentas/emprestimo?ferramenta=${t.id}`)} className="text-xs font-semibold text-warning hover:underline">Emprestar</button>
                          )}
                          {canOperate && t.status === 'emprestada' && loan && (
                            <button onClick={() => navigate(`/ferramentas/${t.id}/devolucao`)} className="text-xs font-semibold text-success hover:underline">Devolver</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        {['Código', 'Ferramenta', 'Categoria', 'Estado', 'Com quem', ''].map(h => (
                          <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredActive.map(t => {
                        const loan = loanByTool.get(t.id);
                        return (
                          <tr key={t.id} className="hover:bg-accent/40 transition-colors">
                            <td onClick={() => navigate(`/ferramentas/${t.id}`)} className="px-5 py-4 whitespace-nowrap text-sm font-mono font-medium text-muted-foreground cursor-pointer">{t.code}</td>
                            <td onClick={() => navigate(`/ferramentas/${t.id}`)} className="px-5 py-4 text-sm font-medium cursor-pointer">{t.name}</td>
                            <td onClick={() => navigate(`/ferramentas/${t.id}`)} className="px-5 py-4 whitespace-nowrap text-sm text-muted-foreground cursor-pointer">{getToolCategoryLabel(t.category)}</td>
                            <td className="px-5 py-4 whitespace-nowrap"><ToolStatusBadge status={t.status} /></td>
                            <td className="px-5 py-4 whitespace-nowrap text-sm text-muted-foreground">{loan?.employeeName ?? '—'}</td>
                            <td className="px-5 py-4 whitespace-nowrap text-right">
                              {canOperate && t.status === 'disponivel' && (
                                <button onClick={() => navigate(`/ferramentas/emprestimo?ferramenta=${t.id}`)} className="text-xs font-semibold text-warning hover:underline">Emprestar</button>
                              )}
                              {canOperate && t.status === 'emprestada' && loan && (
                                <button onClick={() => navigate(`/ferramentas/${t.id}/devolucao`)} className="text-xs font-semibold text-success hover:underline">Devolver</button>
                              )}
                              {!(canOperate && (t.status === 'disponivel' || t.status === 'emprestada')) && (
                                <ChevronRight className="w-4 h-4 text-muted-foreground inline-block" />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Tab: Histórico ─────────────────────── */}
        {tab === 'historico' && (
          <>
            <div className="p-4 border-b border-border space-y-3">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={employeeSearch}
                  onChange={e => setEmployeeSearch(e.target.value)}
                  placeholder="Pesquisar por funcionário…"
                  className="w-full pl-10 pr-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {([['todos', 'Todos'], ['ativo', 'Em curso'], ['devolvido', 'Devolvidos']] as [LoanFilter, string][]).map(([v, l]) => (
                  <button
                    key={v}
                    onClick={() => setLoanFilter(v)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                      loanFilter === v ? 'bg-primary/10 text-primary border-primary/30' : 'bg-transparent text-muted-foreground border-border hover:border-primary/30'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {loadingLoans ? (
              <SkeletonList rows={5} cols={3} />
            ) : filteredLoans.length === 0 ? (
              <EmptyState icon={History} title="Nenhum empréstimo encontrado" description="Tente alterar os filtros." />
            ) : (
              <>
                <div className="md:hidden divide-y divide-border">
                  {filteredLoans.map(l => (
                    <div key={l.id} className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div>
                          <p className="text-sm font-semibold">{l.toolName}</p>
                          <p className="text-xs text-muted-foreground">{l.toolCode} · {l.employeeName}</p>
                        </div>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                          l.status === 'devolvido' ? 'bg-success/10 text-success' : isAtrasado(l) ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'
                        }`}>
                          {l.status === 'devolvido' ? 'Devolvido' : isAtrasado(l) ? 'Atrasado' : 'Em curso'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap mb-2">
                        <span>{l.loanDate.toLocaleDateString('pt-PT')}</span>
                        {l.destination && <span>→ {l.destination}</span>}
                      </div>
                      <button onClick={() => setTermLoan(l)} className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
                        <FileText className="w-3.5 h-3.5" /> Ver Termo
                      </button>
                    </div>
                  ))}
                </div>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        {['Ferramenta', 'Funcionário', 'Empréstimo', 'Devolução Prevista', 'Estado', 'Destino', ''].map(h => (
                          <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredLoans.map(l => (
                        <tr key={l.id} className="hover:bg-accent/40 transition-colors">
                          <td className="px-5 py-3 text-sm font-medium">{l.toolCode} · {l.toolName}</td>
                          <td className="px-5 py-3 text-sm text-muted-foreground">{l.employeeName}</td>
                          <td className="px-5 py-3 whitespace-nowrap text-sm text-muted-foreground">{l.loanDate.toLocaleDateString('pt-PT')}</td>
                          <td className="px-5 py-3 whitespace-nowrap text-sm text-muted-foreground">{l.expectedReturnDate?.toLocaleDateString('pt-PT') ?? '—'}</td>
                          <td className="px-5 py-3 whitespace-nowrap">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              l.status === 'devolvido' ? 'bg-success/10 text-success' : isAtrasado(l) ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'
                            }`}>
                              {l.status === 'devolvido' ? 'Devolvido' : isAtrasado(l) ? 'Atrasado' : 'Em curso'}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-sm text-muted-foreground">{l.destination ?? '—'}</td>
                          <td className="px-5 py-3 whitespace-nowrap text-right">
                            <div className="flex items-center justify-end gap-3">
                              {canOperate && l.status === 'ativo' && (
                                <button onClick={() => navigate(`/ferramentas/${l.toolId}/devolucao`)} className="flex items-center gap-1 text-xs font-semibold text-success hover:underline">
                                  <Undo2 className="w-3.5 h-3.5" /> Devolver
                                </button>
                              )}
                              <button onClick={() => setTermLoan(l)} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                                <FileText className="w-3.5 h-3.5" /> Termo
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Tab: Arquivadas ────────────────────── */}
        {tab === 'arquivadas' && (
          loadingArchived ? (
            <SkeletonList rows={4} cols={3} />
          ) : archivedError ? (
            <div className="p-8 text-center">
              <p className="text-sm text-destructive font-medium mb-3">Erro ao carregar ferramentas arquivadas.</p>
              <button onClick={reloadArchived} className="text-sm text-primary font-semibold hover:underline">Tentar novamente</button>
            </div>
          ) : filteredArchived.length === 0 ? (
            <EmptyState icon={Archive} title="Nenhuma ferramenta arquivada" description="Ferramentas arquivadas aparecem aqui." />
          ) : (
            <div className="md:hidden divide-y divide-border">
              {filteredArchived.map(t => (
                <div key={t.id} className="p-4 flex items-center gap-3">
                  <div className="rounded-xl p-2.5 shrink-0 bg-muted">
                    <Wrench className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate text-muted-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t.code} · {getToolCategoryLabel(t.category)}</p>
                  </div>
                  <button onClick={() => setRestoreId(t.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors shrink-0">
                    <RotateCcw className="w-3.5 h-3.5" /> Restaurar
                  </button>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Modais */}
      {termLoan && (
        <ToolLoanTermPrint
          loan={termLoan}
          tool={tools.find(t => t.id === termLoan.toolId) ?? archived.find(t => t.id === termLoan.toolId) ?? null}
          config={config}
          onClose={() => setTermLoan(null)}
        />
      )}
      {restoreId && (
        <ConfirmDialog
          title={`Restaurar "${archived.find(t => t.id === restoreId)?.name}"?`}
          description="A ferramenta voltará a aparecer no catálogo ativo."
          confirmLabel="Restaurar Ferramenta"
          variant="warning"
          loading={restoring}
          onConfirm={handleRestore}
          onCancel={() => setRestoreId(null)}
        />
      )}
    </div>
  );
}
