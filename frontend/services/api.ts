const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api';

export async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
    });
  } catch (err) {
    throw new Error(`Backend unreachable at ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText} (${url})`);
  }

  return response.json() as Promise<T>;
}
