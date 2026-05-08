import { cn } from '@/lib/utils';

export function MetricCard({
  label,
  value,
  hint,
  tone,
  mono = true,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'positive' | 'danger' | 'warning' | 'neutral';
  mono?: boolean;
}) {
  return (
    <div className="panel p-3.5 flex flex-col gap-1">
      <div className="text-[10px] uppercase tracking-widest text-dim font-medium">{label}</div>
      <div
        className={cn(
          'text-xl font-semibold leading-tight',
          mono && 'font-mono',
          tone === 'positive' && 'text-positive',
          tone === 'danger'   && 'text-danger',
          tone === 'warning'  && 'text-warning',
          !tone              && 'text-white',
        )}
      >
        {value}
      </div>
      {hint && <div className="text-[11px] text-dim leading-tight">{hint}</div>}
    </div>
  );
}
