import { DataTable } from '@/components/dashboard/data-table';
import { MetricCard } from '@/components/dashboard/metric-card';
import { fetchApiSafe } from '@/services/api';
import { currency, number } from '@/lib/utils';

const defaultPerformance = { totalTrades: 0, winRate: 0, averageWin: 0, averageLoss: 0, profitFactor: 0 };

function pnlCell(pnl: number) {
  return (
    <span className={pnl > 0 ? 'font-semibold text-positive' : pnl < 0 ? 'font-semibold text-danger' : 'text-muted'}>
      {currency(pnl)}
    </span>
  );
}

export default async function PerformancePage() {
  const [performance, strategyPerformance, symbolPerformance] = await Promise.all([
    fetchApiSafe<any>('/performance', defaultPerformance),
    fetchApiSafe<Record<string, { count: number; pnl: number }>>('/performance/strategies', {}),
    fetchApiSafe<Record<string, { count: number; pnl: number }>>('/performance/symbols', {}),
  ]);

  const winRate = performance.winRate ?? 0;
  const profitFactor = performance.profitFactor ?? 0;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Trades" value={String(performance.totalTrades)} />
        <MetricCard
          label="Win Rate"
          value={`${number(winRate)}%`}
          tone={winRate >= 50 ? 'positive' : winRate >= 40 ? 'warning' : 'danger'}
        />
        <MetricCard label="Average Win" value={currency(performance.averageWin)} tone="positive" />
        <MetricCard label="Average Loss" value={currency(performance.averageLoss)} tone="danger" />
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <MetricCard
          label="Profit Factor"
          value={number(profitFactor)}
          hint="Win $ / Loss $ — above 1.0 is profitable"
          tone={profitFactor >= 1.5 ? 'positive' : profitFactor >= 1.0 ? 'warning' : 'danger'}
        />
        <MetricCard
          label="Total PnL"
          value={currency(performance.totalPnl ?? 0)}
          tone={(performance.totalPnl ?? 0) >= 0 ? 'positive' : 'danger'}
        />
      </section>
      <section className="grid gap-6 xl:grid-cols-2">
        <DataTable
          title="Strategy Performance"
          headers={['Strategy', 'Trades', 'Win Rate', 'PnL']}
          rows={Object.entries(strategyPerformance).map(([strategy, value]: [string, any]) => [
            <span key="s" className="font-medium">{strategy}</span>,
            value.count,
            value.winRate != null ? (
              <span className={(value.winRate ?? 0) >= 50 ? 'text-positive' : 'text-danger'}>
                {number(value.winRate)}%
              </span>
            ) : '—',
            pnlCell(value.pnl),
          ])}
        />
        <DataTable
          title="Symbol Performance"
          headers={['Symbol', 'Trades', 'Win Rate', 'PnL']}
          rows={Object.entries(symbolPerformance).map(([symbol, value]: [string, any]) => [
            <span key="s" className="font-medium">{symbol}</span>,
            value.count,
            value.winRate != null ? (
              <span className={(value.winRate ?? 0) >= 50 ? 'text-positive' : 'text-danger'}>
                {number(value.winRate)}%
              </span>
            ) : '—',
            pnlCell(value.pnl),
          ])}
        />
      </section>
    </div>
  );
}
