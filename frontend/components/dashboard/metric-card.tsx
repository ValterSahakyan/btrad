import { Card } from '../ui/card';
import { cn } from '@/lib/utils';

export function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'positive' | 'danger' | 'warning' | 'neutral';
}) {
  return (
    <Card className="space-y-2">
      <div className="text-xs uppercase tracking-[0.18em] text-muted">{label}</div>
      <div
        className={cn(
          'text-2xl font-semibold',
          tone === 'positive' && 'text-positive',
          tone === 'danger' && 'text-danger',
          tone === 'warning' && 'text-yellow-300',
        )}
      >
        {value}
      </div>
      {hint ? <div className="text-sm text-muted">{hint}</div> : null}
    </Card>
  );
}
