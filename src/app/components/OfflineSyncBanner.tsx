import { WifiOff, RefreshCw } from 'lucide-react';
import { useOfflineQueue } from '@/features/movimentos/hooks/useOfflineQueue';
import { usePicagensOfflineQueue } from '@/features/picagens/hooks/usePicagensOfflineQueue';

export function OfflineSyncBanner() {
  const mov  = useOfflineQueue();
  const pic  = usePicagensOfflineQueue();

  const totalPending = mov.pendingCount + pic.pendingCount;
  const syncing      = mov.syncing || pic.syncing;

  if (totalPending === 0) return null;

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
