'use client';

import { useState } from 'react';
import { Button } from '../ui/button';
import { ToastContainer } from '../ui/toast';
import { useToast } from '@/hooks/use-toast';
import { clientApiPath } from '@/lib/client-api';

function todayLocalDate(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

export function DailyExportControls({
  resource,
  label,
}: {
  resource: 'trades' | 'signals';
  label: string;
}) {
  const [date, setDate] = useState(todayLocalDate());
  const [pending, setPending] = useState(false);
  const toast = useToast();

  const onDownload = async () => {
    setPending(true);
    try {
      const response = await fetch(`${clientApiPath(`/${resource}/export/daily`)}?date=${encodeURIComponent(date)}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        toast.error(body || `Export failed (${response.status})`);
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const contentDisposition = response.headers.get('Content-Disposition') ?? '';
      const filenameMatch = contentDisposition.match(/filename="([^"]+)"/i);
      const filename = filenameMatch?.[1] ?? `${resource}-${date}.csv`;

      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success(`${label} export downloaded`);
    } catch {
      toast.error('Could not reach backend');
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <input
          className="rounded border border-border bg-transparent px-2.5 py-1 text-[11px] text-white outline-none transition focus:border-accent/60"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
        <Button variant="secondary" size="sm" disabled={pending} onClick={onDownload}>
          {pending ? 'Exporting…' : label}
        </Button>
      </div>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
    </>
  );
}
