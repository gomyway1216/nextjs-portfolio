import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  createPartyMusic, DEFAULT_PARTY_MUSIC_ENABLED, PARTY_MUSIC_FILE, PARTY_MUSIC_GAIN,
  PARTY_MUSIC_LOOP_SECONDS, partyMusicLoopBounds, shouldPlayPartyMusic,
} from '@/lib/ogiri/music';
import type { RoomView } from '@/lib/ogiri/types';

function audioFixture() {
  const sources: {
    buffer: AudioBuffer | null; loop: boolean; loopStart: number; loopEnd: number;
    connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; onended: (() => void) | null;
  }[] = [];
  const gains: { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>;
    gain: { value: number; setValueAtTime: ReturnType<typeof vi.fn>; linearRampToValueAtTime: ReturnType<typeof vi.fn>;
      cancelScheduledValues: ReturnType<typeof vi.fn>; cancelAndHoldAtTime?: ReturnType<typeof vi.fn> } }[] = [];
  const destination = {} as AudioNode;
  const context = {
    state: 'running', currentTime: 10, resume: vi.fn(), close: vi.fn(),
    decodeAudioData: vi.fn(async () => ({ duration: PARTY_MUSIC_LOOP_SECONDS, sampleRate: 44100 }) as AudioBuffer),
    createBufferSource: () => {
      const source = { buffer: null, loop: false, loopStart: 0, loopEnd: 0,
        connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
      sources.push(source);
      return source;
    },
    createGain: () => {
      const gain = { connect: vi.fn(), disconnect: vi.fn(), gain: {
        value: PARTY_MUSIC_GAIN, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(), cancelAndHoldAtTime: vi.fn(),
      } };
      gains.push(gain);
      return gain;
    },
  };
  const fetchMusic = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
  vi.stubGlobal('fetch', fetchMusic);
  const music = createPartyMusic(context as unknown as AudioContext, destination);
  return { music, context, sources, gains, destination, fetchMusic };
}
afterEach(() => vi.unstubAllGlobals());

describe('waiting music', () => {
  it('defaults its preference on but stays inert until audio is running and explicitly started', async () => {
    const { music, context, fetchMusic, sources, gains } = audioFixture();
    expect(DEFAULT_PARTY_MUSIC_ENABLED).toBe(true);
    music.duck(3);
    music.stop();
    expect(fetchMusic).not.toHaveBeenCalled();
    expect(gains).toHaveLength(0);
    context.state = 'suspended';
    expect(await music.start()).toBe(false);
    expect(fetchMusic).not.toHaveBeenCalled();
    expect(sources).toHaveLength(0);
    expect(context.resume).not.toHaveBeenCalled();
  });
  it('shares one download/decode/source across concurrent starts and identical room polls', async () => {
    const { music, context, sources, gains, fetchMusic, destination } = audioFixture();
    expect(await Promise.all([music.start(), music.start(), music.start()])).toEqual([true, true, true]);
    for (let poll = 0; poll < 5; poll++) expect(await music.start()).toBe(true);
    expect(fetchMusic).toHaveBeenCalledExactlyOnceWith(PARTY_MUSIC_FILE);
    expect(context.decodeAudioData).toHaveBeenCalledOnce();
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ loop: true, loopStart: 0, loopEnd: PARTY_MUSIC_LOOP_SECONDS });
    expect(sources[0].start).toHaveBeenCalledExactlyOnceWith(10, 0);
    expect(gains[0].connect).toHaveBeenCalledWith(destination);
    expect(gains[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(PARTY_MUSIC_GAIN, 10.2);
  });
  it.each([44100, 48000])('excludes retained encoder padding at %s Hz without trimming gapless decodes', async sampleRate => {
    expect(partyMusicLoopBounds({ duration: PARTY_MUSIC_LOOP_SECONDS, sampleRate })).toEqual({
      start: 0, end: PARTY_MUSIC_LOOP_SECONDS,
    });
    const { music, context, sources } = audioFixture();
    context.decodeAudioData.mockResolvedValue({
      duration: Math.round((PARTY_MUSIC_LOOP_SECONDS + 1748 / 44100) * sampleRate) / sampleRate, sampleRate,
    } as AudioBuffer);
    await music.start();
    expect(sources[0].loopStart).toBe(1105 / 44100);
    expect(sources[0].loopEnd - sources[0].loopStart).toBeCloseTo(PARTY_MUSIC_LOOP_SECONDS, 8);
    expect(sources[0].start).toHaveBeenCalledExactlyOnceWith(10, 1105 / 44100);
  });
  it('does not start late when disabled during loading, and reuses the cache on the next start', async () => {
    const { music, sources, fetchMusic } = audioFixture();
    let finish!: (response: Response) => void;
    fetchMusic.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    const starting = music.start();
    music.stop();
    finish(new Response(new Uint8Array([1])));
    expect(await starting).toBe(false);
    expect(sources).toHaveLength(0);
    expect(await music.start()).toBe(true);
    expect(fetchMusic).toHaveBeenCalledOnce();
  });
  it.each(['network', 'http', 'decode'])('fails %s loads softly without repeated requests', async failure => {
    const { music, context, fetchMusic, sources } = audioFixture();
    if (failure === 'network') fetchMusic.mockRejectedValue(new Error('offline'));
    if (failure === 'http') fetchMusic.mockResolvedValue(new Response(null, { status: 404 }));
    if (failure === 'decode') context.decodeAudioData.mockRejectedValue(new Error('invalid audio'));
    expect(await music.start()).toBe(false);
    expect(await music.start()).toBe(false);
    expect(music.failed()).toBe(true);
    expect(fetchMusic).toHaveBeenCalledOnce();
    expect(sources).toHaveLength(0);
    expect(context.close).not.toHaveBeenCalled();
  });
  it('retries a failed download only after an explicit user retry', async () => {
    const { music, fetchMusic, context } = audioFixture();
    fetchMusic.mockRejectedValueOnce(new Error('transient offline'));
    expect(await music.start()).toBe(false);
    expect(await music.start()).toBe(false);
    expect(fetchMusic).toHaveBeenCalledOnce();
    music.retry();
    expect(music.failed()).toBe(false);
    expect(fetchMusic).toHaveBeenCalledOnce();
    expect(await music.start()).toBe(true);
    expect(fetchMusic).toHaveBeenCalledTimes(2);
    expect(context.decodeAudioData).toHaveBeenCalledOnce();
  });
  it('can duck and stop when cancelAndHoldAtTime is unavailable', async () => {
    const { music, gains, sources } = audioFixture();
    await music.start();
    delete gains[0].gain.cancelAndHoldAtTime;
    music.duck(1);
    expect(gains[0].gain.cancelScheduledValues).toHaveBeenCalledWith(10);
    expect(gains[0].gain.setValueAtTime).toHaveBeenCalledWith(PARTY_MUSIC_GAIN, 10);
    music.stop();
    expect(sources[0].stop).toHaveBeenCalledOnce();
  });
  it('ducks under effects without resetting the loop and extends ducking for overlapping effects', async () => {
    const { music, context, sources, gains } = audioFixture();
    music.duck(3);
    await music.start();
    expect(gains[0].gain.setValueAtTime).toHaveBeenCalledWith(PARTY_MUSIC_GAIN * 0.2, 13);
    context.currentTime = 11;
    music.duck(4);
    expect(gains[0].gain.cancelAndHoldAtTime).toHaveBeenCalledWith(11);
    expect(gains[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(PARTY_MUSIC_GAIN * 0.2, 11.015);
    expect(gains[0].gain.setValueAtTime).toHaveBeenCalledWith(PARTY_MUSIC_GAIN * 0.2, 15);
    expect(gains[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(PARTY_MUSIC_GAIN, 15.25);
    expect(sources[0].stop).not.toHaveBeenCalled();
    expect(sources[0].start).toHaveBeenCalledOnce();
  });
  it('fades stopped music, can restart from cache, and closes only its own nodes', async () => {
    const { music, context, sources, gains, fetchMusic } = audioFixture();
    await music.start();
    music.stop();
    music.stop();
    expect(gains[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 10.025);
    expect(sources[0].stop).toHaveBeenCalledExactlyOnceWith(10.03);
    sources[0].onended?.();
    expect(sources[0].disconnect).toHaveBeenCalledOnce();
    await music.start();
    expect(sources).toHaveLength(2);
    expect(fetchMusic).toHaveBeenCalledOnce();
    music.close();
    expect(await music.start()).toBe(false);
    expect(sources[1].disconnect).toHaveBeenCalledOnce();
    expect(gains[1].disconnect).toHaveBeenCalledOnce();
    expect(context.close).not.toHaveBeenCalled();
  });
  it('does not start after its owner closes during loading', async () => {
    const { music, sources, fetchMusic } = audioFixture();
    let finish!: (response: Response) => void;
    fetchMusic.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    const starting = music.start();
    music.close();
    finish(new Response(new Uint8Array([1])));
    expect(await starting).toBe(false);
    expect(sources).toHaveLength(0);
  });
  it('runs only in audible, visible, unpaused answer/vote phases', () => {
    const options = { music: true, sound: true, blocked: false, hidden: false, volume: 0.6,
      connected: true, stopped: false };
    const room = { phase: 'answering', paused: false } as RoomView;
    expect(shouldPlayPartyMusic(room, options)).toBe(true);
    expect(shouldPlayPartyMusic({ ...room, phase: 'voting' }, options)).toBe(true);
    for (const phase of ['lobby', 'reveal', 'ranking', 'finished'] as const)
      expect(shouldPlayPartyMusic({ ...room, phase }, options)).toBe(false);
    for (const change of [{ music: false }, { sound: false }, { blocked: true }, { hidden: true },
      { volume: 0 }, { connected: false }, { stopped: true }])
      expect(shouldPlayPartyMusic(room, { ...options, ...change })).toBe(false);
    expect(shouldPlayPartyMusic(null, options)).toBe(false);
    expect(shouldPlayPartyMusic({ ...room, paused: true }, options)).toBe(false);
  });
  it('ships one stereo-compatible MP3 below one megabyte', () => {
    const file = join(process.cwd(), 'public', PARTY_MUSIC_FILE);
    expect(statSync(file).size).toBeLessThan(1_000_000);
    expect(readFileSync(file).subarray(0, 3).toString()).toBe('ID3');
    expect(PARTY_MUSIC_LOOP_SECONDS).toBeCloseTo(128 * 60 / 116, 4);
  });
});
