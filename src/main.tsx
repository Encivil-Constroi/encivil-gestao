import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import App from "./app/App.tsx";
import { ErrorBoundary } from "./app/components/ErrorBoundary.tsx";
import { PWAInstallHint } from "./app/components/PWAInstallHint.tsx";
import { UpdatePrompt } from "./app/components/UpdatePrompt.tsx";
import { initSentry } from "./app/lib/sentry.ts";
import "./styles/index.css";

initSentry();

// O registo do Service Worker e a verificação periódica de novas versões são
// tratados pelo <UpdatePrompt /> (virtual:pwa-register/react), que mostra o
// aviso "Nova versão disponível — Atualizar" quando há um deploy novo.

// After a new deploy, Vite lazy-chunks get new hashes and old URLs 404.
// We clear SW caches before reloading so the SW doesn't serve stale chunks again.
// sessionStorage guard prevents an infinite reload loop if the file genuinely doesn't exist.
window.addEventListener('vite:preloadError', async () => {
  const GUARD_KEY = 'chunk_reload_ts';
  const lastReload = Number(sessionStorage.getItem(GUARD_KEY) ?? '0');
  if (Date.now() - lastReload < 15_000) return; // already reloaded within 15s — stop looping
  sessionStorage.setItem(GUARD_KEY, String(Date.now()));

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  } catch { /* best effort */ }

  window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
    <Toaster richColors position="top-right" />
    <PWAInstallHint />
    <UpdatePrompt />
  </ErrorBoundary>
);
