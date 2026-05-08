import { DataTable } from '@/components/dashboard/data-table';
import { fetchApiSafe } from '@/services/api';

function logLevelCell(level: string) {
  if (level === 'error') return <span className="font-semibold uppercase text-danger">{level}</span>;
  if (level === 'warn') return <span className="font-semibold uppercase text-yellow-300">{level}</span>;
  if (level === 'info') return <span className="uppercase text-accent">{level}</span>;
  return <span className="uppercase text-muted">{level}</span>;
}

function severityCell(severity: string) {
  if (severity === 'high') return <span className="font-semibold uppercase text-danger">{severity}</span>;
  if (severity === 'medium') return <span className="font-semibold uppercase text-yellow-300">{severity}</span>;
  return <span className="uppercase text-muted">{severity}</span>;
}

function timeCell(iso: string) {
  return <span className="text-muted text-xs">{new Date(iso).toLocaleString()}</span>;
}

export default async function LogsPage() {
  const [logs, riskEvents] = await Promise.all([
    fetchApiSafe<any[]>('/logs', []),
    fetchApiSafe<any[]>('/risk-events', []),
  ]);

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <DataTable
        title="Bot Logs"
        headers={['Time', 'Level', 'Source', 'Message']}
        rows={logs.map((log) => [
          timeCell(log.createdAt),
          logLevelCell(log.level),
          <span key="src" className="text-muted">{log.source}</span>,
          log.message,
        ])}
      />
      <DataTable
        title="Risk Events"
        headers={['Time', 'Type', 'Severity', 'Message']}
        rows={riskEvents.map((event) => [
          timeCell(event.createdAt),
          event.type,
          severityCell(event.severity),
          event.message,
        ])}
      />
    </div>
  );
}
