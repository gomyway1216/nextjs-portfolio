import 'server-only';

import { parsePublicMemoryPayload, type PublicMemoryResult } from './schema';

const PUBLIC_MEMORY_REVALIDATE_SECONDS = 60 * 60;
const MAX_RESPONSE_BYTES = 512 * 1024;

function getConfiguredUrl(): URL | null {
  const configured = process.env.PUBLIC_MEMORY_API_URL?.trim();
  if (!configured) return null;

  try {
    const url = new URL(configured);
    const isAllowedProtocol =
      url.protocol === 'https:' ||
      (process.env.NODE_ENV !== 'production' && url.protocol === 'http:');
    return isAllowedProtocol ? url : null;
  } catch {
    return null;
  }
}

export async function getPublicMemoryServer(): Promise<PublicMemoryResult> {
  const url = getConfiguredUrl();
  if (!url) return { status: 'unavailable', items: [] };

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: {
        revalidate: PUBLIC_MEMORY_REVALIDATE_SECONDS,
        tags: ['public-memory'],
      },
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      console.error(`[public-memory] Public projection returned HTTP ${response.status}`);
      return { status: 'unavailable', items: [] };
    }

    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > MAX_RESPONSE_BYTES) {
      console.error('[public-memory] Public projection exceeded the response limit');
      return { status: 'unavailable', items: [] };
    }

    const body = await response.text();
    if (Buffer.byteLength(body, 'utf8') > MAX_RESPONSE_BYTES) {
      console.error('[public-memory] Public projection exceeded the response limit');
      return { status: 'unavailable', items: [] };
    }

    const items = parsePublicMemoryPayload(JSON.parse(body));
    if (!items) {
      console.error('[public-memory] Public projection did not match the expected schema');
      return { status: 'unavailable', items: [] };
    }

    return items.length > 0 ? { status: 'ready', items } : { status: 'empty', items: [] };
  } catch {
    // Avoid logging the error object: fetch errors can contain the configured
    // endpoint. The public page only needs a safe, non-diagnostic fallback.
    console.error('[public-memory] Public projection request failed');
    return { status: 'unavailable', items: [] };
  }
}
