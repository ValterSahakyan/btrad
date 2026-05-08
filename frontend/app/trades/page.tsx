'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm-modal';
import { cn, currency, number } from '@/lib/utils';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3333/api';
const REFRESH_MS = 10_000;

function dir(d: string) {
  return <span className={`font-mono text-[11px] font-semibold ${d === 'LONG' ? 'text-positive' : 'text-danger'}`}>{d}</span>;
}

function pnlCell(v: number | null | undefined, open = false) {
  const n = v ?? 0;
  return (
    <span className={cn(
      'font-mono text-[12px] font-medium',
      n > 0 ? 'text-positive' : n < 0 ? 'text-danger' : 'text-dim',
      open && 'animate-pulse',
    )}>
      {currency(n)}
    </span>
  );
}

function pnlPct(v: number | null | undefined) {
  const n = v ?? 0;
  return (
    <span className={`font-mono text-[11px] ${n > 0 ? 'text-positive' : n < 0 ? 'text-danger' : 'text-dim'}`}>
      {n > 0 ? '+' : ''}{number(n)}%
    </span>
  );
}

function statusBadge(s: string) {
  if (s === 'live_open') return <Badge tone="positive">live</Badge>;
  if (s === 'paper_open') return <Badge tone="warning">paper</Badge>;
  if (s === 'take_profit') return <Badge tone="positive">TP</Badge>;
  if (s === 'stopped') return <Badge tone="danger">SL</Badge>;
  if (s === 'manually_closed') return <Badge tone="neutral">closed</Badge>;
  return <Badge tone="neutral">{s}</Badge>;
}

export default function TradesPage() {
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const { confirm, modal } = useConfirm();

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch(`${API}/trades`, { credentials: 'include', cache: 'no-store' });
      if (res.ok) {
        setTrades(await res.json());
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

  const handleClose = async (tradeId: string, paper: boolean) => {
    const ok = await confirm({
      title: paper ? 'Close Paper Trade' : 'Close Live Trade',
      message: paper
        ? 'Mark this simulated paper trade as closed?'
        : 'Place a market close order on Binance now? This will exit the position at the current market price.',
      confirmLabel: 'Close Trade',
      variant: paper ? 'default' : 'danger',
    });
    if (!ok) return;
    setClosingId(tradeId);
    try {
      await fetch(`${API}/trades/${tradeId}/${paper ? 'close-paper' : 'close-live'}`, {
        method: 'POST', credentials: 'include',
      });
      await fetchTrades();
    } finally {
      setClosingId(null);
    }
  };

  const liveOpen = trades.filter((t) => t.status === 'live_open').length;
  const paperOpen = trades.filter((t) => t.status === 'paper_open').length;

  return (
    <div className="space-y-3">
      {modal}
      {/* Header bar */}
      <div className="panel px-4 py-2.5 flex items-center gap-3">
        <span className="text-[12px] font-semibold text-white mr-auto">Trade History</span>
        {liveOpen > 0 && <Badge tone="positive">{liveOpen} live</Badge>}
        {paperOpen > 0 && <Badge tone="warning">{paperOpen} paper</Badge>}
        {lastUpdated && (
          <span className="text-[11px] text-dim font-mono">{lastUpdated.toLocaleTimeString()}</span>
        )}
        <button
          onClick={fetchTrades}
          className="text-[11px] text-dim hover:text-white transition-colors cursor-pointer"
        >
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="panel overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-[12px] text-dim">Loading…</div>
        ) : trades.length === 0 ? (
          <div className="py-12 text-center text-[12px] text-dim">No trades yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="t-table">
              <thead>
                <tr>
                  {['Symbol', 'Dir', 'Entry', 'Mark / Exit', 'Size', 'Qty', 'Lev', 'Margin', 'PnL', 'PnL %', 'Status', ''].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => {
                  const isLive = t.status === 'live_open';
                  const isPaper = t.status === 'paper_open';
                  const sizePrice = isLive && t.markPrice ? t.markPrice : t.entryPrice;
                  return (
                    <tr
                      key={t.id}
                      className={cn(
                        isLive  && 'row-live',
                        isPaper && 'row-paper',
                      )}
                    >
                      <td className="font-mono font-semibold text-[12px]">{t.symbol}</td>
                      <td>{dir(t.direction)}</td>
                      <td className="font-mono text-[12px]">{number(t.entryPrice, 4)}</td>
                      <td className="font-mono text-[12px]">
                        {isLive
                          ? t.markPrice
                            ? <span className="text-accent">{number(t.markPrice, 4)}</span>
                            : <span className="text-dim">—</span>
                          : t.exitPrice
                            ? number(t.exitPrice, 4)
                            : <span className="text-dim">—</span>}
                      </td>
                      <td className="font-mono text-[12px]">{currency(t.quantity * sizePrice)}</td>
                      <td className="font-mono text-[11px] text-dim">{number(t.quantity, 4)}</td>
                      <td className="font-mono text-[11px] text-dim">{t.leverage}×</td>
                      <td className="font-mono text-[12px] text-dim">{currency(t.margin)}</td>
                      <td>{pnlCell(t.pnl, isLive)}</td>
                      <td>{pnlPct(t.pnlPercent)}</td>
                      <td>{statusBadge(t.status)}</td>
                      <td>
                        {(isLive || isPaper) && (
                          <button
                            onClick={() => handleClose(t.id, isPaper)}
                            disabled={closingId === t.id}
                            className={cn(
                              'text-[11px] px-2 py-0.5 rounded border cursor-pointer transition-colors',
                              'border-danger/25 text-danger hover:bg-danger/10 disabled:opacity-40',
                            )}
                          >
                            {closingId === t.id ? '…' : 'Close'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
