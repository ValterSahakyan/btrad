import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/header';
import { TradeVoiceNotifier } from '@/components/layout/trade-voice-notifier';

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
