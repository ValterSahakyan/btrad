'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useState } from 'react';
import { Button } from '../ui/button';

export function ActionButton({
  label,
  path,
  method = 'POST',
  variant = 'secondary',
  disabled = false,
  body,
  confirmMessage,
}: {
  label: string;
  path: string;
  method?: 'POST' | 'PATCH';
  variant?: 'default' | 'secondary' | 'danger';
  disabled?: boolean;
  body?: Record<string, unknown>;
  confirmMessage?: string;
}) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const onClick = async () => {
    if (confirmMessage && !window.confirm(confirmMessage)) {
      return;
    }

    setPending(true);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api'}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      startTransition(() => router.refresh());
    } finally {
      setPending(false);
    }
  };

  return (
    <Button onClick={onClick} variant={variant} disabled={disabled || pending}>
      {pending ? 'Working...' : label}
    </Button>
  );
}
