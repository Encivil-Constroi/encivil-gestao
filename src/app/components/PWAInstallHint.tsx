import { useState, useEffect } from 'react';
import { Share, X, Plus } from 'lucide-react';

export function PWAInstallHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true);
    const dismissed = localStorage.getItem('pwa-hint-dismissed');

    if (isIOS && !isStandalone && !dismissed) {
      // Mostra após 3 segundos para não ser intrusivo
      const t = setTimeout(() => setVisible(true), 3000);
      return () => clearTimeout(t);
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem('pwa-hint-dismissed', '1');
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 md:hidden">
      <div className="bg-card border border-border rounded-2xl shadow-2xl p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="bg-primary p-1.5 rounded-lg">
              <Share className="w-4 h-4 text-primary-foreground" />
            </div>
            <p className="font-semibold text-sm">Instalar no iPhone</p>
          </div>
          <button onClick={dismiss} className="p-1 hover:bg-accent rounded-lg transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <ol className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <span className="bg-primary text-primary-foreground text-xs w-5 h-5 rounded-full flex items-center justify-center shrink-0 font-bold">1</span>
            Toque em <Share className="w-4 h-4 text-primary inline mx-1" /> <strong className="text-foreground">Partilhar</strong> no Safari
          </li>
          <li className="flex items-center gap-2">
            <span className="bg-primary text-primary-foreground text-xs w-5 h-5 rounded-full flex items-center justify-center shrink-0 font-bold">2</span>
            Escolha <Plus className="w-4 h-4 text-primary inline mx-1" /> <strong className="text-foreground">Adicionar ao Ecrã Inicial</strong>
          </li>
          <li className="flex items-center gap-2">
            <span className="bg-primary text-primary-foreground text-xs w-5 h-5 rounded-full flex items-center justify-center shrink-0 font-bold">3</span>
            Confirme <strong className="text-foreground">Adicionar</strong>
          </li>
        </ol>

        <button onClick={dismiss} className="mt-3 w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
          Não mostrar novamente
        </button>
      </div>
    </div>
  );
}
