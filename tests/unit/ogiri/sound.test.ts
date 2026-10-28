import { describe, it, expect, vi } from 'vitest';
import { createPartyAudio, DEFAULT_PARTY_VOLUME, phaseSound, SOUND_CUES } from '@/lib/ogiri/sound';
import type { RoomView } from '@/lib/ogiri/types';
const view = (phase: RoomView['phase'], turn = phase) =>
  ({ code: 'ABC234', phase, turn, paused: false, players: [{ id: 'a' }] }) as RoomView;
describe('original party audio', () => {
  it('plays state transitions once, and stays silent for initial views, polls and paused states', () => {
    expect(phaseSound(null, view('finished'))).toBeNull();
    expect(phaseSound(view('reveal'), view('reveal'))).toBeNull();
    expect(phaseSound(view('voting'), { ...view('reveal'), paused: true })).toBeNull();
    expect(phaseSound(view('voting'), view('reveal'))).toBe('count');
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
  it('bounds cue duration and gain, with distinct short notes for each action', () => {
    expect(DEFAULT_PARTY_VOLUME).toBe(0.6);
    expect(Object.keys(SOUND_CUES)).toHaveLength(13);
    expect(new Set(Object.values(SOUND_CUES).map((tones) => JSON.stringify(tones))).size).toBe(13);
    for (const tones of Object.values(SOUND_CUES))
      for (const tone of tones) {
        expect(tone.frequency).toBeGreaterThan(100);
        expect(tone.frequency).toBeLessThan(2000);
        expect(tone.at + tone.duration).toBeLessThan(3);
        expect(tone.gain).toBeGreaterThan(0);
        expect(tone.gain).toBeLessThanOrEqual(0.6);
      }
    const duration = (cue: keyof typeof SOUND_CUES) => Math.max(...SOUND_CUES[cue].map(t => t.at + t.duration));
    expect(duration('count')).toBeCloseTo(1);
    expect(duration('cheer')).toBeGreaterThan(2);
    expect(SOUND_CUES.bounce[0].pitch!.map(p => p.frequency)).toEqual([780, 225, 580, 265, 400, 300]);
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
    expect(gainChanges).toHaveBeenLastCalledWith(0.32, 0);
    audio.setVolume(Number.NaN);
    expect(gainChanges).toHaveBeenLastCalledWith(0, 0);
    audio.play('reveal', 0.4);
    expect(oscillators).toHaveLength(5);
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
    await audio.close();
    expect(context.close).toHaveBeenCalledOnce();
  });
});
