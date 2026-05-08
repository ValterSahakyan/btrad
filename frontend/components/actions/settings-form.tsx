'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../ui/button';
import { ToastContainer } from '../ui/toast';
import { useToast } from '@/hooks/use-toast';

type SettingsState = {
  mode: 'testnet' | 'live';
  isPaused: boolean;
  enableRealTrading: boolean;
  paperTradingEnabled: boolean;
  allowAutoLiveExecution: boolean;
  defaultLeverage: number;
  maxLeverage: number;
  riskPerTradePercent: number;
  maxDailyLossPercent: number;
  maxOpenTrades: number;
  maxConsecutiveLosses: number;
  minPositionUsd: number;
  maxPositionUsd: number;
  scannerIntervalSeconds: number;
  signalExpirationMinutes: number;
  maxSymbolsPerScan: number;
  minHotScoreForScan: number;
  minConfidenceScore: number;
  minRiskReward: number;
  breakoutEnabled: boolean;
  breakoutMinVolumeRatio: number;
  breakoutLookbackPeriod: number;
  breakoutMaxSlPercent: number;
  breakoutTp1Multiplier: number;
  breakoutTp2Multiplier: number;
  breakoutMinHotScore: number;
  pullbackEnabled: boolean;
  pullbackRsiLongMin: number;
  pullbackRsiLongMax: number;
  pullbackRsiShortMin: number;
  pullbackRsiShortMax: number;
  pullbackAtrMultiplier: number;
  pullbackMaxSlPercent: number;
  pullbackMinHotScore: number;
  reversionEnabled: boolean;
  reversionRsiOverbought: number;
  reversionRsiOversold: number;
  reversionVwapDeviationPct: number;
  reversionVolumeDeclineRatio: number;
  reversionMaxSlPercent: number;
};

type Field = { key: keyof SettingsState; label: string; unit?: string };
type Section = { title: string; description?: string; fields: Field[] };

const SECTIONS: Section[] = [
  {
    title: 'General',
    fields: [
      { key: 'mode',                  label: 'Mode' },
      { key: 'isPaused',              label: 'Bot Paused' },
      { key: 'enableRealTrading',     label: 'Real Trading' },
      { key: 'paperTradingEnabled',   label: 'Paper Trading' },
      { key: 'allowAutoLiveExecution',label: 'Auto-Execute' },
    ],
  },
  {
    title: 'Risk Management',
    fields: [
      { key: 'defaultLeverage',       label: 'Default Leverage', unit: 'x' },
      { key: 'maxLeverage',           label: 'Max Leverage',     unit: 'x' },
      { key: 'riskPerTradePercent',   label: 'Risk / Trade',     unit: '%' },
      { key: 'maxDailyLossPercent',   label: 'Daily Loss Limit', unit: '%' },
      { key: 'maxOpenTrades',         label: 'Max Open Trades' },
      { key: 'maxConsecutiveLosses',  label: 'Max Consec. Losses' },
      { key: 'maxPositionUsd',        label: 'Max Position',     unit: 'USD' },
      { key: 'minPositionUsd',        label: 'Min Position',     unit: 'USD' },
    ],
  },
  {
    title: 'Scanner & Filters',
    fields: [
      { key: 'scannerIntervalSeconds',  label: 'Scan Interval',    unit: 's' },
      { key: 'signalExpirationMinutes', label: 'Signal Expiry',    unit: 'm' },
      { key: 'maxSymbolsPerScan',       label: 'Max Symbols' },
      { key: 'minHotScoreForScan',      label: 'Min Hot Score' },
      { key: 'minConfidenceScore',      label: 'Min Confidence' },
      { key: 'minRiskReward',           label: 'Min R/R' },
    ],
  },
  {
    title: 'Strategy: Breakout + Volume',
    description: 'Triggers when price breaks resistance/support with volume confirmation.',
    fields: [
      { key: 'breakoutEnabled',         label: 'Enabled' },
      { key: 'breakoutMinVolumeRatio',  label: 'Min Vol. Ratio',    unit: 'x avg' },
      { key: 'breakoutLookbackPeriod',  label: 'Lookback',          unit: '1h candles' },
      { key: 'breakoutMaxSlPercent',    label: 'Max SL',            unit: '%' },
      { key: 'breakoutTp1Multiplier',   label: 'TP1 Mult.',         unit: 'x risk' },
      { key: 'breakoutTp2Multiplier',   label: 'TP2 Mult.',         unit: 'x risk' },
      { key: 'breakoutMinHotScore',     label: 'Min Hot Score' },
    ],
  },
  {
    title: 'Strategy: Trend Pullback',
    description: 'Enters on pullbacks in an existing trend using EMA & RSI.',
    fields: [
      { key: 'pullbackEnabled',         label: 'Enabled' },
      { key: 'pullbackRsiLongMin',      label: 'RSI Long Min' },
      { key: 'pullbackRsiLongMax',      label: 'RSI Long Max' },
      { key: 'pullbackRsiShortMin',     label: 'RSI Short Min' },
      { key: 'pullbackRsiShortMax',     label: 'RSI Short Max' },
      { key: 'pullbackAtrMultiplier',   label: 'ATR Zone',          unit: 'x ATR' },
      { key: 'pullbackMaxSlPercent',    label: 'Max SL',            unit: '%' },
      { key: 'pullbackMinHotScore',     label: 'Min Hot Score' },
    ],
  },
  {
    title: 'Strategy: Mean Reversion',
    description: 'Fades overextended moves when RSI is extreme and volume declines.',
    fields: [
      { key: 'reversionEnabled',             label: 'Enabled' },
      { key: 'reversionRsiOverbought',        label: 'RSI Overbought (SHORT)' },
      { key: 'reversionRsiOversold',          label: 'RSI Oversold (LONG)' },
      { key: 'reversionVwapDeviationPct',     label: 'VWAP Deviation',  unit: '%' },
      { key: 'reversionVolumeDeclineRatio',   label: 'Vol. Decline',    unit: 'of peak' },
      { key: 'reversionMaxSlPercent',         label: 'Max SL',          unit: '%' },
    ],
  },
];

const BOOLEAN_KEYS = new Set([
  'isPaused', 'enableRealTrading', 'paperTradingEnabled', 'allowAutoLiveExecution',
  'breakoutEnabled', 'pullbackEnabled', 'reversionEnabled',
]);

const inputCls =
  'w-full rounded border border-border bg-transparent px-2.5 py-1.5 text-[12px] text-white outline-none ' +
  'transition focus:border-accent/60 hover:border-white/20 placeholder:text-dim font-mono';

const selectCls =
  'w-full rounded border border-border bg-surface px-2.5 py-1.5 text-[12px] text-white outline-none ' +
  'transition focus:border-accent/60 hover:border-white/20 cursor-pointer appearance-none';

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
    breakoutEnabled: settings.breakoutEnabled ?? true,
    breakoutMinVolumeRatio: settings.breakoutMinVolumeRatio ?? 1.5,
    breakoutLookbackPeriod: settings.breakoutLookbackPeriod ?? 20,
    breakoutMaxSlPercent: settings.breakoutMaxSlPercent ?? 5,
    breakoutTp1Multiplier: settings.breakoutTp1Multiplier ?? 1.5,
    breakoutTp2Multiplier: settings.breakoutTp2Multiplier ?? 2.5,
    breakoutMinHotScore: settings.breakoutMinHotScore ?? 55,
    pullbackEnabled: settings.pullbackEnabled ?? true,
    pullbackRsiLongMin: settings.pullbackRsiLongMin ?? 38,
    pullbackRsiLongMax: settings.pullbackRsiLongMax ?? 58,
    pullbackRsiShortMin: settings.pullbackRsiShortMin ?? 42,
    pullbackRsiShortMax: settings.pullbackRsiShortMax ?? 62,
    pullbackAtrMultiplier: settings.pullbackAtrMultiplier ?? 1.5,
    pullbackMaxSlPercent: settings.pullbackMaxSlPercent ?? 4,
    pullbackMinHotScore: settings.pullbackMinHotScore ?? 40,
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

  const SelectField = ({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) => (
    <div className="relative">
      <select className={selectCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-dim" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  );

  const renderField = (key: keyof SettingsState, label: string, unit?: string) => {
    const value = form[key];
    return (
      <label key={key} className="space-y-1">
        <div className="text-[10px] uppercase tracking-wider text-dim font-medium">
          {label}{unit ? <span className="ml-1 opacity-50 normal-case">({unit})</span> : null}
        </div>
        {key === 'mode' ? (
          <SelectField value={value as string} onChange={(v) => setForm((f) => ({ ...f, [key]: v as 'testnet' | 'live' }))} options={[{ value: 'testnet', label: 'Testnet' }, { value: 'live', label: 'Live' }]} />
        ) : BOOLEAN_KEYS.has(key) ? (
          <SelectField value={String(value)} onChange={(v) => setForm((f) => ({ ...f, [key]: v === 'true' }))} options={[{ value: 'true', label: 'Enabled' }, { value: 'false', label: 'Disabled' }]} />
        ) : (
          <input className={inputCls} type="number" step="any" value={String(value)} onChange={(e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) }))} />
        )}
      </label>
    );
  };

  return (
    <div className="space-y-3">
      {SECTIONS.map((section) => (
        <div key={section.title} className="panel p-4">
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-[12px] font-semibold text-white">{section.title}</span>
            {section.description && <span className="text-[11px] text-dim">{section.description}</span>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.fields.map(({ key, label, unit }) => renderField(key, label, unit))}
          </div>
        </div>
      ))}

      <div className="flex justify-end pt-1">
        <Button
          size="md"
          variant="default"
          disabled={isPending}
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
        >
          {isPending ? 'Saving…' : 'Save Settings'}
        </Button>
      </div>

      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
    </div>
  );
}
