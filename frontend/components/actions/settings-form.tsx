'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { ToastContainer } from '../ui/toast';
import { useToast } from '@/hooks/use-toast';

type SettingsState = {
  // General
  mode: 'testnet' | 'live';
  isPaused: boolean;
  enableRealTrading: boolean;
  paperTradingEnabled: boolean;
  allowAutoLiveExecution: boolean;
  // Risk
  defaultLeverage: number;
  maxLeverage: number;
  riskPerTradePercent: number;
  maxDailyLossPercent: number;
  maxOpenTrades: number;
  maxConsecutiveLosses: number;
  minPositionUsd: number;
  maxPositionUsd: number;
  // Scanner
  scannerIntervalSeconds: number;
  signalExpirationMinutes: number;
  maxSymbolsPerScan: number;
  minHotScoreForScan: number;
  minConfidenceScore: number;
  minRiskReward: number;
  // Breakout + Volume
  breakoutEnabled: boolean;
  breakoutMinVolumeRatio: number;
  breakoutLookbackPeriod: number;
  breakoutMaxSlPercent: number;
  breakoutTp1Multiplier: number;
  breakoutTp2Multiplier: number;
  breakoutMinHotScore: number;
  // Trend Pullback
  pullbackEnabled: boolean;
  pullbackRsiLongMin: number;
  pullbackRsiLongMax: number;
  pullbackRsiShortMin: number;
  pullbackRsiShortMax: number;
  pullbackAtrMultiplier: number;
  pullbackMaxSlPercent: number;
  pullbackMinHotScore: number;
  // Mean Reversion
  reversionEnabled: boolean;
  reversionRsiOverbought: number;
  reversionRsiOversold: number;
  reversionVwapDeviationPct: number;
  reversionVolumeDeclineRatio: number;
  reversionMaxSlPercent: number;
};

type Section = {
  title: string;
  description?: string;
  fields: { key: keyof SettingsState; label: string; unit?: string }[];
};

const SECTIONS: Section[] = [
  {
    title: 'General',
    fields: [
      { key: 'mode', label: 'Mode' },
      { key: 'isPaused', label: 'Bot Paused' },
      { key: 'enableRealTrading', label: 'ENABLE_REAL_TRADING' },
      { key: 'paperTradingEnabled', label: 'Paper Trading Enabled' },
      { key: 'allowAutoLiveExecution', label: 'ALLOW_AUTO_LIVE_EXECUTION' },
    ],
  },
  {
    title: 'Risk Management',
    fields: [
      { key: 'defaultLeverage', label: 'Default Leverage', unit: 'x' },
      { key: 'maxLeverage', label: 'Max Leverage', unit: 'x' },
      { key: 'riskPerTradePercent', label: 'Risk Per Trade', unit: '%' },
      { key: 'maxDailyLossPercent', label: 'Max Daily Loss', unit: '%' },
      { key: 'maxOpenTrades', label: 'Max Open Trades' },
      { key: 'maxConsecutiveLosses', label: 'Max Consecutive Losses' },
      { key: 'maxPositionUsd', label: 'Max Position Size', unit: 'USD' },
      { key: 'minPositionUsd', label: 'Min Position Size', unit: 'USD' },
    ],
  },
  {
    title: 'Scanner & Filters',
    fields: [
      { key: 'scannerIntervalSeconds', label: 'Scanner Interval', unit: 's' },
      { key: 'signalExpirationMinutes', label: 'Signal Expiration', unit: 'm' },
      { key: 'maxSymbolsPerScan', label: 'Max Symbols Per Scan' },
      { key: 'minHotScoreForScan', label: 'Min Hot Score For Scan' },
      { key: 'minConfidenceScore', label: 'Min Confidence Score' },
      { key: 'minRiskReward', label: 'Min Risk/Reward' },
    ],
  },
  {
    title: 'Strategy: Breakout + Volume',
    description: 'Triggers when price breaks 1h resistance/support with volume confirmation.',
    fields: [
      { key: 'breakoutEnabled', label: 'Enabled' },
      { key: 'breakoutMinVolumeRatio', label: 'Min Volume Ratio', unit: 'x avg' },
      { key: 'breakoutLookbackPeriod', label: 'Lookback Period', unit: '1h candles' },
      { key: 'breakoutMaxSlPercent', label: 'Max Stop Loss', unit: '%' },
      { key: 'breakoutTp1Multiplier', label: 'TP1 Multiplier', unit: 'x risk' },
      { key: 'breakoutTp2Multiplier', label: 'TP2 Multiplier', unit: 'x risk' },
      { key: 'breakoutMinHotScore', label: 'Min Hot Score' },
    ],
  },
  {
    title: 'Strategy: Trend Pullback Continuation',
    description: 'Enters on pullbacks in an existing trend. Safer entries after initial move.',
    fields: [
      { key: 'pullbackEnabled', label: 'Enabled' },
      { key: 'pullbackRsiLongMin', label: 'RSI Long Min' },
      { key: 'pullbackRsiLongMax', label: 'RSI Long Max' },
      { key: 'pullbackRsiShortMin', label: 'RSI Short Min' },
      { key: 'pullbackRsiShortMax', label: 'RSI Short Max' },
      { key: 'pullbackAtrMultiplier', label: 'Pullback ATR Zone', unit: 'x ATR' },
      { key: 'pullbackMaxSlPercent', label: 'Max Stop Loss', unit: '%' },
      { key: 'pullbackMinHotScore', label: 'Min Hot Score' },
    ],
  },
  {
    title: 'Strategy: Mean Reversion',
    description: 'Fades overextended pumps/dumps when RSI is extreme and volume is declining.',
    fields: [
      { key: 'reversionEnabled', label: 'Enabled' },
      { key: 'reversionRsiOverbought', label: 'RSI Overbought (SHORT trigger)' },
      { key: 'reversionRsiOversold', label: 'RSI Oversold (LONG trigger)' },
      { key: 'reversionVwapDeviationPct', label: 'VWAP Deviation', unit: '%' },
      { key: 'reversionVolumeDeclineRatio', label: 'Volume Decline Ratio', unit: 'of peak' },
      { key: 'reversionMaxSlPercent', label: 'Max Stop Loss', unit: '%' },
    ],
  },
];

const BOOLEAN_KEYS = new Set<string>([
  'isPaused', 'enableRealTrading', 'paperTradingEnabled', 'allowAutoLiveExecution',
  'breakoutEnabled', 'pullbackEnabled', 'reversionEnabled',
]);

export function SettingsForm({ settings }: { settings: any }) {
  const [form, setForm] = useState<SettingsState>({
    mode: settings.mode ?? 'testnet',
    isPaused: settings.isPaused ?? false,
    enableRealTrading: settings.enableRealTrading ?? settings.realTradingEnabled ?? false,
    paperTradingEnabled: settings.paperTradingEnabled ?? true,
    allowAutoLiveExecution: settings.allowAutoLiveExecution ?? (settings.requireDashboardConfirmation === false),
    defaultLeverage: settings.defaultLeverage ?? 3,
    maxLeverage: settings.maxLeverage ?? 5,
    riskPerTradePercent: settings.riskPerTradePercent ?? 1,
    maxDailyLossPercent: settings.maxDailyLossPercent ?? 3,
    maxOpenTrades: settings.maxOpenTrades ?? 2,
    maxConsecutiveLosses: settings.maxConsecutiveLosses ?? 3,
    maxPositionUsd: settings.maxPositionUsd ?? 3,
    minPositionUsd: settings.minPositionUsd ?? 1,
    minConfidenceScore: settings.minConfidenceScore ?? 70,
    minRiskReward: settings.minRiskReward ?? 1.5,
    scannerIntervalSeconds: settings.scannerIntervalSeconds ?? 60,
    signalExpirationMinutes: settings.signalExpirationMinutes ?? 15,
    maxSymbolsPerScan: settings.maxSymbolsPerScan ?? 50,
    minHotScoreForScan: settings.minHotScoreForScan ?? 55,
    // Breakout
    breakoutEnabled: settings.breakoutEnabled ?? true,
    breakoutMinVolumeRatio: settings.breakoutMinVolumeRatio ?? 1.5,
    breakoutLookbackPeriod: settings.breakoutLookbackPeriod ?? 20,
    breakoutMaxSlPercent: settings.breakoutMaxSlPercent ?? 5,
    breakoutTp1Multiplier: settings.breakoutTp1Multiplier ?? 1.5,
    breakoutTp2Multiplier: settings.breakoutTp2Multiplier ?? 2.5,
    breakoutMinHotScore: settings.breakoutMinHotScore ?? 55,
    // Pullback
    pullbackEnabled: settings.pullbackEnabled ?? true,
    pullbackRsiLongMin: settings.pullbackRsiLongMin ?? 38,
    pullbackRsiLongMax: settings.pullbackRsiLongMax ?? 58,
    pullbackRsiShortMin: settings.pullbackRsiShortMin ?? 42,
    pullbackRsiShortMax: settings.pullbackRsiShortMax ?? 62,
    pullbackAtrMultiplier: settings.pullbackAtrMultiplier ?? 1.5,
    pullbackMaxSlPercent: settings.pullbackMaxSlPercent ?? 4,
    pullbackMinHotScore: settings.pullbackMinHotScore ?? 40,
    // Reversion
    reversionEnabled: settings.reversionEnabled ?? true,
    reversionRsiOverbought: settings.reversionRsiOverbought ?? 75,
    reversionRsiOversold: settings.reversionRsiOversold ?? 25,
    reversionVwapDeviationPct: settings.reversionVwapDeviationPct ?? 3,
    reversionVolumeDeclineRatio: settings.reversionVolumeDeclineRatio ?? 0.6,
    reversionMaxSlPercent: settings.reversionMaxSlPercent ?? 5,
  });

  const [isPending, setPending] = useState(false);
  const router = useRouter();
  const toast = useToast();

  const inputClass =
    'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white text-sm outline-none transition ' +
    'focus:border-teal-400/60 focus:bg-white/8 hover:border-white/20 placeholder:text-white/30';

  const selectClass =
    'w-full appearance-none rounded-xl border border-white/10 bg-white/5 pl-3 pr-8 py-2 text-white text-sm outline-none transition ' +
    'focus:border-teal-400/60 focus:bg-white/8 hover:border-white/20 cursor-pointer';

  const SelectField = ({
    value,
    onChange,
    options,
  }: {
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
  }) => (
    <div className="relative">
      <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40"
        width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  );

  const renderField = (key: keyof SettingsState, label: string, unit?: string) => {
    const value = form[key];
    return (
      <label key={key} className="space-y-1 text-sm">
        <div className="text-white/50">
          {label}{unit ? <span className="ml-1 text-xs opacity-50">({unit})</span> : null}
        </div>
        {key === 'mode' ? (
          <SelectField
            value={value as string}
            onChange={(v) => setForm((f) => ({ ...f, [key]: v as 'testnet' | 'live' }))}
            options={[{ value: 'testnet', label: 'Testnet' }, { value: 'live', label: 'Live' }]}
          />
        ) : BOOLEAN_KEYS.has(key) ? (
          <SelectField
            value={String(value)}
            onChange={(v) => setForm((f) => ({ ...f, [key]: v === 'true' }))}
            options={[{ value: 'true', label: 'Enabled' }, { value: 'false', label: 'Disabled' }]}
          />
        ) : (
          <input
            className={inputClass}
            type="number"
            step="any"
            value={String(value)}
            onChange={(e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) }))}
          />
        )}
      </label>
    );
  };

  return (
    <div className="xl:col-span-2 space-y-4">
      {SECTIONS.map((section) => (
        <Card key={section.title}>
          <div className="mb-1 text-base font-semibold">{section.title}</div>
          {section.description && (
            <p className="mb-4 text-xs text-muted">{section.description}</p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {section.fields.map(({ key, label, unit }) => renderField(key, label, unit))}
          </div>
        </Card>
      ))}

      <div className="flex justify-end">
        <Button
          onClick={async () => {
            setPending(true);
            try {
              const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3333/api'}/settings`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
                credentials: 'include',
              });
              if (!res.ok) {
                const body = await res.json().catch(() => ({})) as { message?: string };
                toast.error(body.message ?? `Save failed (${res.status})`);
              } else {
                toast.success('Settings saved');
                router.refresh();
              }
            } catch {
              toast.error('Could not reach backend');
            } finally {
              setPending(false);
            }
          }}
          disabled={isPending}
        >
          {isPending ? 'Saving...' : 'Save All Settings'}
        </Button>
      </div>

      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
    </div>
  );
}
