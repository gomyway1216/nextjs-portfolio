import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createWishAudio, WISH_AUDIO } from '@/components/game/StarcatCaravan/wishAudio';

function setup(fetcher: typeof fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])))) {
  const sources: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn>; loop: boolean }> = [];
  const context = {
    state: 'running', destination: {}, resume: vi.fn(async () => undefined), close: vi.fn(async () => undefined),
    decodeAudioData: vi.fn(async () => ({ duration: 6.4 })),
    createGain: vi.fn(() => ({ gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() })),
    createBufferSource: vi.fn(() => { const source = { start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), loop: false }; sources.push(source); return source; }),
  };
  const makeContext = vi.fn(() => context as unknown as AudioContext);
  return { player: createWishAudio(makeContext, fetcher), context, makeContext, fetcher, sources };
}

describe('musical wish audio', () => {
  it('ships five distinct stereo cues instead of generating the old short button tones', () => {
    expect(new Set(Object.values(WISH_AUDIO)).size).toBe(5);
    for (const url of Object.values(WISH_AUDIO)) {
      const file = path.join(process.cwd(), 'public', url);
      expect(existsSync(file)).toBe(true); expect(statSync(file).size).toBeGreaterThan(30000);
    }
  });

  it('does no audio or network work until the player enables sound', () => {
    const { player, makeContext, fetcher } = setup();
    player.play('launch'); player.stop();
    expect(makeContext).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });

  it('stops the charging loop before playing the launch and stops everything on mute', async () => {
    const { player, sources } = setup();
    player.enable(true); player.play('charge');
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    expect(sources[0].loop).toBe(true);
    player.play('launch');
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    expect(sources[0].stop).toHaveBeenCalledOnce(); expect(sources[1].loop).toBe(false);
    player.enable(false);
    expect(sources[1].stop).toHaveBeenCalledOnce();
  });

  it.each(['stop', 'dispose'] as const)('does not play a late-loading cue after %s', async (operation) => {
    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => { finish = resolve; });
    const fetcher = vi.fn(() => waiting.then(() => new Response(new Uint8Array([1])))) as typeof fetch;
    const { player, context } = setup(fetcher);
    player.enable(true); player.play('reveal-5'); player[operation](); finish();
    await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledTimes(5));
    expect(context.createBufferSource).not.toHaveBeenCalled();
    if (operation === 'dispose') expect(context.close).toHaveBeenCalledOnce();
  });

  it('plays only the latest scene if a player skips while several cues are loading', async () => {
    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => { finish = resolve; });
    const { player, sources } = setup(vi.fn(() => waiting.then(() => new Response(new Uint8Array([1])))) as typeof fetch);
    player.enable(true); player.play('launch'); player.play('reveal-5'); finish();
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    expect(sources[0].start).toHaveBeenCalledOnce();
  });
});
