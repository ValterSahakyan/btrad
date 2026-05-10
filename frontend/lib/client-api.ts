export const CLIENT_API_BASE = '/api/backend';

export function clientApiPath(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${CLIENT_API_BASE}${normalizedPath}`;
}
