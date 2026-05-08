import * as React from 'react';
import { cn } from '@/lib/utils';

export function Button({
  className,
  variant = 'default',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'secondary' | 'danger' }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        'app-button',
        variant === 'default' && 'bg-accent text-surface hover:bg-teal-300',
        variant === 'secondary' && 'bg-white/10 text-white hover:bg-white/15',
        variant === 'danger' && 'bg-danger text-white hover:bg-orange-500',
        className,
      )}
      {...props}
    />
  );
}
