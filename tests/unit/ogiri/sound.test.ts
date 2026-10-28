import { describe, it, expect, vi } from 'vitest';
import { createPartyAudio, phaseSound, SOUND_CUES } from '@/lib/ogiri/sound';
import type { RoomView } from '@/lib/ogiri/types';
const view = (phase: RoomView['phase'], turn = phase) =>
  ({ code: 'ABC234', phase, turn, paused: false, players: [{ id: 'a' }] }) as RoomView;
describe('original party audio', () => {
  it('plays state transitions once, and stays silent for initial views, polls and paused states', () => {
    expect(phaseSound(null, view('finished'))).toBeNull();
    expect(phaseSound(view('reveal'), view('reveal'))).toBeNull();
    expect(phaseSound(view('voting'), { ...view('reveal'), paused: true })).toBeNull();
    expect(phaseSound(view('voting'), view('reveal'))).toBe('reveal');
    expect(phaseSound(view('ranking'), view('finished'))).toBe('champion');
    expect(
      phaseSound(view('lobby'), {
        ...view('lobby'),
        players: [{ id: 'a' }, { id: 'b' }],
      } as RoomView),
    ).toBe('join');
    expect(phaseSound(view('lobby'), view('answering'))).toBe('start');
  });
  it('bounds cue duration and gain, with distinct short notes for each action', () => {
    expect(Object.keys(SOUND_CUES)).toHaveLength(10);
    expect(new Set(Object.values(SOUND_CUES).map((tones) => JSON.stringify(tones))).size).toBe(10);
    for (const tones of Object.values(SOUND_CUES))
      for (const tone of tones) {
        expect(tone.frequency).toBeGreaterThan(100);
        expect(tone.frequency).toBeLessThan(2000);
        expect(tone.at + tone.duration).toBeLessThan(2);
        expect(tone.gain).toBeGreaterThan(0);
        expect(tone.gain).toBeLessThanOrEqual(0.6);
      }
  });
  it('cleans every voice on mute and clamps volume without trying to autoplay suspended audio', async () => {
    const oscillators: { stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] =
      [];
    const gainChanges = vi.fn();
    const context = {
      state: 'suspended',
      currentTime: 0,
      destination: {},
      resume: vi.fn(),
      close: vi.fn(),
      createGain: () => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        gain: { setValueAtTime: gainChanges, exponentialRampToValueAtTime: vi.fn() },
      }),
      createOscillator: () => {
        const oscillator = {
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        };
        oscillators.push(oscillator);
        return oscillator;
      },
    };
    const audio = createPartyAudio(context as unknown as AudioContext);
    audio.play('champion', 1);
    expect(oscillators).toHaveLength(0);
    expect(context.resume).not.toHaveBeenCalled();
    context.state = 'running';
    audio.setVolume(10);
    expect(gainChanges).toHaveBeenLastCalledWith(0.2, 0);
    audio.setVolume(Number.NaN);
    expect(gainChanges).toHaveBeenLastCalledWith(0, 0);
    audio.play('reveal', 0.4);
    expect(oscillators).toHaveLength(4);
    audio.stop();
    expect(
      oscillators.every(
        (o) => o.stop.mock.calls.length === 2 && o.disconnect.mock.calls.length === 1,
      ),
    ).toBe(true);
    await audio.close();
    expect(context.close).toHaveBeenCalledOnce();
  });
});
