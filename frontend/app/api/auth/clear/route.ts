import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function GET() {
  const store = await cookies();
  // Must mirror how the backend sets the cookie (auth.controller.ts): host-only
  // unless AUTH_COOKIE_DOMAIN is explicitly configured. A delete with a Domain
  // that doesn't match how the cookie was set is a no-op.
  const domain = process.env.AUTH_COOKIE_DOMAIN?.trim();
  store.delete({
    name: 'perpscout_session',
    path: '/',
    ...(domain ? { domain: domain.replace(/^\./, '') } : {}),
  });
  redirect('/login');
}
