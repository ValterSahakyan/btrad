import { DataTable } from '@/components/dashboard/data-table';
import { fetchApi } from '@/services/api';
import { number } from '@/lib/utils';

export default async function HotCoinsPage() {
  const hotCoins = await fetchApi<any[]>('/hot-coins');

  return (
    <DataTable
      title="Hot Coins"
      headers={['Symbol', 'Price', '24h %', 'Funding', 'Open Interest', 'Volatility', 'Spread', 'Hot Score']}
      rows={hotCoins.slice(0, 50).map((item) => [
        item.symbol.symbol,
        number(item.price, 4),
        number(item.priceChange24h),
        number(item.fundingRate, 4),
        number(item.openInterest, 2),
        number(item.volatility),
        number(item.spread),
        number(item.hotScore),
      ])}
    />
  );
}
