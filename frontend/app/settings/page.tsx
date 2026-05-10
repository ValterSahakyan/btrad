import { ActionButton } from '@/components/actions/action-button';
import { SettingsForm } from '@/components/actions/settings-form';
import { Badge } from '@/components/ui/badge';
import { fetchApiSafe } from '@/services/api';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 py-2 last:border-none">
      <span className="text-[11px] text-dim">{label}</span>
      <div className="text-[12px]">{children}</div>
    </div>
  );
}

export default async function SettingsPage() {
  const settings = await fetchApiSafe<any>('/settings', null);

  if (!settings) {
    return (
      <div className="panel p-6">
        <div className="mb-1 text-[13px] font-semibold text-white">Backend Unavailable</div>
        <p className="text-[12px] text-dim">Cannot reach the API server. Start the backend and refresh.</p>
      </div>
    );
  }

  const isLive = settings.mode === 'live';
  const realOn = settings.enableRealTrading ?? settings.realTradingEnabled;
  const autoExec = settings.allowAutoLiveExecution ?? (settings.requireDashboardConfirmation === false);

  return (
    <div className="space-y-4">
      {realOn && autoExec && (
        <div className="flex items-start gap-3 rounded border border-danger/25 bg-danger/5 px-4 py-3 text-[12px] text-danger">
          <span className="font-mono font-bold">!</span>
          <span>
            <span className="font-semibold">Auto-execute and real trading are both ON.</span>{' '}
            New qualifying signals will place live Binance Futures orders without confirmation.
          </span>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
        <div className="space-y-3">
          <div className="panel p-4">
            <div className="mb-3 text-[11px] font-medium uppercase tracking-widest text-dim">Bot State</div>
            <Row label="Mode">
              <Badge tone={isLive ? 'positive' : 'warning'}>{settings.mode}</Badge>
            </Row>
            <Row label="Status">
              <Badge tone="positive">Running</Badge>
            </Row>
            <Row label="Real Trading">
              <Badge tone={realOn ? 'positive' : 'danger'}>{realOn ? 'ON' : 'OFF'}</Badge>
            </Row>
            <Row label="Execution">
              <Badge tone={autoExec ? 'danger' : 'warning'}>{autoExec ? 'Auto' : 'Manual'}</Badge>
            </Row>
          </div>

          <div className="panel p-4">
            <div className="mb-3 text-[11px] font-medium uppercase tracking-widest text-dim">Risk Limits</div>
            <Row label="Leverage">
              <span className="font-mono">
                {settings.defaultLeverage}x / {settings.maxLeverage}x max
              </span>
            </Row>
            <Row label="Risk / Trade">
              <span className="font-mono">{settings.riskPerTradePercent}%</span>
            </Row>
            <Row label="Daily Loss Limit">
              <span className="font-mono">{settings.maxDailyLossPercent}%</span>
            </Row>
            <Row label="Max Open Trades">
              <span className="font-mono">{settings.maxOpenTrades}</span>
            </Row>
            <Row label="Max Holding">
              <span className="font-mono">{settings.maxHoldingHours > 0 ? `${settings.maxHoldingHours}h` : 'OFF'}</span>
            </Row>
            <Row label="Position Size">
              <span className="font-mono">
                ${settings.minPositionUsd} - ${settings.maxPositionUsd}
              </span>
            </Row>
            <Row label="Min Confidence">
              <span className="font-mono">{settings.minConfidenceScore}</span>
            </Row>
            <Row label="Min R/R">
              <span className="font-mono">{settings.minRiskReward}</span>
            </Row>
          </div>

          <div className="panel p-4">
            <div className="mb-3 text-[11px] font-medium uppercase tracking-widest text-dim">Strategies</div>
            <Row label="Breakout + Volume">
              <Badge tone={settings.breakoutEnabled !== false ? 'positive' : 'neutral'}>
                {settings.breakoutEnabled !== false ? 'ON' : 'OFF'}
              </Badge>
            </Row>
            <Row label="Trend Pullback">
              <Badge tone={settings.pullbackEnabled !== false ? 'positive' : 'neutral'}>
                {settings.pullbackEnabled !== false ? 'ON' : 'OFF'}
              </Badge>
            </Row>
            <Row label="Mean Reversion">
              <Badge tone={settings.reversionEnabled !== false ? 'positive' : 'neutral'}>
                {settings.reversionEnabled !== false ? 'ON' : 'OFF'}
              </Badge>
            </Row>
          </div>

          <div className="panel p-4">
            <div className="mb-3 text-[11px] font-medium uppercase tracking-widest text-dim">Controls</div>
            <p className="mb-3 text-[11px] leading-relaxed text-dim">
              Start syncs symbols and runs one scanner cycle immediately.
            </p>
            <div className="flex gap-2">
              <ActionButton
                label="Start Bot"
                path="/bot/start"
                variant="default"
                size="sm"
                confirmTitle="Start Bot"
                confirmMessage="Sync symbols from Binance and run one scanner cycle immediately?"
              />
            </div>
          </div>
        </div>

        <SettingsForm settings={settings} />
      </div>
    </div>
  );
}
