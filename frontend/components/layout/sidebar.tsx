'use client';

import type { Route } from 'next';
import type { ComponentType } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, ChartCandlestick, Cog, Flame, LineChart, Logs, Radar, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems: Array<{ href: Route; label: string; icon: ComponentType<{ size?: number }> }> = [
  { href: '/overview', label: 'Overview', icon: Activity },
  { href: '/hot-coins', label: 'Hot Coins', icon: Flame },
  { href: '/signals', label: 'Signals', icon: Radar },
  { href: '/trades', label: 'Trades', icon: Wallet },
  { href: '/performance', label: 'Performance', icon: LineChart },
  { href: '/settings', label: 'Settings', icon: Cog },
  { href: '/logs', label: 'Logs', icon: Logs },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="app-sidebar w-full max-w-72 rounded-[28px] border border-white/10 bg-black/20 p-4 backdrop-blur">
      <div className="app-sidebar-brand mb-6 rounded-2xl bg-white/5 p-4">
        <div className="mb-2 flex items-center gap-3">
          <div className="rounded-2xl bg-accent/15 p-2 text-accent">
            <ChartCandlestick size={22} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-muted">PerpScout AI</div>
            <div className="text-lg font-semibold">Futures Console</div>
          </div>
        </div>
        <p className="text-sm text-muted">Automated Binance USDⓈ-M Futures bot — scanning, signals, live execution, and risk controls.</p>
      </div>
      <nav className="app-nav space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'app-nav-link flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition',
                isActive ? 'bg-accent text-surface' : 'bg-white/5 text-white hover:bg-white/10',
              )}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
