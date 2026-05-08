'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn, currency, number } from '@/lib/utils';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3333/api';
const REFRESH_MS = 10_000;

function dirBadge(direction: string) {
  return (
    <span className={direction === 'LONG' ? 'font-semibold text-positive' : 'font-semibold text-danger'}>
      {direction}
    </span>
  );
}

function pnlCell(pnl: number | null | undefined, open = false) {
  const v = pnl ?? 0;
  return (
    <span className={cn(
      v > 0 ? 'font-semibold text-positive' : v < 0 ? 'font-semibold text-danger' : 'text-muted',
      open && 'animate-pulse',
    )}>
      {currency(v)}
      {open && <span className="ml-1 text-[10px] opacity-60">live</span>}
    </span>
  );
}

function pnlPctCell(pct: number | null | undefined, open = false) {
  const v = pct ?? 0;
  return (
    <span className={v > 0 ? 'text-positive' : v < 0 ? 'text-danger' : 'text-muted'}>
      {v > 0 ? '+' : ''}{number(v)}%
    </span>
  );
}

function statusBadge(status: string) {
  if (status === 'live_open') return <Badge tone="positive">Live Open</Badge>;
  if (status === 'paper_open') return <Badge tone="warning">Paper Open</Badge>;
  if (status === 'take_profit') return <Badge tone="positive">TP Hit</Badge>;
  if (status === 'stopped') return <Badge tone="danger">SL Hit</Badge>;
  if (status === 'manually_closed') return <Badge tone="warning">Closed</Badge>;
  return <Badge tone="neutral">{status}</Badge>;
}

export default function TradesPage() {
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch(`${API}/trades`, { credentials: 'include', cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setTrades(data);
        setLastUpdated(new Date());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrades();
    const id = setInterval(fetchTrades, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchTrades]);

  const handleClose = async (tradeId: string, paperTrade: boolean) => {
    const message = paperTrade
      ? 'Close this simulated paper trade?'
      : 'Close this live trade at market price on Binance?';
    if (!confirm(message)) return;

    setClosingId(tradeId);
    try {
      await fetch(`${API}/trades/${tradeId}/${paperTrade ? 'close-paper' : 'close-live'}`, {
        method: 'POST',
        credentials: 'include',
      });
      await fetchTrades();
    } finally {
      setClosingId(null);
    }
  };

  const openLiveCount = trades.filter((t) => t.status === 'live_open').length;
  const openPaperCount = trades.filter((t) => t.status === 'paper_open').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-lg font-semibold">Trades</div>
          {openLiveCount > 0 && <Badge tone="positive">{openLiveCount} live open</Badge>}
          {openPaperCount > 0 && <Badge tone="warning">{openPaperCount} paper open</Badge>}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted">
          {lastUpdated && <span>Updated {lastUpdated.toLocaleTimeString()}</span>}
          <button
            onClick={fetchTrades}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs transition hover:bg-white/10"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <Card>
          <div className="py-8 text-center text-sm text-muted">Loading trades...</div>
        </Card>
      ) : trades.length === 0 ? (
        <Card>
          <div className="py-8 text-center text-sm text-muted">No trades yet</div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-muted">
                  {['Symbol', 'Direction', 'Entry', 'Mark / Exit', 'Size $', 'Qty', 'Leverage', 'Margin', 'PnL', 'PnL %', 'Status', ''].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => {
                  const isLiveOpen = trade.status === 'live_open';
                  const isPaperOpen = trade.status === 'paper_open';
                  return (
                    <tr key={trade.id} className={cn(
                      'border-b border-white/5 last:border-none hover:bg-white/[0.02]',
                      isLiveOpen && 'bg-positive/[0.03]',
                      isPaperOpen && 'bg-yellow-500/[0.04]',
                    )}>
                      <td className="px-3 py-3 font-medium">{trade.symbol}</td>
                      <td className="px-3 py-3">{dirBadge(trade.direction)}</td>
                      <td className="px-3 py-3">{number(trade.entryPrice, 4)}</td>
                      <td className="px-3 py-3">
                        {isLiveOpen
                          ? trade.markPrice
                            ? <span className="text-accent">{number(trade.markPrice, 4)}</span>
                            : '-'
                          : trade.exitPrice
                            ? number(trade.exitPrice, 4)
                            : <span className="text-muted">-</span>}
                      </td>
                      <td className="px-3 py-3 font-medium">
                        {currency(trade.quantity * ((isLiveOpen && trade.markPrice) ? trade.markPrice : trade.entryPrice))}
                      </td>
                      <td className="px-3 py-3 text-muted">{number(trade.quantity, 4)}</td>
                      <td className="px-3 py-3 text-muted">{trade.leverage}x</td>
                      <td className="px-3 py-3 text-muted">{currency(trade.margin)}</td>
                      <td className="px-3 py-3">{pnlCell(trade.pnl, isLiveOpen)}</td>
                      <td className="px-3 py-3">{pnlPctCell(trade.pnlPercent, isLiveOpen)}</td>
                      <td className="px-3 py-3">{statusBadge(trade.status)}</td>
                      <td className="px-3 py-3">
                        {(isLiveOpen || isPaperOpen) && (
                          <button
                            onClick={() => handleClose(trade.id, isPaperOpen)}
                            disabled={closingId === trade.id}
                            className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-1 text-xs text-danger transition hover:bg-danger/20 disabled:opacity-50"
                          >
                            {closingId === trade.id ? 'Closing...' : isPaperOpen ? 'Close Paper' : 'Close Live'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
