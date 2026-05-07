import { DataTable } from '@/components/dashboard/data-table';
import { fetchApi } from '@/services/api';

export default async function LogsPage() {
  const [logs, riskEvents] = await Promise.all([fetchApi<any[]>('/logs'), fetchApi<any[]>('/risk-events')]);

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <DataTable
        title="Bot Logs"
        headers={['Time', 'Level', 'Source', 'Message']}
        rows={logs.map((log) => [
          new Date(log.createdAt).toLocaleString(),
          log.level,
          log.source,
          log.message,
        ])}
      />
      <DataTable
        title="Risk Events"
        headers={['Time', 'Type', 'Severity', 'Message']}
        rows={riskEvents.map((event) => [
          new Date(event.createdAt).toLocaleString(),
          event.type,
          event.severity,
          event.message,
        ])}
      />
    </div>
  );
}
