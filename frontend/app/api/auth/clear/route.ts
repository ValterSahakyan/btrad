import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function GET() {
  const store = await cookies();
  const domain = process.env.AUTH_COOKIE_DOMAIN?.trim() || deriveCookieDomain(process.env.FRONTEND_URL);
  store.delete({
    name: 'perpscout_session',
    path: '/',
    ...(domain ? { domain } : {}),
  });
  redirect('/login');
}

function deriveCookieDomain(frontendUrl?: string): string | undefined {
  if (!frontendUrl) return undefined;
  try {
    const hostname = new URL(frontendUrl.split(',')[0].trim()).hostname;
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) return undefined;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return undefined;
    return hostname;
  } catch {
    return undefined;
  }
}
