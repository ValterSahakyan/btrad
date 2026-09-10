'use client';

// Root-level error boundary. Must render its own <html>/<body>. Having this
// (plus not-found.tsx) stops Next from falling back to the Pages-Router
// _error/_document path during the build, which is what throws
// "<Html> should not be imported outside of pages/_document" on some platforms.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          background: '#080C14',
          color: '#C9D1D9',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 32 }}>⚠</div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#fff' }}>Something went wrong</h1>
        <button
          onClick={reset}
          style={{
            borderRadius: 8,
            border: 0,
            background: '#58A6FF',
            color: '#fff',
            padding: '8px 16px',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
