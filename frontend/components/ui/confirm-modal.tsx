'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
};

type ModalState = ConfirmOptions & {
  resolve: (confirmed: boolean) => void;
};

function ConfirmModal({ state }: { state: ModalState }) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') state.resolve(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state]);

  const isDanger = state.variant === 'danger';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) state.resolve(false); }}
    >
      <div
        className="w-full max-w-sm mx-4 panel p-5 space-y-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            {state.title && (
              <div id="confirm-title" className="text-[13px] font-semibold text-white">
                {state.title}
              </div>
            )}
            <p className="text-[12px] text-muted leading-relaxed">{state.message}</p>
          </div>
          <button
            onClick={() => state.resolve(false)}
            className="text-dim hover:text-white transition-colors cursor-pointer flex-shrink-0 mt-0.5"
            aria-label="Cancel"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-border" />

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => state.resolve(false)}
            className="px-3 py-1.5 rounded text-[12px] font-medium text-muted border border-border hover:text-white hover:border-white/20 transition-colors cursor-pointer"
          >
            {state.cancelLabel ?? 'Cancel'}
          </button>
          <button
            ref={confirmRef}
            onClick={() => state.resolve(true)}
            className={[
              'px-3 py-1.5 rounded text-[12px] font-medium transition-colors cursor-pointer',
              isDanger
                ? 'bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25'
                : 'bg-accent text-white hover:bg-accent/80',
            ].join(' ')}
          >
            {state.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm() {
  const [state, setState] = useState<ModalState | null>(null);

  const confirm = useCallback((options: string | ConfirmOptions): Promise<boolean> => {
    const opts: ConfirmOptions = typeof options === 'string' ? { message: options } : options;
    return new Promise((resolve) => {
      setState({ ...opts, resolve: (v) => { setState(null); resolve(v); } });
    });
  }, []);

  const modal = state ? <ConfirmModal state={state} /> : null;

  return { confirm, modal };
}
