import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { forwardsActivityLogs } from '@/app/api/_lib/activityLogForwarding';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import { logApiError } from '@/app/api/utils/errorLogger';
import { POST as postLog } from '@/app/api/activity-logs/log/route';

// Activity logs reach production's activity_logs only from a deployment on Vercel. CI's e2e server and a developer's
// server drop them, so their test traffic is not written into production's logs. `fetch` is faked: nothing reaches the
// real Cloud Function.

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
  async () => new Response(JSON.stringify({ success: true }), { status: 200 }),
);

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VERCEL', '');
  vi.stubEnv('ACTIVITY_LOG_FORWARD', '');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const toCloudFunction = () => fetchMock.mock.calls.filter(([url]) => String(url).includes('logclientactivity'));

describe('forwardsActivityLogs', () => {
  it('forwards from a build made on Vercel, or where Vercel says so at run time', () => {
    expect(forwardsActivityLogs({}, true)).toBe(true);
    expect(forwardsActivityLogs({ VERCEL: '1' }, false)).toBe(true);
  });

  it('drops them anywhere else: CI, next dev, next start', () => {
    expect(forwardsActivityLogs({}, false)).toBe(false);
    expect(forwardsActivityLogs({ CI: 'true' }, false)).toBe(false);
  });

  it('is turned on or off anywhere by ACTIVITY_LOG_FORWARD', () => {
    expect(forwardsActivityLogs({ ACTIVITY_LOG_FORWARD: '1' }, false)).toBe(true);
    expect(forwardsActivityLogs({ ACTIVITY_LOG_FORWARD: '0' }, true)).toBe(false);
    expect(forwardsActivityLogs({ ACTIVITY_LOG_FORWARD: '0', VERCEL: '1' }, false)).toBe(false);
  });
});

describe('the three senders, off Vercel', () => {
  it('an API route wrapped in withActivityLog answers as before and sends nothing', async () => {
    const handler = withActivityLog('next_api.test.GET', async () => Response.json({ ok: true }));
    const response = await handler(new NextRequest('http://localhost:3000/api/test'), {});
    expect(response?.status).toBe(200);
    await Promise.resolve();
    expect(toCloudFunction()).toHaveLength(0);
  });

  it('logApiError sends nothing', async () => {
    await logApiError({ errorType: 'Test', message: 'test error', endpoint: '/api/test' });
    expect(toCloudFunction()).toHaveLength(0);
  });

  it('the browser’s /api/activity-logs/log is answered and dropped', async () => {
    const response = await postLog(
      new NextRequest('http://localhost:3000/api/activity-logs/log', { method: 'POST', body: JSON.stringify({ action: 'page_view', source: 'client' }) }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, forwarded: false });
    expect(toCloudFunction()).toHaveLength(0);
  });
});

describe('the three senders, where forwarding is on (as on Vercel)', () => {
  beforeEach(() => vi.stubEnv('ACTIVITY_LOG_FORWARD', '1'));

  it('withActivityLog sends the route’s entry to the Cloud Function', async () => {
    const handler = withActivityLog('next_api.test.GET', async () => Response.json({ ok: true }));
    await handler(new NextRequest('http://localhost:3000/api/test'), {});
    await vi.waitFor(() => expect(toCloudFunction()).toHaveLength(1));
  });

  it('logApiError sends the error to the Cloud Function', async () => {
    await logApiError({ errorType: 'Test', message: 'test error', endpoint: '/api/test' });
    expect(toCloudFunction()).toHaveLength(1);
  });

  it('/api/activity-logs/log passes the entry on and answers with the Cloud Function’s reply', async () => {
    const response = await postLog(
      new NextRequest('http://localhost:3000/api/activity-logs/log', { method: 'POST', body: JSON.stringify({ action: 'page_view', source: 'client' }) }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(toCloudFunction()).toHaveLength(1);
  });
});
