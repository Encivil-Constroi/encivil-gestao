import { useState, useEffect } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useOfflineQueue } from '@/features/movimentos/hooks/useOfflineQueue';
import { usePicagensOfflineQueue } from '@/features/picagens/hooks/usePicagensOfflineQueue';

export function OfflineSyncBanner() {
  const mov  = useOfflineQueue();
  const pic  = usePicagensOfflineQueue();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline  = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const totalPending = mov.pendingCount + pic.pendingCount;
  const syncing      = mov.syncing || pic.syncing;

  if (totalPending === 0 && isOnline) return null;

  // Sem ligação mas sem pendentes: indicador discreto
  if (totalPending === 0) {
    return (
      <div className="bg-muted/60 border-b border-border px-4 py-1.5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Sem ligação — os registos serão guardados localmente.</span>
      </div>
    );
  }

  const label = () => {
    const parts: string[] = [];
    if (mov.pendingCount > 0)
      parts.push(`${mov.pendingCount} movimento${mov.pendingCount !== 1 ? 's' : ''}`)
    if (pic.pendingCount > 0)
      parts.push(`${pic.pendingCount} picagem${pic.pendingCount !== 1 ? 's' : ''}`)
    return parts.join(' e ')
  }

  return (
    <div className="bg-warning/10 border-b border-warning/30 px-4 py-2.5 flex items-center justify-center gap-2.5 text-xs sm:text-sm">
      {syncing ? (
        <RefreshCw className="w-4 h-4 text-warning animate-spin shrink-0" />
      ) : (
        <WifiOff className="w-4 h-4 text-warning shrink-0" />
      )}
      <span className="text-foreground">
        {syncing
          ? 'A sincronizar registos pendentes…'
          : `${label()} guardado${totalPending !== 1 ? 's' : ''} sem ligação — será${totalPending !== 1 ? 'ão' : ''} enviado${totalPending !== 1 ? 's' : ''} automaticamente.`}
      </span>
      {!syncing && (
        <button
          onClick={() => { void mov.flushNow(); void pic.flushNow() }}
          className="text-warning font-semibold hover:underline shrink-0"
        >
          Tentar agora
        </button>
      )}
    </div>
  );
}
