import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/header';
import { TradeVoiceNotifier } from '@/components/layout/trade-voice-notifier';

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'BEE trad',
  description: 'Algorithmic Binance USD-M Futures trading console',
  icons: { icon: '/icon.svg' },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get('x-pathname') ?? '';
  const isPublic = pathname === '/login';

  if (isPublic) {
    return (
      <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
        <body suppressHydrationWarning>{children}</body>
      </html>
    );
  }

  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
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
