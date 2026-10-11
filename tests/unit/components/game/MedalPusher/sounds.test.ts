import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  COMPRESSOR,
  LEVEL,
  LIMITS,
  MASTER_GAIN,
  MEDAL,
  MUSIC,
  MUSIC_ON,
  POCKET_NOTES,
  POURS,
  POUR_SAMPLES,
  SAMPLES,
  SCORES,
  SOUNDS,
  SOUND_LEVELS,
  TRAY,
  VARIANTS,
  hush,
  pitch,
  playSound,
  pourHits,
  pourLevel,
  pourSeed,
  renderSound,
  resetAudio,
  setMusic,
  unlockAudio,
  type Note,
  type Pour,
  type PusherSound,
  type Sample,
} from '@/components/game/MedalPusher/sounds';

// ── A stand-in for the Web Audio API that writes down everything it is asked to do ──

class FakeParam {
  /** Every value it has been given, by assignment or on a schedule. */
  readonly seen: number[] = [];
  private current: number;

  constructor(initial: number) {
    this.current = initial;
  }

  get value(): number {
    return this.current;
  }

  set value(next: number) {
    this.current = next;
    this.seen.push(next);
  }

  setValueAtTime(value: number): this {
    this.seen.push(value);
    return this;
  }

  linearRampToValueAtTime(value: number): this {
    this.seen.push(value);
    return this;
  }

  /** The targets it has been set, with the moment each starts, and the moments its schedule was cleared from. */
  readonly targets: { value: number; at: number }[] = [];
  readonly cancelled: number[] = [];

  setTargetAtTime(value: number, at = 0): this {
    this.seen.push(value);
    this.targets.push({ value, at });
    return this;
  }

  cancelScheduledValues(from = 0): this {
    this.cancelled.push(from);
    return this;
  }
}

class FakeNode {
  readonly outputs: FakeNode[] = [];

  connect(to: FakeNode): FakeNode {
    this.outputs.push(to);
    return to;
  }

  disconnect(): void {
    this.outputs.length = 0;
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1);
}

class FakeCompressor extends FakeNode {
  readonly threshold = new FakeParam(-24);
  readonly knee = new FakeParam(30);
  readonly ratio = new FakeParam(12);
  readonly attack = new FakeParam(0.003);
  readonly release = new FakeParam(0.25);
}

class FakeBuffer {
  readonly data: Float32Array;

  constructor(
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = new Float32Array(length);
  }

  get duration(): number {
    return this.length / this.sampleRate;
  }

  getChannelData(): Float32Array {
    return this.data;
  }
}

class FakeSource extends FakeNode {
  buffer: FakeBuffer | null = null;
  loop = false;
  onended: (() => void) | null = null;
  readonly playbackRate = new FakeParam(1);
  /** When it was told to start, and every time it was told to stop: the last one counts. */
  readonly started: number[] = [];
  readonly stopped: number[] = [];

  start(when = 0): void {
    this.started.push(when);
  }

  stop(when = 0): void {
    this.stopped.push(when);
  }

  get begins(): number {
    return this.started[0];
  }

  get ends(): number {
    return this.stopped[this.stopped.length - 1];
  }
}

class FakeContext {
  static made: FakeContext[] = [];
  /** Set to make every new source fail, as a browser that has run out of something would. */
  static broken = false;

  state: 'suspended' | 'running' | 'closed' = 'suspended';
  currentTime = 0;
  sampleRate = 48000;
  onstatechange: (() => void) | null = null;
  readonly destination = new FakeNode();
  readonly gains: FakeGain[] = [];
  readonly sources: FakeSource[] = [];
  readonly buffers: FakeBuffer[] = [];
  readonly compressors: FakeCompressor[] = [];

  constructor() {
    FakeContext.made.push(this);
  }

  createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }

  createDynamicsCompressor(): FakeCompressor {
    const compressor = new FakeCompressor();
    this.compressors.push(compressor);
    return compressor;
  }

  createBuffer(_channels: number, length: number, sampleRate: number): FakeBuffer {
    const buffer = new FakeBuffer(length, sampleRate);
    this.buffers.push(buffer);
    return buffer;
  }

  createBufferSource(): FakeSource {
    if (FakeContext.broken) throw new Error('no more sources');
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }

  become(state: 'suspended' | 'running'): void {
    this.state = state;
    this.onstatechange?.();
  }

  async resume(): Promise<void> {
    this.become('running');
  }

  async close(): Promise<void> {
    this.state = 'closed';
  }

  /** The gain everything else is connected to. */
  get master(): FakeGain {
    return this.gains[0];
  }

  /** The gain the loop alone goes through on its way to the master. */
  get bus(): FakeGain {
    return this.gains[1];
  }

  /** The gain a source plays through. */
  gainOf(source: FakeSource): FakeGain {
    return source.outputs[0] as FakeGain;
  }

  /** Sources that are still to finish `margin` seconds from now. */
  sounding(margin = 0): FakeSource[] {
    return this.sources.filter((source) => source.ends > this.currentTime + margin);
  }
}

/** The loudest a stretch of samples gets. A loop, because a jackpot has too many samples to spread into Math.max. */
function peakOf(samples: Float32Array): number {
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  return peak;
}

/**
 * Where two stretches of samples first differ, or −1 when they are the same sample for sample. A loop, because
 * deep equality on a few hundred thousand numbers takes seconds, and on a busy machine more than a test is given.
 */
function firstDifference(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return Math.min(a.length, b.length);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i;
  return -1;
}

/** A sound being cut short fades for this long; a little more than the module's own figure. */
const FADE = 0.031;
const EVERY_TAKE = SAMPLES.reduce((sum, sample) => sum + (VARIANTS[sample] ?? 1), 0);

/**
 * Presses the Sound toggle. The cabinet then works its buffers out one by one in the background; a test that
 * is about that lets it finish (`warm`), and every other test calls it off, so that only the sounds it plays
 * are worked out and it stays quick.
 */
async function switchOn(warm = false): Promise<FakeContext> {
  vi.stubGlobal('AudioContext', FakeContext);
  await unlockAudio();
  if (warm) vi.advanceTimersByTime(5000);
  else vi.clearAllTimers();
  return FakeContext.made[FakeContext.made.length - 1];
}

/** Makes every roll of the dice come out as `value`: with 0 a medal is its first take, at its full level, a shade slow. */
function fix(value: number): void {
  vi.spyOn(Math, 'random').mockReturnValue(value);
}

/** Lets `seconds` go by on the audio clock and the page's timers together. */
function wait(audio: FakeContext, seconds: number, step: number = MUSIC.every): void {
  for (let i = 0; i < Math.round(seconds / step); i++) {
    audio.currentTime += step;
    vi.advanceTimersByTime(step * 1000);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeContext.made = [];
  FakeContext.broken = false;
});

afterEach(() => {
  resetAudio();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('before the sound is switched on', () => {
  it('makes nothing at all: no context, no node, no timer', () => {
    vi.stubGlobal('AudioContext', FakeContext);
    for (const sound of SOUNDS) playSound(sound, true);
    setMusic(true);
    hush();
    expect(FakeContext.made).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('plays nothing while the sound is off, even with the audio awake', async () => {
    const audio = await switchOn();
    for (const sound of SOUNDS) playSound(sound, false);
    expect(audio.sources).toHaveLength(0);
  });

  it('plays nothing while the context is not running', async () => {
    const audio = await switchOn();
    audio.become('suspended');
    for (const sound of SOUNDS) playSound(sound, true);
    setMusic(true);
    wait(audio, 2);
    expect(audio.sources).toHaveLength(0);
  });

  it('is harmless where there is no Web Audio', async () => {
    await expect(unlockAudio()).resolves.toBeUndefined();
    expect(() => {
      playSound('jackpot', true);
      setMusic(true);
      hush();
    }).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('makes one context however often the toggle is pressed', async () => {
    await switchOn();
    await unlockAudio();
    await unlockAudio();
    expect(FakeContext.made).toHaveLength(1);
  });

  it('wakes a context the browser had put to sleep', async () => {
    const audio = await switchOn();
    audio.state = 'suspended';
    await unlockAudio();
    expect(audio.state).toBe('running');
  });
});

describe('the chain', () => {
  it('is one gain into one compressor into the speakers', async () => {
    const audio = await switchOn();
    expect(audio.compressors).toHaveLength(1);
    expect(audio.master.outputs).toEqual([audio.compressors[0]]);
    expect(audio.compressors[0].outputs).toEqual([audio.destination]);
    expect(audio.master.gain.value).toBe(MASTER_GAIN);
    // And one more gain in front, wide open, that only the loop goes through.
    expect(audio.gains).toHaveLength(2);
    expect(audio.bus.outputs).toEqual([audio.master]);
    expect(audio.bus.gain.value).toBe(1);
  });

  it('sets the compressor as a limiter', async () => {
    const audio = await switchOn();
    const [compressor] = audio.compressors;
    expect(compressor.threshold.value).toBe(COMPRESSOR.threshold);
    expect(compressor.knee.value).toBe(0);
    expect(compressor.ratio.value).toBe(COMPRESSOR.ratio);
    expect(compressor.attack.value).toBe(COMPRESSOR.attack);
    expect(compressor.release.value).toBe(COMPRESSOR.release);
  });

  /** What comes out of the chain for a steady level going in, by the compressor's own rule. */
  function through(level: number): number {
    const makeUp = -0.6 * COMPRESSOR.threshold * (1 - 1 / COMPRESSOR.ratio);
    const into = 20 * Math.log10(level * MASTER_GAIN);
    const out = into <= COMPRESSOR.threshold ? into : COMPRESSOR.threshold + (into - COMPRESSOR.threshold) / COMPRESSOR.ratio;
    return 10 ** ((out + makeUp) / 20);
  }

  it('leaves a single sound at the level it was played at', () => {
    expect(MASTER_GAIN).toBeLessThan(1);
    for (const level of [0.01, 0.05, LEVEL.ceiling, 0.3]) expect(through(level)).toBeCloseTo(level * LEVEL.master, 10);
  });

  it('cannot clip, however many sounds pile up', () => {
    // Every voice there can be, each at the ceiling and all of them in step: far more than a jackpot over a stream of medals.
    const everything = (LIMITS.voices + MUSIC.voices) * LEVEL.ceiling;
    expect(everything).toBeGreaterThan(1);
    expect(through(everything)).toBeLessThan(0.5);
    expect(through(100)).toBeLessThan(1);
  });

  it('keeps every sound under the ceiling, and the ceiling low', () => {
    expect(LEVEL.ceiling).toBeLessThanOrEqual(0.12);
    for (const sound of SOUNDS) {
      expect(SOUND_LEVELS[sound], sound).toBeGreaterThan(0);
      expect(SOUND_LEVELS[sound], sound).toBeLessThanOrEqual(LEVEL.ceiling);
    }
    for (const part of MUSIC.parts) expect(part.level).toBeLessThan(Math.min(...Object.values(SOUND_LEVELS).filter((level) => level > SOUND_LEVELS.spin)));
  });

  it('plays the medals well above the loop, and a rattle louder the more medals are in it', () => {
    const loop = MUSIC.parts.reduce((sum, part) => sum + part.level, 0);
    for (const sound of ['land', 'insert', 'win', 'lost'] as const) expect(SOUND_LEVELS[sound], sound).toBeGreaterThanOrEqual(loop * 2.5);
    expect(pourLevel(1)).toBe(SOUND_LEVELS.win);
    expect(pourLevel(POURS[POURS.length - 1])).toBeCloseTo(LEVEL.ceiling, 12);
    POURS.forEach((size, index) => {
      if (index > 0) expect(pourLevel(size)).toBeGreaterThan(pourLevel(POURS[index - 1]));
      expect(pourLevel(size)).toBeLessThanOrEqual(LEVEL.ceiling + 1e-12);
    });
    // Under the medals the loop is turned well down, but not off.
    expect(MUSIC.ducked).toBeGreaterThan(0.2);
    expect(MUSIC.ducked).toBeLessThan(0.6);
  });
});

describe('every sound', () => {
  it.each(SOUNDS)('%s plays, through the master, and is stopped as well as started', async (sound) => {
    const audio = await switchOn();
    expect(() => playSound(sound, true)).not.toThrow();
    expect(audio.sources.length).toBeGreaterThanOrEqual(1);
    for (const source of audio.sources) {
      expect(source.buffer).not.toBeNull();
      expect(source.started).toHaveLength(1);
      expect(source.stopped).toHaveLength(1);
      expect(source.begins).toBeGreaterThanOrEqual(audio.currentTime);
      expect(source.ends).toBeGreaterThan(source.begins);
      expect(source.ends - source.begins).toBeLessThan(7);
      expect(audio.gainOf(source).outputs).toEqual([audio.master]);
    }
  });

  it('never schedules a gain above the ceiling', async () => {
    const audio = await switchOn();
    setMusic(true);
    // A tower into the tray first, while there is room for all of it, then everything at once for four seconds.
    playSound('win', true, { count: 30 });
    wait(audio, 2);
    for (let round = 0; round < 40; round++) {
      for (const sound of SOUNDS) playSound(sound, true, { level: round % 8, count: 1 + ((round * 7) % 40), stops: [0.3 + round * 0.01, 1.4, 0.9] });
      wait(audio, 0.1);
    }
    hush();
    expect(audio.sources.length).toBeGreaterThan(100);
    const voices = audio.gains.filter((gain) => gain !== audio.master && gain !== audio.bus);
    expect(voices).toHaveLength(audio.sources.length);
    for (const gain of voices) {
      expect(gain.gain.seen.length).toBeGreaterThan(0);
      for (const value of gain.gain.seen) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(LEVEL.ceiling);
      }
    }
    expect(audio.master.gain.seen).toEqual([MASTER_GAIN]);
    // The loop's own gain only ever goes down from wide open, and comes back.
    expect(audio.bus.gain.seen.length).toBeGreaterThan(1);
    for (const value of audio.bus.gain.seen) expect([1, MUSIC.ducked]).toContain(value);
  });

  it('stops every source it starts, the loop and the reels included', async () => {
    const audio = await switchOn();
    setMusic(true);
    for (let round = 0; round < 40; round++) {
      for (const sound of SOUNDS) playSound(sound, true);
      wait(audio, 0.1);
    }
    for (const source of audio.sources) {
      expect(source.started).toHaveLength(1);
      expect(source.stopped.length).toBeGreaterThanOrEqual(1);
      // Left to itself a source ends after it begins. One that was cut short may have been a note of the loop that
      // a fanfare stopped before its time came, which a browser then never plays at all.
      if (source.stopped.length === 1) expect(source.ends).toBeGreaterThan(source.begins);
    }
  });

  it('works each buffer out once', async () => {
    const audio = await switchOn(true);
    expect(audio.buffers).toHaveLength(EVERY_TAKE);
    setMusic(true);
    for (let round = 0; round < 20; round++) {
      for (const sound of SOUNDS) playSound(sound, true, { level: 1 + (round % 6), count: 1 + round * 3 });
      wait(audio, 0.2);
    }
    expect(audio.buffers).toHaveLength(EVERY_TAKE);
    for (const buffer of audio.buffers) expect(peakOf(buffer.data)).toBeCloseTo(1, 5);
  });

  it('plays a sound straight away, before the buffers have been worked out', async () => {
    vi.stubGlobal('AudioContext', FakeContext);
    await unlockAudio();
    const [audio] = FakeContext.made;
    expect(audio.buffers).toHaveLength(0);
    playSound('jackpot', true);
    expect(audio.sources).toHaveLength(1);
    expect(audio.buffers).toHaveLength(1);
  });

  it.each(['land', 'insert', 'lost', 'roll'] as const)('gives each %s a sound of its own: one of several takes, at its own pitch and level', async (sound) => {
    const audio = await switchOn();
    for (let medal = 0; medal < 60; medal++) {
      playSound(sound, true, { bare: false });
      audio.currentTime += 0.05;
    }
    expect(audio.sources).toHaveLength(60);
    const speeds = audio.sources.map((source) => source.playbackRate.value);
    const levels = audio.sources.map((source) => audio.gainOf(source).gain.value);
    expect(new Set(speeds).size).toBeGreaterThan(50);
    expect(new Set(levels).size).toBeGreaterThan(50);
    expect(new Set(audio.sources.map((source) => source.buffer)).size).toBe(VARIANTS[sound]);
    for (const speed of speeds) expect(Math.abs(speed - 1)).toBeLessThanOrEqual(0.05 + 1e-9);
    for (const level of levels) {
      expect(level).toBeLessThanOrEqual(SOUND_LEVELS[sound]);
      expect(level).toBeGreaterThanOrEqual(SOUND_LEVELS[sound] * 0.7 - 1e-9);
    }
  });

  it('lands a medal on the table or on other medals, as it is told, and more often on medals when it is not', async () => {
    const audio = await switchOn();
    const lengths = (sample: Sample) => Array.from({ length: VARIANTS[sample] ?? 1 }, (_, variant) => rendered(sample, variant).length);
    const [onMedals, onTable] = [lengths('land'), lengths('plate')];
    expect(onMedals.some((length) => onTable.includes(length))).toBe(false);
    const landed = (options?: { bare?: boolean }): number => {
      audio.currentTime += 1;
      playSound('land', true, options);
      return audio.sources[audio.sources.length - 1].buffer?.length ?? 0;
    };
    for (let medal = 0; medal < 12; medal++) expect(onTable).toContain(landed({ bare: true }));
    for (let medal = 0; medal < 12; medal++) expect(onMedals).toContain(landed({ bare: false }));
    // Left to chance, it is the table about one time in four.
    fix(0.2);
    expect(onTable).toContain(landed());
    fix(0.3);
    expect(onMedals).toContain(landed());
    fix(0.99);
    expect(onMedals).toContain(landed());
  });

  it('plays everything but a medal the same way every time', async () => {
    const audio = await switchOn();
    for (let round = 0; round < 5; round++) {
      playSound('prize', true);
      wait(audio, 1);
    }
    expect(new Set(audio.sources.map((source) => source.buffer)).size).toBe(1);
    for (const source of audio.sources) {
      expect(source.playbackRate.value).toBe(1);
      expect(audio.gainOf(source).gain.value).toBe(SOUND_LEVELS.prize);
    }
  });

  it("raises the pocket's tone with the run", async () => {
    const audio = await switchOn();
    for (const level of [1, 2, 3, 4, 5, 6, 0, 99, undefined]) {
      playSound('pocket', true, { level });
      wait(audio, 1);
    }
    const takes = audio.sources.map((source) => source.buffer);
    expect(new Set(takes.slice(0, 6)).size).toBe(6);
    expect(takes[6]).toBe(takes[0]);
    expect(takes[7]).toBe(takes[5]);
    expect(takes[8]).toBe(takes[0]);
  });

  it('gives each reel a whirr that lasts as long as it turns and winds down as it stops', async () => {
    const audio = await switchOn();
    audio.currentTime = 10;
    playSound('spin', true, { stops: [0.72, 2.9, 1.2] });
    expect(audio.sources).toHaveLength(3);
    expect(audio.sources.map((source) => source.ends - 10)).toEqual([0.72, 2.9, 1.2].map((stop) => expect.closeTo(stop, 6)));
    for (const source of audio.sources) {
      expect(source.loop).toBe(true);
      expect(source.begins).toBe(10);
      const speeds = source.playbackRate.seen;
      expect(speeds[speeds.length - 1]).toBeLessThan(speeds[0]);
      const levels = audio.gainOf(source).gain.seen;
      expect(levels[0]).toBe(SOUND_LEVELS.spin);
      expect(levels[levels.length - 1]).toBe(0);
    }
    // No two reels at the same speed, or they would be one sound.
    expect(new Set(audio.sources.map((source) => source.playbackRate.seen[0])).size).toBe(3);
  });

  it('leaves out a reel that has no time to turn, and spins on its own clock when it is told nothing', async () => {
    const audio = await switchOn();
    playSound('spin', true, { stops: [0, 1, 0.5] });
    expect(audio.sources).toHaveLength(2);
    wait(audio, 5);
    playSound('spin', true);
    expect(audio.sources).toHaveLength(5);
  });

  it('never throws into the game when a sound cannot be made', async () => {
    const audio = await switchOn();
    FakeContext.broken = true;
    expect(() => {
      for (const sound of SOUNDS) playSound(sound, true);
      setMusic(true);
      wait(audio, 1);
    }).not.toThrow();
    expect(audio.sources).toHaveLength(0);
  });
});

describe('the limits', () => {
  it('plays one clink for two hundred asked for in the same instant', async () => {
    const audio = await switchOn();
    for (let i = 0; i < 200; i++) playSound('land', true);
    expect(audio.sources).toHaveLength(1);
  });

  it.each(['land', 'insert', 'lost', 'roll'] as const)('holds a burst of two hundred %s clinks to a few', async (sound) => {
    const audio = await switchOn();
    for (let i = 0; i < 200; i++) {
      playSound(sound, true);
      audio.currentTime += LIMITS.window / 200;
    }
    expect(audio.sources.length).toBeGreaterThanOrEqual(2);
    expect(audio.sources.length).toBeLessThanOrEqual(LIMITS.clinks);
  });

  it('holds a long stream to the same rate, in any tenth of a second', async () => {
    const audio = await switchOn();
    for (let i = 0; i < 4000; i++) {
      playSound('land', true);
      playSound('insert', true);
      playSound('lost', true);
      audio.currentTime += 0.0007;
    }
    const seconds = audio.currentTime;
    const starts = audio.sources.map((source) => source.begins).sort((a, b) => a - b);
    // Three kinds of clink, each held to its own few.
    expect(starts.length).toBeLessThanOrEqual(Math.ceil(seconds / LIMITS.window) * LIMITS.clinks * 3);
    for (const from of starts) {
      const within = starts.filter((at) => at >= from && at < from + LIMITS.window - 1e-9).length;
      expect(within).toBeLessThanOrEqual(LIMITS.clinks * 3);
    }
    // And never so many in the air that a jingle would be crowded out.
    expect(LIMITS.kept).toBeGreaterThan(0);
  });

  it('never has more voices in the air than the limit, however hard it is pressed', async () => {
    const audio = await switchOn();
    let most = 0;
    for (let i = 0; i < 3000; i++) {
      for (const sound of SOUNDS) playSound(sound, true, { level: 1 + (i % 6), count: 1 + (i % 50) });
      most = Math.max(most, audio.sounding(FADE).length);
      expect(audio.sounding(FADE).length).toBeLessThanOrEqual(LIMITS.voices);
      audio.currentTime += 0.004;
    }
    // It was pressed hard enough to reach the limit (give or take a voice in its last few milliseconds),
    // and it created far fewer nodes than it was asked for.
    expect(most).toBeGreaterThanOrEqual(LIMITS.voices - 2);
    expect(audio.sources.length).toBeLessThan(3000 * SOUNDS.length * 0.1);
  });

  it('keeps voices back from the medals for the jingles', async () => {
    const audio = await switchOn();
    // Long sounds, a few at a time, until only the voices kept back are free.
    const long: PusherSound[] = ['jackpot', 'fever', 'seven', 'ball', 'big', 'small', 'chest', 'open', 'dice', 'reach', 'prize', 'pocket'];
    while (audio.sounding().length < LIMITS.voices - LIMITS.kept) {
      for (const sound of long) if (audio.sounding().length < LIMITS.voices - LIMITS.kept) playSound(sound, true);
      audio.currentTime += 0.09;
    }
    const before = audio.sources.length;
    playSound('land', true);
    playSound('insert', true);
    playSound('win', true, { count: 30 });
    playSound('lost', true);
    expect(audio.sources).toHaveLength(before);
    playSound('gate', true);
    expect(audio.sources).toHaveLength(before + 1);
  });

  it('does not start a jingle on top of itself', async () => {
    const audio = await switchOn();
    for (let i = 0; i < 10; i++) playSound('fever', true);
    expect(audio.sources).toHaveLength(1);
    audio.currentTime += LIMITS.gap;
    playSound('fever', true);
    expect(audio.sources).toHaveLength(2);
  });

  it('lets the lamps tick faster than a jingle may repeat, but not without end', async () => {
    const audio = await switchOn();
    for (let i = 0; i < 1000; i++) {
      playSound('tick', true);
      audio.currentTime += 0.001;
    }
    expect(audio.sources.length).toBeGreaterThan(1 / LIMITS.gap);
    expect(audio.sources.length).toBeLessThanOrEqual(Math.ceil(1 / LIMITS.quickGap) + 1);
  });
});

describe('the tray', () => {
  /** How many medals a source of the tray holds, told by its level: with the dice fixed at 0 each size has its own. */
  const sizeOf = (audio: FakeContext, source: FakeSource): Pour | undefined => POURS.find((size) => Math.abs(audio.gainOf(source).gain.value - pourLevel(size)) < 1e-9);
  const sizes = (audio: FakeContext, from = 0) => audio.sources.slice(from).map((source) => sizeOf(audio, source));
  const total = (audio: FakeContext, from = 0) => sizes(audio, from).reduce<number>((sum, size) => sum + (size ?? 0), 0);

  it('makes 1, 5 and 30 medals three different things to hear', async () => {
    fix(0);
    const audio = await switchOn();
    const won = (count: number) => {
      audio.currentTime += 5;
      const from = audio.sources.length;
      playSound('win', true, { count });
      return audio.sources.slice(from);
    };
    const [one, five, thirty] = [won(1), won(5), won(30)];
    // One medal is one clink. Five are a rattle of four and one more. Thirty are four rattles, the largest of sixteen.
    expect(one.map((source) => sizeOf(audio, source))).toEqual([1]);
    expect(five.map((source) => sizeOf(audio, source))).toEqual([4, 1]);
    expect(thirty.map((source) => sizeOf(audio, source))).toEqual([16, 8, 4, 2]);
    // Each is the buffer of its size, so they differ in what is played, for how long and how loud.
    for (const source of [...one, ...five, ...thirty]) {
      const size = sizeOf(audio, source) ?? 1;
      expect(source.buffer?.length).toBe(rendered(POUR_SAMPLES[size], 0).length);
    }
    const lasts = (sources: FakeSource[]) => Math.max(...sources.map((source) => source.ends)) - Math.min(...sources.map((source) => source.begins));
    const loudest = (sources: FakeSource[]) => Math.max(...sources.map((source) => audio.gainOf(source).gain.value));
    expect(lasts(five)).toBeGreaterThan(lasts(one));
    expect(lasts(thirty)).toBeGreaterThan(lasts(five) * 1.2);
    expect(loudest(five)).toBeGreaterThan(loudest(one));
    expect(loudest(thirty)).toBeGreaterThan(loudest(five));
  });

  it('is heard a moment after the medal goes over, never at once and never long after', async () => {
    const audio = await switchOn();
    for (let medal = 0; medal < 40; medal++) {
      audio.currentTime += 1;
      playSound('win', true);
      const source = audio.sources[audio.sources.length - 1];
      expect(source.begins - audio.currentTime).toBeGreaterThanOrEqual(TRAY.fall[0]);
      expect(source.begins - audio.currentTime).toBeLessThanOrEqual(TRAY.fall[1]);
      expect(audio.gainOf(source).outputs).toEqual([audio.master]);
    }
    expect(audio.sources).toHaveLength(40);
    expect(new Set(audio.sources.map((source) => (source.begins % 1).toFixed(4))).size).toBeGreaterThan(30);
  });

  it('plays every medal of a steady trickle as a clink of its own, each a little different', async () => {
    const audio = await switchOn();
    for (let medal = 0; medal < 80; medal++) {
      playSound('win', true, { count: 1 });
      audio.currentTime += 0.25;
    }
    expect(audio.sources).toHaveLength(80);
    const single = Array.from({ length: VARIANTS.win ?? 1 }, (_, variant) => rendered('win', variant).length);
    for (const source of audio.sources) {
      expect(single).toContain(source.buffer?.length);
      expect(Math.abs(source.playbackRate.value - 1)).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(audio.gainOf(source).gain.value).toBeLessThanOrEqual(SOUND_LEVELS.win);
      expect(audio.gainOf(source).gain.value).toBeGreaterThanOrEqual(SOUND_LEVELS.win * (1 - TRAY.wander) - 1e-9);
    }
    expect(new Set(audio.sources.map((source) => source.buffer)).size).toBe(VARIANTS.win);
    expect(new Set(audio.sources.map((source) => source.playbackRate.value)).size).toBeGreaterThan(60);
  });

  it('never starts two sources in step', async () => {
    const audio = await switchOn();
    for (let frame = 0; frame < 600; frame++) {
      playSound('win', true, { count: 1 + (frame % 7) });
      audio.currentTime += 1 / 60;
    }
    const begins = audio.sources.map((source) => source.begins).sort((a, b) => a - b);
    expect(begins.length).toBeGreaterThan(20);
    begins.forEach((at, index) => {
      if (index > 0) expect(at - begins[index - 1]).toBeGreaterThanOrEqual(TRAY.spacing - 1e-9);
    });
  });

  it('never has more sources than its limit, however many medals fall', async () => {
    fix(0);
    const audio = await switchOn();
    let asked = 0;
    let most = 0;
    for (let frame = 0; frame < 1200; frame++) {
      // A trickle, then a tower going over, then a flood no machine could pay, then a trickle again.
      const count = frame < 300 ? (frame % 20 === 0 ? 1 : 0) : frame < 600 ? 1 + (frame % 3) : frame < 900 ? 500 : frame % 30 === 0 ? 2 : 0;
      if (count > 0) playSound('win', true, { count });
      asked += count;
      most = Math.max(most, audio.sounding().length);
      expect(audio.sounding().length).toBeLessThanOrEqual(LIMITS.tray);
      audio.currentTime += 1 / 60;
    }
    expect(most).toBe(LIMITS.tray);
    // Hundreds of thousands of medals were a few hundred sources, and no source held more than the largest rattle.
    expect(asked).toBeGreaterThan(100_000);
    expect(audio.sources.length).toBeLessThan(400);
    expect(total(audio)).toBeLessThanOrEqual(audio.sources.length * POURS[POURS.length - 1]);
    expect(LIMITS.tray).toBeLessThanOrEqual(LIMITS.voices - LIMITS.kept);
  });

  it('lets the first few be single medals and asks more of each source after that', async () => {
    fix(0);
    const audio = await switchOn();
    const alone = LIMITS.tray - POURS.length + 1;
    // One medal a frame: the first few are clinks of their own.
    for (let frame = 0; frame < alone; frame++) {
      playSound('win', true);
      audio.currentTime += 1 / 60;
    }
    expect(sizes(audio)).toEqual(Array.from({ length: alone }, () => 1));
    // The next medal has to wait for another: then the two are a rattle of two.
    playSound('win', true);
    expect(audio.sources).toHaveLength(alone);
    audio.currentTime += 1 / 60;
    playSound('win', true);
    expect(sizes(audio, alone)).toEqual([2]);
    // And then for three more: a rattle of four.
    for (let frame = 0; frame < 4; frame++) {
      expect(audio.sources).toHaveLength(alone + 1);
      audio.currentTime += 1 / 60;
      playSound('win', true);
    }
    expect(sizes(audio, alone + 1)).toEqual([4]);
  });

  it('plays as many medals as went over while it keeps up, and close to it when a tower goes', async () => {
    fix(0);
    const audio = await switchOn();
    // Five medals a second for four seconds: every one is a clink of its own.
    for (let frame = 0; frame < 240; frame++) {
      if (frame % 12 === 0) playSound('win', true);
      audio.currentTime += 1 / 60;
    }
    expect(sizes(audio)).toEqual(Array.from({ length: 20 }, () => 1));
    audio.currentTime += 5;
    // Ninety medals in half a second: most of them are heard, in a handful of sources that grow as the tray fills.
    const from = audio.sources.length;
    for (let frame = 0; frame < 30; frame++) {
      playSound('win', true, { count: 3 });
      audio.currentTime += 1 / 60;
    }
    expect(total(audio, from)).toBeGreaterThanOrEqual(60);
    expect(total(audio, from)).toBeLessThanOrEqual(90);
    expect(audio.sources.length - from).toBeLessThanOrEqual(LIMITS.tray);
    expect(Math.max(...sizes(audio, from).map((size) => size ?? 0))).toBeGreaterThanOrEqual(16);
    const grown = sizes(audio, from).map((size) => size ?? 0);
    expect(grown[grown.length - 1]).toBeGreaterThan(grown[0]);
  });

  it('forgets medals it could not play once the winning has stopped', async () => {
    fix(0);
    const audio = await switchOn();
    for (let frame = 0; frame < 10; frame++) {
      playSound('win', true, { count: 500 });
      audio.currentTime += 1 / 60;
    }
    const flood = audio.sources.length;
    expect(flood).toBe(LIMITS.tray);
    // Long after, one medal is one clink: nothing was left over to come out with it.
    audio.currentTime += 5;
    playSound('win', true);
    expect(sizes(audio, flood)).toEqual([1]);
  });

  it('is emptied by a hush: what was owed is not heard afterwards', async () => {
    fix(0);
    const audio = await switchOn();
    for (let frame = 0; frame < 6; frame++) playSound('win', true, { count: 500 });
    expect(audio.sounding().length).toBeGreaterThan(0);
    hush();
    expect(audio.sounding(FADE)).toHaveLength(0);
    const before = audio.sources.length;
    audio.currentTime += 0.2;
    playSound('win', true);
    expect(sizes(audio, before)).toEqual([1]);
    expect(audio.sources[before].begins - audio.currentTime).toBeCloseTo(TRAY.fall[0], 9);
  });

  it('takes a count that makes no sense for one medal', async () => {
    fix(0);
    const audio = await switchOn();
    for (const count of [0, -5, Number.NaN, 0.2, undefined]) {
      audio.currentTime += 5;
      const from = audio.sources.length;
      expect(() => playSound('win', true, { count })).not.toThrow();
      expect(sizes(audio, from)).toEqual([1]);
    }
    audio.currentTime += 5;
    const from = audio.sources.length;
    playSound('win', true, { count: 2.6 });
    expect(total(audio, from)).toBe(3);
    audio.currentTime += 5;
    const flood = audio.sources.length;
    expect(() => playSound('win', true, { count: Number.POSITIVE_INFINITY })).not.toThrow();
    expect(total(audio, flood)).toBe(LIMITS.owed);
  });

  it('starts nothing while the sound is off', async () => {
    const audio = await switchOn();
    playSound('win', false, { count: 30 });
    playSound('insert', false);
    playSound('land', false, { bare: true });
    expect(audio.sources).toHaveLength(0);
    expect(audio.bus.gain.seen).toEqual([1]);
    // And owes nothing for it: the first medal after the sound comes on is one clink.
    fix(0);
    playSound('win', true);
    expect(sizes(audio)).toEqual([1]);
  });

  it('turns the loop down while medals are falling into it, and lets it come back', async () => {
    const audio = await switchOn();
    setMusic(true);
    wait(audio, 1);
    // The loop's notes go through the gain of their own; nothing else does.
    for (const note of audio.sources) expect(audio.gainOf(note).outputs).toEqual([audio.bus]);
    expect(audio.bus.gain.seen).toEqual([1]);
    // A medal going in, landing, lost, or by itself in the tray is heard over the loop as it is.
    playSound('insert', true);
    playSound('land', true);
    playSound('lost', true);
    playSound('win', true);
    expect(audio.bus.gain.seen).toEqual([1]);
    // A rattle turns it down, and each rattle that follows puts off its coming back.
    audio.currentTime += 1;
    playSound('win', true, { count: 12 });
    expect(audio.bus.gain.seen.slice(1)).toEqual([MUSIC.ducked, 1, MUSIC.ducked, 1]);
    // It goes on playing underneath.
    const made = audio.sources.length;
    wait(audio, 2);
    expect(audio.sources.length).toBeGreaterThan(made + 4);
  });

  it('gives the loop its level back when everything is hushed, and forgets the rattle it was making room for', async () => {
    const audio = await switchOn();
    setMusic(true);
    wait(audio, 1);
    const last = () => audio.bus.gain.targets[audio.bus.gain.targets.length - 1];
    // A long rattle: the loop is to come back when it ends, more than half a second from now.
    playSound('win', true, { count: 32 });
    const long = last();
    expect(long.value).toBe(1);
    expect(long.at).toBeGreaterThan(audio.currentTime + 0.5);
    // The sound is switched off in the middle of it. The schedule is cleared and the loop's gain is on its way back at once.
    wait(audio, 0.1);
    hush();
    expect(audio.bus.gain.cancelled[audio.bus.gain.cancelled.length - 1]).toBe(audio.currentTime);
    expect(last().value).toBe(1);
    expect(last().at).toBeLessThan(audio.currentTime + 0.05);
    // A short rattle afterwards waits for its own end, not for the end of the long one that was cut.
    wait(audio, 0.2);
    playSound('win', true, { count: 2 });
    expect(last().value).toBe(1);
    expect(last().at).toBeGreaterThan(audio.currentTime);
    expect(last().at).toBeLessThan(long.at);
  });
});

describe('the background loop', () => {
  const loopNotes = MUSIC.parts.reduce((sum, part) => sum + part.notes.length, 0);

  it('is there to be played', () => {
    expect(MUSIC_ON).toBe(true);
  });

  it('is scheduled a little at a time, never far ahead and never in the past', async () => {
    const audio = await switchOn();
    audio.currentTime = 3;
    setMusic(true);
    expect(audio.sources.length).toBeGreaterThan(0);
    expect(audio.sources.length).toBeLessThan(6);
    let checked = 0;
    for (let tick = 0; tick < 400; tick++) {
      for (const source of audio.sources.slice(checked)) {
        expect(source.begins).toBeGreaterThanOrEqual(audio.currentTime);
        expect(source.begins).toBeLessThan(audio.currentTime + MUSIC.ahead + 1e-9);
      }
      checked = audio.sources.length;
      wait(audio, MUSIC.every);
    }
    // Forty seconds: two and a half times round.
    expect(audio.sources.length).toBeGreaterThan(loopNotes * 2.4);
    expect(audio.sources.length).toBeLessThan(loopNotes * 2.6);
  });

  it('plays the notes that are written, in time, and comes round again', async () => {
    const audio = await switchOn();
    setMusic(true);
    wait(audio, MUSIC.length * 2 + 1);
    const origin = audio.sources[0].begins;
    const written = MUSIC.parts.flatMap((part) => part.notes.map((note) => note.at)).sort((a, b) => a - b);
    const first = audio.sources.slice(0, loopNotes).map((source) => source.begins - origin);
    const second = audio.sources.slice(loopNotes, loopNotes * 2).map((source) => source.begins - origin - MUSIC.length);
    first.forEach((at, index) => expect(at).toBeCloseTo(written[index], 6));
    second.forEach((at, index) => expect(at).toBeCloseTo(written[index], 6));
  });

  it('plays quietly, each note at the pitch that is written', async () => {
    const audio = await switchOn();
    setMusic(true);
    wait(audio, MUSIC.length);
    const levels = new Set(audio.sources.map((source) => audio.gainOf(source).gain.value));
    expect([...levels].sort()).toEqual(MUSIC.parts.map((part) => part.level).sort());
    // Two buffers, each played faster or slower for its note: the speeds are the notes' own ratios.
    expect(new Set(audio.sources.map((source) => source.buffer)).size).toBe(MUSIC.parts.length);
    const speeds = new Set(audio.sources.map((source) => source.playbackRate.value.toFixed(4)));
    const pitches = new Set(MUSIC.parts.flatMap((part) => part.notes.map((note) => note.hz.toFixed(2))));
    expect(speeds.size).toBeGreaterThan(8);
    expect(speeds.size).toBeLessThanOrEqual(pitches.size);
    for (const source of audio.sources) {
      expect(source.playbackRate.value).toBeGreaterThan(0.5);
      expect(source.playbackRate.value).toBeLessThan(2.1);
    }
  });

  it('stops at once and schedules nothing afterwards', async () => {
    const audio = await switchOn();
    setMusic(true);
    wait(audio, 5);
    expect(audio.sounding().length).toBeGreaterThan(0);
    setMusic(false);
    expect(audio.sounding(FADE)).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    const made = audio.sources.length;
    wait(audio, 30);
    expect(audio.sources).toHaveLength(made);
  });

  it('can be started and stopped again and again', async () => {
    const audio = await switchOn();
    for (let round = 0; round < 5; round++) {
      setMusic(true);
      setMusic(true);
      expect(vi.getTimerCount()).toBe(1);
      const made = audio.sources.length;
      wait(audio, 2);
      expect(audio.sources.length).toBeGreaterThan(made);
      setMusic(false);
      setMusic(false);
      expect(vi.getTimerCount()).toBe(0);
      expect(audio.sounding(FADE)).toHaveLength(0);
    }
  });

  it('waits for the sound to be unlocked', async () => {
    vi.stubGlobal('AudioContext', FakeContext);
    setMusic(true);
    expect(FakeContext.made).toHaveLength(0);
    await unlockAudio();
    expect(FakeContext.made[0].sources.length).toBeGreaterThan(0);
  });

  it('stops while the page is hidden and comes back with it', async () => {
    const listeners = new Set<() => void>();
    const page = {
      hidden: false,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    };
    vi.stubGlobal('document', page);
    const audio = await switchOn();
    setMusic(true);
    expect(listeners.size).toBe(1);
    wait(audio, 3);

    page.hidden = true;
    listeners.forEach((listener) => listener());
    expect(audio.sounding(FADE)).toHaveLength(0);
    const made = audio.sources.length;
    wait(audio, 10);
    expect(audio.sources).toHaveLength(made);

    page.hidden = false;
    listeners.forEach((listener) => listener());
    wait(audio, 1);
    expect(audio.sources.length).toBeGreaterThan(made);

    setMusic(false);
    expect(listeners.size).toBe(0);
  });

  it('does not start on a page that is hidden', async () => {
    vi.stubGlobal('document', { hidden: true, addEventListener: () => undefined, removeEventListener: () => undefined });
    const audio = await switchOn();
    setMusic(true);
    wait(audio, 3);
    expect(audio.sources).toHaveLength(0);
  });

  it('stops when the browser stops the audio, and comes back with it', async () => {
    const audio = await switchOn();
    setMusic(true);
    wait(audio, 2);
    audio.become('suspended');
    expect(vi.getTimerCount()).toBe(0);
    const made = audio.sources.length;
    audio.become('running');
    wait(audio, 1);
    expect(audio.sources.length).toBeGreaterThan(made);
  });

  it('falls silent for a fanfare and picks up after it', async () => {
    const audio = await switchOn();
    setMusic(true);
    wait(audio, 2);
    const before = audio.sources.length;
    // The loop has notes in the air, and at least one more lined up within its look-ahead.
    expect(audio.sounding().some((note) => note.begins <= audio.currentTime)).toBe(true);
    expect(audio.sources.some((note) => note.begins > audio.currentTime)).toBe(true);
    playSound('jackpot', true);
    const fanfare = audio.sources[before];
    // All of them are cut short there and then, faded rather than clicked off: only the fanfare is left.
    expect(audio.sounding(FADE)).toEqual([fanfare]);
    for (const note of audio.sources.slice(0, before)) {
      if (note.stopped.length > 1) {
        const levels = audio.gainOf(note).gain.seen;
        expect(levels[levels.length - 1]).toBe(0);
      }
    }
    expect(audio.sources.slice(0, before).some((note) => note.stopped.length > 1)).toBe(true);
    wait(audio, 10);
    // Nothing of the loop starts until the fanfare is over, and then it carries on.
    const after = audio.sources.slice(before + 1);
    expect(after.length).toBeGreaterThan(0);
    for (const note of after) expect(note.begins).toBeGreaterThanOrEqual(fanfare.ends);
    // A jingle is short enough to play over.
    const made = audio.sources.length;
    playSound('prize', true);
    wait(audio, 1);
    expect(audio.sources.length).toBeGreaterThan(made + 3);
  });

  it('leaves out what it missed when the page stalls, rather than play it late', async () => {
    const audio = await switchOn();
    setMusic(true);
    wait(audio, 2);
    const made = audio.sources.length;
    audio.currentTime += 1000;
    vi.advanceTimersByTime(MUSIC.every * 1000);
    const caught = audio.sources.slice(made);
    expect(caught.length).toBeLessThan(6);
    for (const note of caught) expect(note.begins).toBeGreaterThanOrEqual(audio.currentTime);
    wait(audio, 2);
    expect(audio.sources.length).toBeGreaterThan(made + 4);
  });

  it('never holds more notes than it is allowed', async () => {
    const audio = await switchOn();
    setMusic(true);
    for (let tick = 0; tick < 400; tick++) {
      wait(audio, MUSIC.every);
      expect(audio.sounding().length).toBeLessThanOrEqual(MUSIC.voices);
    }
  });
});

describe('hush', () => {
  it('cuts short everything that is sounding', async () => {
    const audio = await switchOn();
    setMusic(true);
    for (const sound of SOUNDS) playSound(sound, true);
    wait(audio, 0.2);
    expect(audio.sounding(FADE).length).toBeGreaterThan(10);
    hush();
    expect(audio.sounding(FADE)).toHaveLength(0);
    for (const source of audio.sources) {
      const levels = audio.gainOf(source).gain.seen;
      if (source.stopped.length > 1) expect(levels[levels.length - 1]).toBe(0);
    }
  });

  it('leaves the cabinet able to play again', async () => {
    const audio = await switchOn();
    playSound('fever', true);
    hush();
    wait(audio, 1);
    playSound('fever', true);
    expect(audio.sources).toHaveLength(2);
    expect(audio.sounding()).toHaveLength(1);
  });
});

// ── The notes, which are plain data ─────────────────────────────────────────

const scores = Object.entries(SCORES);
const everyNote: [string, Note][] = [
  ...scores.flatMap(([name, score]) => score.parts.flatMap((part) => part.notes.map((note): [string, Note] => [name, note]))),
  ...MUSIC.parts.flatMap((part) => part.notes.map((note): [string, Note] => [`loop ${part.sample}`, note])),
];

describe('the notes', () => {
  it('reads a note name as its frequency', () => {
    expect(pitch('A4')).toBe(440);
    expect(pitch('A5')).toBeCloseTo(880, 9);
    expect(pitch('C4')).toBeCloseTo(261.626, 2);
    expect(pitch('F#5')).toBeCloseTo(739.989, 2);
    expect(pitch('Bb3')).toBeCloseTo(233.082, 2);
    expect(pitch('E3')).toBeCloseTo(164.814, 2);
    expect(() => pitch('H2')).toThrow();
    expect(() => pitch('C')).toThrow();
  });

  it('are all in a range a speaker can play and an ear can stand', () => {
    expect(everyNote.length).toBeGreaterThan(250);
    for (const [name, note] of everyNote) {
      expect(Number.isFinite(note.hz), name).toBe(true);
      expect(note.hz, name).toBeGreaterThanOrEqual(20);
      expect(note.hz, name).toBeLessThanOrEqual(8000);
      expect(note.length, name).toBeGreaterThan(0);
      expect(note.length, name).toBeLessThan(2);
      expect(note.at, name).toBeGreaterThanOrEqual(0);
    }
    for (const hz of POCKET_NOTES) {
      expect(hz).toBeGreaterThanOrEqual(20);
      expect(hz).toBeLessThanOrEqual(8000);
    }
  });

  it('keep the bass above what a small speaker turns into a rattle', () => {
    for (const [name, note] of everyNote) expect(note.hz, name).toBeGreaterThan(80);
  });

  it('follow one another within a part, with no two at once', () => {
    for (const [name, score] of scores) {
      expect(score.parts.length, name).toBeGreaterThan(0);
      for (const part of score.parts) {
        expect(part.level, name).toBeGreaterThan(0);
        expect(part.level, name).toBeLessThanOrEqual(1);
        expect(part.notes.length, name).toBeGreaterThan(0);
        part.notes.forEach((note, index) => {
          if (index > 0) expect(note.at, name).toBeGreaterThanOrEqual(part.notes[index - 1].at + part.notes[index - 1].length - 1e-9);
          expect(note.at + note.length, name).toBeLessThanOrEqual(score.length + 1e-9);
        });
      }
    }
  });

  it('give the fanfares harmony and a bass, and make the jackpot the longest thing there is', () => {
    for (const name of ['fever', 'jackpot'] as const) {
      const voices = SCORES[name].parts.map((part) => part.voice);
      expect(voices).toContain('lead');
      expect(voices).toContain('second');
      expect(voices).toContain('bass');
      const lead = SCORES[name].parts[0].notes;
      const second = SCORES[name].parts[1].notes;
      // The second voice moves with the lead, below it.
      expect(second).toHaveLength(lead.length);
      second.forEach((note, index) => {
        expect(note.at).toBeCloseTo(lead[index].at, 9);
        expect(note.hz).toBeLessThan(lead[index].hz);
      });
    }
    for (const [name, score] of scores) if (name !== 'jackpot') expect(score.length, name).toBeLessThan(SCORES.jackpot.length);
    expect(SCORES.jackpot.length).toBeGreaterThan(SCORES.fever.length * 2);
    expect(SCORES.jackpot.length).toBeLessThan(5);
  });

  it('give each of the three lines its own jingle', () => {
    const tune = (name: 'small' | 'big' | 'seven') => SCORES[name].parts[0].notes.map((note) => `${note.hz.toFixed(1)}@${note.at.toFixed(2)}`).join(' ');
    expect(new Set([tune('small'), tune('big'), tune('seven')]).size).toBe(3);
    for (const name of ['small', 'big', 'seven'] as const) expect(SCORES[name].parts.length).toBeGreaterThanOrEqual(3);
  });

  it('raise the pocket tone with every number, to an octave above where it began', () => {
    POCKET_NOTES.forEach((hz, index) => {
      if (index > 0) expect(hz).toBeGreaterThan(POCKET_NOTES[index - 1]);
    });
    expect(POCKET_NOTES[POCKET_NOTES.length - 1]).toBeCloseTo(POCKET_NOTES[0] * 2, 6);
  });

  it('make a loop of eight bars that every part fills exactly', () => {
    expect(MUSIC.bars).toBe(8);
    expect(MUSIC.length).toBeGreaterThan(12);
    expect(MUSIC.length).toBeLessThan(24);
    expect(MUSIC.ahead).toBeGreaterThan(MUSIC.every * 2);
    expect(MUSIC.ahead).toBeLessThanOrEqual(0.5);
    for (const part of MUSIC.parts) {
      let at = 0;
      for (const note of part.notes) {
        expect(note.at).toBeCloseTo(at, 9);
        at += note.length;
      }
      expect(at).toBeCloseTo(MUSIC.length, 9);
    }
    expect(MUSIC.parts.map((part) => part.sample)).toEqual(['arp', 'bass']);
  });
});

// ── What is worked out, measured in place of listening to it ────────────────

const RATE = 48000;
const takes: [Sample, number][] = SAMPLES.flatMap((sample) => Array.from({ length: VARIANTS[sample] ?? 1 }, (_, variant): [Sample, number] => [sample, variant]));
const takesOf = (sample: Sample): number[] => Array.from({ length: VARIANTS[sample] ?? 1 }, (_, variant) => variant);

/**
 * A take as the cabinet would work it out, kept from one test to the next: working every sound out afresh in
 * every test that looks at one would take longer than all the looking.
 */
const kept = new Map<string, Float32Array>();
function rendered(sample: Sample, variant = 0, rate = RATE): Float32Array {
  const key = `${sample}:${variant}:${rate}`;
  let samples = kept.get(key);
  if (!samples) {
    samples = renderSound(sample, rate, variant);
    kept.set(key, samples);
  }
  return samples;
}

const energy = (samples: Float32Array, from = 0, to = samples.length): number => {
  let sum = 0;
  for (let i = Math.max(0, Math.floor(from)); i < Math.min(samples.length, Math.floor(to)); i++) sum += samples[i] * samples[i];
  return sum;
};

/**
 * How bright a sound is, as the frequency of the sine that changes as fast
 * from one sample to the next as the sound does on average.
 */
function brightness(samples: Float32Array, rate: number): number {
  let changes = 0;
  for (let i = 1; i < samples.length; i++) changes += (samples[i] - samples[i - 1]) ** 2;
  return (rate / Math.PI) * Math.asin(Math.min(1, Math.sqrt(changes / energy(samples)) / 2));
}

/** The share of a sound's energy that lies below `hz`: what is left after four low-pass filters in a row. */
function shareBelow(samples: Float32Array, hz: number, rate: number): number {
  const angle = (2 * Math.PI * hz) / rate;
  const alpha = Math.sin(angle) / Math.SQRT2;
  const b = (1 - Math.cos(angle)) / 2 / (1 + alpha);
  const a1 = (-2 * Math.cos(angle)) / (1 + alpha);
  const a2 = (1 - alpha) / (1 + alpha);
  let low = Float64Array.from(samples);
  for (let pass = 0; pass < 4; pass++) {
    const next = new Float64Array(low.length);
    for (let i = 0; i < low.length; i++) next[i] = b * (low[i] + 2 * (low[i - 1] ?? 0) + (low[i - 2] ?? 0)) - a1 * (next[i - 1] ?? 0) - a2 * (next[i - 2] ?? 0);
    low = next;
  }
  let below = 0;
  for (const value of low) below += value * value;
  return below / energy(samples);
}

/** The power of a take at every frequency up to half the sample rate, `RATE / (2 · (length − 1))` hertz apart: a Fourier transform. */
const spectra = new Map<string, Float64Array>();
function spectrum(sample: Sample, variant: number): Float64Array {
  const key = `${sample}:${variant}`;
  const known = spectra.get(key);
  if (known) return known;
  const samples = rendered(sample, variant);
  let size = 1;
  while (size < samples.length) size *= 2;
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  re.set(samples);
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j]] = [re[j], re[i]];
  }
  for (let span = 2; span <= size; span *= 2) {
    const turn = (-2 * Math.PI) / span;
    for (let from = 0; from < size; from += span) {
      for (let k = 0; k < span / 2; k++) {
        const cos = Math.cos(turn * k);
        const sin = Math.sin(turn * k);
        const a = from + k;
        const b = a + span / 2;
        const x = re[b] * cos - im[b] * sin;
        const y = re[b] * sin + im[b] * cos;
        re[b] = re[a] - x;
        im[b] = im[a] - y;
        re[a] += x;
        im[a] += y;
      }
    }
  }
  const power = new Float64Array(size / 2 + 1);
  for (let i = 0; i < power.length; i++) power[i] = re[i] * re[i] + im[i] * im[i];
  spectra.set(key, power);
  return power;
}

/** The share of a take's energy that lies between `low` and `high` hertz. */
function shareBetween(sample: Sample, variant: number, low: number, high: number): number {
  const power = spectrum(sample, variant);
  const apart = RATE / (2 * (power.length - 1));
  let within = 0;
  let all = 0;
  power.forEach((value, index) => {
    all += value;
    if (index * apart >= low && index * apart < high) within += value;
  });
  return within / all;
}

/** The seconds by which nine tenths of a sound's energy has gone by. */
function mostlyOverBy(samples: Float32Array): number {
  const all = energy(samples);
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
    if (sum >= all * 0.9) return i / RATE;
  }
  return samples.length / RATE;
}

/**
 * When the strikes that can be told apart in a sound come: the two-millisecond stretches that are at least
 * `over` times as strong as the two before them, and not within six milliseconds of the last. Strikes that
 * fall on top of one another count once, so their number lags behind the true one in a thick rattle, but it
 * still grows with it.
 */
function strikeTimes(samples: Float32Array, over = 3): number[] {
  const width = Math.round(0.002 * RATE);
  const levels: number[] = [];
  for (let i = 0; i + width <= samples.length; i += width) levels.push(energy(samples, i, i + width));
  const floor = Math.max(...levels) * 0.002;
  const times: number[] = [];
  levels.forEach((level, index) => {
    const at = (index * width) / RATE;
    const fresh = times.length === 0 || at - times[times.length - 1] >= 0.006;
    if (fresh && level > floor && level > (((levels[index - 1] ?? 0) + (levels[index - 2] ?? 0)) / 2) * over) times.push(at);
  });
  return times;
}

const strikes = (samples: Float32Array): number => strikeTimes(samples).length;

/** The loudest twentieth of a second of a sound played at `level`, as an average level. */
function loudest(samples: Float32Array, level: number): number {
  const width = Math.round(0.05 * RATE);
  let most = 0;
  for (let i = 0; i < samples.length; i += width / 2) most = Math.max(most, energy(samples, i, i + width));
  return level * Math.sqrt(most / width);
}

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

describe('what is worked out', () => {
  it('covers every sound, the medals first, and the two notes of the loop', () => {
    expect(new Set(SOUNDS).size).toBe(SOUNDS.length);
    expect(new Set(SAMPLES).size).toBe(SAMPLES.length);
    for (const sound of SOUNDS) expect(SAMPLES).toContain(sound);
    for (const size of POURS) expect(SAMPLES).toContain(POUR_SAMPLES[size]);
    expect(SAMPLES).toContain('plate');
    // A medal on the table, five sizes of rattle and the loop's two notes are kept besides the sounds that have names.
    expect(SAMPLES).toHaveLength(SOUNDS.length + 1 + (POURS.length - 1) + MUSIC.parts.length);
    expect(SAMPLES.slice(0, 4)).toEqual(['land', 'plate', 'insert', 'win']);
    for (const name of Object.keys(SCORES)) expect(SOUNDS).toContain(name);
    // The names the cabinet has always used are still there.
    const old = ['land', 'win', 'lost', 'gate', 'full', 'spin', 'reelStop', 'tick', 'hop', 'reach', 'small', 'big', 'seven', 'dice', 'chest', 'open'];
    for (const name of [...old, 'prize', 'ball', 'roulette', 'pocket', 'tower', 'cross', 'crash', 'fever', 'jackpot']) expect(SOUNDS).toContain(name);
  });

  it.each(takes)('%s (take %i) is finite, peaks at exactly 1, begins and ends in silence, and is the same every time', (sample, variant) => {
    const samples = renderSound(sample, RATE, variant);
    expect(firstDifference(samples, rendered(sample, variant))).toBe(-1);
    expect(samples.length).toBeGreaterThan(RATE * 0.03);
    expect(samples.length).toBeLessThan(RATE * 6);
    let sum = 0;
    for (const value of samples) sum += value;
    expect(Number.isFinite(sum)).toBe(true);
    expect(peakOf(samples)).toBeCloseTo(1, 6);
    expect(Math.abs(samples[0])).toBe(0);
    expect(Math.abs(samples[samples.length - 1])).toBeLessThan(1e-3);
    // No steady push on the speaker, and next to nothing below 60 Hz.
    expect(Math.abs(sum / samples.length)).toBeLessThan(0.01);
    expect(shareBelow(samples, 60, RATE)).toBeLessThan(0.02);
    // It is a sound, not a click: more than a few samples carry it.
    expect(energy(samples)).toBeGreaterThan(20);
  });

  it('comes out much the same at another sample rate', () => {
    for (const sample of ['land', 'insert', 'win', 'pour8', 'jackpot', 'spin', 'crash'] as const) {
      const usual = rendered(sample);
      const slower = rendered(sample, 0, 44100);
      expect(slower.length / 44100).toBeCloseTo(usual.length / RATE, 3);
      expect(peakOf(slower)).toBeCloseTo(1, 6);
      const ratio = brightness(slower, 44100) / brightness(usual, RATE);
      expect(ratio, sample).toBeGreaterThan(0.9);
      expect(ratio, sample).toBeLessThan(1.1);
    }
  });

  it('still makes sense on a sound card that runs slowly', () => {
    // A telephone headset can run at 16,000 samples a second: nothing may be asked to sound above half of that.
    for (const sample of ['land', 'plate', 'insert', 'win', 'pour4', 'lost', 'roll', 'tick', 'gate', 'prize', 'crash'] as const) {
      const samples = rendered(sample, 0, 16000);
      expect(samples.length / 16000).toBeCloseTo(rendered(sample).length / RATE, 3);
      expect(peakOf(samples)).toBeCloseTo(1, 6);
      expect(brightness(samples, 16000), sample).toBeLessThan(8000 * 0.9);
    }
  });

  it('holds no long tone except in the fanfares: everything else is over in a second and a half', () => {
    for (const [sample, variant] of takes) {
      if (sample === 'fever' || sample === 'jackpot') continue;
      expect(rendered(sample, variant).length / RATE, sample).toBeLessThan(1.5);
    }
  });

  it('lasts about as long as the notes say, and the jackpot longer than anything', () => {
    for (const [name, score] of scores) {
      expect(rendered(name as PusherSound).length / RATE).toBeCloseTo(score.length + score.tail, 3);
    }
    const jackpot = rendered('jackpot').length;
    for (const [sample, variant] of takes) if (sample !== 'jackpot') expect(rendered(sample, variant).length).toBeLessThan(jackpot);
    expect(rendered('fever').length / RATE).toBeGreaterThan(1.5);
  });

  it('makes the reel loop a whole second that joins up with itself', () => {
    const samples = rendered('spin');
    expect(samples).toHaveLength(RATE);
    expect(Math.abs(samples[0])).toBe(0);
    expect(Math.abs(samples[samples.length - 1])).toBeLessThan(1e-3);
    // A steady whirr: no tenth of a second much louder than another.
    const tenths = Array.from({ length: 10 }, (_, index) => energy(samples, (index * RATE) / 10, ((index + 1) * RATE) / 10));
    expect(Math.max(...tenths) / Math.min(...tenths)).toBeLessThan(2);
  });

  it('gives the things that should be low a low voice and the lamps a high one', () => {
    const of = (sample: Sample, variant = 0) => brightness(rendered(sample, variant), RATE);
    for (const low of ['reelStop', 'tower', 'cross'] as const) expect(of(low), low).toBeLessThan(1200);
    for (const high of ['tick', 'dice'] as const) expect(of(high), high).toBeGreaterThan(1500);
    expect(of('cross')).toBeLessThan(of('prize'));
    expect(of('reelStop')).toBeLessThan(of('tick'));
    // The pocket's tone climbs.
    const pockets = POCKET_NOTES.map((_, variant) => of('pocket', variant));
    pockets.forEach((value, index) => {
      if (index > 0) expect(value).toBeGreaterThan(pockets[index - 1]);
    });
  });
});

// ── The medals ──────────────────────────────────────────────────────────────

/** Every sound a medal makes by itself, and the rattles of several. */
const SINGLES = ['land', 'plate', 'insert', 'win', 'lost'] as const;
const RATTLES = POURS.map((size) => POUR_SAMPLES[size]);
const brightOf = (sample: Sample): number[] => takesOf(sample).map((variant) => brightness(rendered(sample, variant), RATE));
const sharesOf = (sample: Sample, low: number, high: number): number[] => takesOf(sample).map((variant) => shareBetween(sample, variant, low, high));

describe('the medals', () => {
  it('ring where a brass medal rings, in modes that are not harmonics of one another', () => {
    // 5.25 · h / (2π a²) · √(E / 12ρ(1 − ν²)) for brass: about 6 kHz for 30 mm by 1.5 mm, 9 kHz for 25 mm.
    const lowest = (across: number, thick: number) => ((5.25 * thick) / (2 * Math.PI * (across / 2) ** 2)) * Math.sqrt(105e9 / (12 * 8500 * (1 - 0.34 ** 2)));
    expect(lowest(0.03, 0.0015)).toBeGreaterThan(5500);
    expect(lowest(0.03, 0.0015)).toBeLessThan(6500);
    expect(lowest(0.025, 0.0015)).toBeGreaterThan(8000);
    expect(MEDAL.hz).toBeGreaterThanOrEqual(lowest(0.03, 0.0015) * 0.95);
    expect(MEDAL.hz).toBeLessThanOrEqual(lowest(0.025, 0.0015));
    expect(MEDAL.modes).toEqual([1, 1.73, 2.33]);
    expect(MEDAL.hz * MEDAL.modes[2]).toBeLessThan(MEDAL.top);
    MEDAL.weights.forEach((weight, mode) => {
      if (mode > 0) {
        expect(weight).toBeLessThan(MEDAL.weights[mode - 1]);
        expect(MEDAL.lives[mode]).toBeLessThan(MEDAL.lives[mode - 1]);
      }
    });
  });

  it('keep several takes of each sound, no two alike', () => {
    for (const sample of [...SINGLES, 'roll', ...RATTLES] as const) {
      const count = VARIANTS[sample] ?? 1;
      expect(count, sample).toBeGreaterThanOrEqual(2);
      takesOf(sample).forEach((variant) => {
        for (let other = 0; other < variant; other++) expect(firstDifference(rendered(sample, variant), rendered(sample, other)), sample).not.toBe(-1);
      });
    }
    for (const sample of SINGLES) expect(VARIANTS[sample], sample).toBeGreaterThanOrEqual(3);
    // A take that does not exist is the nearest one that does.
    expect(firstDifference(renderSound('land', RATE, 99), rendered('land', (VARIANTS.land ?? 1) - 1))).toBe(-1);
    expect(firstDifference(renderSound('land', RATE, -3), rendered('land', 0))).toBe(-1);
  });

  it('are bright going in and bright in the tray, and dull in the gutter', () => {
    const [land, plate, insert, lost] = [brightOf('land'), brightOf('plate'), brightOf('insert'), brightOf('lost')];
    const tray = RATTLES.flatMap(brightOf);
    // Up where a coin rings, well above anything else on the cabinet, and not so high that it is all hiss.
    for (const value of [...land, ...plate, ...insert, ...tray]) {
      expect(value).toBeGreaterThan(4000);
      expect(value).toBeLessThan(9000);
    }
    for (const other of ['tick', 'gate', 'prize', 'jackpot', 'dice'] as const) expect(brightness(rendered(other), RATE), other).toBeLessThan(Math.min(...insert, ...tray));
    // The gutter is plastic: duller and lower than the tray by a long way, but a coin all the same and not a thud.
    expect(Math.max(...lost)).toBeLessThan(Math.min(...tray) * 0.75);
    expect(Math.max(...lost)).toBeLessThan(Math.min(...insert) * 0.6);
    expect(Math.min(...lost)).toBeGreaterThan(2000);
    for (const share of sharesOf('lost', 5000, 8000)) expect(share).toBeGreaterThan(0.08);
    for (const share of sharesOf('lost', 60, 1000)) expect(share).toBeGreaterThan(0.4);
  });

  it('have the medal in every one of them and the tray only where there is a tray', () => {
    // The medal's own ring lies between 5 and 8 kHz. The tray answers between 1 and 3.
    for (const sample of ['land', 'plate', 'insert'] as const) {
      for (const share of sharesOf(sample, 5000, 8000)) expect(share, sample).toBeGreaterThan(0.45);
      for (const share of sharesOf(sample, 1000, 3200)) expect(share, sample).toBeLessThan(0.2);
    }
    for (const sample of RATTLES) {
      for (const share of sharesOf(sample, 5000, 8000)) expect(share, sample).toBeGreaterThan(0.15);
      // Most of what a rattle is: the tray is far bigger than a medal, and struck by the same blow.
      for (const share of sharesOf(sample, 1000, 3200)) expect(share, sample).toBeGreaterThan(0.25);
    }
    // And it is the same tray every time: the more medals, the more of it, never less.
    const tray = RATTLES.map((sample) => mean(sharesOf(sample, 1000, 3200)));
    expect(tray[tray.length - 1]).toBeGreaterThanOrEqual(tray[0]);
  });

  it('strike at once, and are over in tens of milliseconds unless they are left to ring', () => {
    for (const sample of SINGLES) {
      for (const variant of takesOf(sample)) {
        const samples = rendered(sample, variant);
        // The first strike is in the first hundredth of a second. In the slot it is the lighter one, the catch on the edge.
        expect(energy(samples, 0, RATE * 0.01), sample).toBeGreaterThan(energy(samples) * (sample === 'insert' ? 0.03 : 0.1));
        expect(strikeTimes(samples)[0], sample).toBeLessThan(0.004);
        // The last quarter is silence, near enough.
        expect(energy(samples, (samples.length * 3) / 4, samples.length), sample).toBeLessThan(energy(samples) * 0.01);
      }
    }
    const over = (sample: Sample) => takesOf(sample).map((variant) => mostlyOverBy(rendered(sample, variant)));
    // Among other medals a medal is damped at once. On the bare table it rings and chatters; in the slot it is left ringing longest.
    expect(Math.max(...over('land'))).toBeLessThan(0.04);
    expect(Math.min(...over('plate'))).toBeGreaterThan(Math.max(...over('land')) * 2);
    expect(Math.min(...over('insert'))).toBeGreaterThan(0.08);
    expect(Math.max(...over('insert'))).toBeLessThan(0.2);
  });

  it('bounce: on the table, in the slot and in the tray a medal strikes more than once', () => {
    for (const sample of ['plate', 'insert', 'win'] as const) {
      for (const variant of takesOf(sample)) expect(strikes(rendered(sample, variant)), sample).toBeGreaterThanOrEqual(3);
    }
    // On the table the taps come quicker and quicker: a medal chattering to rest.
    for (const variant of takesOf('plate')) {
      const taps = strikeTimes(rendered('plate', variant));
      const gaps = taps.slice(1).map((at, index) => at - taps[index]);
      expect(gaps.length).toBeGreaterThanOrEqual(2);
      expect(gaps[0]).toBeGreaterThan(0.03);
      expect(gaps[gaps.length - 1]).toBeLessThan(gaps[0] * 0.8);
    }
  });

  it('roll for half a second, steadily, quieter than a medal that strikes', () => {
    for (const variant of takesOf('roll')) {
      const samples = rendered('roll', variant);
      expect(samples.length / RATE).toBeCloseTo(0.5, 2);
      // Rolling, not striking: the middle of it is as loud as the start, and the level is even.
      const tenths = Array.from({ length: 6 }, (_, index) => energy(samples, (0.1 + index * 0.05) * RATE, (0.15 + index * 0.05) * RATE));
      expect(Math.max(...tenths) / Math.min(...tenths)).toBeLessThan(4);
      expect(mostlyOverBy(samples)).toBeGreaterThan(0.3);
      expect(brightness(samples, RATE)).toBeLessThan(Math.min(...brightOf('insert')));
    }
    expect(SOUND_LEVELS.roll).toBeLessThan(SOUND_LEVELS.land);
  });

  it('are heard over the loop: a single medal has more in its loudest moment than the loop has in its own', () => {
    // The loop is at its loudest when both its notes are struck together.
    const notes = MUSIC.parts.map((part) => loudest(rendered(part.sample), part.level));
    const loop = Math.hypot(...notes);
    for (const sample of ['land', 'plate', 'insert', 'win'] as const) {
      const level = sample === 'plate' ? SOUND_LEVELS.land : SOUND_LEVELS[sample];
      for (const variant of takesOf(sample)) {
        // Half as much again at the bottom of its wander, twice as much at the top.
        expect(loudest(rendered(sample, variant), level * 0.7), sample).toBeGreaterThan(loop * 1.5);
        expect(loudest(rendered(sample, variant), level), sample).toBeGreaterThan(loop * 2);
      }
    }
    // A rattle turns the loop down, and at its quietest is six times what is left of it.
    for (const size of POURS.slice(1)) {
      for (const variant of takesOf(POUR_SAMPLES[size])) {
        expect(loudest(rendered(POUR_SAMPLES[size], variant), pourLevel(size) * (1 - TRAY.wander)), `rattle of ${size}`).toBeGreaterThan(loop * MUSIC.ducked * 6);
      }
    }
    // A medal that is lost is over the loop too, but it is not what the player is listening for: it stays under the tray.
    for (const variant of takesOf('lost')) {
      expect(loudest(rendered('lost', variant), SOUND_LEVELS.lost * 0.7)).toBeGreaterThan(loop * 1.2);
      expect(loudest(rendered('lost', variant), SOUND_LEVELS.lost)).toBeLessThan(Math.min(...takesOf('win').map((take) => loudest(rendered('win', take), SOUND_LEVELS.win))));
    }
    // And a rattle of thirty-two is louder than a single medal by a long way, though its peak is hardly higher.
    const single = mean(takesOf('win').map((variant) => energy(rendered('win', variant)) * pourLevel(1) ** 2));
    const most = mean(takesOf('pour32').map((variant) => energy(rendered('pour32', variant)) * pourLevel(32) ** 2));
    expect(most).toBeGreaterThan(single * 8);
  });
});

describe('a rattle', () => {
  const hitsOf = (size: Pour, variant: number) => pourHits(size, pourSeed(size, variant));
  const every = POURS.flatMap((size) => takesOf(POUR_SAMPLES[size]).map((variant): [Pour, number] => [size, variant]));

  it.each(every)('of %i medals (take %i) has every medal strike the tray, and bounce', (size, variant) => {
    const hits = hitsOf(size, variant);
    // As many first strikes as medals, and one or two bounces for each: more strikes the more medals.
    expect(hits.filter((hit) => hit.bounce === 0)).toHaveLength(size);
    expect(hits.length).toBeGreaterThanOrEqual(size * 2);
    expect(hits.length).toBeLessThanOrEqual(size * 4);
    expect(hits[0].at).toBe(0);
    expect(hits[0].level).toBe(1);
    hits.forEach((hit, index) => {
      if (index > 0) expect(hit.at).toBeGreaterThanOrEqual(hits[index - 1].at);
      // Every medal is its own: a little off the next in pitch, never far from what a medal is.
      expect(hit.hz).toBeGreaterThan(MEDAL.hz * 0.9);
      expect(hit.hz).toBeLessThan(MEDAL.hz * 1.12);
      expect(hit.level).toBeGreaterThan(0);
      expect(hit.level).toBeLessThanOrEqual(1);
      expect(hit.ring).toBeGreaterThan(0.005);
      expect(hit.ring).toBeLessThan(0.06);
      // A bounce is softer than the strike before it.
      if (hit.bounce > 0) expect(hit.level).toBeLessThan(0.5);
    });
    expect(new Set(hits.filter((hit) => hit.bounce === 0).map((hit) => hit.hz.toFixed(1))).size).toBe(size);
    // The same every time, and the buffer is as long as its last strike and the time that is left to ring.
    expect(pourHits(size, pourSeed(size, variant))).toEqual(hits);
    expect(rendered(POUR_SAMPLES[size], variant).length / RATE).toBeCloseTo(0.001 + hits[hits.length - 1].at + 0.2, 3);
  });

  it('lasts longer the more medals are in it, and they come thick at first', () => {
    const lastIn = (size: Pour, variant: number) => Math.max(...hitsOf(size, variant).filter((hit) => hit.bounce === 0).map((hit) => hit.at));
    const spread = POURS.map((size) => mean(takesOf(POUR_SAMPLES[size]).map((variant) => lastIn(size, variant))));
    expect(spread[0]).toBe(0);
    spread.forEach((seconds, index) => {
      if (index > 0) expect(seconds).toBeGreaterThan(spread[index - 1]);
    });
    // Two medals are a tenth of a second apart at most; thirty-two take most of a second, not several.
    expect(spread[1]).toBeLessThan(0.1);
    expect(spread[spread.length - 1]).toBeGreaterThan(0.4);
    expect(spread[spread.length - 1]).toBeLessThan(1);
    for (const variant of takesOf('pour32')) {
      const firsts = hitsOf(32, variant).filter((hit) => hit.bounce === 0).map((hit) => hit.at);
      const half = Math.max(...firsts) / 2;
      expect(firsts.filter((at) => at < half).length).toBeGreaterThan(firsts.length / 2);
    }
  });

  it('lets a medal by itself ring and damps the ones in a crowd', () => {
    const ring = POURS.map((size) => mean(hitsOf(size, 0).filter((hit) => hit.bounce === 0).map((hit) => hit.ring)));
    expect(ring[0]).toBeGreaterThan(ring[ring.length - 1] * 1.5);
    expect(ring[ring.length - 1]).toBeGreaterThan(0.01);
    expect(ring[0]).toBeLessThan(0.05);
  });

  it('can be heard to hold more: more strikes, more time and more sound with every size', () => {
    const of = (measure: (samples: Float32Array, size: Pour) => number) =>
      POURS.map((size) => mean(takesOf(POUR_SAMPLES[size]).map((variant) => measure(rendered(POUR_SAMPLES[size], variant), size))));
    const told = of((samples) => strikes(samples));
    const seconds = of((samples) => mostlyOverBy(samples));
    const sound = of((samples, size) => energy(samples) * pourLevel(size) ** 2);
    POURS.forEach((size, index) => {
      if (index === 0) return;
      // Each size carries more than the one below it, at the level it is played at.
      expect(sound[index], `sound of ${size}`).toBeGreaterThan(sound[index - 1] * 1.15);
      // From four medals up it also goes on longer, and has more strikes that can be told apart than the size two below.
      if (index >= 2) {
        expect(seconds[index], `seconds of ${size}`).toBeGreaterThan(seconds[index - 1]);
        expect(told[index], `strikes of ${size}`).toBeGreaterThan(told[index - 2]);
      }
    });
    // One, five (a four and a one) and thirty (sixteen and more) are far apart on every count.
    expect(told[2]).toBeGreaterThan(told[0] * 1.5);
    expect(told[4]).toBeGreaterThan(told[2] * 1.5);
    expect(seconds[4]).toBeGreaterThan(seconds[0] * 2.5);
    expect(sound[4]).toBeGreaterThan(sound[2] * 2);
    expect(sound[2]).toBeGreaterThan(sound[0] * 2);
  });

  it('stays under the limiter when the tray is as full as its rule lets it be', () => {
    /** The loudest instant of takes laid one over another, each a spacing after the last and at the top of its level. */
    const piled = (sizes: readonly Pour[]): number => {
      const longest = Math.max(...POURS.flatMap((size) => takesOf(POUR_SAMPLES[size]).map((variant) => rendered(POUR_SAMPLES[size], variant).length)));
      const mix = new Float32Array(longest + Math.ceil(sizes.length * TRAY.spacing * RATE));
      sizes.forEach((size, source) => {
        const sample = POUR_SAMPLES[size];
        const samples = rendered(sample, source % (VARIANTS[sample] ?? 1));
        const from = Math.round(source * TRAY.spacing * RATE);
        for (let i = 0; i < samples.length; i++) mix[from + i] += samples[i] * pourLevel(size);
      });
      return peakOf(mix);
    };
    // Five single medals, then a rattle of every size, the way a tower going over fills it. 0.39 is where the
    // compressor begins to work: below it the chain passes the mix untouched.
    const full = piled([...Array.from({ length: LIMITS.tray - POURS.length + 1 }, (): Pour => 1), ...POURS.slice(1)]);
    expect(full).toBeGreaterThan(LEVEL.ceiling);
    expect(full).toBeLessThan(0.39);
    // A flood no machine could pay, ten of the largest rattle at once, is still only a little over it: work for
    // the compressor, and a long way short of full scale.
    const flood = piled(Array.from({ length: LIMITS.tray }, (): Pour => 32));
    expect(flood).toBeGreaterThan(full);
    expect(flood).toBeLessThan(0.6);
  });
});
