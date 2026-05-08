import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'positive' | 'danger' | 'warning';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium border',
        tone === 'neutral'  && 'bg-white/5 text-muted border-white/10',
        tone === 'positive' && 'bg-positive/10 text-positive border-positive/20',
        tone === 'danger'   && 'bg-danger/10 text-danger border-danger/20',
        tone === 'warning'  && 'bg-warning/10 text-warning border-warning/20',
      )}
    >
      {children}
    </span>
  );
}
