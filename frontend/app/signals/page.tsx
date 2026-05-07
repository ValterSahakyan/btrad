import { DataTable } from '@/components/dashboard/data-table';
import { ActionButton } from '@/components/actions/action-button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { fetchApi } from '@/services/api';
import { number } from '@/lib/utils';

export default async function SignalsPage() {
  const [signals, status] = await Promise.all([fetchApi<any[]>('/signals'), fetchApi<any>('/status')]);

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Signal Approval Controls</div>
            <div className="text-sm text-muted">Live approval stays disabled unless environment safeguards and server configuration explicitly permit it.</div>
          </div>
          <div className="flex gap-2">
            <Badge tone="warning">Min confidence enforced</Badge>
            <Badge tone={status.realTradingEnabled ? 'danger' : 'positive'}>
              {status.realTradingEnabled ? 'Live Env Enabled' : 'Live Env Disabled'}
            </Badge>
          </div>
        </div>
      </Card>
      <DataTable
        title="Signals"
        headers={['Symbol', 'Direction', 'Strategy', 'Score', 'Entry', 'SL', 'TP1', 'TP2', 'R/R', 'Leverage', 'Status', 'Actions']}
        rows={signals.map((signal) => [
          signal.symbol.symbol,
          signal.direction,
          signal.strategy,
          number(signal.confidenceScore),
          number(signal.entryPrice, 4),
          number(signal.stopLoss, 4),
          number(signal.takeProfit1, 4),
          number(signal.takeProfit2, 4),
          number(signal.riskReward),
          signal.leverage,
          signal.status,
          <div key={signal.id} className="flex flex-wrap gap-2">
            <ActionButton label="Approve Paper" path={`/signals/${signal.id}/approve-paper`} />
            <ActionButton
              label="Approve Live"
              path={`/signals/${signal.id}/approve-live`}
              variant="danger"
              disabled
              confirmMessage="Live futures trading is risky. This action will place a real Binance Futures order."
            />
            <ActionButton label="Skip" path={`/signals/${signal.id}/skip`} variant="secondary" />
          </div>,
        ])}
      />
    </div>
  );
}
