import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  COMPRESSOR,
  LEVEL,
  LIMITS,
  MASTER_GAIN,
  MUSIC,
  MUSIC_ON,
  POCKET_NOTES,
  SAMPLES,
  SCORES,
  SOUNDS,
  SOUND_LEVELS,
  VARIANTS,
  hush,
  pitch,
  playSound,
  renderSound,
  resetAudio,
  setMusic,
  unlockAudio,
  type Note,
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

  cancelScheduledValues(): this {
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

/** A sound being cut short fades for this long; a little more than the module's own figure. */
const FADE = 0.031;
const EVERY_TAKE = SAMPLES.reduce((sum, sample) => sum + (VARIANTS[sample] ?? 1), 0);

/** Presses the Sound toggle and lets the cabinet finish working its buffers out. */
async function switchOn(): Promise<FakeContext> {
  vi.stubGlobal('AudioContext', FakeContext);
  await unlockAudio();
  vi.advanceTimersByTime(5000);
  return FakeContext.made[FakeContext.made.length - 1];
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
    for (let round = 0; round < 40; round++) {
      for (const sound of SOUNDS) playSound(sound, true, { level: round % 8, stops: [0.3 + round * 0.01, 1.4, 0.9] });
      wait(audio, 0.1);
    }
    hush();
    expect(audio.sources.length).toBeGreaterThan(100);
    const voices = audio.gains.filter((gain) => gain !== audio.master);
    expect(voices).toHaveLength(audio.sources.length);
    for (const gain of voices) {
      expect(gain.gain.seen.length).toBeGreaterThan(0);
      for (const value of gain.gain.seen) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(LEVEL.ceiling);
      }
    }
    expect(audio.master.gain.seen).toEqual([MASTER_GAIN]);
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
    const audio = await switchOn();
    expect(audio.buffers).toHaveLength(EVERY_TAKE);
    setMusic(true);
    for (let round = 0; round < 20; round++) {
      for (const sound of SOUNDS) playSound(sound, true, { level: 1 + (round % 6) });
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

  it('gives each medal a clink of its own: one of several takes, at its own pitch and level', async () => {
    const audio = await switchOn();
    for (let medal = 0; medal < 60; medal++) {
      playSound('land', true);
      wait(audio, 0.05, 0.05);
    }
    expect(audio.sources).toHaveLength(60);
    const speeds = audio.sources.map((source) => source.playbackRate.value);
    const levels = audio.sources.map((source) => audio.gainOf(source).gain.value);
    expect(new Set(speeds).size).toBeGreaterThan(50);
    expect(new Set(levels).size).toBeGreaterThan(50);
    expect(new Set(audio.sources.map((source) => source.buffer)).size).toBe(VARIANTS.land);
    for (const speed of speeds) expect(Math.abs(speed - 1)).toBeLessThanOrEqual(0.05 + 1e-9);
    for (const level of levels) {
      expect(level).toBeLessThanOrEqual(SOUND_LEVELS.land);
      expect(level).toBeGreaterThanOrEqual(SOUND_LEVELS.land * 0.7 - 1e-9);
    }
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

  it.each(['land', 'win', 'lost'] as const)('holds a burst of two hundred %s clinks to a few', async (sound) => {
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
      playSound('win', true);
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
      for (const sound of SOUNDS) playSound(sound, true, { level: 1 + (i % 6) });
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
    playSound('win', true);
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

const energy = (samples: Float32Array, from = 0, to = samples.length): number => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
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
  let kept = 0;
  for (const value of low) kept += value * value;
  return kept / energy(samples);
}

describe('what is worked out', () => {
  it('covers every sound and the two notes of the loop', () => {
    expect(new Set(SOUNDS).size).toBe(SOUNDS.length);
    expect(SAMPLES).toHaveLength(SOUNDS.length + MUSIC.parts.length);
    for (const name of Object.keys(SCORES)) expect(SOUNDS).toContain(name);
    // The names the cabinet has always used are still there.
    const old = ['land', 'win', 'lost', 'gate', 'full', 'reelStop', 'reach', 'small', 'big', 'seven', 'tick', 'prize', 'jackpot', 'crash', 'ball', 'dice', 'chest', 'fever'];
    for (const name of old) expect(SOUNDS).toContain(name);
  });

  it.each(takes)('%s (take %i) is finite, peaks at exactly 1, and begins and ends in silence', (sample, variant) => {
    const samples = renderSound(sample, RATE, variant);
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

  it('comes out the same every time, and at another sample rate too', () => {
    for (const [sample, variant] of takes) {
      expect(renderSound(sample, RATE, variant)).toEqual(renderSound(sample, RATE, variant));
    }
    for (const sample of ['land', 'jackpot', 'spin', 'crash'] as const) {
      const slower = renderSound(sample, 44100);
      expect(slower.length / 44100).toBeCloseTo(renderSound(sample, RATE).length / RATE, 3);
      expect(peakOf(slower)).toBeCloseTo(1, 6);
      expect(brightness(slower, 44100) / brightness(renderSound(sample, RATE), RATE)).toBeGreaterThan(0.9);
      expect(brightness(slower, 44100) / brightness(renderSound(sample, RATE), RATE)).toBeLessThan(1.1);
    }
  });

  it('still makes sense on a sound card that runs slowly', () => {
    // A telephone headset can run at 16,000 samples a second: nothing may be asked to sound above half of that.
    for (const sample of ['land', 'win', 'tick', 'gate', 'prize', 'jackpot', 'crash'] as const) {
      const samples = renderSound(sample, 16000);
      expect(samples.length / 16000).toBeCloseTo(renderSound(sample, RATE).length / RATE, 3);
      expect(peakOf(samples)).toBeCloseTo(1, 6);
      expect(brightness(samples, 16000)).toBeLessThan(8000 * 0.9);
    }
  });

  it('keeps several takes of each clink, no two alike', () => {
    for (const sound of ['land', 'win', 'lost'] as const) {
      const count = VARIANTS[sound] ?? 1;
      expect(count).toBeGreaterThanOrEqual(3);
      const seen = new Set(Array.from({ length: count }, (_, variant) => brightness(renderSound(sound, RATE, variant), RATE).toFixed(1)));
      expect(seen.size).toBe(count);
    }
    // A take that does not exist is the nearest one that does.
    expect(renderSound('land', RATE, 99)).toEqual(renderSound('land', RATE, (VARIANTS.land ?? 1) - 1));
    expect(renderSound('land', RATE, -3)).toEqual(renderSound('land', RATE, 0));
  });

  it('makes a medal that is won brighter than one that lands, and one that is lost duller than both', () => {
    const of = (sound: 'land' | 'win' | 'lost') => Array.from({ length: VARIANTS[sound] ?? 1 }, (_, variant) => brightness(renderSound(sound, RATE, variant), RATE));
    const [land, win, lost] = [of('land'), of('win'), of('lost')];
    expect(Math.min(...win)).toBeGreaterThan(Math.max(...land) * 1.15);
    expect(Math.min(...land)).toBeGreaterThan(Math.max(...lost) * 2);
    // Metal, not a beep: up where a coin rings, and not so high that it is all hiss.
    for (const value of [...land, ...win]) {
      expect(value).toBeGreaterThan(2000);
      expect(value).toBeLessThan(8000);
    }
  });

  it('lets a clink die away quickly, the one that is won bouncing before it does', () => {
    for (const sound of ['land', 'win', 'lost'] as const) {
      for (let variant = 0; variant < (VARIANTS[sound] ?? 1); variant++) {
        const samples = renderSound(sound, RATE, variant);
        expect(samples.length / RATE).toBeLessThan(0.4);
        const quarter = Math.floor(samples.length / 4);
        expect(energy(samples, 3 * quarter)).toBeLessThan(energy(samples, 0, quarter) * 0.01);
      }
    }
    // The strike is the loudest thing in a clink, and it comes at once.
    const land = renderSound('land', RATE);
    expect(land.findIndex((value) => Math.abs(value) === 1) / RATE).toBeLessThan(0.005);
    // The second bounce: the level falls and comes back up.
    const win = renderSound('win', RATE);
    const window = Math.round(0.01 * RATE);
    const levels = Array.from({ length: Math.floor(win.length / window) }, (_, index) => energy(win, index * window, (index + 1) * window));
    expect(levels.some((level, index) => index > 2 && level > levels[index - 1] * 2)).toBe(true);
  });

  it('makes the reel loop a whole second that joins up with itself', () => {
    const samples = renderSound('spin', RATE);
    expect(samples).toHaveLength(RATE);
    expect(Math.abs(samples[0])).toBe(0);
    expect(Math.abs(samples[samples.length - 1])).toBeLessThan(1e-3);
    // A steady whirr: no tenth of a second much louder than another.
    const tenths = Array.from({ length: 10 }, (_, index) => energy(samples, (index * RATE) / 10, ((index + 1) * RATE) / 10));
    expect(Math.max(...tenths) / Math.min(...tenths)).toBeLessThan(2);
  });

  it('gives the things that should be low a low voice and the lamps a high one', () => {
    const of = (sample: Sample, variant = 0) => brightness(renderSound(sample, RATE, variant), RATE);
    for (const low of ['reelStop', 'tower', 'cross', 'lost'] as const) expect(of(low), low).toBeLessThan(1200);
    for (const high of ['tick', 'land', 'win', 'dice'] as const) expect(of(high), high).toBeGreaterThan(1500);
    expect(of('cross')).toBeLessThan(of('prize'));
    expect(of('reelStop')).toBeLessThan(of('tick'));
    // The pocket's tone climbs.
    const pockets = POCKET_NOTES.map((_, variant) => of('pocket', variant));
    pockets.forEach((value, index) => {
      if (index > 0) expect(value).toBeGreaterThan(pockets[index - 1]);
    });
  });

  it('lasts about as long as the notes say, and the jackpot longer than anything', () => {
    for (const [name, score] of scores) {
      expect(renderSound(name as PusherSound, RATE).length / RATE).toBeCloseTo(score.length + score.tail, 3);
    }
    const jackpot = renderSound('jackpot', RATE).length;
    for (const [sample, variant] of takes) if (sample !== 'jackpot') expect(renderSound(sample, RATE, variant).length).toBeLessThan(jackpot);
    expect(renderSound('fever', RATE).length / RATE).toBeGreaterThan(1.5);
  });

  it('holds no long tone except in the fanfares: everything else is over in a second and a half', () => {
    for (const [sample, variant] of takes) {
      if (sample === 'fever' || sample === 'jackpot') continue;
      expect(renderSound(sample, RATE, variant).length / RATE, sample).toBeLessThan(1.5);
    }
  });
});
