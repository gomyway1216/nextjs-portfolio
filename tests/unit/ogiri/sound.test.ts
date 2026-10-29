import { describe, it, expect, vi } from 'vitest';
import { createPartyAudio, DEFAULT_PARTY_VOLUME, phaseSound, SOUND_CUES, SOUND_FILES } from '@/lib/ogiri/sound';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { RoomView } from '@/lib/ogiri/types';
const view = (phase: RoomView['phase'], turn = phase) =>
  ({ code: 'ABC234', phase, turn, paused: false, players: [{ id: 'a', score: 0 }] }) as RoomView;
describe('original party audio', () => {
  it('plays state transitions once, and stays silent for initial views, polls and paused states', () => {
    expect(phaseSound(null, view('finished'))).toBeNull();
    expect(phaseSound(view('reveal'), view('reveal'))).toBeNull();
    expect(phaseSound(view('voting'), { ...view('reveal'), paused: true })).toBeNull();
    expect(phaseSound(view('voting'), view('reveal'))).toBe('bounce');
    const scored = { ...view('reveal'), players: [{ id: 'a', score: 100 }] } as RoomView;
    expect(phaseSound(view('voting'), scored)).toBe('count');
    expect(phaseSound(scored, structuredClone(scored))).toBeNull();
    expect(phaseSound(view('reveal'), scored)).toBe('count');
    expect(phaseSound(view('ranking'), view('finished'))).toBe('cheer');
    expect(phaseSound(view('answering'), view('voting'))).toBe('bounce');
    expect(
      phaseSound(view('lobby'), {
        ...view('lobby'),
        players: [{ id: 'a' }, { id: 'b' }],
      } as RoomView),
    ).toBe('join');
    expect(phaseSound(view('lobby'), view('answering'))).toBe('start');
  });
  it('keeps existing open tabs able to preload the legacy sound URLs', () => {
    const directory = path.join(process.cwd(), 'public/audio/ogiri');
    expect(statSync(path.join(directory, 'boing.mp3')).size).toBeGreaterThan(0);
    expect(statSync(path.join(directory, 'boing.mp3')).size).toBeLessThan(5000);
    expect(readFileSync(path.join(directory, 'score-count.mp3')))
      .toEqual(readFileSync(path.join(directory, 'points-cheer.mp3')));
  });
  it('bounds dry percussive cues and gain, with distinct accents and lightweight recorded cheers', () => {
    expect(DEFAULT_PARTY_VOLUME).toBe(0.6);
    expect(Object.keys(SOUND_CUES)).toHaveLength(13);
    expect(new Set(Object.values(SOUND_CUES).map((tones) => JSON.stringify(tones))).size).toBe(13);
    for (const tones of Object.values(SOUND_CUES))
      for (const tone of tones) {
        expect(tone.frequency).toBeGreaterThan(60);
        expect(tone.frequency).toBeLessThan(4000);
        expect(tone.at + tone.duration).toBeLessThan(3);
        expect(tone.gain).toBeGreaterThan(0);
        expect(tone.gain).toBeLessThanOrEqual(0.6);
        expect((tone as import('@/lib/ogiri/sound').Tone).vibrato).toBeUndefined();
        expect((tone as import('@/lib/ogiri/sound').Tone).pitch).toBeUndefined();
      }
    const duration = (cue: keyof typeof SOUND_CUES) => Math.max(...SOUND_CUES[cue].map(t => t.at + t.duration));
    expect(duration('select')).toBeLessThan(0.1);
    expect(duration('tick')).toBeLessThan(0.06);
    expect(duration('champion')).toBeLessThan(1.2);
    expect(duration('bounce')).toBeLessThanOrEqual(0.12);
    for (const tone of SOUND_CUES.bounce as import('@/lib/ogiri/sound').Tone[]) {
      expect(tone.wave ?? 'sine').toBe('sine');
      expect(tone.vibrato).toBeUndefined();
      expect(tone.pitch).toBeUndefined();
      expect(tone.frequency).toBeGreaterThan(500);
      expect(tone.endFrequency ?? tone.frequency).toBeGreaterThan(500);
    }
    expect(Object.keys(SOUND_FILES).sort()).toEqual(['cheer', 'count']);
    expect(SOUND_FILES.count).toBe('/audio/ogiri/points-cheer.mp3');
    expect(Object.values(SOUND_FILES).reduce((total, file) => total + statSync(path.join(process.cwd(), 'public', file)).size, 0))
      .toBeLessThan(40000);
  });
  it('cleans every voice on mute and clamps volume without trying to autoplay suspended audio', async () => {
    const oscillators: { stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] =
      [];
    const gainChanges = vi.fn();
    const parameter = () => ({ setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
    const createSource = () => {
      const oscillator = {
        connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(),
        frequency: parameter(), detune: parameter(),
      };
      oscillators.push(oscillator);
      return oscillator;
    };
    const context = {
      state: 'suspended',
      currentTime: 0,
      sampleRate: 22050,
      destination: {},
      resume: vi.fn(),
      close: vi.fn(),
      decodeAudioData: vi.fn(async () => ({ duration: 1 })),
      createGain: () => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        gain: { setValueAtTime: gainChanges, exponentialRampToValueAtTime: vi.fn() },
      }),
      createOscillator: createSource,
      createBufferSource: createSource,
      createBuffer: () => ({ getChannelData: () => new Float32Array(5513) }),
      createBiquadFilter: () => ({
        connect: vi.fn(), disconnect: vi.fn(), frequency: parameter(), Q: parameter(),
      }),
      createDynamicsCompressor: () => ({
        connect: vi.fn(), disconnect: vi.fn(), threshold: parameter(), knee: parameter(),
        ratio: parameter(), attack: parameter(), release: parameter(),
      }),
      createWaveShaper: () => ({ connect: vi.fn(), disconnect: vi.fn() }),
    };
    const audio = createPartyAudio(context as unknown as AudioContext);
    audio.play('champion', 1);
    expect(oscillators).toHaveLength(0);
    expect(context.resume).not.toHaveBeenCalled();
    await expect(audio.resume()).rejects.toThrow('not running');
    context.state = 'running';
    await expect(audio.resume()).resolves.toBeUndefined();
    expect(audio.state()).toBe('running');
    audio.setVolume(10);
    expect(gainChanges).toHaveBeenLastCalledWith(1, 0);
    audio.setVolume(Number.NaN);
    expect(gainChanges).toHaveBeenLastCalledWith(0, 0);
    audio.play('reveal', 0.4);
    expect(oscillators.length).toBeGreaterThan(0);
    audio.stop();
    for (const cue of ['cheer', 'bounce', 'count'] as const) {
      audio.play(cue, 0.6);
      audio.stop();
      audio.stop();
    }
    expect(
      oscillators.every(
        (o) => o.stop.mock.calls.length === 2 && o.disconnect.mock.calls.length === 1,
      ),
    ).toBe(true);
    const fetchSample = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal('fetch', fetchSample);
    try {
      await audio.prepare();
      await audio.prepare();
      expect(fetchSample).toHaveBeenCalledTimes(2);
      const before = oscillators.length;
      audio.play('count', 1);
      expect(oscillators).toHaveLength(before + 1); // Decoded clip, no delayed synthesis or fetch.
      expect(fetchSample).toHaveBeenCalledTimes(2);
      audio.stop();
      expect(oscillators.at(-1)!.stop).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
    await audio.close();
    expect(context.close).toHaveBeenCalledOnce();
  });
});

it.each(['ogiri', 'majority', 'identity'] as const)('requires an actual score increase for the %s points voice', gameType => {
  const previous = { ...view('voting'), gameType, players: [{ id: 'a', score: 200 }, { id: 'b', score: 50 }] } as RoomView;
  const answerOnly = { ...previous, phase: 'reveal', turn: 'another-reveal' } as RoomView;
  expect(phaseSound(previous, answerOnly)).toBe('bounce');
  const decrease = { ...answerOnly, players: [{ id: 'a', score: 100 }, { id: 'b', score: 50 }] } as RoomView;
  expect(phaseSound(previous, decrease)).toBe('bounce');
  const scored = { ...answerOnly, players: [{ id: 'a', score: 200 }, { id: 'b', score: 150 }] } as RoomView;
  expect(phaseSound(previous, scored)).toBe('count');
  expect(phaseSound(scored, structuredClone(scored))).toBeNull();
  const newlyVisiblePlayer = { ...answerOnly, players: [...answerOnly.players, { id: 'new', score: 500 }] } as RoomView;
  expect(phaseSound(previous, newlyVisiblePlayer)).toBe('bounce');
});
