import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Lock, Eye, EyeOff, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

type State = 'waiting' | 'ready' | 'saving' | 'done' | 'invalid';

const inputCls = 'w-full pl-10 pr-10 py-3 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-base';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [state, setState]           = useState<State>('waiting');
  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [showConf, setShowConf]     = useState(false);

  // Supabase processa automaticamente o token do hash da URL e dispara
  // PASSWORD_RECOVERY quando a sessão de recuperação fica pronta.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setState('ready');
      }
    });

    // Se o utilizador navegou diretamente para esta página sem token válido,
    // após 4 s sem evento consideramos inválido.
    const timeout = setTimeout(() => {
      setState(s => s === 'waiting' ? 'invalid' : s);
    }, 4000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error('A palavra-passe deve ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      toast.error('As palavras-passe não coincidem.');
      return;
    }
    setState('saving');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error('Não foi possível atualizar a palavra-passe. O link pode ter expirado.');
      setState('ready');
      return;
    }
    setState('done');
    await supabase.auth.signOut();
  };

  const logo = (
    <div className="flex flex-col items-center mb-8">
      <img src="/icone_oficial.png" alt="ENCIVIL" className="w-20 h-20 object-contain mb-4" draggable={false} />
      <h1 className="text-2xl font-semibold text-foreground mb-1">ENCIVIL Gestão</h1>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary via-primary/90 to-primary/80 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-2xl shadow-2xl p-8">

          {/* A aguardar token */}
          {state === 'waiting' && (
            <div className="text-center py-4">
              {logo}
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mt-2" />
              <p className="text-sm text-muted-foreground mt-4">A validar o link…</p>
            </div>
          )}

          {/* Link inválido ou expirado */}
          {state === 'invalid' && (
            <div className="text-center py-4">
              {logo}
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 mx-auto mb-5">
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
              <h2 className="text-lg font-semibold mb-2">Link inválido ou expirado</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-[32ch] mx-auto">
                O link de redefinição expirou ou já foi utilizado. Peça um novo link na página de login.
              </p>
              <button
                onClick={() => navigate('/login')}
                className="w-full py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
              >
                Ir para o Login
              </button>
            </div>
          )}

          {/* Formulário de nova password */}
          {(state === 'ready' || state === 'saving') && (
            <>
              {logo}
              <p className="text-sm text-muted-foreground text-center mb-6">
                Escolha uma nova palavra-passe para a sua conta.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Nova palavra-passe</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      id="new-password"
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className={inputCls}
                      placeholder="Mínimo 8 caracteres"
                      required
                      minLength={8}
                      autoFocus
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Confirmar palavra-passe</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      id="confirm-password"
                      type={showConf ? 'text' : 'password'}
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      className={inputCls}
                      placeholder="Repita a palavra-passe"
                      required
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConf(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showConf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {confirm.length > 0 && password !== confirm && (
                    <p className="text-xs text-destructive mt-1.5">As palavras-passe não coincidem.</p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={state === 'saving' || password !== confirm || password.length < 8}
                  className="w-full py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 font-medium mt-2"
                >
                  {state === 'saving' ? 'A guardar…' : 'Guardar nova palavra-passe'}
                </button>
              </form>
            </>
          )}

          {/* Sucesso */}
          {state === 'done' && (
            <div className="text-center py-4">
              {logo}
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-success/10 mx-auto mb-5">
                <CheckCircle2 className="w-8 h-8 text-success" />
              </div>
              <h2 className="text-lg font-semibold mb-2">Palavra-passe atualizada</h2>
              <p className="text-sm text-muted-foreground mb-6">
                A sua palavra-passe foi alterada com sucesso. Faça login com as novas credenciais.
              </p>
              <button
                onClick={() => navigate('/login')}
                className="w-full py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
              >
                Ir para o Login
              </button>
            </div>
          )}

        </div>
        <div className="text-center mt-6 text-white/70 text-sm">
          <p>© 2026 ENCIVIL - Todos os direitos reservados</p>
        </div>
      </div>
    </div>
  );
}
