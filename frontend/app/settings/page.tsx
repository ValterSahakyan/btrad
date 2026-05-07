import { ActionButton } from '@/components/actions/action-button';
import { SettingsForm } from '@/components/actions/settings-form';
import { Card } from '@/components/ui/card';
import { fetchApiSafe } from '@/services/api';

export default async function SettingsPage() {
  const settings = await fetchApiSafe<any>('/settings', null);

  if (!settings) {
    return (
      <Card>
        <div className="text-lg font-semibold mb-2">Backend Unavailable</div>
        <p className="text-sm text-muted">Cannot reach the API server. Start the backend and refresh.</p>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <div className="mb-4 text-lg font-semibold">Current Settings</div>
        <div className="grid gap-3 text-sm text-muted">
          <div>Mode: <span className="text-white">{settings.mode}</span></div>
          <div>Paused: <span className="text-white">{String(settings.isPaused)}</span></div>
          <div>Real Trading: <span className="text-white">{String(settings.realTradingEnabled)}</span></div>
          <div>Paper Trading: <span className="text-white">{String(settings.paperTradingEnabled)}</span></div>
          <div>Auto-Execute: <span className="text-white">{settings.requireDashboardConfirmation ? 'Manual approval' : 'Auto (no confirmation)'}</span></div>
          <div>Default Leverage: <span className="text-white">{settings.defaultLeverage}x</span></div>
          <div>Risk Per Trade: <span className="text-white">{settings.riskPerTradePercent}%</span></div>
          <div>Max Daily Loss: <span className="text-white">{settings.maxDailyLossPercent}%</span></div>
          <div>Max Open Trades: <span className="text-white">{settings.maxOpenTrades}</span></div>
          <div>Min Confidence: <span className="text-white">{settings.minConfidenceScore}</span></div>
          <div>Min R/R: <span className="text-white">{settings.minRiskReward}</span></div>
          <hr className="border-white/10" />
          <div className="font-medium text-white">Active Strategies</div>
          <div>Breakout + Volume: <span className="text-white">{settings.breakoutEnabled !== false ? 'ON' : 'OFF'}</span></div>
          <div>Trend Pullback: <span className="text-white">{settings.pullbackEnabled !== false ? 'ON' : 'OFF'}</span></div>
          <div>Mean Reversion: <span className="text-white">{settings.reversionEnabled !== false ? 'ON' : 'OFF'}</span></div>
        </div>
      </Card>

      <Card>
        <div className="mb-4 text-lg font-semibold">Bot Controls</div>
        <div className="space-y-3 text-sm text-muted">
          <p>All settings are stored in the database and take effect on the next scanner run — no restart required.</p>
          <p>Keep <strong>Real Trading Enabled</strong> off and validate on testnet first.</p>
          <p>Do not enable withdrawal permissions on Binance API keys.</p>
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
