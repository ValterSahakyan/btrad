import { cookies } from 'next/headers';

const API_BASE = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api';

async function getAuthCookie(): Promise<string> {
  try {
    const store = await cookies();
    const session = store.get('perpscout_session');
    return session ? `perpscout_session=${session.value}` : '';
  } catch {
    // Not in a Server Component context (e.g. client-side)
    return '';
  }
}

export async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const cookieHeader = await getAuthCookie();

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
      credentials: 'include',
    });
  } catch (err) {
    throw new Error(`Backend unreachable at ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText} (${url})`);
  }

  return response.json() as Promise<T>;
}

export async function fetchApiSafe<T>(path: string, fallback: T, init?: RequestInit): Promise<T> {
  try {
    return await fetchApi<T>(path, init);
  } catch {
    return fallback;
  }
}
