import { DataTable } from '@/components/dashboard/data-table';
import { MetricCard } from '@/components/dashboard/metric-card';
import { PnlChart } from '@/components/dashboard/pnl-chart';
import { Badge } from '@/components/ui/badge';
import { currency, number } from '@/lib/utils';
import { fetchApiSafe } from '@/services/api';

const defaultStatus = {
  botStatus: 'offline', mode: 'testnet', realTradingEnabled: false,
  paperTradingEnabled: true, requireDashboardConfirmation: true,
  executionMode: 'signal_only', openTrades: 0, openPaperTrades: 0, activeSignals: 0,
};
const defaultPerf = { totalPnl: 0, winRate: 0, profitFactor: 0, averageWin: 0, averageLoss: 0, totalTrades: 0 };

function dir(d: string) {
  return <span className={`font-mono font-semibold text-[11px] ${d === 'LONG' ? 'text-positive' : 'text-danger'}`}>{d}</span>;
}
function pnl(v: number | null | undefined) {
  const n = v ?? 0;
  return <span className={`font-mono text-[12px] font-medium ${n > 0 ? 'text-positive' : n < 0 ? 'text-danger' : 'text-dim'}`}>{currency(n)}</span>;
}
function sigStatus(s: string) {
  if (s === 'active') return <Badge tone="positive">active</Badge>;
  if (s === 'pending') return <Badge tone="warning">pending</Badge>;
  if (s === 'paper_opened') return <Badge tone="warning">paper</Badge>;
  if (s === 'live_executed') return <Badge tone="positive">live</Badge>;
  if (s === 'expired' || s === 'skipped') return <Badge tone="neutral">{s}</Badge>;
  return <Badge tone="neutral">{s}</Badge>;
}
function tradeStatus(s: string) {
  if (s === 'live_open') return <Badge tone="positive">live</Badge>;
  if (s === 'paper_open') return <Badge tone="warning">paper</Badge>;
  if (s === 'take_profit') return <Badge tone="positive">TP</Badge>;
  if (s === 'stopped') return <Badge tone="danger">SL</Badge>;
  if (s === 'manually_closed') return <Badge tone="neutral">closed</Badge>;
  return <Badge tone="neutral">{s}</Badge>;
}
function logLevel(l: string) {
  if (l === 'error') return <span className="font-mono text-[10px] font-semibold text-danger uppercase">{l}</span>;
  if (l === 'warn')  return <span className="font-mono text-[10px] font-semibold text-warning uppercase">{l}</span>;
  if (l === 'info')  return <span className="font-mono text-[10px] text-accent uppercase">{l}</span>;
  return <span className="font-mono text-[10px] text-dim uppercase">{l}</span>;
}

function execMode(m: string) {
  if (m === 'live_auto')   return 'Live Auto';
  if (m === 'live_manual') return 'Live Manual';
  if (m === 'paper_manual') return 'Paper Manual';
  return 'Signal Only';
}

export default async function OverviewPage() {
  const [status, perf, daily, signals, trades, logs, balance] = await Promise.all([
    fetchApiSafe<any>('/status', defaultStatus),
    fetchApiSafe<any>('/performance', defaultPerf),
    fetchApiSafe<any[]>('/performance/daily', []),
    fetchApiSafe<any[]>('/signals', []),
    fetchApiSafe<any[]>('/trades', []),
    fetchApiSafe<any[]>('/logs', []),
    fetchApiSafe<any>('/balance', { futures: null }),
  ]);

  const totalPnl = perf.totalPnl ?? 0;
  const isRunning = status.botStatus === 'running';

  return (
    <div className="space-y-4">
      {/* Status banner — only when paused */}
      {status.botStatus === 'paused' && (
        <div className="flex items-center gap-2 rounded border border-danger/20 bg-danger/5 px-4 py-2.5 text-[12px] text-danger">
          <span className="font-mono">!</span>
          Bot is paused — no new signals or trades. Go to Settings to resume.
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetricCard
          label="Bot Status"
          value={isRunning ? 'Running' : status.botStatus}
          hint={`${status.mode} · ${execMode(status.executionMode)}`}
          tone={isRunning ? 'positive' : 'danger'}
          mono={false}
        />
        <MetricCard
          label="Total PnL"
          value={currency(totalPnl)}
          hint={`${number(perf.winRate)}% win · ${perf.totalTrades} trades`}
          tone={totalPnl > 0 ? 'positive' : totalPnl < 0 ? 'danger' : 'neutral'}
        />
        <MetricCard
          label="Win Rate"
          value={`${number(perf.winRate)}%`}
          tone={(perf.winRate ?? 0) >= 50 ? 'positive' : 'danger'}
        />
        <MetricCard
          label="Profit Factor"
          value={number(perf.profitFactor)}
          hint="Win $ ÷ Loss $"
          tone={(perf.profitFactor ?? 0) >= 1 ? 'positive' : 'danger'}
        />
        <MetricCard
          label="Live Open"
          value={String(status.openTrades)}
          hint={`${status.openPaperTrades} paper · ${status.activeSignals} signals`}
        />
        <MetricCard
          label="Futures Balance"
          value={balance.futures !== null ? currency(balance.futures) : '—'}
          hint={balance.error ?? `${status.mode} wallet`}
          tone={balance.futures !== null && balance.futures > 0 ? 'neutral' : balance.error ? 'danger' : 'neutral'}
        />
      </div>

      {/* Chart + stat column */}
      <div className="grid gap-3 xl:grid-cols-[1fr_200px]">
        <PnlChart data={daily.map((d) => ({ ...d, createdAt: new Date(d.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), pnl: d.pnl ?? 0 }))} />
        <div className="grid grid-cols-2 xl:grid-cols-1 gap-3">
          <MetricCard label="Avg Win" value={currency(perf.averageWin)} tone="positive" />
          <MetricCard label="Avg Loss" value={currency(perf.averageLoss)} tone="danger" />
          <MetricCard label="Signals" value={String(status.activeSignals)} hint="active" />
          <MetricCard label="Open" value={String(status.openTrades)} hint="live trades" />
        </div>
      </div>

      {/* Recent data */}
      <div className="grid gap-3 xl:grid-cols-3">
        <DataTable
          title="Recent Signals"
          headers={['Symbol', 'Dir', 'Score', 'Status']}
          rows={signals.slice(0, 8).map((s) => [
            <span key="sym" className="font-mono text-[12px] font-medium">{s.symbol?.symbol ?? s.symbol}</span>,
            dir(s.direction),
            <span key="sc" className={`font-mono text-[12px] ${Number(s.confidenceScore) >= 75 ? 'text-positive' : 'text-white'}`}>{number(s.confidenceScore)}</span>,
            sigStatus(s.status),
          ])}
        />
        <DataTable
          title="Recent Trades"
          headers={['Symbol', 'Dir', 'PnL', 'Status']}
          rows={trades.slice(0, 8).map((t) => [
            <span key="sym" className="font-mono text-[12px] font-medium">{t.symbol}</span>,
            dir(t.direction),
            pnl(t.pnl),
            tradeStatus(t.status),
          ])}
        />
        <DataTable
          title="Recent Logs"
          headers={['Lvl', 'Source', 'Message']}
          rows={logs.slice(0, 8).map((l) => [
            logLevel(l.level),
            <span key="src" className="text-dim text-[11px]">{l.source}</span>,
            <span key="msg" className="text-[11px] text-white/80 max-w-[200px] truncate block">{l.message}</span>,
          ])}
        />
      </div>
    </div>
  );
}
