import { Card } from '../ui/card';

export function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="space-y-2">
      <div className="text-xs uppercase tracking-[0.18em] text-muted">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {hint ? <div className="text-sm text-muted">{hint}</div> : null}
    </Card>
  );
}
