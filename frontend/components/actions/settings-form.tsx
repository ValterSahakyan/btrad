'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../ui/button';
import { Card } from '../ui/card';

const FIELD_LABELS: Record<string, string> = {
  mode: 'Mode',
  isPaused: 'Paused',
  realTradingEnabled: 'Real Trading Enabled',
  requireDashboardConfirmation: 'Require Dashboard Confirmation',
  paperTradingEnabled: 'Paper Trading Enabled',
  defaultLeverage: 'Default Leverage',
  maxLeverage: 'Max Leverage',
  riskPerTradePercent: 'Risk Per Trade (%)',
  maxDailyLossPercent: 'Max Daily Loss (%)',
  maxOpenTrades: 'Max Open Trades',
  maxConsecutiveLosses: 'Max Consecutive Losses',
  minConfidenceScore: 'Min Confidence Score',
  minRiskReward: 'Min Risk Reward',
  scannerIntervalSeconds: 'Scanner Interval (s)',
  signalExpirationMinutes: 'Signal Expiration (m)',
};

export function SettingsForm({ settings }: { settings: any }) {
  const [form, setForm] = useState({
    mode: settings.mode as 'testnet' | 'live',
    isPaused: settings.isPaused as boolean,
    realTradingEnabled: settings.realTradingEnabled as boolean,
    requireDashboardConfirmation: settings.requireDashboardConfirmation as boolean,
    paperTradingEnabled: settings.paperTradingEnabled as boolean,
    defaultLeverage: settings.defaultLeverage as number,
    maxLeverage: settings.maxLeverage as number,
    riskPerTradePercent: settings.riskPerTradePercent as number,
    maxDailyLossPercent: settings.maxDailyLossPercent as number,
    maxOpenTrades: settings.maxOpenTrades as number,
    maxConsecutiveLosses: settings.maxConsecutiveLosses as number,
    minConfidenceScore: settings.minConfidenceScore as number,
    minRiskReward: settings.minRiskReward as number,
    scannerIntervalSeconds: settings.scannerIntervalSeconds as number,
    signalExpirationMinutes: settings.signalExpirationMinutes as number,
  });
  const [isPending, setPending] = useState(false);
  const router = useRouter();

  const inputClass = 'w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white';

  return (
    <Card>
      <div className="mb-4 text-lg font-semibold">Update Settings</div>
      <div className="grid gap-4 md:grid-cols-2">
        {(Object.keys(form) as Array<keyof typeof form>).map((key) => {
          const value = form[key];
          const label = FIELD_LABELS[key] ?? key;
          return (
            <label key={key} className="space-y-2 text-sm">
              <div className="text-muted">{label}</div>
              {key === 'mode' ? (
                <select
                  className={inputClass}
                  value={value as string}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                >
                  <option value="testnet">testnet</option>
                  <option value="live">live</option>
                </select>
              ) : typeof value === 'boolean' ? (
                <select
                  className={inputClass}
                  value={String(value)}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value === 'true' }))}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  className={inputClass}
                  type="number"
                  value={String(value)}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) }))}
                />
              )}
            </label>
          );
        })}
      </div>
      <div className="mt-4">
        <Button
          onClick={async () => {
            setPending(true);
            try {
              await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api'}/settings`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
              });
              router.refresh();
            } finally {
              setPending(false);
            }
          }}
          disabled={isPending}
        >
          {isPending ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </Card>
  );
}
