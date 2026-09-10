'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const isBackendDown = error.message.includes('unreachable') || error.message.includes('fetch failed');

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="text-4xl">⚠</div>
      <h2 className="text-xl font-semibold text-white">
        {isBackendDown ? 'Backend Unavailable' : 'Something went wrong'}
      </h2>
      <p className="max-w-md text-sm text-muted">
        {isBackendDown
          ? 'Cannot reach the API server. Make sure the backend is running on port 3000.'
          : error.message}
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-80"
      >
        Try again
      </button>
    </div>
  );
}
