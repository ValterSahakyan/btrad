import { DataTable } from '@/components/dashboard/data-table';
import { MetricCard } from '@/components/dashboard/metric-card';
import { PnlChart } from '@/components/dashboard/pnl-chart';
import { Badge } from '@/components/ui/badge';
import { currency, number } from '@/lib/utils';
import { fetchApiSafe } from '@/services/api';

const defaultStatus = {
  botStatus: 'offline',
  mode: 'testnet',
  realTradingEnabled: false,
  paperTradingEnabled: true,
  requireDashboardConfirmation: true,
  executionMode: 'signal_only',
  openTrades: 0,
  openPaperTrades: 0,
  activeSignals: 0,
};
const defaultPerformance = { totalPnl: 0, winRate: 0, profitFactor: 0, averageWin: 0, averageLoss: 0, totalTrades: 0 };

function dirBadge(direction: string) {
  return (
    <span className={direction === 'LONG' ? 'font-semibold text-positive' : 'font-semibold text-danger'}>
      {direction}
    </span>
  );
}

function pnlCell(pnl: number | null | undefined) {
  const v = pnl ?? 0;
  return (
    <span className={v > 0 ? 'font-semibold text-positive' : v < 0 ? 'font-semibold text-danger' : 'text-muted'}>
      {currency(v)}
    </span>
  );
}

function signalStatusBadge(status: string) {
  if (status === 'active') return <Badge tone="positive">{status}</Badge>;
  if (status === 'pending') return <Badge tone="warning">{status}</Badge>;
  if (status === 'paper_opened') return <Badge tone="warning">paper open</Badge>;
  if (status === 'live_executed') return <Badge tone="positive">live open</Badge>;
  if (status === 'expired' || status === 'skipped') return <Badge tone="neutral">{status}</Badge>;
  return <Badge tone="neutral">{status}</Badge>;
}

function tradeStatusBadge(status: string) {
  if (status === 'live_open') return <Badge tone="positive">live open</Badge>;
  if (status === 'paper_open') return <Badge tone="warning">paper open</Badge>;
  if (status === 'take_profit') return <Badge tone="positive">TP hit</Badge>;
  if (status === 'stopped') return <Badge tone="danger">SL hit</Badge>;
  if (status === 'manually_closed') return <Badge tone="warning">closed</Badge>;
  return <Badge tone="neutral">{status}</Badge>;
}

function logLevelBadge(level: string) {
  if (level === 'error') return <span className="font-semibold text-danger uppercase">{level}</span>;
  if (level === 'warn') return <span className="font-semibold text-yellow-300 uppercase">{level}</span>;
  if (level === 'info') return <span className="text-accent uppercase">{level}</span>;
  return <span className="text-muted uppercase">{level}</span>;
}

function executionModeLabel(mode: string) {
  if (mode === 'live_auto') return 'Live Auto';
  if (mode === 'live_manual') return 'Live Manual';
  if (mode === 'paper_manual') return 'Paper Manual';
  return 'Signal Only';
}

function statusBanner(status: any) {
  if (status.botStatus === 'paused') return 'Bot is paused - no new trades will be opened.';
  if (status.executionMode === 'live_manual') return 'Live trading is enabled, but every order still requires manual dashboard approval.';
  if (status.executionMode === 'paper_manual') return 'Paper trading mode is active - signals can be simulated without placing Binance orders.';
  if (status.executionMode === 'live_auto') return null;
  return 'Signal-only mode is active - the bot scans and scores signals without opening trades.';
}

export default async function OverviewPage() {
  const [status, performance, daily, signals, trades, logs, balance] = await Promise.all([
    fetchApiSafe<any>('/status', defaultStatus),
    fetchApiSafe<any>('/performance', defaultPerformance),
    fetchApiSafe<any[]>('/performance/daily', []),
    fetchApiSafe<any[]>('/signals', []),
    fetchApiSafe<any[]>('/trades', []),
    fetchApiSafe<any[]>('/logs', []),
    fetchApiSafe<any>('/balance', { futures: null, funding: null }),
  ]);

  const isRunning = status.botStatus === 'running';
  const isPaused = status.botStatus === 'paused';
  const totalPnl = performance.totalPnl ?? 0;
  const banner = statusBanner(status);

  return (
    <div className="space-y-6">
      {banner && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger/30 bg-danger/10 px-5 py-3 text-sm text-danger">
          <span className="font-semibold">{banner}</span>
          <span className="text-danger/70">Go to Settings to change.</span>
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Bot Status"
          value={status.botStatus}
          hint={`Mode: ${status.mode}`}
          tone={isRunning ? 'positive' : isPaused ? 'danger' : 'warning'}
        />
        <MetricCard
          label="Execution Mode"
          value={executionModeLabel(status.executionMode)}
          hint={status.realTradingEnabled ? 'Binance orders allowed' : status.paperTradingEnabled ? 'Paper trading available' : 'Signals only'}
          tone={status.executionMode.startsWith('live') ? 'positive' : status.executionMode === 'paper_manual' ? 'warning' : 'neutral'}
        />
        <MetricCard
          label="Total PnL"
          value={currency(totalPnl)}
          hint={`Win rate ${number(performance.winRate)}%  |  ${performance.totalTrades} trades`}
          tone={totalPnl > 0 ? 'positive' : totalPnl < 0 ? 'danger' : 'neutral'}
        />
        <MetricCard
          label="Live Open Trades"
          value={String(status.openTrades)}
          hint={`${status.openPaperTrades} paper open  |  ${status.activeSignals} active signal${status.activeSignals !== 1 ? 's' : ''}`}
        />
        <MetricCard
          label="Futures Wallet"
          value={balance.futures !== null ? currency(balance.futures) : '-'}
          hint={balance.futures !== null ? `${balance.mode ?? status.mode} balance | total ${currency(balance.futuresTotal)}` : (balance.error ?? 'No API keys configured')}
          tone={balance.futures !== null && balance.futures > 0 ? 'neutral' : balance.error ? 'danger' : 'neutral'}
        />
        <MetricCard
          label="Available to Trade"
          value={balance.futures !== null ? currency(balance.futures) : '-'}
          hint="Unrealized PnL excluded | futures account only"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <PnlChart data={daily.map((item) => ({ ...item, createdAt: new Date(item.createdAt).toLocaleDateString(), pnl: item.pnl ?? 0 }))} />
        <div className="grid gap-4">
          <MetricCard
            label="Win Rate"
            value={`${number(performance.winRate)}%`}
            tone={(performance.winRate ?? 0) >= 50 ? 'positive' : 'danger'}
          />
          <MetricCard label="Average Win" value={currency(performance.averageWin)} tone="positive" />
          <MetricCard label="Average Loss" value={currency(performance.averageLoss)} tone="danger" />
          <MetricCard label="Profit Factor" value={number(performance.profitFactor)} tone={(performance.profitFactor ?? 0) >= 1 ? 'positive' : 'danger'} />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <DataTable
          title="Recent Signals"
          headers={['Symbol', 'Direction', 'Score', 'Status']}
          rows={signals.slice(0, 10).map((signal) => [
            signal.symbol?.symbol ?? signal.symbol,
            dirBadge(signal.direction),
            <span key="score" className={Number(signal.confidenceScore) >= 75 ? 'text-positive font-semibold' : ''}>{number(signal.confidenceScore)}</span>,
            signalStatusBadge(signal.status),
          ])}
        />
        <DataTable
          title="Recent Trades"
          headers={['Symbol', 'Dir', 'PnL', 'Status']}
          rows={trades.slice(0, 10).map((trade) => [
            trade.symbol,
            dirBadge(trade.direction),
            pnlCell(trade.pnl),
            tradeStatusBadge(trade.status),
          ])}
        />
        <DataTable
          title="Recent Logs"
          headers={['Level', 'Source', 'Message']}
          rows={logs.slice(0, 10).map((log) => [
            logLevelBadge(log.level),
            <span key="src" className="text-muted">{log.source}</span>,
            log.message,
          ])}
        />
      </section>
    </div>
  );
}
