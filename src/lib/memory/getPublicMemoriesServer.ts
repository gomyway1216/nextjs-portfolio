import 'server-only';

import { parsePublicMemoryResponse, type PublicMemoryItem } from './publicMemory';

const PUBLIC_MEMORY_LIMIT = 100;
const PUBLIC_MEMORY_REVALIDATE_SECONDS = 300;
const PUBLIC_MEMORY_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 512_000;
const PUBLIC_PATHS = new Set(['/public', '/public/memories']);

function publicMemoryUrl(): URL {
  const configuredUrl = process.env.PUBLIC_MEMORY_API_URL;
  if (!configuredUrl) throw new Error('Public memory endpoint is not configured');

  const url = new URL(configuredUrl);
  const isLocalDevelopment = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !isLocalDevelopment) {
    throw new Error('Public memory endpoint must use HTTPS');
  }

  const normalizedPath = url.pathname.replace(/\/$/, '') || '/';
  if (!PUBLIC_PATHS.has(normalizedPath)) {
    throw new Error('Public memory endpoint must target the public projection route');
  }

  url.searchParams.set('limit', String(PUBLIC_MEMORY_LIMIT));
  return url;
}

export async function getPublicMemoriesServer(): Promise<PublicMemoryItem[]> {
  const response = await fetch(publicMemoryUrl(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'omit',
    signal: AbortSignal.timeout(PUBLIC_MEMORY_TIMEOUT_MS),
    next: {
      revalidate: PUBLIC_MEMORY_REVALIDATE_SECONDS,
      tags: ['public-memory-projections'],
    },
  });

  if (!response.ok) throw new Error('Public memory endpoint is temporarily unavailable');

  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new Error('Public memory response is too large');
  }

  const body = await response.text();
  if (body.length > MAX_RESPONSE_BYTES) throw new Error('Public memory response is too large');

  return parsePublicMemoryResponse(JSON.parse(body));
}
