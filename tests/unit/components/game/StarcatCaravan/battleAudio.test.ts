import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BATTLE_AUDIO, abilityCue, createBattleAudio, reactionCue } from '@/components/game/StarcatCaravan/battleAudio';

describe('battle sound effects', () => {
  it('ships four distinct effects and assigns new elements and support skills appropriate sounds', () => {
    expect(new Set(Object.values(BATTLE_AUDIO)).size).toBe(4);
    for (const url of Object.values(BATTLE_AUDIO)) { const file = path.join(process.cwd(), 'public', url); expect(existsSync(file)).toBe(true); expect(statSync(file).size).toBeGreaterThan(10000); }
    expect(reactionCue('freeze')).toBe('frost'); expect(reactionCue('shock')).toBe('thunder'); expect(reactionCue('bloom')).toBe('support');
    expect(abilityCue('ward')).toBe('support'); expect(abilityCue('chain')).toBe('thunder');
  });

  it('creates nothing before opt-in and cancels active or queued effects on mute', async () => {
    const sources: { stop: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; buffer: unknown; loop: boolean; onended: unknown }[] = [];
    const context = { state: 'running', destination: {}, resume: vi.fn(async () => undefined), close: vi.fn(async () => undefined), decodeAudioData: vi.fn(async () => ({})), createGain: vi.fn(() => ({ gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() })), createBufferSource: vi.fn(() => { const source = { stop: vi.fn(), start: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), buffer: null, loop: false, onended: null }; sources.push(source); return source; }) };
    const make = vi.fn(() => context as unknown as AudioContext);
    const fetcher = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    const audio = createBattleAudio(make, fetcher);
    audio.play('impact'); expect(make).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
    audio.enable(true); expect(context.resume).toHaveBeenCalledTimes(1);
    audio.play('thunder');
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    expect(sources[0].loop).toBe(false);
    audio.play('frost'); audio.enable(false);
    await Promise.resolve(); await Promise.resolve();
    expect(sources[0].stop).toHaveBeenCalled(); expect(sources).toHaveLength(1);
    audio.dispose(); expect(context.close).toHaveBeenCalledTimes(1);
  });

  it('does not interrupt play when a browser blocks audio construction', () => {
    const audio = createBattleAudio(() => { throw Error('blocked'); }); audio.enable(true);
    expect(() => audio.play('frost')).not.toThrow();
  });
});
