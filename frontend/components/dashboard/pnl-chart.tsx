'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type DayPnl = { createdAt: string; pnl: number | null };

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const val: number = payload[0].value ?? 0;
  return (
    <div className="rounded border border-border bg-surface px-3 py-2 text-[11px] shadow-xl">
      <div className="text-dim mb-1">{label}</div>
      <div className={`font-mono font-semibold ${val >= 0 ? 'text-positive' : 'text-danger'}`}>
        {val >= 0 ? '+' : ''}${val.toFixed(2)}
      </div>
    </div>
  );
}

export function PnlChart({ data }: { data: DayPnl[] }) {
  return (
    <div className="panel p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-white">Daily PnL</span>
        <span className="text-[10px] text-dim uppercase tracking-wider">USD</span>
      </div>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barSize={12}>
            <CartesianGrid stroke="#1C2333" vertical={false} />
            <XAxis
              dataKey="createdAt"
              tick={{ fill: '#6E7681', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#6E7681', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${v}`}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
              {data.map((entry, i) => (
                <Cell key={i} fill={(entry.pnl ?? 0) >= 0 ? '#3FB950' : '#F85149'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
