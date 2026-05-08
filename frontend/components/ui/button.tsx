import * as React from 'react';
import { cn } from '@/lib/utils';

export function Button({
  className,
  variant = 'default',
  size = 'md',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded font-medium transition-colors cursor-pointer',
        'focus:outline-none disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' && 'px-2.5 py-1 text-[11px]',
        size === 'md' && 'px-3.5 py-1.5 text-[12px]',
        variant === 'default'   && 'bg-accent text-white hover:bg-accent/80',
        variant === 'secondary' && 'bg-white/8 text-muted border border-border hover:bg-white/12 hover:text-white',
        variant === 'danger'    && 'bg-danger/15 text-danger border border-danger/25 hover:bg-danger/25',
        variant === 'ghost'     && 'text-muted hover:text-white hover:bg-white/5',
        className,
      )}
      {...props}
    />
  );
}
