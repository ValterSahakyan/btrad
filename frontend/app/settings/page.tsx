import { ActionButton } from '@/components/actions/action-button';
import { SettingsForm } from '@/components/actions/settings-form';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { fetchApiSafe } from '@/services/api';

export default async function SettingsPage() {
  const settings = await fetchApiSafe<any>('/settings', null);

  if (!settings) {
    return (
      <Card>
        <div className="mb-2 text-lg font-semibold">Backend Unavailable</div>
        <p className="text-sm text-muted">Cannot reach the API server. Start the backend and refresh.</p>
      </Card>
    );
  }

  const isLive = settings.mode === 'live';
  const realOn = settings.enableRealTrading ?? settings.realTradingEnabled;
  const paperOn = settings.paperTradingEnabled !== false;
  const autoExecute = settings.allowAutoLiveExecution ?? (settings.requireDashboardConfirmation === false);

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {realOn && autoExecute && (
        <div className="xl:col-span-2 flex items-start gap-3 rounded-2xl border border-danger/40 bg-danger/10 px-5 py-4 text-sm text-danger">
          <span className="text-lg leading-none">!</span>
          <div>
            <span className="font-semibold">Auto-execute and real trading are both ON.</span>
            {' '}New signals will place real Binance Futures orders without manual confirmation.
          </div>
        </div>
      )}

      <Card>
        <div className="mb-4 text-lg font-semibold">Current Settings</div>
        <div className="grid gap-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted">Mode</span>
            <Badge tone={isLive ? 'positive' : 'warning'}>{settings.mode}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Bot Status</span>
            <Badge tone={settings.isPaused ? 'danger' : 'positive'}>{settings.isPaused ? 'Paused' : 'Running'}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Real Trading</span>
            <Badge tone={realOn ? 'positive' : 'danger'}>{realOn ? 'Enabled' : 'Disabled'}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Paper Trading</span>
            <Badge tone={paperOn ? 'warning' : 'neutral'}>{paperOn ? 'Enabled' : 'Disabled'}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">ALLOW_AUTO_LIVE_EXECUTION</span>
            <Badge tone={autoExecute ? 'danger' : 'warning'}>{autoExecute ? 'Auto-Execute' : 'Manual Approval'}</Badge>
          </div>
          <hr className="border-white/10" />
          <div className="flex items-center justify-between">
            <span className="text-muted">Default Leverage</span>
            <span className="text-white">{settings.defaultLeverage}x</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Risk Per Trade</span>
            <span className="text-white">{settings.riskPerTradePercent}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Max Daily Loss</span>
            <span className="text-white">{settings.maxDailyLossPercent}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Max Open Trades</span>
            <span className="text-white">{settings.maxOpenTrades}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Max Position Size</span>
            <span className="text-white">${settings.maxPositionUsd ?? 3}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Min Confidence</span>
            <span className="text-white">{settings.minConfidenceScore}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Min R/R</span>
            <span className="text-white">{settings.minRiskReward}</span>
          </div>
          <hr className="border-white/10" />
          <div className="font-medium text-white">Active Strategies</div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Breakout + Volume</span>
            <Badge tone={settings.breakoutEnabled !== false ? 'positive' : 'neutral'}>{settings.breakoutEnabled !== false ? 'ON' : 'OFF'}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Trend Pullback</span>
            <Badge tone={settings.pullbackEnabled !== false ? 'positive' : 'neutral'}>{settings.pullbackEnabled !== false ? 'ON' : 'OFF'}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Mean Reversion</span>
            <Badge tone={settings.reversionEnabled !== false ? 'positive' : 'neutral'}>{settings.reversionEnabled !== false ? 'ON' : 'OFF'}</Badge>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-4 text-lg font-semibold">Bot Controls</div>
        <div className="space-y-4 text-sm text-muted">
          <p>Start will unpause the bot, sync symbols, and run one scanner cycle immediately.</p>
          <p>Stop will pause the bot so scheduled work no longer creates new signals or orders.</p>
          <p>Do not enable Binance withdrawal permissions on these API keys.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <ActionButton
              label="Start Bot"
              path="/bot/start"
              confirmMessage="Start the bot, sync symbols, and run the scanner now?"
            />
            <ActionButton
              label="Stop Bot"
              path="/bot/stop"
              variant="danger"
              confirmMessage="Stop the bot now?"
            />
          </div>
        </div>
      </Card>

      <SettingsForm settings={settings} />
    </div>
  );
}
