import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = new Set(['/login']);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const session = request.cookies.get('perpscout_session');

  // Try a lightweight preflight: if no cookie at all, check if auth is enabled
  // by looking at a header the backend could set, or just redirect to login.
  // We only redirect if the cookie is missing AND we know auth is enabled.
  // Since we can't call the backend here easily, we only redirect when the
  // cookie is missing and the user tries to navigate away from public pages.
  // The pages themselves handle 401s gracefully via fetchApiSafe.
  // So middleware only hard-redirects when explicitly enabled via env.
  if (process.env.NEXT_PUBLIC_AUTH_REQUIRED === 'true' && !session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|.*\\..*).*)'],
};
