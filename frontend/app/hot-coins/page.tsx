import { fetchApiSafe } from '@/services/api';
import { number } from '@/lib/utils';

function change(v: number) {
  const n = v ?? 0;
  return (
    <span className={`font-mono text-[12px] font-medium ${n > 0 ? 'text-positive' : n < 0 ? 'text-danger' : 'text-dim'}`}>
      {n > 0 ? '+' : ''}{number(n)}%
    </span>
  );
}

function funding(rate: number) {
  const pct = (rate ?? 0) * 100;
  return (
    <span className={`font-mono text-[11px] ${pct > 0.05 ? 'text-danger' : pct < -0.05 ? 'text-positive' : 'text-dim'}`}>
      {number(pct, 4)}%
    </span>
  );
}

function hotScore(v: number) {
  const n = v ?? 0;
  const color = n >= 75 ? 'text-positive' : n >= 60 ? 'text-warning' : 'text-dim';
  const barWidth = Math.min(100, Math.round(n));
  const barColor = n >= 75 ? '#3FB950' : n >= 60 ? '#E3B341' : '#6E7681';
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="h-1 w-16 rounded-full bg-border overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${barWidth}%`, background: barColor }} />
      </div>
      <span className={`font-mono text-[12px] font-semibold ${color}`}>{number(n)}</span>
    </div>
  );
}

export default async function HotCoinsPage() {
  const coins = await fetchApiSafe<any[]>('/hot-coins', []);

  return (
    <div className="panel overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <span className="text-[12px] font-semibold text-white">Market Scanner</span>
        <span className="font-mono text-[11px] text-dim">{coins.length} symbols</span>
      </div>
      <div className="overflow-x-auto">
        <table className="t-table">
          <thead>
            <tr>
              {['#', 'Symbol', 'Price', '24h %', 'Funding', 'Open Int.', 'Volatility', 'Spread', 'Hot Score'].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {coins.slice(0, 50).map((item, i) => (
              <tr key={item.symbol?.symbol ?? item.symbol ?? i}>
                <td className="font-mono text-[11px] text-dim w-8">{i + 1}</td>
                <td className="font-mono font-semibold text-[12px]">{item.symbol?.symbol ?? item.symbol}</td>
                <td className="font-mono text-[12px]">{number(item.price, 4)}</td>
                <td>{change(item.priceChange24h)}</td>
                <td>{funding(item.fundingRate)}</td>
                <td className="font-mono text-[11px] text-dim">{number(item.openInterest, 0)}</td>
                <td className="font-mono text-[11px] text-dim">{number(item.volatility)}%</td>
                <td className="font-mono text-[11px] text-dim">{number(item.spread, 4)}</td>
                <td>{hotScore(item.hotScore)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
