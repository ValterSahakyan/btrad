import type { Metadata } from 'next';
import './globals.css';

// Root layout is intentionally minimal and static: no headers()/cookies() and
// no app chrome. Anything request-dependent forces every route — including the
// built-in /404, /500 and /_error pages — to fail static generation, which this
// platform's build surfaces as "<Html> should not be imported outside of
// pages/_document". The dashboard chrome lives in app/(app)/layout.tsx; the
// login page renders bare through this root layout.
//
// Fonts come from a system stack defined in globals.css (:root --font-inter /
// --font-mono). next/font/google was removed because it fetches font files from
// fonts.googleapis.com at build time, which fails in restricted build sandboxes.

export const metadata: Metadata = {
  title: 'Bee Trading ',
  description: 'Algorithmic Binance USD-M Futures trading console',
  icons: { icon: '/icon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
