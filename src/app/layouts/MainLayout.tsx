import { useState } from 'react';
import { Outlet, useLocation, ScrollRestoration } from 'react-router';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { MobileBottomNav } from '../components/MobileBottomNav';
import { OfflineSyncBanner } from '../components/OfflineSyncBanner';

export function MainLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Header onMenuOpen={() => setMobileMenuOpen(true)} />
        <OfflineSyncBanner />

        <main className="flex-1 p-4 md:p-6 overflow-auto pb-20 md:pb-6">
          {/* key forces remount on route change → triggers enc-page entrance animation */}
          <div key={location.pathname} className="enc-page">
            <Outlet />
          </div>
        </main>
        <ScrollRestoration />
      </div>

      <MobileBottomNav />
    </div>
  );
}
