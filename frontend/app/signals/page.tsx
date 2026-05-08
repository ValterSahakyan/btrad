import { ActionButton } from '@/components/actions/action-button';
import { DataTable } from '@/components/dashboard/data-table';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { number } from '@/lib/utils';
import { fetchApiSafe } from '@/services/api';

const ACTIONABLE = new Set(['active', 'pending']);

function dirBadge(direction: string) {
  return (
    <span className={direction === 'LONG' ? 'font-semibold text-positive' : 'font-semibold text-danger'}>
      {direction}
    </span>
  );
}

function signalStatusBadge(status: string) {
  if (status === 'active') return <Badge tone="positive">{status}</Badge>;
  if (status === 'pending') return <Badge tone="warning">{status}</Badge>;
  if (status === 'paper_opened') return <Badge tone="warning">paper open</Badge>;
  if (status === 'live_executed') return <Badge tone="positive">live open</Badge>;
  if (status === 'approved') return <Badge tone="warning">approved</Badge>;
  if (status === 'expired' || status === 'skipped' || status === 'cancelled') return <Badge tone="neutral">{status}</Badge>;
  if (status === 'failed') return <Badge tone="danger">failed</Badge>;
  return <Badge tone="neutral">{status}</Badge>;
}

function scoreCell(score: number | null | undefined) {
  const v = score ?? 0;
  const tone = v >= 80 ? 'text-positive font-semibold' : v >= 65 ? 'text-yellow-300' : 'text-muted';
  return <span className={tone}>{number(v)}</span>;
}

export default async function SignalsPage() {
  const [signals, status] = await Promise.all([
    fetchApiSafe<any[]>('/signals', []),
    fetchApiSafe<any>('/status', {
      realTradingEnabled: false,
      paperTradingEnabled: true,
      mode: 'testnet',
      requireDashboardConfirmation: true,
      executionMode: 'signal_only',
    }),
  ]);

  const liveEnabled = status.realTradingEnabled && status.mode === 'live';
  const paperEnabled = status.paperTradingEnabled !== false;
  const autoExecute = status.requireDashboardConfirmation === false && liveEnabled;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Signal Controls</div>
            <div className="mt-1 text-sm text-muted">
              {autoExecute
                ? 'Live auto-execution is on. New qualifying signals can place real Binance orders automatically.'
                : liveEnabled
                  ? 'Live trading is enabled. Click Execute Live to place a real Binance Futures order.'
                  : paperEnabled
                    ? 'Paper trading mode is available. Click Open Paper to simulate a trade without touching Binance.'
                    : 'Signal-only mode is active. Signals can be reviewed, skipped, or left untouched.'}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={liveEnabled ? 'positive' : 'neutral'}>
              {liveEnabled ? 'Live Mode' : 'Testnet Mode'}
            </Badge>
            <Badge tone={status.realTradingEnabled ? 'positive' : 'danger'}>
              {status.realTradingEnabled ? 'Real Trading ON' : 'Real Trading OFF'}
            </Badge>
            <Badge tone={paperEnabled ? 'warning' : 'neutral'}>
              {paperEnabled ? 'Paper Trading ON' : 'Paper Trading OFF'}
            </Badge>
            {autoExecute && <Badge tone="danger">Auto-Execute ON</Badge>}
            <ActionButton
              label="Clear Inactive Signals"
              path="/signals/cleanup"
              body={{ olderThanDays: 0 }}
              variant="secondary"
              confirmMessage="Delete skipped, expired, failed, and cancelled signals that have no linked trades?"
              successMessage="Inactive signals cleared"
            />
          </div>
        </div>
        <div className="mt-3 text-xs text-muted">
          Cleanup removes skipped, expired, failed, and cancelled signals that have no linked trades.
        </div>
      </Card>
      <DataTable
        title="Signals"
        headers={['Symbol', 'Direction', 'Strategy', 'Score', 'Entry', 'SL', 'TP1', 'TP2', 'R/R', 'Lev', 'Status', 'Actions']}
        rows={signals.map((signal) => {
          const canAct = ACTIONABLE.has(signal.status);
          return [
            <span key="sym" className="font-medium">{signal.symbol?.symbol ?? signal.symbol}</span>,
            dirBadge(signal.direction),
            <span key="strat" className="text-xs text-muted">{signal.strategy}</span>,
            scoreCell(signal.confidenceScore),
            number(signal.entryPrice, 4),
            <span key="sl" className="text-danger">{number(signal.stopLoss, 4)}</span>,
            <span key="tp1" className="text-positive">{number(signal.takeProfit1, 4)}</span>,
            <span key="tp2" className="text-positive">{number(signal.takeProfit2, 4)}</span>,
            number(signal.riskReward),
            <span key="lev" className="text-muted">{signal.leverage}x</span>,
            signalStatusBadge(signal.status),
            <div key={signal.id} className="flex flex-wrap gap-2">
              <ActionButton
                label="Execute Live"
                path={`/signals/${signal.id}/approve-live`}
                disabled={!canAct || !liveEnabled}
                confirmMessage="This will place a real Binance Futures order. Continue?"
              />
              <ActionButton
                label="Open Paper"
                path={`/signals/${signal.id}/approve-paper`}
                variant="secondary"
                disabled={!canAct || !paperEnabled || autoExecute}
              />
              <ActionButton
                label="Skip"
                path={`/signals/${signal.id}/skip`}
                variant="secondary"
                disabled={!canAct}
              />
            </div>,
          ];
        })}
      />
    </div>
  );
}
