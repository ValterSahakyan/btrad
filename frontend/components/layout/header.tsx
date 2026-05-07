import { Badge } from '../ui/badge';
import { fetchApiSafe } from '@/services/api';

type Status = {
  mode: string;
  realTradingEnabled: boolean;
  requireDashboardConfirmation: boolean;
  botStatus: string;
  activeSignals: number;
  openTrades: number;
};

export async function Header() {
  const status = await fetchApiSafe<Status | null>('/status', null);

  const mode = status?.mode ?? 'testnet';
  const liveEnabled = status?.realTradingEnabled ?? false;
  const autoApprove = status?.requireDashboardConfirmation === false;
  const paused = status?.botStatus === 'paused';

  return (
    <header className="mb-6 flex flex-col gap-3 rounded-[28px] border border-white/10 bg-white/5 p-5 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div className="text-xs uppercase tracking-[0.24em] text-muted">Futures trading console</div>
        <h1 className="text-3xl font-semibold">PerpScout AI</h1>
        {status && (
          <div className="mt-1 flex gap-4 text-xs text-muted">
            <span>{status.activeSignals} active signals</span>
            <span>{status.openTrades} open trades</span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {paused && <Badge tone="danger">Bot Paused</Badge>}
        <Badge tone={mode === 'live' ? 'positive' : 'warning'}>
          {mode === 'live' ? 'Live Mode' : 'Testnet Mode'}
        </Badge>
        <Badge tone={liveEnabled ? 'positive' : 'danger'}>
          {liveEnabled ? 'Live Trading On' : 'Live Disabled'}
        </Badge>
        <Badge tone={autoApprove ? 'warning' : 'positive'}>
          {autoApprove ? 'Auto-Execute' : 'Manual Approval'}
        </Badge>
        {!status && <Badge tone="danger">Backend Offline</Badge>}
      </div>
    </header>
  );
}
