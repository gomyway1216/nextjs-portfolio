import { describe, expect, it } from 'vitest';
import { MACHINE_SOUNDS, PEAK, SOUND_WORDS, TICK_GAP, countedSoundLength, pitch, renderSound } from '@/components/game/MedalCenter/machineSounds';
import { COUNT_UP } from '@/components/game/MedalCenter/countUp';

// The table machines' sounds are worked out as numbers, so they can be measured without anyone listening: each one
// starts and ends in silence, never goes past the peak, and is short.

describe('the table machines’ sounds', () => {
  it('each starts and ends in silence, is never louder than the peak, and is short', () => {
    for (const sound of MACHINE_SOUNDS) {
      const samples = renderSound(sound, 22050);
      expect(samples.length, sound).toBeGreaterThan(100);
      let loudest = 0;
      let bad = 0;
      for (const v of samples) {
        if (!Number.isFinite(v)) bad++;
        loudest = Math.max(loudest, Math.abs(v));
      }
      expect(bad, sound).toBe(0);
      expect(loudest, sound).toBeLessThanOrEqual(PEAK + 1e-6);
      expect(loudest, sound).toBeGreaterThan(PEAK * 0.6);
      expect(Math.abs(samples[0]), sound).toBeLessThan(0.01);
      expect(Math.abs(samples[samples.length - 1]), sound).toBeLessThan(0.01);
      expect(countedSoundLength(sound, 22050), sound).toBeLessThan(2);
    }
  });

  it('chirps each medal of a win in less time than a medal takes to count in', () => {
    // A medal is counted in every COUNT_UP.perMedal ms; its chirp is shorter, so chirps never pile up.
    expect(countedSoundLength('tick', 44100) * 1000).toBeLessThan(COUNT_UP.perMedal);
    expect(TICK_GAP * 1000).toBeLessThan(COUNT_UP.perMedal);
  });

  it('tunes its notes from A4 = 440 Hz', () => {
    expect(pitch('A4')).toBeCloseTo(440, 9);
    expect(pitch('A5')).toBeCloseTo(880, 9);
    expect(pitch('C5')).toBeCloseTo(523.2511, 3);
  });

  it('names its switch in both languages, with no word of money', () => {
    expect(SOUND_WORDS.en).toEqual({ on: 'Sound on', off: 'Sound off' });
    expect(SOUND_WORDS.ja).toEqual({ on: '音あり', off: '音なし' });
  });
});
