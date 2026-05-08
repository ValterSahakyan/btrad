import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3333';
const apiOrigin = getCspConnectOrigin(apiBase);

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      `connect-src 'self' ${apiOrigin}`,
      "frame-ancestors 'none'",
    ].join('; '),
  },
];

function getCspConnectOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, '');
  }
}

export default function nextConfig(phase: string): NextConfig {
  return {
    typedRoutes: true,
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next-prod',
    async headers() {
      return [{ source: '/(.*)', headers: securityHeaders }];
    },
  };
}
