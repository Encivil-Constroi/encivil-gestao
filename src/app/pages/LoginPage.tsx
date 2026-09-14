import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Lock, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/AuthContext';

type Mode = 'login' | 'request-reset' | 'reset-sent';

const inputCls = 'w-full pl-10 pr-4 py-3 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary';

export function LoginPage() {
  const navigate = useNavigate();
  const { signIn, session } = useAuth();
  const [mode, setMode]         = useState<Mode>('login');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [isLoading, setIsLoading]   = useState(false);

  if (session) {
    navigate('/', { replace: true });
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const { error } = await signIn(email, password);
    if (error) {
      toast.error('Credenciais inválidas. Verifique o e-mail e a palavra-passe.');
      setIsLoading(false);
      return;
    }
    navigate('/');
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setIsLoading(false);
    if (error) {
      toast.error('Não foi possível enviar o email. Verifique o endereço e tente novamente.');
      return;
    }
    setMode('reset-sent');
  };

  const logo = (
    <div className="flex flex-col items-center mb-8">
      <img src="/icone_oficial.png" alt="ENCIVIL" className="w-24 h-24 object-contain mb-5" draggable={false} />
      <h1 className="text-2xl font-semibold text-foreground mb-1">ENCIVIL Gestão</h1>
      <p className="text-sm text-muted-foreground text-center">Sistema interno de gestão da empresa</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary via-primary/90 to-primary/80 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-2xl shadow-2xl p-8">

          {/* ── Formulário de login ── */}
          {mode === 'login' && (
            <>
              {logo}
              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className={inputCls}
                      placeholder="seu.email@encivil.pt"
                      required
                      autoComplete="email"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Palavra-passe</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      id="login-password"
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className={inputCls}
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {isLoading ? 'A entrar…' : 'Entrar'}
                </button>
              </form>
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => { setResetEmail(email); setMode('request-reset'); }}
                  className="text-sm text-primary hover:underline"
                >
                  Esqueceu a palavra-passe?
                </button>
              </div>
            </>
          )}

          {/* ── Pedir reset ── */}
          {mode === 'request-reset' && (
            <>
              {logo}
              <form onSubmit={handleRequestReset} className="space-y-5">
                <div>
                  <p className="text-sm text-muted-foreground mb-4 text-center">
                    Indique o seu email e enviaremos um link para redefinir a palavra-passe.
                  </p>
                  <label className="block text-sm font-medium text-foreground mb-2">Email da conta</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      id="reset-email"
                      type="email"
                      value={resetEmail}
                      onChange={e => setResetEmail(e.target.value)}
                      className={inputCls}
                      placeholder="seu.email@encivil.pt"
                      required
                      autoFocus
                      autoComplete="email"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 font-medium"
                >
                  {isLoading ? 'A enviar…' : 'Enviar link de redefinição'}
                </button>
              </form>
              <div className="mt-5 text-center">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 mx-auto transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao login
                </button>
              </div>
            </>
          )}

          {/* ── Confirmação de envio ── */}
          {mode === 'reset-sent' && (
            <div className="text-center py-4">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-success/10 mx-auto mb-5">
                <CheckCircle2 className="w-8 h-8 text-success" />
              </div>
              <h2 className="text-lg font-semibold mb-2">Email enviado</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-[30ch] mx-auto">
                Verifique a caixa de entrada de <strong>{resetEmail}</strong> e clique no link para redefinir a palavra-passe.
              </p>
              <p className="text-xs text-muted-foreground mb-6">
                Não recebeu? Verifique o spam ou{' '}
                <button
                  type="button"
                  onClick={() => setMode('request-reset')}
                  className="text-primary hover:underline"
                >
                  tente novamente
                </button>.
              </p>
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 mx-auto transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao login
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
