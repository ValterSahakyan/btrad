import { DataTable } from '@/components/dashboard/data-table';
import { fetchApiSafe } from '@/services/api';
import { number } from '@/lib/utils';

function change24hCell(pct: number) {
  const v = pct ?? 0;
  return (
    <span className={v > 0 ? 'text-positive font-semibold' : v < 0 ? 'text-danger font-semibold' : 'text-muted'}>
      {v > 0 ? '+' : ''}{number(v)}%
    </span>
  );
}

function hotScoreCell(score: number) {
  const v = score ?? 0;
  const tone = v >= 75 ? 'text-positive font-semibold' : v >= 60 ? 'text-yellow-300' : 'text-muted';
  return <span className={tone}>{number(v)}</span>;
}

function fundingCell(rate: number) {
  const v = rate ?? 0;
  const pct = v * 100;
  return (
    <span className={pct > 0.05 ? 'text-danger' : pct < -0.05 ? 'text-positive' : 'text-muted'}>
      {number(pct, 4)}%
    </span>
  );
}

export default async function HotCoinsPage() {
  const hotCoins = await fetchApiSafe<any[]>('/hot-coins', []);

  return (
    <DataTable
      title="Hot Coins"
      headers={['#', 'Symbol', 'Price', '24h %', 'Funding', 'Open Interest', 'Volatility', 'Spread', 'Hot Score']}
      rows={hotCoins.slice(0, 50).map((item, i) => [
        <span key="rank" className="text-muted">{i + 1}</span>,
        <span key="sym" className="font-medium">{item.symbol?.symbol ?? item.symbol}</span>,
        number(item.price, 4),
        change24hCell(item.priceChange24h),
        fundingCell(item.fundingRate),
        number(item.openInterest, 0),
        number(item.volatility),
        number(item.spread),
        hotScoreCell(item.hotScore),
      ])}
    />
  );
}
