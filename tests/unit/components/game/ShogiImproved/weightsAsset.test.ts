/**
 * The shogi AI's weights live in two places that must hold the same bytes: public/ (development, tests, CI) and the
 * public asset bucket (every build made on Vercel, whose deployments leave the file out). See weightsAsset.ts.
 *
 * The bucket itself is not reachable from a unit test, so what is pinned here is everything around it: the file in
 * public/ is the one the constant names, the bucket path is named for it, Vercel leaves it out, only a Vercel build
 * turns the bucket on, and a worker built that way fetches from the bucket.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  NNUE_WEIGHTS_FILE,
  NNUE_WEIGHTS_REMOTE_URL,
  NNUE_WEIGHTS_SHA256,
} from '@/components/game/ShogiImproved/weightsAsset';

describe('the weights in public/ and in the asset bucket', () => {
  it('are the bytes the constant names: change the weights, upload them, and change the constant together', () => {
    const bytes = readFileSync(join(process.cwd(), 'public', NNUE_WEIGHTS_FILE));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    expect(
      sha256,
      `public/${NNUE_WEIGHTS_FILE} changed: upload it to gs://yudai-portfolio-assets/shogi/${sha256.slice(0, 12)}/${NNUE_WEIGHTS_FILE} (see weightsAsset.ts) and set NNUE_WEIGHTS_SHA256 to ${sha256}`,
    ).toBe(NNUE_WEIGHTS_SHA256);
  });

  it('are found in the bucket under a path named for that SHA-256', () => {
    expect(NNUE_WEIGHTS_REMOTE_URL).toBe(
      `https://storage.googleapis.com/yudai-portfolio-assets/shogi/${NNUE_WEIGHTS_SHA256.slice(0, 12)}/${NNUE_WEIGHTS_FILE}`,
    );
  });

  it('are left out of Vercel deployments', () => {
    const ignored = readFileSync(join(process.cwd(), '.vercelignore'), 'utf8')
      .split('\n')
      .map((line) => line.trim());
    expect(ignored).toContain(`public/${NNUE_WEIGHTS_FILE}`);
  });

  it('are fetched from the bucket only by a build made on Vercel', () => {
    const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8');
    expect(config).toMatch(/NEXT_PUBLIC_SHOGI_WEIGHTS_REMOTE:\s*process\.env\.VERCEL === "1" \? "1" : ""/);
  });
});

describe('a worker built on Vercel', () => {
  const posted: { type: string; status?: string }[] = [];
  const scope = {
    postMessage: (message: { type: string; status?: string }) => posted.push(message),
    onmessage: null as ((event: { data: unknown }) => void) | null,
    location: { origin: 'https://www.meetyudai.com' },
  };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    vi.stubEnv('NEXT_PUBLIC_SHOGI_WEIGHTS_REMOTE', '1');
    // Nothing is served: the test only needs to see where the worker asks. A 404 is not retried.
    fetchMock = vi.fn(async () => ({ ok: false, status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    (globalThis as Record<string, unknown>).self = scope;
    await import('@/components/game/ShogiImproved/shogi-ai.worker');
    const until = Date.now() + 10_000;
    while (Date.now() < until && !posted.some((message) => message.type === 'nnueWeightsStatus')) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('fetches the weights from the asset bucket, not from its own origin', () => {
    const asked = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(asked).toContain(NNUE_WEIGHTS_REMOTE_URL);
    expect(asked.some((url) => url.endsWith(`www.meetyudai.com/${NNUE_WEIGHTS_FILE}`))).toBe(false);
  });
});
