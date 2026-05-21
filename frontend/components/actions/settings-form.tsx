'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../ui/button';
import { ToastContainer } from '../ui/toast';
import { useToast } from '@/hooks/use-toast';
import { clientApiPath } from '@/lib/client-api';

type SettingsState = {
  mode: 'testnet' | 'live';
  enableRealTrading: boolean;
  allowAutoLiveExecution: boolean;
  defaultLeverage: number;
  maxLeverage: number;
  riskPerTradePercent: number;
  maxOpenTrades: number;
  maxHoldingHours: number;
  minPositionUsd: number;
  maxPositionUsd: number;
  scannerIntervalSeconds: number;
  signalExpirationMinutes: number;
  maxSymbolsPerScan: number;
  minHotScoreForScan: number;
  minConfidenceScore: number;
  minRiskReward: number;
  maxSpreadPercent: number;
  minDailyVolumeUsd: number;
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
  pullbackTp1Multiplier: number;
  pullbackTp2Multiplier: number;
  reversionEnabled: boolean;
  reversionRsiOverbought: number;
  reversionRsiOversold: number;
  reversionVwapDeviationPct: number;
  reversionVolumeDeclineRatio: number;
  reversionMaxSlPercent: number;
  trendReclaimEnabled: boolean;
  trendReclaimEmaBufferAtr: number;
  trendReclaimVolumeRatio: number;
  trendReclaimMaxSlPercent: number;
  trendReclaimTp1Multiplier: number;
  trendReclaimTp2Multiplier: number;
  trendReclaimMinHotScore: number;
  rangeBounceEnabled: boolean;
  rangeBounceLookbackPeriod: number;
  rangeBounceProximityAtr: number;
  rangeBounceRsiLongMax: number;
  rangeBounceRsiShortMin: number;
  rangeBounceMaxSlPercent: number;
  rangeBounceTp1Multiplier: number;
  rangeBounceTp2Multiplier: number;
  rangeBounceMinHotScore: number;
  maxConsecutiveLosses: number;
  fixedRoeEnabled: boolean;
  fixedRoeTpPercent: number;
  fixedRoeSlPercent: number;
  voiceNotificationsEnabled: boolean;
};

type Field = { key: keyof SettingsState; label: string; unit?: string; min?: number; max?: number };
type Section = { title: string; description?: string; fields: Field[] };

const SECTIONS: Section[] = [
  {
    title: 'General',
    fields: [
      { key: 'mode',                       label: 'Mode' },
      { key: 'enableRealTrading',          label: 'Real Trading' },
      { key: 'allowAutoLiveExecution',     label: 'Auto-Execute' },
      { key: 'voiceNotificationsEnabled',  label: 'Voice Notifications' },
    ],
  },
  {
    title: 'Risk Management',
    fields: [
      { key: 'defaultLeverage',       label: 'Default Leverage', unit: 'x' },
      { key: 'maxLeverage',           label: 'Max Leverage',     unit: 'x' },
      { key: 'riskPerTradePercent',   label: 'Risk / Trade',     unit: '%' },
      { key: 'maxOpenTrades',           label: 'Max Open Trades' },
      { key: 'maxConsecutiveLosses',   label: 'Max Consecutive Losses', unit: 'per strategy/day' },
      { key: 'maxHoldingHours',         label: 'Max Holding',      unit: 'hours (0=off)' },
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
      { key: 'maxSpreadPercent',        label: 'Max Spread',            unit: '%' },
      { key: 'minDailyVolumeUsd',       label: 'Min 24h Volume',        unit: 'USD' },
    ],
  },
  {
    title: 'Fixed ROE Targets (Fee-Adjusted)',
    description: 'If enabled, SL/TP are calculated to guarantee specific net ROE% after Binance fees.',
    fields: [
      { key: 'fixedRoeEnabled',         label: 'Enabled' },
      { key: 'fixedRoeTpPercent',       label: 'Target Profit ROE', unit: '%' },
      { key: 'fixedRoeSlPercent',       label: 'Stop Loss ROE',     unit: '%' },
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
      { key: 'pullbackAtrMultiplier',   label: 'ATR Zone',          unit: 'x ATR', min: 0.1, max: 10 },
      { key: 'pullbackMaxSlPercent',    label: 'Max SL',            unit: '%' },
      { key: 'pullbackTp1Multiplier',   label: 'TP1 Mult.',         unit: 'x risk' },
      { key: 'pullbackTp2Multiplier',   label: 'TP2 Mult.',         unit: 'x risk' },
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
  {
    title: 'Strategy: Trend Reclaim',
    description: 'Joins strong trends after a clean EMA reclaim with confirming volume.',
    fields: [
      { key: 'trendReclaimEnabled',        label: 'Enabled' },
      { key: 'trendReclaimEmaBufferAtr',   label: 'EMA Buffer',        unit: 'x ATR' },
      { key: 'trendReclaimVolumeRatio',    label: 'Min Vol. Ratio',    unit: 'x avg' },
      { key: 'trendReclaimMaxSlPercent',   label: 'Max SL',            unit: '%' },
      { key: 'trendReclaimTp1Multiplier',  label: 'TP1 Mult.',         unit: 'x risk' },
      { key: 'trendReclaimTp2Multiplier',  label: 'TP2 Mult.',         unit: 'x risk' },
      { key: 'trendReclaimMinHotScore',    label: 'Min Hot Score' },
    ],
  },
  {
    title: 'Strategy: Range Bounce',
    description: 'Trades rejection bounces from 1h support and resistance in calmer conditions.',
    fields: [
      { key: 'rangeBounceEnabled',         label: 'Enabled' },
      { key: 'rangeBounceLookbackPeriod',  label: 'Lookback',          unit: '1h candles' },
      { key: 'rangeBounceProximityAtr',    label: 'Level Proximity',   unit: 'x ATR' },
      { key: 'rangeBounceRsiLongMax',      label: 'RSI Long Max' },
      { key: 'rangeBounceRsiShortMin',     label: 'RSI Short Min' },
      { key: 'rangeBounceMaxSlPercent',    label: 'Max SL',            unit: '%' },
      { key: 'rangeBounceTp1Multiplier',   label: 'TP1 Mult.',         unit: 'x risk' },
      { key: 'rangeBounceTp2Multiplier',   label: 'TP2 Mult.',         unit: 'x risk' },
      { key: 'rangeBounceMinHotScore',     label: 'Min Hot Score' },
    ],
  },
];

const BOOLEAN_KEYS = new Set([
  'enableRealTrading', 'allowAutoLiveExecution', 'voiceNotificationsEnabled',
  'breakoutEnabled', 'pullbackEnabled', 'reversionEnabled', 'trendReclaimEnabled', 'rangeBounceEnabled',
  'fixedRoeEnabled',
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
    enableRealTrading: settings.enableRealTrading ?? settings.realTradingEnabled ?? false,
    allowAutoLiveExecution: settings.allowAutoLiveExecution ?? (settings.requireDashboardConfirmation === false),
    defaultLeverage: settings.defaultLeverage ?? 3,
    maxLeverage: settings.maxLeverage ?? 5,
    riskPerTradePercent: settings.riskPerTradePercent ?? 1,
    maxOpenTrades: settings.maxOpenTrades ?? 2,
    maxConsecutiveLosses: settings.maxConsecutiveLosses ?? 5,
    maxHoldingHours: settings.maxHoldingHours ?? 0,
    maxPositionUsd: settings.maxPositionUsd ?? 3,
    minPositionUsd: settings.minPositionUsd ?? 1,
    minConfidenceScore: settings.minConfidenceScore ?? 70,
    minRiskReward: settings.minRiskReward ?? 1.5,
    scannerIntervalSeconds: settings.scannerIntervalSeconds ?? 60,
    signalExpirationMinutes: settings.signalExpirationMinutes ?? 15,
    maxSymbolsPerScan: settings.maxSymbolsPerScan ?? 50,
    minHotScoreForScan: settings.minHotScoreForScan ?? 55,
    maxSpreadPercent: settings.maxSpreadPercent ?? 0.4,
    minDailyVolumeUsd: settings.minDailyVolumeUsd ?? 5000000,
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
    pullbackTp1Multiplier: settings.pullbackTp1Multiplier ?? 1.5,
    pullbackTp2Multiplier: settings.pullbackTp2Multiplier ?? 2.5,
    pullbackMinHotScore: settings.pullbackMinHotScore ?? 40,
    reversionEnabled: settings.reversionEnabled ?? true,
    reversionRsiOverbought: settings.reversionRsiOverbought ?? 75,
    reversionRsiOversold: settings.reversionRsiOversold ?? 25,
    reversionVwapDeviationPct: settings.reversionVwapDeviationPct ?? 3,
    reversionVolumeDeclineRatio: settings.reversionVolumeDeclineRatio ?? 0.6,
    reversionMaxSlPercent: settings.reversionMaxSlPercent ?? 5,
    trendReclaimEnabled: settings.trendReclaimEnabled ?? true,
    trendReclaimEmaBufferAtr: settings.trendReclaimEmaBufferAtr ?? 0.35,
    trendReclaimVolumeRatio: settings.trendReclaimVolumeRatio ?? 1.1,
    trendReclaimMaxSlPercent: settings.trendReclaimMaxSlPercent ?? 3.5,
    trendReclaimTp1Multiplier: settings.trendReclaimTp1Multiplier ?? 1.4,
    trendReclaimTp2Multiplier: settings.trendReclaimTp2Multiplier ?? 2.3,
    trendReclaimMinHotScore: settings.trendReclaimMinHotScore ?? 50,
    rangeBounceEnabled: settings.rangeBounceEnabled ?? true,
    rangeBounceLookbackPeriod: settings.rangeBounceLookbackPeriod ?? 24,
    rangeBounceProximityAtr: settings.rangeBounceProximityAtr ?? 0.8,
    rangeBounceRsiLongMax: settings.rangeBounceRsiLongMax ?? 45,
    rangeBounceRsiShortMin: settings.rangeBounceRsiShortMin ?? 55,
    rangeBounceMaxSlPercent: settings.rangeBounceMaxSlPercent ?? 3.2,
    rangeBounceTp1Multiplier: settings.rangeBounceTp1Multiplier ?? 1.3,
    rangeBounceTp2Multiplier: settings.rangeBounceTp2Multiplier ?? 2,
    rangeBounceMinHotScore: settings.rangeBounceMinHotScore ?? 35,
    fixedRoeEnabled: settings.fixedRoeEnabled ?? false,
    fixedRoeTpPercent: settings.fixedRoeTpPercent ?? 20,
    fixedRoeSlPercent: settings.fixedRoeSlPercent ?? 20,
    voiceNotificationsEnabled: settings.voiceNotificationsEnabled ?? true,
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

  const renderField = (key: keyof SettingsState, label: string, unit?: string, min?: number, max?: number) => {
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
          <input className={inputCls} type="number" step="any" min={min} max={max} value={String(value)} onChange={(e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) }))} />
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
            {section.fields.map(({ key, label, unit, min, max }) => renderField(key, label, unit, min, max))}
          </div>
        </div>
      ))}

      <div className="flex justify-end pt-1">
        <Button
          size="md"
          variant="default"
          disabled={isPending}
          onClick={async () => {
            if (form.pullbackAtrMultiplier > 10) {
              toast.error('Pullback ATR Zone must be 10 or less');
              return;
            }

            setPending(true);
            try {
              const res = await fetch(clientApiPath('/settings'), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
                credentials: 'include',
              });
              if (!res.ok) {
                const body = await res.json().catch(() => ({})) as { message?: string | string[] };
                const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
                toast.error(message ?? `Save failed (${res.status})`);
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
