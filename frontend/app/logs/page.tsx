import { fetchApiSafe } from '@/services/api';

function levelCell(l: string) {
  if (l === 'error') return <span className="font-mono text-[10px] font-bold text-danger uppercase">{l}</span>;
  if (l === 'warn')  return <span className="font-mono text-[10px] font-bold text-warning uppercase">{l}</span>;
  if (l === 'info')  return <span className="font-mono text-[10px] text-accent uppercase">{l}</span>;
  return <span className="font-mono text-[10px] text-dim uppercase">{l}</span>;
}

function severity(s: string) {
  if (s === 'high')   return <span className="font-mono text-[10px] font-bold text-danger uppercase">{s}</span>;
  if (s === 'medium') return <span className="font-mono text-[10px] font-bold text-warning uppercase">{s}</span>;
  return <span className="font-mono text-[10px] text-dim uppercase">{s}</span>;
}

function ts(iso: string) {
  return <span className="font-mono text-[10px] text-dim">{new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>;
}

export default async function LogsPage() {
  const [logs, events] = await Promise.all([
    fetchApiSafe<any[]>('/logs', []),
    fetchApiSafe<any[]>('/risk-events', []),
  ]);

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {/* Bot Logs */}
      <div className="panel overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <span className="text-[12px] font-semibold text-white">Bot Logs</span>
          <span className="font-mono text-[11px] text-dim">{logs.length}</span>
        </div>
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="t-table">
            <thead className="sticky top-0 bg-surface z-10">
              <tr>
                <th>Time</th><th>Level</th><th>Source</th><th>Message</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr><td colSpan={4} className="py-8 text-center text-dim">No logs</td></tr>
              )}
              {logs.map((l, i) => (
                <tr key={l.id ?? i}>
                  <td>{ts(l.createdAt)}</td>
                  <td>{levelCell(l.level)}</td>
                  <td className="text-dim text-[11px] whitespace-nowrap">{l.source}</td>
                  <td className="text-[11px] text-white/80 max-w-[300px]">
                    <span className="block truncate">{l.message}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Risk Events */}
      <div className="panel overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <span className="text-[12px] font-semibold text-white">Risk Events</span>
          <span className="font-mono text-[11px] text-dim">{events.length}</span>
        </div>
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="t-table">
            <thead className="sticky top-0 bg-surface z-10">
              <tr>
                <th>Time</th><th>Type</th><th>Severity</th><th>Message</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && (
                <tr><td colSpan={4} className="py-8 text-center text-dim">No events</td></tr>
              )}
              {events.map((e, i) => (
                <tr key={e.id ?? i}>
                  <td>{ts(e.createdAt)}</td>
                  <td className="text-[11px] text-white/70 whitespace-nowrap">{e.type}</td>
                  <td>{severity(e.severity)}</td>
                  <td className="text-[11px] text-white/80 max-w-[300px]">
                    <span className="block truncate">{e.message}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
