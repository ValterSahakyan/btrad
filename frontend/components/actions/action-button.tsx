'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useState } from 'react';
import { Button } from '../ui/button';
import { ToastContainer } from '../ui/toast';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '../ui/confirm-modal';

export function ActionButton({
  label,
  path,
  method = 'POST',
  variant = 'secondary',
  disabled = false,
  size = 'sm',
  body,
  confirmMessage,
  confirmTitle,
  confirmVariant,
  successMessage,
  onSuccess,
}: {
  label: string;
  path: string;
  method?: 'POST' | 'PATCH';
  variant?: 'default' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  size?: 'sm' | 'md';
  body?: Record<string, unknown>;
  confirmMessage?: string;
  confirmTitle?: string;
  confirmVariant?: 'default' | 'danger';
  successMessage?: string;
  onSuccess?: () => void;
}) {
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const { confirm, modal } = useConfirm();

  const onClick = async () => {
    if (confirmMessage) {
      const ok = await confirm({
        title: confirmTitle,
        message: confirmMessage,
        confirmLabel: label,
        variant: confirmVariant ?? (variant === 'danger' ? 'danger' : 'default'),
      });
      if (!ok) return;
    }

    setPending(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3333/api'}${path}`,
        {
          method,
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: body ? JSON.stringify(body) : undefined,
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { message?: string };
        toast.error(data.message ?? `Request failed (${res.status})`);
      } else {
        const data = await res.json().catch(() => ({})) as { message?: string };
        toast.success(data.message ?? successMessage ?? `${label} completed`);
        if (onSuccess) {
          onSuccess();
        } else {
          startTransition(() => router.refresh());
        }
      }
    } catch {
      toast.error('Could not reach backend');
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      {modal}
      <Button onClick={onClick} variant={variant} size={size} disabled={disabled || pending}>
        {pending ? '…' : label}
      </Button>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
    </>
  );
}
