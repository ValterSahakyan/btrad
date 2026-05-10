'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '@/components/dashboard/data-table';
import { MetricCard } from '@/components/dashboard/metric-card';
import { PnlChart } from '@/components/dashboard/pnl-chart';
import { Badge } from '@/components/ui/badge';
import { clientApiPath } from '@/lib/client-api';
import { currency, number } from '@/lib/utils';

const REFRESH_MS = 10_000;

const defaultStatus = {
  botStatus: 'offline',
  mode: 'testnet',
  realTradingEnabled: false,
  requireDashboardConfirmation: true,
  executionMode: 'signal_only',
  openTrades: 0,
  activeSignals: 0,
  queuedSignals: 0,
  executedSignals: 0,
};

const defaultPerf = {
  totalPnl: 0,
  winRate: 0,
  profitFactor: 0,
  averageWin: 0,
  averageLoss: 0,
  totalTrades: 0,
};

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
  if (s === 'approved') return <Badge tone="warning">approved</Badge>;
  if (s === 'live_executed') return <Badge tone="positive">live</Badge>;
  if (s === 'expired' || s === 'skipped') return <Badge tone="neutral">{s}</Badge>;
  if (s === 'failed') return <Badge tone="danger">failed</Badge>;
  return <Badge tone="neutral">{s}</Badge>;
}

function tradeStatus(s: string) {
  if (s === 'live_open') return <Badge tone="positive">live</Badge>;
  if (s === 'take_profit') return <Badge tone="positive">TP</Badge>;
  if (s === 'stopped') return <Badge tone="danger">SL</Badge>;
  if (s === 'manually_closed') return <Badge tone="neutral">closed</Badge>;
  return <Badge tone="neutral">{s}</Badge>;
}

function logLevel(l: string) {
  if (l === 'error') return <span className="font-mono text-[10px] font-semibold text-danger uppercase">{l}</span>;
  if (l === 'warn') return <span className="font-mono text-[10px] font-semibold text-warning uppercase">{l}</span>;
  if (l === 'info') return <span className="font-mono text-[10px] text-accent uppercase">{l}</span>;
  return <span className="font-mono text-[10px] text-dim uppercase">{l}</span>;
}

function execMode(m: string) {
  if (m === 'live_auto') return 'Live Auto';
  if (m === 'live_manual') return 'Live Manual';
  return 'Signal Only';
}

export default function OverviewPage() {
  const [status, setStatus] = useState<any>(defaultStatus);
  const [perf, setPerf] = useState<any>(defaultPerf);
  const [daily, setDaily] = useState<any[]>([]);
  const [signals, setSignals] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [balance, setBalance] = useState<any>({ futures: null });
  const [loading, setLoading] = useState(true);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const responses = await Promise.all([
        fetch(clientApiPath('/status'), { credentials: 'include', cache: 'no-store' }),
        fetch(clientApiPath('/performance'), { credentials: 'include', cache: 'no-store' }),
        fetch(clientApiPath('/performance/daily'), { credentials: 'include', cache: 'no-store' }),
        fetch(clientApiPath('/signals'), { credentials: 'include', cache: 'no-store' }),
        fetch(clientApiPath('/trades'), { credentials: 'include', cache: 'no-store' }),
        fetch(clientApiPath('/logs'), { credentials: 'include', cache: 'no-store' }),
        fetch(clientApiPath('/balance'), { credentials: 'include', cache: 'no-store' }),
      ]);

      const firstFailure = responses.find((response) => !response.ok);
      if (firstFailure) {
        setBackendError(`Backend request failed (${firstFailure.status})`);
        return;
      }

      const [nextStatus, nextPerf, nextDaily, nextSignals, nextTrades, nextLogs, nextBalance] = await Promise.all(
        responses.map((response) => response.json()),
      );

      setStatus(nextStatus);
      setPerf(nextPerf);
      setDaily(nextDaily);
      setSignals(nextSignals);
      setTrades(nextTrades);
      setLogs(nextLogs);
      setBalance(nextBalance);
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

  const chartData = useMemo(() => aggregateDailyPnl(daily), [daily]);
  const liveTrades = useMemo(() => trades.filter((trade) => trade.status === 'live_open'), [trades]);
  const unrealizedPnl = useMemo(
    () => liveTrades.reduce((sum, trade) => sum + Number(trade.pnl ?? 0), 0),
    [liveTrades],
  );

  const totalPnl = perf.totalPnl ?? 0;
  const isStopped = status.botStatus === 'paused';

  return (
    <div className="space-y-4">
      {backendError && (
        <div className="panel border border-danger/20 bg-danger/5 px-4 py-3 text-[12px] text-danger">
          {backendError}. Retrying automatically.
        </div>
      )}

      {isStopped && (
        <div className="flex items-center gap-2 rounded border border-danger/20 bg-danger/5 px-4 py-2.5 text-[12px] text-danger">
          <span className="font-mono">!</span>
          Bot is stopped. Existing live trades are still monitored, but no new scans or trades will start.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="Bot Status"
          value={isStopped ? 'Stopped' : 'Running'}
          hint={`${status.mode} · ${execMode(status.executionMode)}`}
          tone={isStopped ? 'danger' : 'positive'}
          mono={false}
        />
        <MetricCard
          label="Closed PnL"
          value={currency(totalPnl)}
          hint={`${number(perf.winRate)}% win · ${perf.totalTrades} closed`}
          tone={totalPnl > 0 ? 'positive' : totalPnl < 0 ? 'danger' : 'neutral'}
        />
        <MetricCard
          label="Live Unrealized"
          value={currency(unrealizedPnl)}
          hint={`${liveTrades.length} open trades`}
          tone={unrealizedPnl > 0 ? 'positive' : unrealizedPnl < 0 ? 'danger' : 'neutral'}
        />
        <MetricCard
          label="Win Rate"
          value={`${number(perf.winRate)}%`}
          tone={(perf.winRate ?? 0) >= 50 ? 'positive' : 'danger'}
        />
        <MetricCard
          label="Profit Factor"
          value={number(perf.profitFactor)}
          hint="Closed trades"
          tone={(perf.profitFactor ?? 0) >= 1 ? 'positive' : 'danger'}
        />
        <MetricCard
          label="Futures Balance"
          value={balance.futures !== null ? currency(balance.futures) : '-'}
          hint={balance.error ?? `${status.mode} wallet`}
          tone={balance.futures !== null && balance.futures > 0 ? 'neutral' : balance.error ? 'danger' : 'neutral'}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_220px]">
        <PnlChart data={chartData} />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-1">
          <MetricCard label="Avg Win" value={currency(perf.averageWin)} tone="positive" />
          <MetricCard label="Avg Loss" value={currency(perf.averageLoss)} tone="danger" />
          <MetricCard label="Signals" value={String(status.activeSignals)} hint="queued for action" />
          <MetricCard
            label="Last Update"
            value={lastUpdated ? lastUpdated.toLocaleTimeString() : loading ? 'Loading' : '-'}
            hint="auto refresh"
            mono={false}
          />
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <DataTable
          title="Recent Signals"
          headers={['Symbol', 'Dir', 'Score', 'Status']}
          rows={signals.slice(0, 8).map((signal) => [
            <span key="sym" className="font-mono text-[12px] font-medium">{signal.symbol?.symbol ?? signal.symbol}</span>,
            dir(signal.direction),
            <span key="sc" className={`font-mono text-[12px] ${Number(signal.confidenceScore) >= 75 ? 'text-positive' : 'text-white'}`}>{number(signal.confidenceScore)}</span>,
            sigStatus(signal.status),
          ])}
        />
        <DataTable
          title="Recent Trades"
          headers={['Symbol', 'Dir', 'PnL', 'Status']}
          rows={trades.slice(0, 8).map((trade) => [
            <span key="sym" className="font-mono text-[12px] font-medium">{trade.symbol}</span>,
            dir(trade.direction),
            pnl(trade.pnl),
            tradeStatus(trade.status),
          ])}
        />
        <DataTable
          title="Recent Logs"
          headers={['Lvl', 'Source', 'Message']}
          rows={logs.slice(0, 8).map((log) => [
            logLevel(log.level),
            <span key="src" className="text-dim text-[11px]">{log.source}</span>,
            <span key="msg" className="block max-w-[200px] truncate text-[11px] text-white/80">{log.message}</span>,
          ])}
        />
      </div>
    </div>
  );
}

function aggregateDailyPnl(rows: Array<{ createdAt: string; pnl: number | null }>) {
  const dailyBuckets = new Map<string, number>();
  for (const row of rows) {
    const date = new Date(row.createdAt);
    if (Number.isNaN(date.getTime())) continue;
    const key = date.toISOString().slice(0, 10);
    dailyBuckets.set(key, (dailyBuckets.get(key) ?? 0) + Number(row.pnl ?? 0));
  }

  return [...dailyBuckets.entries()].map(([key, value]) => ({
    createdAt: new Date(`${key}T00:00:00.000Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    pnl: Number(value.toFixed(4)),
  }));
}
