import 'server-only';

import {
  parsePrivateMemoryHistoryResponse,
  parsePrivateMemoryIndexPageResponse,
  type PrivateMemoryIndexItem,
  type PrivateMemoryRevision,
} from './privateMemory';

const PRIVATE_MEMORY_TIMEOUT_MS = 8_000;
const MAX_INDEX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_HISTORY_RESPONSE_BYTES = 1024 * 1024;
const INDEX_PAGE_SIZE = 500;
const MAX_DASHBOARD_MEMORIES = 10_000;

function privateMemoryUrl(): URL {
  const configuredUrl = process.env.PERSONAL_MEMORY_ADMIN_API_URL;
  if (!configuredUrl) throw new Error('Private memory endpoint is not configured');
  const url = new URL(configuredUrl);
  const isLocalDevelopment = process.env.NODE_ENV !== 'production' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (url.protocol !== 'https:' && !isLocalDevelopment) {
    throw new Error('Private memory endpoint must use HTTPS');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Private memory endpoint must not include credentials, query, or fragment');
  }
  const path = url.pathname.replace(/\/+$/u, '');
  if (path !== '/admin/memories' && !path.endsWith('/memoryApi/admin/memories')) {
    throw new Error('Private memory endpoint must target the admin memories route');
  }
  return url;
}

function dashboardReadKey(): string {
  const key = process.env.PERSONAL_MEMORY_DASHBOARD_READ_KEY?.trim();
  if (!key) throw new Error('Private memory credential is not configured');
  return key;
}

async function fetchPrivateMemory(url: URL, maximumBytes: number): Promise<unknown> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${dashboardReadKey()}`,
    },
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(PRIVATE_MEMORY_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error('Private memory endpoint is temporarily unavailable');
  const lengthHeader = response.headers.get('content-length');
  if (lengthHeader !== null) {
    const length = Number(lengthHeader);
    if (lengthHeader.trim() === '' || !Number.isSafeInteger(length) || length < 0 || length > maximumBytes) {
      throw new Error('Private memory response is too large');
    }
  }
  const body = await response.text();
  if (Buffer.byteLength(body, 'utf8') > maximumBytes) {
    throw new Error('Private memory response is too large');
  }
  return JSON.parse(body);
}

export async function getPrivateMemoryIndexServer(): Promise<PrivateMemoryIndexItem[]> {
  const items = new Map<string, PrivateMemoryIndexItem>();
  let offset = 0;
  let expectedTotal: number | undefined;
  while (offset < MAX_DASHBOARD_MEMORIES) {
    const url = privateMemoryUrl();
    url.searchParams.set('view', 'index');
    url.searchParams.set('limit', String(INDEX_PAGE_SIZE));
    url.searchParams.set('offset', String(offset));
    const page = parsePrivateMemoryIndexPageResponse(
      await fetchPrivateMemory(url, MAX_INDEX_RESPONSE_BYTES),
    );
    if (expectedTotal === undefined) expectedTotal = page.total;
    if (page.total > MAX_DASHBOARD_MEMORIES) {
      throw new Error('Private memory index exceeds the dashboard limit');
    }
    if (page.total !== expectedTotal) {
      throw new Error('Private memory index changed while loading');
    }
    for (const item of page.items) items.set(item.id, item);
    if (page.nextOffset === undefined) break;
    if (page.nextOffset <= offset) throw new Error('Private memory pagination did not advance');
    offset = page.nextOffset;
  }
  if (items.size !== (expectedTotal ?? 0)) {
    throw new Error('Private memory index is incomplete');
  }
  return [...items.values()];
}

export async function getPrivateMemoryHistoryServer(memoryId: string): Promise<PrivateMemoryRevision[]> {
  if (!/^[A-Za-z\d._:-]{1,128}$/u.test(memoryId)) throw new Error('Invalid memory id');
  const url = privateMemoryUrl();
  url.searchParams.set('view', 'history');
  url.searchParams.set('memoryId', memoryId);
  url.searchParams.set('limit', '100');
  return parsePrivateMemoryHistoryResponse(
    await fetchPrivateMemory(url, MAX_HISTORY_RESPONSE_BYTES),
    memoryId,
  );
}
