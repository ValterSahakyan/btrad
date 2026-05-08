'use client';

import type { Route } from 'next';
import type { ComponentType } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BarChart2,
  ChevronRight,
  Flame,
  List,
  Radio,
  Settings,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems: Array<{ href: Route; label: string; icon: ComponentType<{ size?: number; strokeWidth?: number }> }> = [
  { href: '/overview',     label: 'Overview',     icon: Activity },
  { href: '/hot-coins',    label: 'Scanner',      icon: Flame },
  { href: '/signals',      label: 'Signals',      icon: Radio },
  { href: '/trades',       label: 'Trades',       icon: TrendingUp },
  { href: '/performance',  label: 'Performance',  icon: BarChart2 },
  { href: '/settings',     label: 'Settings',     icon: Settings },
  { href: '/logs',         label: 'Logs',         icon: List },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="app-sidebar">
      {/* Brand */}
      <div className="px-4 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded bg-accent/15 flex items-center justify-center">
            <ChevronRight size={14} className="text-accent" strokeWidth={2.5} />
          </div>
          <div>
            <div className="text-[13px] font-semibold text-white tracking-wide">BTRAD</div>
            <div className="text-[10px] text-dim uppercase tracking-widest">Futures</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3">
        <div className="px-3 mb-1.5 text-[10px] uppercase tracking-widest text-dim font-medium">Navigation</div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== '/overview' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn('nav-link', isActive && 'active')}
            >
              <Icon size={14} strokeWidth={isActive ? 2.5 : 2} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <div className="text-[10px] text-dim">Binance USDⓈ-M Futures</div>
        <div className="text-[10px] text-dim opacity-50 mt-0.5">PerpScout AI v1.0</div>
      </div>
    </aside>
  );
}
