'use client';

import type { Route } from 'next';
import type { ComponentType } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Activity,
  BarChart2,
  ChevronRight,
  Flame,
  List,
  LogOut,
  Radio,
  Settings,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { clientApiPath } from '@/lib/client-api';

const navItems: Array<{ href: Route; label: string; icon: ComponentType<{ size?: number; strokeWidth?: number }> }> = [
  { href: '/overview', label: 'Overview', icon: Activity },
  { href: '/hot-coins', label: 'Scanner', icon: Flame },
  { href: '/signals', label: 'Signals', icon: Radio },
  { href: '/trades', label: 'Trades', icon: TrendingUp },
  { href: '/performance', label: 'Performance', icon: BarChart2 },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/logs', label: 'Logs', icon: List },
];

const productMeta = {
  exchange: 'Binance USD-M Futures',
  app: 'Bee Trading  v1.0',
};

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch(clientApiPath('/auth/logout'), { method: 'POST', credentials: 'include' });
    } catch {
      // Even if the request fails, send the user to /login — worst case
      // they just need to sign in again, which is the goal either way.
    } finally {
      router.push('/login');
      router.refresh();
    }
  }

  return (
    <aside className="app-sidebar">
      <div className="px-4 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded bg-accent/15 flex items-center justify-center">
            <ChevronRight size={14} className="text-accent" strokeWidth={2.5} />
          </div>
          <div>
            <div className="text-[13px] font-semibold text-white tracking-wide">Bee Trading </div>
            <div className="text-[10px] text-dim uppercase tracking-widest">Futures</div>
          </div>
        </div>
      </div>

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

      <div className="mt-auto border-t border-border">
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex w-full items-center gap-2 px-4 py-3 text-[12px] text-dim transition hover:text-white disabled:opacity-50 cursor-pointer"
        >
          <LogOut size={14} strokeWidth={2} />
          {loggingOut ? 'Logging out…' : 'Logout'}
        </button>
        <div className="px-4 pb-4">
          <div className="text-[10px] text-dim tracking-wide">{productMeta.exchange}</div>
          <div className="mt-0.5 text-[10px] text-dim opacity-50 tracking-wide">{productMeta.app}</div>
        </div>
      </div>
    </aside>
  );
}
