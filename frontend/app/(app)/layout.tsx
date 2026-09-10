import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/header';
import { TradeVoiceNotifier } from '@/components/layout/trade-voice-notifier';

// Force dynamic rendering for all routes in this group. This prevents Next.js
// from trying to statically prerender the 404 page with this layout, which
// would fail because the layout contains client components that depend on
// request context (usePathname, cookies, etc).
export const dynamic = 'force-dynamic';

// Chrome for every authenticated dashboard route. Kept out of the root layout so
// the root stays static (see app/layout.tsx). No headers()/cookies() here — the
// login page lives outside this group and renders bare.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main-wrap">
        <Topbar />
        <TradeVoiceNotifier />
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}

