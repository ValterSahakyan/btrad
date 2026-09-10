import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/header';
import { TradeVoiceNotifier } from '@/components/layout/trade-voice-notifier';

// Fonts come from a system stack defined in globals.css (:root --font-inter /
// --font-mono). next/font/google was removed because it fetches font files from
// fonts.googleapis.com at BUILD time — that network call fails in restricted
// build sandboxes and surfaces as "Export encountered an error on /_error: /404".

export const metadata: Metadata = {
  title: 'Bee Trading ',
  description: 'Algorithmic Binance USD-M Futures trading console',
  icons: { icon: '/icon.svg' },
};

// This layout already reads request headers (below), so nothing under it can be
// statically prerendered anyway. Make it explicit so the build never attempts a
// static export of /404 or /_error through this tree — that export is what fails
// on hosted builders ("Export encountered an error on /_error: /404").
export const dynamic = 'force-dynamic';

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
