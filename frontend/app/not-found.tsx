import Link from 'next/link';

// Explicit App-Router 404. Without this, Next generates a Pages-Router 404
// fallback that pulls in <Html> from next/document, which fails to prerender
// on some build platforms ("<Html> should not be imported outside of
// pages/_document").
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#080C14] text-center">
      <div className="text-4xl">404</div>
      <h1 className="text-xl font-semibold text-white">Page not found</h1>
      <Link
        href="/overview"
        className="rounded-lg bg-[#58A6FF] px-4 py-2 text-sm font-medium text-white hover:opacity-80"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
