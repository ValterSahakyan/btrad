'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../ui/card';

export function PnlChart({ data }: { data: Array<{ createdAt: string; pnl: number | null }> }) {
  return (
    <Card className="h-[320px]">
      <div className="mb-4 text-lg font-semibold">Daily PnL</div>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="pnlFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.6} />
              <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
          <XAxis dataKey="createdAt" tick={{ fill: '#7c8aa5', fontSize: 12 }} />
          <YAxis tick={{ fill: '#7c8aa5', fontSize: 12 }} />
          <Tooltip />
          <Area type="monotone" dataKey="pnl" stroke="#2dd4bf" fill="url(#pnlFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}
