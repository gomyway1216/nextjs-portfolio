import { describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const { create, codes } = vi.hoisted(() => ({ create: vi.fn(), codes: [] as string[] }));
vi.mock('@/lib/firebase-admin', () => ({
  getFirestore: () => ({
    collection: () => ({
      doc: (code: string) => {
        codes.push(code);
        return { create };
      },
    }),
  }),
}));
import { makeRoom } from '@/lib/ogiri/store';

describe('room code collision', () => {
  it('retries create-if-absent without replacing an existing room', async () => {
    vi.stubEnv('OGIRI_EMULATOR', '');
    create.mockRejectedValueOnce({ code: 6 }).mockResolvedValueOnce({});
    const result = await makeRoom('主催者', '🐱');
    expect(create).toHaveBeenCalledTimes(2);
    expect(codes).toHaveLength(2);
    expect(result.view.code).toBe(codes[1]);
    expect(result.view.isHost).toBe(true);
    expect(JSON.stringify(result.view)).not.toContain(result.token);
    vi.unstubAllEnvs();
  });
});
