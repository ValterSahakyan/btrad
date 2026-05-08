'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pagination } from '@/components/ui/pagination';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3333/api';
const REFRESH_MS = 15_000;
const PAGE_SIZE = 100;

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
  return (
    <span className="font-mono text-[10px] text-dim whitespace-nowrap">
      {new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  );
}

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsPage, setLogsPage] = useState(1);
  const [eventsPage, setEventsPage] = useState(1);

  const fetchAll = useCallback(async () => {
    try {
      const [logsRes, eventsRes] = await Promise.all([
        fetch(`${API}/logs`, { credentials: 'include', cache: 'no-store' }),
        fetch(`${API}/risk-events`, { credentials: 'include', cache: 'no-store' }),
      ]);
      if (logsRes.ok) setLogs(await logsRes.json());
      if (eventsRes.ok) setEvents(await eventsRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchAll]);

  // Clamp pages when data shrinks
  useEffect(() => {
    const lp = Math.max(1, Math.ceil(logs.length / PAGE_SIZE));
    if (logsPage > lp) setLogsPage(1);
  }, [logs.length, logsPage]);

  useEffect(() => {
    const ep = Math.max(1, Math.ceil(events.length / PAGE_SIZE));
    if (eventsPage > ep) setEventsPage(1);
  }, [events.length, eventsPage]);

  const logsPageData = logs.slice((logsPage - 1) * PAGE_SIZE, logsPage * PAGE_SIZE);
  const eventsPageData = events.slice((eventsPage - 1) * PAGE_SIZE, eventsPage * PAGE_SIZE);

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {/* Bot Logs */}
      <div className="panel overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <span className="text-[12px] font-semibold text-white">Bot Logs</span>
          <span className="font-mono text-[11px] text-dim">{loading ? '…' : logs.length}</span>
        </div>
        {loading ? (
          <div className="py-12 text-center text-[12px] text-dim">Loading…</div>
        ) : (
          <>
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="t-table">
                <thead className="sticky top-0 bg-surface z-10">
                  <tr>
                    <th>Time</th><th>Level</th><th>Source</th><th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {logsPageData.length === 0 && (
                    <tr><td colSpan={4} className="py-8 text-center text-dim">No logs</td></tr>
                  )}
                  {logsPageData.map((l, i) => (
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
            <Pagination
              page={logsPage}
              total={logs.length}
              pageSize={PAGE_SIZE}
              onPage={setLogsPage}
            />
          </>
        )}
      </div>

      {/* Risk Events */}
      <div className="panel overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <span className="text-[12px] font-semibold text-white">Risk Events</span>
          <span className="font-mono text-[11px] text-dim">{loading ? '…' : events.length}</span>
        </div>
        {loading ? (
          <div className="py-12 text-center text-[12px] text-dim">Loading…</div>
        ) : (
          <>
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="t-table">
                <thead className="sticky top-0 bg-surface z-10">
                  <tr>
                    <th>Time</th><th>Type</th><th>Severity</th><th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {eventsPageData.length === 0 && (
                    <tr><td colSpan={4} className="py-8 text-center text-dim">No events</td></tr>
                  )}
                  {eventsPageData.map((e, i) => (
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
            <Pagination
              page={eventsPage}
              total={events.length}
              pageSize={PAGE_SIZE}
              onPage={setEventsPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
