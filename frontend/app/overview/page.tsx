import { DataTable } from '@/components/dashboard/data-table';
import { MetricCard } from '@/components/dashboard/metric-card';
import { PnlChart } from '@/components/dashboard/pnl-chart';
import { Badge } from '@/components/ui/badge';
import { fetchApi } from '@/services/api';
import { currency, number } from '@/lib/utils';

export default async function OverviewPage() {
  const [status, performance, daily, signals, trades, logs] = await Promise.all([
    fetchApi<any>('/status'),
    fetchApi<any>('/performance'),
    fetchApi<any[]>('/performance/daily'),
    fetchApi<any[]>('/signals'),
    fetchApi<any[]>('/trades'),
    fetchApi<any[]>('/logs'),
  ]);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Bot Status" value={status.botStatus} hint={`Mode: ${status.mode}`} />
        <MetricCard label="Real Trading" value={status.realTradingEnabled ? 'Enabled' : 'Disabled'} hint="Requires env gate + live mode" />
        <MetricCard label="Total PnL" value={currency(performance.totalPnl)} hint={`Win rate ${number(performance.winRate)}%`} />
        <MetricCard label="Open Trades" value={String(status.openTrades)} hint={`Active signals ${status.activeSignals}`} />
      </section>
      <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <PnlChart data={daily.map((item) => ({ ...item, createdAt: new Date(item.createdAt).toLocaleDateString(), pnl: item.pnl ?? 0 }))} />
        <div className="grid gap-4">
          <MetricCard label="Profit Factor" value={number(performance.profitFactor)} />
          <MetricCard label="Average Win" value={currency(performance.averageWin)} />
          <MetricCard label="Average Loss" value={currency(performance.averageLoss)} />
          <div className="rounded-2xl border border-white/10 bg-panel/80 p-5">
            <div className="mb-3 text-xs uppercase tracking-[0.18em] text-muted">Safety</div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="warning">Paper First</Badge>
              <Badge tone="danger">No Auto Live</Badge>
              <Badge tone="positive">Dashboard Approval</Badge>
            </div>
          </div>
        </div>
      </section>
      <section className="grid gap-6 xl:grid-cols-3">
        <DataTable
          title="Recent Signals"
          headers={['Symbol', 'Direction', 'Score', 'Status']}
          rows={signals.slice(0, 10).map((signal) => [signal.symbol.symbol, signal.direction, number(signal.confidenceScore), signal.status])}
        />
        <DataTable
          title="Recent Trades"
          headers={['Symbol', 'Direction', 'PnL', 'Status']}
          rows={trades.slice(0, 10).map((trade) => [trade.symbol, trade.direction, currency(trade.pnl), trade.status])}
        />
        <DataTable
          title="Recent Logs"
          headers={['Level', 'Source', 'Message']}
          rows={logs.slice(0, 10).map((log) => [log.level, log.source, log.message])}
        />
      </section>
    </div>
  );
}
