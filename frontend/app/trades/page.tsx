import { DataTable } from '@/components/dashboard/data-table';
import { fetchApi } from '@/services/api';
import { currency, number } from '@/lib/utils';

export default async function TradesPage() {
  const trades = await fetchApi<any[]>('/trades');

  return (
    <DataTable
      title="Trades"
      headers={['Symbol', 'Direction', 'Mode', 'Entry', 'Exit', 'Qty', 'Leverage', 'PnL', 'PnL %', 'Status']}
      rows={trades.map((trade) => [
        trade.symbol,
        trade.direction,
        String(trade.status).startsWith('paper') ? 'Paper' : 'Live',
        number(trade.entryPrice, 4),
        number(trade.exitPrice, 4),
        number(trade.quantity, 4),
        trade.leverage,
        currency(trade.pnl),
        number(trade.pnlPercent),
        trade.status,
      ])}
    />
  );
}
