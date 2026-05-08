import { MetricCard } from '@/components/dashboard/metric-card';
import { fetchApiSafe } from '@/services/api';
import { currency, number } from '@/lib/utils';

const defaultPerf = { totalTrades: 0, winRate: 0, averageWin: 0, averageLoss: 0, profitFactor: 0, totalPnl: 0 };

function pnl(v: number) {
  return <span className={`font-mono text-[12px] font-medium ${v > 0 ? 'text-positive' : v < 0 ? 'text-danger' : 'text-dim'}`}>{currency(v)}</span>;
}
function winRateCell(v: number | null | undefined) {
  const n = v ?? 0;
  return <span className={`font-mono text-[12px] ${n >= 50 ? 'text-positive' : 'text-danger'}`}>{number(n)}%</span>;
}

export default async function PerformancePage() {
  const [perf, byStrategy, bySymbol] = await Promise.all([
    fetchApiSafe<any>('/performance', defaultPerf),
    fetchApiSafe<Record<string, { count: number; pnl: number; winRate?: number }>>('/performance/strategies', {}),
    fetchApiSafe<Record<string, { count: number; pnl: number; winRate?: number }>>('/performance/symbols', {}),
  ]);

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetricCard label="Total Trades" value={String(perf.totalTrades)} mono={false} />
        <MetricCard label="Win Rate" value={`${number(perf.winRate)}%`} tone={(perf.winRate ?? 0) >= 50 ? 'positive' : 'danger'} />
        <MetricCard label="Profit Factor" value={number(perf.profitFactor)} hint="Win $ ÷ Loss $" tone={(perf.profitFactor ?? 0) >= 1.5 ? 'positive' : (perf.profitFactor ?? 0) >= 1 ? 'warning' : 'danger'} />
        <MetricCard label="Total PnL" value={currency(perf.totalPnl ?? 0)} tone={(perf.totalPnl ?? 0) >= 0 ? 'positive' : 'danger'} />
        <MetricCard label="Avg Win" value={currency(perf.averageWin)} tone="positive" />
        <MetricCard label="Avg Loss" value={currency(perf.averageLoss)} tone="danger" />
      </div>

      {/* Strategy + Symbol breakdown */}
      <div className="grid gap-3 xl:grid-cols-2">
        {/* Strategy */}
        <div className="panel overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border">
            <span className="text-[12px] font-semibold text-white">By Strategy</span>
          </div>
          <div className="overflow-x-auto">
            <table className="t-table">
              <thead>
                <tr>
                  <th>Strategy</th><th>Trades</th><th>Win Rate</th><th>PnL</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byStrategy).length === 0 && (
                  <tr><td colSpan={4} className="py-8 text-center text-dim">No data</td></tr>
                )}
                {Object.entries(byStrategy).map(([strat, val]: [string, any]) => (
                  <tr key={strat}>
                    <td className="font-medium text-[12px]">{strat}</td>
                    <td className="font-mono text-[12px] text-dim">{val.count}</td>
                    <td>{winRateCell(val.winRate)}</td>
                    <td>{pnl(val.pnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Symbol */}
        <div className="panel overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border">
            <span className="text-[12px] font-semibold text-white">By Symbol</span>
          </div>
          <div className="overflow-x-auto">
            <table className="t-table">
              <thead>
                <tr>
                  <th>Symbol</th><th>Trades</th><th>Win Rate</th><th>PnL</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(bySymbol).length === 0 && (
                  <tr><td colSpan={4} className="py-8 text-center text-dim">No data</td></tr>
                )}
                {Object.entries(bySymbol).map(([sym, val]: [string, any]) => (
                  <tr key={sym}>
                    <td className="font-mono font-semibold text-[12px]">{sym}</td>
                    <td className="font-mono text-[12px] text-dim">{val.count}</td>
                    <td>{winRateCell(val.winRate)}</td>
                    <td>{pnl(val.pnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
