import { PropsWithChildren } from 'react';
import { cn } from '@/lib/utils';

export function Card({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <div className={cn('app-card rounded-2xl border border-white/10 bg-panel/80 p-5 shadow-2xl shadow-black/20', className)}>{children}</div>;
}
