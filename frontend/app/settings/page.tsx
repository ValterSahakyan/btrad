import { ActionButton } from '@/components/actions/action-button';
import { SettingsForm } from '@/components/actions/settings-form';
import { Card } from '@/components/ui/card';
import { fetchApi } from '@/services/api';

export default async function SettingsPage() {
  const settings = await fetchApi<any>('/settings');

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <div className="mb-4 text-lg font-semibold">Current Settings</div>
        <div className="grid gap-3 text-sm text-muted">
          <div>Mode: <span className="text-white">{settings.mode}</span></div>
          <div>Paused: <span className="text-white">{String(settings.isPaused)}</span></div>
          <div>Real Trading Enabled: <span className="text-white">{String(settings.realTradingEnabled)}</span></div>
          <div>Require Dashboard Confirmation: <span className="text-white">{String(settings.requireDashboardConfirmation)}</span></div>
          <div>Paper Trading Enabled: <span className="text-white">{String(settings.paperTradingEnabled)}</span></div>
          <div>Default Leverage: <span className="text-white">{settings.defaultLeverage}x</span></div>
          <div>Max Leverage: <span className="text-white">{settings.maxLeverage}x</span></div>
          <div>Risk Per Trade: <span className="text-white">{settings.riskPerTradePercent}%</span></div>
          <div>Max Daily Loss: <span className="text-white">{settings.maxDailyLossPercent}%</span></div>
          <div>Max Open Trades: <span className="text-white">{settings.maxOpenTrades}</span></div>
          <div>Max Consecutive Losses: <span className="text-white">{settings.maxConsecutiveLosses}</span></div>
          <div>Min Confidence Score: <span className="text-white">{settings.minConfidenceScore}</span></div>
          <div>Min Risk Reward: <span className="text-white">{settings.minRiskReward}</span></div>
          <div>Scanner Interval: <span className="text-white">{settings.scannerIntervalSeconds}s</span></div>
          <div>Signal Expiration: <span className="text-white">{settings.signalExpirationMinutes}m</span></div>
        </div>
      </Card>
      <Card>
        <div className="mb-4 text-lg font-semibold">Bot Controls</div>
        <div className="space-y-3 text-sm text-muted">
          <p>All trading settings are stored in the database and take effect immediately — no server restart required.</p>
          <p>Keep <strong>Real Trading Enabled</strong> off and validate on testnet and paper mode before enabling live execution.</p>
          <p>Do not enable withdrawal permission on Binance API keys.</p>
          <div className="flex flex-wrap gap-2">
            <ActionButton label="Pause Bot" path="/bot/pause" variant="danger" />
            <ActionButton label="Resume Bot" path="/bot/resume" />
            <ActionButton label="Sync Symbols" path="/bot/sync-symbols" variant="secondary" />
            <ActionButton label="Run Scanner" path="/bot/run-scanner" variant="secondary" />
          </div>
        </div>
      </Card>
      <SettingsForm settings={settings} />
    </div>
  );
}
