import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { TradeVoiceNotifier } from '@/components/layout/trade-voice-notifier';

export const metadata: Metadata = {
  title: 'PerpScout AI — Futures Console',
  description: 'Algorithmic futures trading dashboard',
  icons: {
    icon: '/icon.svg',
  },
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
      <body suppressHydrationWarning className="app-body">
        <div className="app-shell mx-auto flex min-h-screen max-w-[1600px] flex-col gap-6 p-5 lg:flex-row">
          <Sidebar />
          <main className="app-main flex-1">
            <Header />
            <TradeVoiceNotifier />
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
