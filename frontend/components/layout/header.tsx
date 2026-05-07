import { Badge } from '../ui/badge';

export function Header() {
  return (
    <header className="mb-6 flex flex-col gap-3 rounded-[28px] border border-white/10 bg-white/5 p-5 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div className="text-xs uppercase tracking-[0.24em] text-muted">Dashboard-first trading operations</div>
        <h1 className="text-3xl font-semibold">PerpScout AI MVP</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge tone="warning">Testnet Default</Badge>
        <Badge tone="danger">Live Disabled By Default</Badge>
        <Badge tone="positive">Manual Approval Required</Badge>
      </div>
    </header>
  );
}
