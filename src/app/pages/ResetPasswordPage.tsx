import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Lock, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { parseSupabaseError } from '@/app/lib/parseSupabaseError';
import { loginDeEmail } from '@/features/auth/lib/contaInterna';
import { DICA_SENHA, SENHA_MIN, mensagemSenha, validarSenha } from '@/features/auth/lib/politicaSenha';
import { MfaDesafio } from '@/features/auth/components/MfaDesafio';
import {
  analisarEntradaUrl, entradaCapturada, limparMarcadorRecuperacao, temMarcadorRecuperacao,
  type EntradaRecuperacao,
} from '@/integrations/supabase/entradaUrl';

type State = 'confirmar' | 'validando' | 'ready' | 'saving' | 'mfa' | 'expirado' | 'erroRede';

const PRAZO_VALIDACAO_MS = 8000;

// A captura corre antes do cliente (que limpa o hash); o URL atual só serve de reserva
// (token_hash fica no URL até ser usado).
function entradaInicial(): EntradaRecuperacao | null {
  return entradaCapturada() ?? analisarEntradaUrl(window.location.search, window.location.hash);
}

// Erro de rede/servidor: o token ainda pode servir, por isso não se descarta.
function erroTransitorio(error: { status?: number; name?: string }): boolean {
  return error.status === undefined || error.status >= 500 || error.name === 'AuthRetryableFetchError';
}

function limparTokenDoUrl() {
  window.history.replaceState(window.history.state, '', window.location.pathname);
}

function exigeMfa(error: { code?: string; message?: string }): boolean {
  return error.code === 'insufficient_aal' || (error.message ?? '').includes('AAL2');
}

// Chrome/Edge: oferece guardar no gestor de palavras-passe; outros navegadores usam o autocomplete do formulário
async function guardarCredencial(id: string, password: string): Promise<void> {
  const PC = (window as unknown as { PasswordCredential?: new (d: { id: string; password: string }) => Credential }).PasswordCredential
  if (!PC || !navigator.credentials?.store) return
  try { await navigator.credentials.store(new PC({ id, password })) } catch { /* utilizador recusou ou sem suporte */ }
}

const inputCls = 'w-full pl-10 pr-10 py-3 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-base';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [entrada]                   = useState(entradaInicial);
  const tokenHash = entrada?.tipo === 'token_hash' ? entrada.tokenHash : null;
  const [state, setState]           = useState<State>(() => {
    if (entrada?.tipo === 'token_hash') return 'confirmar';
    return entrada?.tipo === 'erro' ? 'expirado' : 'validando';
  });
  const [motivoErro, setMotivoErro] = useState<string | null>(entrada?.tipo === 'erro' ? entrada.codigo : null);
  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [showConf, setShowConf]     = useState(false);
  const [email, setEmail]           = useState('');

  // Três fontes de validação: sessão já criada (getSession), eventos do cliente e um prazo.
  // O cliente processa o #access_token antes de esta página montar, por isso o evento
  // PASSWORD_RECOVERY sozinho chega tarde.
  useEffect(() => {
    let ativo = true;
    const marcador = temMarcadorRecuperacao();
    const pronto = (mail: string | undefined) => {
      setEmail(mail ?? '');
      setState(s => (s === 'validando' || s === 'confirmar') ? 'ready' : s);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') pronto(session?.user.email);
      else if (marcador && session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) pronto(session.user.email);
    });

    if (marcador && state === 'validando') {
      void supabase.auth.getSession().then(({ data }) => {
        if (ativo && data.session) pronto(data.session.user.email);
      }).catch(() => { /* o prazo trata do resto */ });
    }

    const timeout = state === 'validando' ? setTimeout(() => {
      setState(s => s === 'validando' ? 'expirado' : s);
    }, PRAZO_VALIDACAO_MS) : undefined;

    return () => {
      ativo = false;
      subscription.unsubscribe();
      if (timeout) clearTimeout(timeout);
    };
    // Corre uma vez: o estado inicial decide que fontes ligar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Só depois do clique: a pré-visualização do WhatsApp/scanners abre o URL sem
  // clicar e não pode gastar o token de uso único.
  const continuar = async () => {
    if (!tokenHash) return;
    setState('validando');
    let resultado;
    try {
      resultado = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
    } catch {
      setState('erroRede');
      return;
    }
    const { data, error } = resultado;
    if (error && erroTransitorio(error)) {
      setState('erroRede');
      return;
    }
    limparTokenDoUrl();
    if (error || !data.session) {
      setMotivoErro(null);
      setState('expirado');
      return;
    }
    setEmail(data.session.user.email ?? '');
    setState('ready');
  };

  const concluir = async () => {
    await guardarCredencial(email, password);
    limparMarcadorRecuperacao();
    toast.success('Palavra-passe guardada. Bem-vindo de volta!');
    navigate('/', { replace: true });
  };

  const falhaAtualizar = (error: { code?: string }) => {
    toast.error(error.code === 'weak_password'
      ? parseSupabaseError(error)
      : 'Não foi possível atualizar a palavra-passe. O link pode ter expirado.');
    setState('ready');
  };

  // Contas com verificação em dois passos: a sessão de recuperação é aal1 e o
  // GoTrue só aceita mudar a senha em aal2. Repete-se uma vez após o código.
  const aposMfa = async () => {
    setState('saving');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      falhaAtualizar(error);
      return;
    }
    await concluir();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const erroPolitica = mensagemSenha(validarSenha(password));
    if (erroPolitica) {
      toast.error(erroPolitica);
      return;
    }
    if (password !== confirm) {
      toast.error('As palavras-passe não coincidem.');
      return;
    }
    setState('saving');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      if (exigeMfa(error)) {
        setState('mfa');
        return;
      }
      falhaAtualizar(error);
      return;
    }
    await concluir();
  };

  if (state === 'mfa') return <MfaDesafio onConcluido={() => { void aposMfa(); }} />;

  const logo = (
    <div className="flex flex-col items-center mb-8">
      <img src="/icone_oficial.png" alt="ENCIVIL" className="w-20 h-20 object-contain mb-4 grayscale mix-blend-multiply dark:invert dark:mix-blend-screen" draggable={false} />
      <h1 className="text-2xl font-semibold text-foreground mb-1">ENCIVIL Gestão</h1>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-card border border-border rounded-xl shadow-sm p-6 sm:p-8">

          {/* Link do administrador: confirma antes de usar o token */}
          {state === 'confirmar' && (
            <div className="text-center py-4">
              {logo}
              <h2 className="text-lg font-semibold mb-2">Criar nova palavra-passe</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-[32ch] mx-auto">
                Toque em Continuar para escolher a nova palavra-passe da sua conta.
              </p>
              <button
                type="button"
                onClick={() => { void continuar(); }}
                className="w-full py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
              >
                Continuar
              </button>
            </div>
          )}

          {/* A aguardar token */}
          {state === 'validando' && (
            <div className="text-center py-4">
              {logo}
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mt-2" />
              <p className="text-sm text-muted-foreground mt-4">A validar o link…</p>
            </div>
          )}

          {/* Falha de rede ao validar: o token continua no URL */}
          {state === 'erroRede' && (
            <div className="text-center py-4">
              {logo}
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-warning/10 mx-auto mb-5">
                <AlertTriangle className="w-8 h-8 text-warning" />
              </div>
              <h2 className="text-lg font-semibold mb-2">Sem ligação</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-[32ch] mx-auto">
                Não foi possível validar o link por falha de ligação. O link continua válido: tente de novo.
              </p>
              <button
                type="button"
                onClick={() => { void continuar(); }}
                className="w-full py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
              >
                Tentar de novo
              </button>
            </div>
          )}

          {/* Link inválido ou expirado */}
          {state === 'expirado' && (
            <div className="text-center py-4">
              {logo}
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 mx-auto mb-5">
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
              <h2 className="text-lg font-semibold mb-2">Link inválido</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-[32ch] mx-auto">
                {motivoErro === 'otp_expired' || motivoErro === 'access_denied'
                  ? 'O link já foi usado ou expirou. Alguns programas de email abrem o link antes de si e gastam-no. Peça um novo link.'
                  : 'O link expirou ou já foi usado. Peça um novo ao administrador ou use "Esqueceu a palavra-passe?" se tiver email.'}
              </p>
              <button
                type="button"
                onClick={() => navigate('/login', { state: { modo: 'pedir-reset' } })}
                className="w-full py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
              >
                Pedir novo link
              </button>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="w-full py-3 mt-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Voltar ao login
              </button>
            </div>
          )}

          {/* Formulário de nova password */}
          {(state === 'ready' || state === 'saving') && (
            <>
              {logo}
              {email && (
                <p className="text-sm font-medium text-foreground text-center mb-2">Conta: {loginDeEmail(email) ?? email}</p>
              )}
              <p className="text-sm text-muted-foreground text-center mb-6">
                Escolha uma nova palavra-passe para a sua conta.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <input type="text" name="username" autoComplete="username" value={email} readOnly className="sr-only" tabIndex={-1} aria-hidden="true" />
                <div>
                  <label htmlFor="new-password" className="block text-sm font-medium text-foreground mb-2">Nova palavra-passe</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      id="new-password"
                      name="new-password"
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className={inputCls}
                      placeholder={`Mínimo ${SENHA_MIN} caracteres`}
                      required
                      minLength={SENHA_MIN}
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
                  <p className="text-xs text-muted-foreground mt-1.5">{DICA_SENHA}</p>
                </div>
                <div>
                  <label htmlFor="confirm-password" className="block text-sm font-medium text-foreground mb-2">Confirmar palavra-passe</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      id="confirm-password"
                      name="confirm-password"
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
                  disabled={state === 'saving' || password !== confirm || validarSenha(password).length > 0}
                  className="w-full py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 font-medium mt-2"
                >
                  {state === 'saving' ? 'A guardar…' : 'Guardar nova palavra-passe'}
                </button>
              </form>
            </>
          )}

        </div>
        <div className="text-center mt-6 text-muted-foreground text-xs">
          <p>© 2026 ENCIVIL - Todos os direitos reservados</p>
        </div>
      </div>
    </div>
  );
}
