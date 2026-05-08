import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/header';
import { TradeVoiceNotifier } from '@/components/layout/trade-voice-notifier';

export const metadata: Metadata = {
  title: 'BTRAD — Futures Terminal',
  description: 'Algorithmic Binance USDⓈ-M Futures trading console',
  icons: { icon: '/icon.svg' },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get('x-pathname') ?? '';
  const isPublic = pathname === '/login';

  if (isPublic) {
    return (
      <html lang="en">
        <body suppressHydrationWarning>{children}</body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <div className="app-shell">
          <Sidebar />
          <div className="app-main-wrap">
            <Topbar />
            <TradeVoiceNotifier />
            <main className="app-content">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
