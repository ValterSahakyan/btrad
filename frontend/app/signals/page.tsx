'use client';

import { useCallback, useEffect, useState } from 'react';
import { ActionButton } from '@/components/actions/action-button';
import { DailyExportControls } from '@/components/actions/daily-export-controls';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/pagination';
import { number } from '@/lib/utils';
import { clientApiPath } from '@/lib/client-api';

const API = '/api/backend';
const REFRESH_MS = 15_000;
const PAGE_SIZE = 100;

function dir(d: string) {
  return (
    <span className={`font-mono text-[11px] font-semibold ${d === 'LONG' ? 'text-positive' : 'text-danger'}`}>
      {d}
    </span>
  );
}

function score(v: number | null | undefined) {
  const n = v ?? 0;
  return (
    <span className={`font-mono text-[12px] font-semibold ${n >= 80 ? 'text-positive' : n >= 65 ? 'text-warning' : 'text-muted'}`}>
      {number(n)}
    </span>
  );
}

function sigStatus(s: string) {
  if (s === 'active') return <Badge tone="positive">active</Badge>;
  if (s === 'pending') return <Badge tone="warning">pending</Badge>;
  if (s === 'approved') return <Badge tone="warning">approved</Badge>;
  if (s === 'live_executed') return <Badge tone="positive">live</Badge>;
  if (s === 'expired')   return <Badge tone="neutral">expired</Badge>;
  if (s === 'skipped')   return <Badge tone="neutral">skipped</Badge>;
  if (s === 'cancelled') return <Badge tone="neutral">cancelled</Badge>;
  if (s === 'failed')    return <Badge tone="danger">failed</Badge>;
  return <Badge tone="neutral">{s}</Badge>;
}

const ACTIONABLE = new Set(['active', 'pending']);

export default function SignalsPage() {
  const [signals, setSignals] = useState<any[]>([]);
  const [status, setStatus] = useState<any>({
    realTradingEnabled: false,
    mode: 'testnet', requireDashboardConfirmation: true,
  });
  const [loading, setLoading] = useState(true);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const fetchAll = useCallback(async () => {
    try {
      const [sigRes, stRes] = await Promise.all([
        fetch(clientApiPath('/signals'), { credentials: 'include', cache: 'no-store' }),
        fetch(clientApiPath('/status'), { credentials: 'include', cache: 'no-store' }),
      ]);
      if (!sigRes.ok || !stRes.ok) {
        setBackendError(`Backend request failed (${!sigRes.ok ? sigRes.status : stRes.status})`);
        return;
      }

      setSignals(await sigRes.json());
      setStatus(await stRes.json());
      setBackendError(null);
    } catch {
      setBackendError('Backend unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchAll]);

  // Reset to page 1 when total shrinks
  useEffect(() => {
    const totalPages = Math.ceil(signals.length / PAGE_SIZE);
    if (page > totalPages && totalPages > 0) setPage(1);
  }, [signals.length, page]);

  const liveEnabled = status.realTradingEnabled && status.mode === 'live';
  const autoExec = status.requireDashboardConfirmation === false && liveEnabled;

  const pageData = signals.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-3">
      {backendError && (
        <div className="panel border border-danger/20 bg-danger/5 px-4 py-3 text-[12px] text-danger">
          {backendError}. Retrying automatically.
        </div>
      )}

      {/* Controls bar */}
      <div className="panel px-4 py-2.5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 mr-auto">
          {autoExec && <Badge tone="danger">Auto-Execute ON</Badge>}
          {!autoExec && liveEnabled && <Badge tone="positive">Live Manual</Badge>}
          {!liveEnabled && <Badge tone="neutral">Signal Only</Badge>}
          <span className="text-[11px] text-dim">
            {autoExec
              ? 'Orders placed automatically on qualifying signals'
              : liveEnabled
                ? 'Click Execute Live to place a real Binance Futures order'
                : 'Review signals only — enable live trading in Settings to execute'}
          </span>
        </div>
        <ActionButton
          label="Clear Inactive"
          path="/signals/cleanup"
          body={{ olderThanDays: 0 }}
          variant="ghost"
          size="sm"
          confirmTitle="Clear Inactive Signals"
          confirmMessage="Delete all skipped, expired, failed, and cancelled signals that have no linked trades? This cannot be undone."
          successMessage="Inactive signals cleared"
          onSuccess={fetchAll}
        />
        <DailyExportControls resource="signals" label="Export Daily CSV" />
      </div>

      {/* Signals table */}
      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <span className="text-[12px] font-semibold text-white">Signals</span>
          <span className="font-mono text-[11px] text-dim">{loading ? '…' : signals.length}</span>
        </div>
        {loading ? (
          <div className="py-12 text-center text-[12px] text-dim">Loading…</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="t-table">
                <thead>
                  <tr>
                    {['Symbol', 'Dir', 'Strategy', 'Score', 'Entry', 'SL', 'TP1', 'TP2', 'R/R', 'Lev', 'Status', 'Actions'].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageData.length === 0 && (
                    <tr>
                      <td colSpan={12} className="py-10 text-center text-dim">No signals</td>
                    </tr>
                  )}
                  {pageData.map((sig) => {
                    const canAct = ACTIONABLE.has(sig.status);
                    return (
                      <tr key={sig.id}>
                        <td className="font-mono font-medium text-[12px]">{sig.symbol?.symbol ?? sig.symbol}</td>
                        <td>{dir(sig.direction)}</td>
                        <td className="text-dim text-[11px] max-w-[120px] truncate">{sig.strategy}</td>
                        <td>{score(sig.confidenceScore)}</td>
                        <td className="font-mono text-[12px]">{number(sig.entryPrice, 4)}</td>
                        <td className="font-mono text-[12px] text-danger">{number(sig.stopLoss, 4)}</td>
                        <td className="font-mono text-[12px] text-positive">{number(sig.takeProfit1, 4)}</td>
                        <td className="font-mono text-[12px] text-positive">{number(sig.takeProfit2, 4)}</td>
                        <td className="font-mono text-[12px]">{number(sig.riskReward)}</td>
                        <td className="font-mono text-[11px] text-dim">{sig.leverage}×</td>
                        <td>{sigStatus(sig.status)}</td>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <ActionButton
                              label="Live"
                              path={`/signals/${sig.id}/approve-live`}
                              variant="default"
                              size="sm"
                              disabled={!canAct || !liveEnabled}
                              confirmTitle="Execute Live Order"
                              confirmMessage={`Place a real Binance Futures ${sig.direction} order for ${sig.symbol?.symbol ?? sig.symbol}? Entry ~${number(sig.entryPrice, 4)}, SL ${number(sig.stopLoss, 4)}, TP ${number(sig.takeProfit1, 4)}.`}
                              confirmVariant="danger"
                              onSuccess={fetchAll}
                            />
                            <ActionButton
                              label="Skip"
                              path={`/signals/${sig.id}/skip`}
                              variant="ghost"
                              size="sm"
                              disabled={!canAct}
                              onSuccess={fetchAll}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              total={signals.length}
              pageSize={PAGE_SIZE}
              onPage={setPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
