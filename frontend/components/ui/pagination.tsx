'use client';

import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
  className?: string;
}

export function Pagination({ page, total, pageSize, onPage, className }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1 && total <= pageSize) return null;

  const start = Math.min((page - 1) * pageSize + 1, total);
  const end = Math.min(page * pageSize, total);

  const btnClass = (disabled: boolean) =>
    cn(
      'px-2.5 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer',
      disabled
        ? 'border-border text-dim opacity-40 cursor-not-allowed'
        : 'border-border text-muted hover:text-white hover:border-white/20',
    );

  return (
    <div className={cn('flex items-center justify-between px-4 py-2 border-t border-border', className)}>
      <span className="font-mono text-[11px] text-dim">
        {start}–{end} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          className={btnClass(page <= 1)}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          ← Prev
        </button>
        <span className="font-mono text-[11px] text-muted">
          {page} / {totalPages}
        </span>
        <button
          className={btnClass(page >= totalPages)}
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
