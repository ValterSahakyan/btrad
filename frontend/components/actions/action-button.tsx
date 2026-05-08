'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useState } from 'react';
import { Button } from '../ui/button';
import { ToastContainer } from '../ui/toast';
import { useToast } from '@/hooks/use-toast';

export function ActionButton({
  label,
  path,
  method = 'POST',
  variant = 'secondary',
  disabled = false,
  size = 'sm',
  body,
  confirmMessage,
  successMessage,
}: {
  label: string;
  path: string;
  method?: 'POST' | 'PATCH';
  variant?: 'default' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  size?: 'sm' | 'md';
  body?: Record<string, unknown>;
  confirmMessage?: string;
  successMessage?: string;
}) {
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const router = useRouter();

  const onClick = async () => {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
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
        startTransition(() => router.refresh());
      }
    } catch {
      toast.error('Could not reach backend');
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button onClick={onClick} variant={variant} size={size} disabled={disabled || pending}>
        {pending ? '…' : label}
      </Button>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
    </>
  );
}
