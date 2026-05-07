import { DataTable } from '@/components/dashboard/data-table';
import { MetricCard } from '@/components/dashboard/metric-card';
import { fetchApi } from '@/services/api';
import { currency, number } from '@/lib/utils';

export default async function PerformancePage() {
  const [performance, strategyPerformance, symbolPerformance] = await Promise.all([
    fetchApi<any>('/performance'),
    fetchApi<Record<string, { count: number; pnl: number }>>('/performance/strategies'),
    fetchApi<Record<string, { count: number; pnl: number }>>('/performance/symbols'),
  ]);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Trades" value={String(performance.totalTrades)} />
        <MetricCard label="Win Rate" value={`${number(performance.winRate)}%`} />
        <MetricCard label="Average Win" value={currency(performance.averageWin)} />
        <MetricCard label="Average Loss" value={currency(performance.averageLoss)} />
      </section>
      <section className="grid gap-6 xl:grid-cols-2">
        <DataTable
          title="Strategy Performance"
          headers={['Strategy', 'Trades', 'PnL']}
          rows={Object.entries(strategyPerformance).map(([strategy, value]) => [strategy, value.count, currency(value.pnl)])}
        />
        <DataTable
          title="Symbol Performance"
          headers={['Symbol', 'Trades', 'PnL']}
          rows={Object.entries(symbolPerformance).map(([symbol, value]) => [symbol, value.count, currency(value.pnl)])}
        />
      </section>
    </div>
  );
}
