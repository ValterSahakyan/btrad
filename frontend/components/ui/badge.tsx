import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'positive' | 'danger' | 'warning' }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em]',
        tone === 'neutral' && 'bg-white/10 text-white',
        tone === 'positive' && 'bg-positive/15 text-positive',
        tone === 'danger' && 'bg-danger/15 text-danger',
        tone === 'warning' && 'bg-yellow-400/15 text-yellow-300',
      )}
    >
      {children}
    </span>
  );
}
