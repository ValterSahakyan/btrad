import { NextRequest } from 'next/server';

const API_BASE =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'http://localhost:3333/api';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

async function proxy(request: NextRequest, params: { path?: string[] }) {
  const targetPath = (params.path ?? []).join('/');
  const targetUrl = new URL(`${API_BASE.replace(/\/+$/, '')}/${targetPath}`);
  targetUrl.search = request.nextUrl.search;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return;
    headers.set(key, value);
  });

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(targetUrl, init);
  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return;
    responseHeaders.append(key, value);
  });

  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  return proxy(request, await context.params);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxy(request, await context.params);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxy(request, await context.params);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxy(request, await context.params);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxy(request, await context.params);
}
