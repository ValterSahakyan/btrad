import { PropsWithChildren } from 'react';
import { cn } from '@/lib/utils';

export function Card({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={cn('panel p-4', className)}>
      {children}
    </div>
  );
}
