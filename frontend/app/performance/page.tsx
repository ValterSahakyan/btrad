'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MetricCard } from '@/components/dashboard/metric-card';
import { clientApiPath } from '@/lib/client-api';
import { currency, number } from '@/lib/utils';

const REFRESH_MS = 15_000;

const defaultPerf = { totalTrades: 0, winRate: 0, averageWin: 0, averageLoss: 0, profitFactor: 0, totalPnl: 0 };
const defaultAnalytics = {
  assumptions: { estimatedTakerFeeBps: 0, estimatedSlippageBps: 0, totalClosedTrades: 0 },
  overall: { grossExpectancy: 0, netExpectancy: 0, grossProfitFactor: 0, netProfitFactor: 0, avgEntrySlippageBps: 0, avgFillDelaySec: 0, totalEstimatedCost: 0 },
  byStrategy: {},
  byVersion: {},
  bySide: {},
  bySession: {},
};

function pnl(v: number) {
  return <span className={`font-mono text-[12px] font-medium ${v > 0 ? 'text-positive' : v < 0 ? 'text-danger' : 'text-dim'}`}>{currency(v)}</span>;
}

function winRateCell(v: number | null | undefined) {
  const n = v ?? 0;
  return <span className={`font-mono text-[12px] ${n >= 50 ? 'text-positive' : 'text-danger'}`}>{number(n)}%</span>;
}

export default function PerformancePage() {
  const [perf, setPerf] = useState<any>(defaultPerf);
  const [byStrategy, setByStrategy] = useState<Record<string, { count: number; pnl: number; winRate?: number }>>({});
  const [bySymbol, setBySymbol] = useState<Record<string, { count: number; pnl: number; winRate?: number }>>({});
  const [analytics, setAnalytics] = useState<any>(defaultAnalytics);
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const responses = await Promise.all([
        fetch(clientApiPath('/performance'), { credentials: 'include', cache: 'no-store' }),
        fetch(clientApiPath('/performance/strategies'), { credentials: 'include', cache: 'no-store' }),
        fetch(clientApiPath('/performance/symbols'), { credentials: 'include', cache: 'no-store' }),
        fetch(clientApiPath('/performance/analytics'), { credentials: 'include', cache: 'no-store' }),
        fetch(clientApiPath('/trades'), { credentials: 'include', cache: 'no-store' }),
      ]);

      const firstFailure = responses.find((response) => !response.ok);
      if (firstFailure) {
        setBackendError(`Backend request failed (${firstFailure.status})`);
        return;
      }

      const [nextPerf, nextByStrategy, nextBySymbol, nextAnalytics, nextTrades] = await Promise.all(
        responses.map((response) => response.json()),
      );

      setPerf(nextPerf);
      setByStrategy(nextByStrategy);
      setBySymbol(nextBySymbol);
      setAnalytics(nextAnalytics);
      setTrades(nextTrades);
      setBackendError(null);
      setLastUpdated(new Date());
    } catch {
      setBackendError('Backend unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const intervalId = window.setInterval(fetchAll, REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [fetchAll]);

  const liveTrades = useMemo(() => trades.filter((trade) => trade.status === 'live_open'), [trades]);
  const liveOpenCount = liveTrades.length;
  const liveUnrealizedPnl = useMemo(
    () => liveTrades.reduce((sum, trade) => sum + Number(trade.pnl ?? 0), 0),
    [liveTrades],
  );

  return (
    <div className="space-y-4">
      {backendError && (
        <div className="panel border border-danger/20 bg-danger/5 px-4 py-3 text-[12px] text-danger">
          {backendError}. Retrying automatically.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetricCard label="Closed Trades" value={String(perf.totalTrades)} mono={false} />
        <MetricCard label="Open Trades" value={String(liveOpenCount)} mono={false} />
        <MetricCard label="Closed Win Rate" value={`${number(perf.winRate)}%`} tone={(perf.winRate ?? 0) >= 50 ? 'positive' : 'danger'} />
        <MetricCard label="Closed Profit Factor" value={number(perf.profitFactor)} hint="Win $ / Loss $" tone={(perf.profitFactor ?? 0) >= 1.5 ? 'positive' : (perf.profitFactor ?? 0) >= 1 ? 'warning' : 'danger'} />
        <MetricCard label="Closed PnL" value={currency(perf.totalPnl ?? 0)} tone={(perf.totalPnl ?? 0) >= 0 ? 'positive' : 'danger'} />
        <MetricCard label="Live Unrealized" value={currency(liveUnrealizedPnl)} tone={liveUnrealizedPnl >= 0 ? 'positive' : 'danger'} hint={lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : loading ? 'Loading' : 'Live'} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetricCard label="Avg Win" value={currency(perf.averageWin)} tone="positive" />
        <MetricCard label="Avg Loss" value={currency(perf.averageLoss)} tone="danger" />
        <MetricCard label="Gross Expectancy" value={currency(analytics.overall.grossExpectancy)} tone={(analytics.overall.grossExpectancy ?? 0) >= 0 ? 'positive' : 'danger'} />
        <MetricCard label="Net Expectancy" value={currency(analytics.overall.netExpectancy)} tone={(analytics.overall.netExpectancy ?? 0) >= 0 ? 'positive' : 'danger'} hint={`Fees ${number(analytics.assumptions.estimatedTakerFeeBps)} bps + slip ${number(analytics.assumptions.estimatedSlippageBps)} bps`} />
        <MetricCard label="Gross PF" value={number(analytics.overall.grossProfitFactor)} tone={(analytics.overall.grossProfitFactor ?? 0) >= 1 ? 'positive' : 'danger'} />
        <MetricCard label="Net PF" value={number(analytics.overall.netProfitFactor)} tone={(analytics.overall.netProfitFactor ?? 0) >= 1 ? 'positive' : 'danger'} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetricCard label="Avg Entry Slip" value={`${number(analytics.overall.avgEntrySlippageBps)} bps`} tone={(analytics.overall.avgEntrySlippageBps ?? 0) <= 5 ? 'positive' : 'warning'} />
        <MetricCard label="Avg Fill Delay" value={`${number(analytics.overall.avgFillDelaySec)}s`} tone={(analytics.overall.avgFillDelaySec ?? 0) <= 60 ? 'positive' : 'warning'} />
        <MetricCard label="Total Est. Cost" value={currency(analytics.overall.totalEstimatedCost)} tone="warning" />
        <MetricCard label="Side Buckets" value={String(Object.keys(analytics.bySide).length)} mono={false} />
        <MetricCard label="Version Buckets" value={String(Object.keys(analytics.byVersion).length)} mono={false} />
        <MetricCard label="Strategy Buckets" value={String(Object.keys(analytics.byStrategy).length)} mono={false} />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <PerformanceTable
          title="By Strategy"
          emptyLabel="No closed strategy data"
          headers={['Strategy', 'Trades', 'Win Rate', 'PnL']}
          rows={Object.entries(byStrategy).map(([strategy, value]) => (
            <tr key={strategy}>
              <td className="font-medium text-[12px]">{strategy}</td>
              <td className="font-mono text-[12px] text-dim">{value.count}</td>
              <td>{winRateCell(value.winRate)}</td>
              <td>{pnl(value.pnl)}</td>
            </tr>
          ))}
        />
        <PerformanceTable
          title="By Symbol"
          emptyLabel="No closed symbol data"
          headers={['Symbol', 'Trades', 'Win Rate', 'PnL']}
          rows={Object.entries(bySymbol).map(([symbol, value]) => (
            <tr key={symbol}>
              <td className="font-mono font-semibold text-[12px]">{symbol}</td>
              <td className="font-mono text-[12px] text-dim">{value.count}</td>
              <td>{winRateCell(value.winRate)}</td>
              <td>{pnl(value.pnl)}</td>
            </tr>
          ))}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <PerformanceTable
          title="Strategy Research"
          emptyLabel="No strategy research data"
          headers={['Strategy', 'Trades', 'Net Exp.', 'Net PF', 'Slip']}
          rows={Object.entries(analytics.byStrategy).map(([strategy, value]: [string, any]) => (
            <tr key={strategy}>
              <td className="font-medium text-[12px]">{strategy}</td>
              <td className="font-mono text-[12px] text-dim">{value.trades}</td>
              <td>{pnl(value.netExpectancy)}</td>
              <td className="font-mono text-[12px]">{number(value.netProfitFactor)}</td>
              <td className="font-mono text-[12px] text-dim">{number(value.avgEntrySlippageBps)} bps</td>
            </tr>
          ))}
        />
        <PerformanceTable
          title="Version Research"
          emptyLabel="No version research data"
          headers={['Version', 'Trades', 'Net PnL', 'Net PF', 'Net Exp.']}
          rows={Object.entries(analytics.byVersion).map(([version, value]: [string, any]) => (
            <tr key={version}>
              <td className="font-mono text-[12px]">{version}</td>
              <td className="font-mono text-[12px] text-dim">{value.trades}</td>
              <td>{pnl(value.netPnl)}</td>
              <td className="font-mono text-[12px]">{number(value.netProfitFactor)}</td>
              <td>{pnl(value.netExpectancy)}</td>
            </tr>
          ))}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <PerformanceTable
          title="Side Research"
          emptyLabel="No side research data"
          headers={['Side', 'Trades', 'Net PnL', 'Net PF', 'Net Exp.']}
          rows={Object.entries(analytics.bySide).map(([side, value]: [string, any]) => (
            <tr key={side}>
              <td className="font-mono text-[12px]">{side}</td>
              <td className="font-mono text-[12px] text-dim">{value.trades}</td>
              <td>{pnl(value.netPnl)}</td>
              <td className="font-mono text-[12px]">{number(value.netProfitFactor)}</td>
              <td>{pnl(value.netExpectancy)}</td>
            </tr>
          ))}
        />
        <PerformanceTable
          title="Session Research"
          emptyLabel="No session research data"
          headers={['Session', 'Trades', 'Net PnL', 'Net PF', 'Net Exp.']}
          rows={Object.entries(analytics.bySession).map(([session, value]: [string, any]) => (
            <tr key={session}>
              <td className="font-mono text-[12px]">{session}</td>
              <td className="font-mono text-[12px] text-dim">{value.trades}</td>
              <td>{pnl(value.netPnl)}</td>
              <td className="font-mono text-[12px]">{number(value.netProfitFactor)}</td>
              <td>{pnl(value.netExpectancy)}</td>
            </tr>
          ))}
        />
      </div>
    </div>
  );
}

function PerformanceTable({
  title,
  headers,
  rows,
  emptyLabel,
}: {
  title: string;
  headers: string[];
  rows: React.ReactNode[];
  emptyLabel: string;
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <span className="text-[12px] font-semibold text-white">{title}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="t-table">
          <thead>
            <tr>
              {headers.map((header) => <th key={header}>{header}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={headers.length} className="py-8 text-center text-dim">{emptyLabel}</td></tr>
            )}
            {rows}
          </tbody>
        </table>
      </div>
    </div>
  );
}
