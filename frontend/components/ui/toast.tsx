'use client';

import { useEffect, useState } from 'react';

export type ToastType = 'success' | 'error';

export type Toast = {
  id: number;
  message: string;
  type: ToastType;
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(toast.id), 250);
    }, 3500);
    return () => {
      cancelAnimationFrame(show);
      clearTimeout(timer);
    };
  }, [toast.id, onDismiss]);

  return (
    <div
      className={[
        'flex items-center gap-2.5 rounded border px-3 py-2.5 text-[12px] shadow-xl transition-all duration-250',
        toast.type === 'success'
          ? 'border-positive/25 bg-surface text-positive'
          : 'border-danger/25 bg-surface text-danger',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
      ].join(' ')}
    >
      <span className="font-mono text-[10px]">{toast.type === 'success' ? '✓' : '✕'}</span>
      <span className="text-white/90">{toast.message}</span>
      <button onClick={() => onDismiss(toast.id)} className="ml-2 text-muted hover:text-white cursor-pointer">
        ✕
      </button>
    </div>
  );
}

export function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
