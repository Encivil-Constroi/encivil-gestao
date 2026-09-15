import { useState, useEffect } from 'react';
import { Building2, Package, Save, User, Mail, Shield, AlertTriangle, Sun, Moon, Monitor } from 'lucide-react';
import { toast } from 'sonner';
import { useConfiguracoes } from '@/features/configuracoes/hooks/useConfiguracoes';
import { useAuth } from '@/features/auth/AuthContext';
import { useRole } from '@/features/auth/useRole';
import { useTheme, type ThemeChoice } from '@/features/theme/ThemeProvider';

const THEME_OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun; desc: string }[] = [
  { value: 'light',  label: 'Claro',   Icon: Sun,     desc: 'Fundo branco'     },
  { value: 'dark',   label: 'Escuro',  Icon: Moon,    desc: 'Fundo escuro'     },
  { value: 'system', label: 'Sistema', Icon: Monitor, desc: 'Segue o sistema'  },
]

export function SettingsPage() {
  const { config, loading, saving, atualizar } = useConfiguracoes();
  const { user } = useAuth();
  const { role, isAdmin } = useRole();
  const { theme, setTheme } = useTheme();

  const [formData, setFormData] = useState({
    nomeEmpresa:        '',
    responsavelArmazem: '',
    stockMinimoPadrao:  '10',
    nifEmpresa:         '',
    sedeEmpresa:        '',
  });

  useEffect(() => {
    if (config) {
      setFormData({
        nomeEmpresa:        config.nomeEmpresa,
        responsavelArmazem: config.responsavelArmazem ?? '',
        stockMinimoPadrao:  String(config.stockMinimoPadrao),
        nifEmpresa:         config.nifEmpresa ?? '',
        sedeEmpresa:        config.sedeEmpresa ?? '',
      });
    }
  }, [config]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await atualizar({
      nomeEmpresa:        formData.nomeEmpresa,
      responsavelArmazem: formData.responsavelArmazem || null,
      stockMinimoPadrao:  parseFloat(formData.stockMinimoPadrao) || 10,
      nifEmpresa:         formData.nifEmpresa || null,
      sedeEmpresa:        formData.sedeEmpresa || null,
    });
    if (ok) toast.success('Configurações guardadas com sucesso!');
    else    toast.error('Erro ao guardar configurações.');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const inputCls = 'w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-base';

  const roleLabel: Record<string, { label: string; cls: string }> = {
    admin:  { label: 'Administrador',  cls: 'bg-primary/10 text-primary' },
    gestor: { label: 'Encarregado',    cls: 'bg-success/10 text-success' },
  };
  const roleBadge = roleLabel[role ?? ''] ?? { label: role ?? 'Utilizador', cls: 'bg-muted text-muted-foreground' };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">Preferências do sistema ENCIVIL</p>
      </div>

      {!isAdmin && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Apenas de visualização</p>
            <p className="text-xs text-amber-700 mt-0.5">Só administradores podem editar as configurações da empresa.</p>
          </div>
        </div>
      )}

      {/* Aparência — preferência pessoal, disponível a todos os utilizadores */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Sun className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Aparência</h3>
        </div>
        <div className="p-5">
          <p className="text-xs text-muted-foreground mb-3">Escolha o tema da interface. A preferência é guardada neste dispositivo.</p>
          <div className="grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map(({ value, label, Icon, desc }) => {
              const active = theme === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  className={`
                    flex flex-col items-center gap-2 px-3 py-4 rounded-xl border-2 transition-all
                    ${active
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:border-border/80 hover:bg-accent/50 text-muted-foreground'}
                  `}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-semibold">{label}</span>
                  <span className="text-[10px] text-center leading-tight opacity-70">{desc}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Conta do utilizador */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <User className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">A Minha Conta</h3>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">Email</span>
            </div>
            <span className="text-sm font-medium">{user?.email ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">Permissões</span>
            </div>
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${roleBadge.cls}`}>
              {roleBadge.label}
            </span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <fieldset disabled={!isAdmin} className="contents">

        {/* Dados da empresa */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Dados da Empresa</h3>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Nome da Empresa</label>
              <input
                type="text"
                value={formData.nomeEmpresa}
                onChange={e => setFormData({ ...formData, nomeEmpresa: e.target.value })}
                className={inputCls}
                placeholder="ENCIVIL"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Responsável pelo Armazém</label>
              <input
                type="text"
                value={formData.responsavelArmazem}
                onChange={e => setFormData({ ...formData, responsavelArmazem: e.target.value })}
                className={inputCls}
                placeholder="Nome do responsável"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">NIF da Empresa</label>
              <input
                type="text"
                value={formData.nifEmpresa}
                onChange={e => setFormData({ ...formData, nifEmpresa: e.target.value })}
                className={inputCls}
                placeholder="Ex: 500123456"
              />
              <p className="text-xs text-muted-foreground mt-1.5">Usado no cabeçalho do Termo de Responsabilidade de ferramentas.</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Sede da Empresa</label>
              <input
                type="text"
                value={formData.sedeEmpresa}
                onChange={e => setFormData({ ...formData, sedeEmpresa: e.target.value })}
                className={inputCls}
                placeholder="Endereço completo da sede"
              />
            </div>
          </div>
        </div>

        {/* Preferências de stock */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Package className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Preferências de Stock</h3>
          </div>
          <div className="p-5">
            <div>
              <label className="block text-sm font-medium mb-1">Stock Mínimo Padrão</label>
              <p className="text-xs text-muted-foreground mb-2">
                Valor sugerido ao criar novos produtos
              </p>
              <input
                type="number"
                value={formData.stockMinimoPadrao}
                onChange={e => setFormData({ ...formData, stockMinimoPadrao: e.target.value })}
                className={inputCls}
                min="0"
                placeholder="10"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving || !isAdmin}
          className="w-full py-4 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 font-bold disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
        >
          <Save className="w-5 h-5" />
          {saving ? 'A guardar…' : 'Guardar Configurações'}
        </button>
        </fieldset>
      </form>
    </div>
  );
}
