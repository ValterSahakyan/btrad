'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { clientApiPath } from '@/lib/client-api';

type Status = {
  mode: string;
  realTradingEnabled: boolean;
  requireDashboardConfirmation: boolean;
  botStatus: string;
  activeSignals: number;
  queuedSignals?: number;
  openTrades: number;
};

const REFRESH_MS = 10_000;

function Pill({ label, tone }: { label: string; tone: 'pos' | 'neg' | 'warn' | 'dim' | 'acc' }) {
  const styles = {
    pos: 'bg-positive/10 text-positive border-positive/20',
    neg: 'bg-danger/10 text-danger border-danger/20',
    warn: 'bg-warning/10 text-warning border-warning/20',
    dim: 'bg-white/5 text-muted border-white/10',
    acc: 'bg-accent/10 text-accent border-accent/20',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${styles[tone]}`}>
      {label}
    </span>
  );
}

const pageTitle: Record<string, string> = {
  '/overview': 'Overview',
  '/hot-coins': 'Scanner',
  '/signals': 'Signals',
  '/trades': 'Trades',
  '/performance': 'Performance',
  '/settings': 'Settings',
  '/logs': 'Logs',
};

export function Topbar() {
  const pathname = usePathname();
  const title = pageTitle[pathname] ?? 'Dashboard';
  const [status, setStatus] = useState<Status | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(clientApiPath('/status'), {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) {
        setStatus(null);
        return;
      }
      setStatus(await response.json());
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const intervalId = window.setInterval(fetchStatus, REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [fetchStatus]);

  const isStopped = status?.botStatus === 'paused';
  const liveMode = status?.mode === 'live';
  const realOn = status?.realTradingEnabled ?? false;
  const autoExec = status?.requireDashboardConfirmation === false;

  return (
    <div className="app-topbar">
      <span className="text-[13px] font-semibold text-white mr-auto">{title}</span>

      {!status && <Pill label="Backend Offline" tone="neg" />}

      {status && (
        <>
          {status.activeSignals > 0 && (
            <span className="text-[11px] text-muted">
              <span className="text-warning font-mono">{status.activeSignals}</span> queued
            </span>
          )}
          {status.openTrades > 0 && (
            <span className="text-[11px] text-muted">
              <span className="text-positive font-mono">{status.openTrades}</span> open
            </span>
          )}
          <span className="w-px h-3 bg-border mx-1" />
          <Pill label={isStopped ? 'Stopped' : 'Running'} tone={isStopped ? 'neg' : 'pos'} />
          <Pill label={liveMode ? 'Live' : 'Testnet'} tone={liveMode ? 'acc' : 'warn'} />
          {realOn && <Pill label="Real ON" tone="pos" />}
          {autoExec && <Pill label="Auto-Exec" tone="neg" />}
        </>
      )}
    </div>
  );
}
