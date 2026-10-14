import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PUSHER, pusherFront } from '@/components/game/MedalPusher/engine';
import {
  AMBIENCE,
  CHUTE,
  COMPRESSOR,
  ENTRY,
  GOLD_SHIMMER,
  GOLD_START,
  GUARD,
  HOPPER,
  LEVEL,
  LIMITS,
  LOOPING,
  LOW_RATE,
  MASTER_GAIN,
  MEDAL,
  MOTOR,
  MUSIC,
  MUSIC_ON,
  POCKET_NOTES,
  POURS,
  POUR_SAMPLES,
  ROTOR,
  RUN,
  SAMPLES,
  SCORES,
  SOUNDS,
  SOUND_LEVELS,
  TRAY,
  VARIANTS,
  VOLUME,
  WANDER,
  WARMED,
  hush,
  masterGain,
  pitch,
  playSound,
  pourHits,
  pourLevel,
  pourSeed,
  renderSound,
  resetAudio,
  setAmbience,
  setMusic,
  setVolume,
  turnMotor,
  turnRotor,
  unlockAudio,
  type Note,
  type Pour,
  type PusherSound,
  type Sample,
  type Score,
  type SoundOptions,
} from '@/components/game/MedalPusher/sounds';

// ── A stand-in for the Web Audio API that writes down everything it is asked to do ──

class FakeParam {
  /** Whether the browser can stop a schedule where it has got to. Not every browser can. */
  static canHold = true;

  /** Every value it has been given, by assignment or on a schedule. */
  readonly seen: number[] = [];
  /** What it has been scheduled to do, in the order it was told: jump to a value at a moment, or get there in a straight line by one. */
  readonly plan: { how: 'set' | 'ramp'; value: number; at: number }[] = [];
  /** The moments a schedule was stopped where it had got to. */
  readonly held: number[] = [];
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

  setValueAtTime(value: number, at = 0): this {
    this.seen.push(value);
    this.plan.push({ how: 'set', value, at });
    return this;
  }

  linearRampToValueAtTime(value: number, at = 0): this {
    this.seen.push(value);
    this.plan.push({ how: 'ramp', value, at });
    return this;
  }

  get cancelAndHoldAtTime(): ((at: number) => this) | undefined {
    if (!FakeParam.canHold) return undefined;
    return (at: number) => {
      this.held.push(at);
      return this;
    };
  }

  /**
   * The targets it has been set, with the moment each starts and the time constant it is approached with, and the
   * moments its schedule was cleared from.
   */
  readonly targets: { value: number; at: number; over: number }[] = [];
  readonly cancelled: number[] = [];

  setTargetAtTime(value: number, at = 0, over = 0): this {
    this.seen.push(value);
    this.targets.push({ value, at, over });
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
  /** How far into its buffer it was told to start, in seconds. */
  from = 0;

  start(when = 0, offset = 0): void {
    this.started.push(when);
    this.from = offset;
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
  /**
   * The rate the next sound card runs at. A test that plays everything there is, and is about what is started and
   * not about what is in a buffer, runs it slowly: a third of the samples to work out, in a third of the time.
   */
  static rate = 48000;

  state: 'suspended' | 'running' | 'closed' = 'suspended';
  currentTime = 0;
  sampleRate = FakeContext.rate;
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

  /** The gain the room alone goes through on its way to the master. */
  get room(): FakeGain {
    return this.gains[2];
  }

  /** The gains that are a source's own: every one but the three the chain is built from. */
  get own(): FakeGain[] {
    return this.gains.slice(3);
  }

  /** The sources that play into a gain. */
  into(gain: FakeGain): FakeSource[] {
    return this.sources.filter((source) => this.gainOf(source).outputs[0] === gain);
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
/** Every take the cabinet works out in the background once the sound is on. The room's are left until the room is asked for. */
const EVERY_TAKE = WARMED.reduce((sum, sample) => sum + (VARIANTS[sample] ?? 1), 0);

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

/** Makes the dice roll differently every time, but the same way in every run of the tests. */
function seedDice(seed = 20261012): void {
  let state = seed >>> 0;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  });
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
  FakeContext.rate = 48000;
  FakeParam.canHold = true;
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
    // And two more gains in front, wide open: one that only the loop goes through, and one that only the room does.
    expect(audio.gains).toHaveLength(3);
    expect(audio.bus.outputs).toEqual([audio.master]);
    expect(audio.bus.gain.value).toBe(1);
    expect(audio.room.outputs).toEqual([audio.master]);
    expect(audio.room.gain.value).toBe(1);
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
    // And with the machine's own bed and the wheel's rotor under it and the room round it, every source of the room at
    // its loudest and in step as well. Those are all there is: each of the four keeps to a count of its own.
    const withTheRoom = everything + MOTOR.level + ROTOR.level + AMBIENCE.voices * AMBIENCE.level;
    expect(withTheRoom).toBeGreaterThan(everything + 0.2);
    expect(through(withTheRoom)).toBeLessThan(0.5);
    expect(through(100)).toBeLessThan(1);
  });

  it('keeps the bed and the room under everything the player does', () => {
    const quietestMedal = Math.min(SOUND_LEVELS.land, SOUND_LEVELS.insert, SOUND_LEVELS.lost, SOUND_LEVELS.win) * (1 - WANDER.level);
    // The clunk at the end of the stroke is the loudest the bed gets, and the hum under it is less than half of that.
    expect(MOTOR.level).toBeLessThan(quietestMedal);
    expect(MOTOR.level).toBeLessThanOrEqual(0.04);
    // Nothing from far off is as loud as the quietest medal of the player's own, and the room's tone is quieter still.
    expect(AMBIENCE.level).toBeLessThan(quietestMedal * 0.6);
    expect(AMBIENCE.room.level).toBeLessThan(AMBIENCE.level);
    // Alone, the bed and the room at their very loudest are a long way under where the compressor begins, at any volume.
    const alone = MOTOR.level + AMBIENCE.voices * AMBIENCE.level;
    expect(alone * VOLUME.most).toBeLessThan(0.39 * 1.5);
    expect(MOTOR.level + AMBIENCE.room.level + 2 * AMBIENCE.level).toBeLessThan(0.39 / VOLUME.most);
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

describe('the volume', () => {
  /** What comes out of the chain for a steady level going in with the volume at `volume`, by the compressor's own rule. */
  const through = (level: number, volume: number = VOLUME.usual): number => {
    const makeUp = -0.6 * COMPRESSOR.threshold * (1 - 1 / COMPRESSOR.ratio);
    const into = 20 * Math.log10(level * masterGain(volume));
    const out = into <= COMPRESSOR.threshold ? into : COMPRESSOR.threshold + (into - COMPRESSOR.threshold) / COMPRESSOR.ratio;
    return 10 ** ((out + makeUp) / 20);
  };

  it('runs from silent, through the level the cabinet was made at, to twice that', () => {
    expect(VOLUME.least).toBe(0);
    expect(VOLUME.usual).toBe(LEVEL.master);
    expect(VOLUME.most).toBe(2);
    expect(masterGain(VOLUME.usual)).toBe(MASTER_GAIN);
    expect(masterGain(VOLUME.least)).toBe(0);
    expect(masterGain(VOLUME.most)).toBeCloseTo(MASTER_GAIN * 2, 12);
    // Half way up the slider is half the level, and a volume outside the range is brought into it.
    expect(masterGain(0.5)).toBeCloseTo(MASTER_GAIN / 2, 12);
    expect(masterGain(-3)).toBe(0);
    expect(masterGain(50)).toBe(masterGain(VOLUME.most));
  });

  it('says what a medal and a jackpot peak at, at each end of it', () => {
    // Silent is silent.
    expect(through(SOUND_LEVELS.win, VOLUME.least)).toBe(0);
    expect(through(SOUND_LEVELS.jackpot, VOLUME.least)).toBe(0);
    // In the middle they are what they were made at: 0.10 and 0.11 of full scale.
    expect(through(SOUND_LEVELS.win)).toBeCloseTo(0.1, 10);
    expect(through(SOUND_LEVELS.jackpot)).toBeCloseTo(0.11, 10);
    // Right up they are twice that, and still under where the compressor begins: 0.20 and 0.22, the loudest single sound 0.24.
    expect(through(SOUND_LEVELS.win, VOLUME.most)).toBeCloseTo(0.2, 10);
    expect(through(SOUND_LEVELS.jackpot, VOLUME.most)).toBeCloseTo(0.22, 10);
    expect(through(LEVEL.ceiling, VOLUME.most)).toBeCloseTo(0.24, 10);
    expect(through(LEVEL.ceiling, VOLUME.most)).toBeLessThan(0.39);
    // The background loop, which peaks at about 0.024, goes from nothing to about 0.05.
    const loop = MUSIC.parts.reduce((sum, part) => sum + part.level, 0);
    expect(through(loop, VOLUME.most)).toBeCloseTo(loop * 2, 10);
    expect(through(loop, VOLUME.most)).toBeLessThan(0.06);
  });

  it("keeps the limiter's promise with the volume right up", () => {
    // The compressor begins to work where what comes out reaches 0.39, at any volume: that is on half as much going in.
    expect(through(0.39 / VOLUME.most, VOLUME.most)).toBeCloseTo(0.39, 2);
    expect(through(0.19, VOLUME.most)).toBeCloseTo(0.38, 10);
    expect(through(0.3, VOLUME.most)).toBeLessThan(0.6 * 0.72);
    // The tray as full as its rule lets it be peaks under 0.39 as it is played, and a flood no machine could pay under
    // 0.6: the tests of the rattles hold them to that. Twice as loud, both still come out well under half of full
    // scale, at 0.42 and 0.43.
    expect(through(0.39, VOLUME.most)).toBeLessThan(0.42);
    expect(through(0.6, VOLUME.most)).toBeLessThan(0.44);
    // Every voice there can be, each at the ceiling and all of them in step, which cannot happen: 0.48 as the cabinet
    // was made, and 0.51 with the volume right up.
    const everything = (LIMITS.voices + MUSIC.voices) * LEVEL.ceiling;
    expect(through(everything)).toBeLessThan(0.49);
    expect(through(everything, VOLUME.most)).toBeGreaterThan(through(everything));
    expect(through(everything, VOLUME.most)).toBeLessThan(0.51);
    // The machine's bed, the wheel's rotor and the room, each source of it at its loudest and in step with all the rest, add less than
    // a hundredth to that: 0.484 as the cabinet was made and 0.513 with the volume right up.
    const withTheRoom = everything + MOTOR.level + ROTOR.level + AMBIENCE.voices * AMBIENCE.level;
    expect(through(withTheRoom)).toBeLessThan(0.485);
    expect(through(withTheRoom, VOLUME.most)).toBeLessThan(0.515);
    expect(through(withTheRoom, VOLUME.most) - through(everything, VOLUME.most)).toBeLessThan(0.01);
    // The worst that play can make, the tray as full as its rule lets it be, with the bed's clunk, the room's tone and
    // two far-off sounds at their loudest all landing on its peak: 0.39 + 0.12 going in, 0.41 and 0.43 coming out.
    const pileUp = 0.39 + MOTOR.level + AMBIENCE.room.level + 2 * AMBIENCE.level;
    expect(through(pileUp)).toBeLessThan(0.41);
    expect(through(pileUp, VOLUME.most)).toBeLessThan(0.43);
    // And nothing at all gets to full scale.
    expect(through(100, VOLUME.most)).toBeLessThan(1);
    // Turned down, the compressor has less to do, never more.
    for (const volume of [0.25, 0.5, 0.75]) expect(through(everything, volume)).toBeLessThan(through(everything));
  });

  it('keeps the tower tubes at work under where the compressor begins as the cabinet was made, and under half of full scale right up', () => {
    // The loudest the tubes are by themselves: a medal landing on the stack in each tube in the same frame, both arms'
    // motors running and a gate seating, all on one peak. That is 0.335 going in, which comes out as it went in, and
    // 0.41 with the volume right up.
    const tubes = 2 * SOUND_LEVELS.land + 2 * SOUND_LEVELS.lift + SOUND_LEVELS.guard;
    expect(tubes).toBeCloseTo(0.335, 10);
    expect(through(tubes)).toBeCloseTo(tubes, 10);
    expect(through(tubes)).toBeLessThan(0.34);
    expect(through(tubes, VOLUME.most)).toBeLessThan(0.42);
    // With the hopper's doors out and the loudest rattle they pour, and the bed's clunk, landing on that peak as well:
    // 0.58 going in, 0.41 and 0.43 coming out, which is the worst play makes of the tray (above).
    const worst = tubes + SOUND_LEVELS.hopper + pourLevel(POURS[POURS.length - 1]) + MOTOR.level;
    expect(through(worst)).toBeLessThan(0.41);
    expect(through(worst, VOLUME.most)).toBeLessThan(0.44);
  });

  it('is what the cabinet starts at when it is set before the sound is switched on, and makes nothing by itself', async () => {
    vi.stubGlobal('AudioContext', FakeContext);
    setVolume(0.5);
    setVolume(0.35);
    expect(FakeContext.made).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    const audio = await switchOn();
    expect(audio.master.gain.value).toBeCloseTo(MASTER_GAIN * 0.35, 12);
    // It began there: there was nothing to glide from.
    expect(audio.master.gain.targets).toHaveLength(0);
  });

  it('glides to a new level instead of jumping to it, whatever is playing', async () => {
    const audio = await switchOn();
    setMusic(true);
    playSound('jackpot', true);
    wait(audio, 1);
    const playing = audio.sounding().length;
    const stops = () => audio.sources.reduce((sum, source) => sum + source.stopped.length, 0);
    const stopped = stops();
    expect(playing).toBeGreaterThan(0);
    setVolume(1.5);
    const { targets, cancelled } = audio.master.gain;
    expect(targets).toEqual([{ value: masterGain(1.5), at: audio.currentTime, over: VOLUME.glide }]);
    expect(cancelled).toEqual([audio.currentTime]);
    // The gain was never set outright after it was built: only ever approached. Fast enough to follow a finger
    // on a slider, slow enough not to click.
    expect(audio.master.gain.value).toBe(MASTER_GAIN);
    expect(VOLUME.glide).toBeGreaterThanOrEqual(0.01);
    expect(VOLUME.glide).toBeLessThanOrEqual(0.1);
    // What was playing plays on: nothing was stopped or started for it.
    expect(audio.sounding()).toHaveLength(playing);
    expect(stops()).toBe(stopped);

    // A slider being dragged: a change every few milliseconds, each a glide from wherever the last had got to.
    for (let step = 1; step <= 40; step++) {
      audio.currentTime += 0.008;
      setVolume(1.5 - step * 0.03);
    }
    expect(targets).toHaveLength(41);
    expect(cancelled).toHaveLength(41);
    targets.forEach((target, index) => {
      expect(target.over).toBe(VOLUME.glide);
      expect(target.at).toBe(cancelled[index]);
      if (index > 0) expect(target.at).toBeGreaterThan(targets[index - 1].at);
    });
    expect(targets[40].value).toBeCloseTo(masterGain(0.3), 12);
    expect(audio.master.gain.value).toBe(MASTER_GAIN);
  });

  it('goes all the way down to silent and all the way up, and no further either way', async () => {
    const audio = await switchOn();
    const last = () => audio.master.gain.targets[audio.master.gain.targets.length - 1].value;
    setVolume(VOLUME.least);
    expect(last()).toBe(0);
    setVolume(VOLUME.most);
    expect(last()).toBeCloseTo(MASTER_GAIN * 2, 12);
    setVolume(9);
    expect(last()).toBe(masterGain(VOLUME.most));
    setVolume(-1);
    expect(last()).toBe(0);
    // What is not a number is not a volume: the level stays where it was.
    const asked = audio.master.gain.targets.length;
    for (const nonsense of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) setVolume(nonsense);
    expect(audio.master.gain.targets).toHaveLength(asked);
    // And the next cabinet starts at the last volume that made sense.
    resetAudio();
    setVolume(0.25);
    setVolume(Number.NaN);
    const next = await switchOn();
    expect(next.master.gain.value).toBeCloseTo(MASTER_GAIN * 0.25, 12);
  });

  it('changes how loud the cabinet is, not what any sound is played at', async () => {
    fix(0);
    const audio = await switchOn();
    setVolume(VOLUME.most);
    for (const sound of ['insert', 'land', 'lost', 'prize', 'jackpot'] as const) playSound(sound, true, { bare: false });
    setMusic(true);
    playSound('win', true, { count: 30 });
    wait(audio, 0.5);
    setVolume(VOLUME.least);
    playSound('fever', true);
    const voices = audio.own;
    expect(voices.length).toBeGreaterThan(8);
    for (const gain of voices) for (const value of gain.gain.seen) expect(value).toBeLessThanOrEqual(LEVEL.ceiling);
    const levelOf = (index: number) => audio.gainOf(audio.sources[index]).gain.value;
    expect([0, 1, 2, 3, 4].map(levelOf)).toEqual([SOUND_LEVELS.insert, SOUND_LEVELS.land, SOUND_LEVELS.lost, SOUND_LEVELS.prize, SOUND_LEVELS.jackpot]);
    // The loop's own gain is the loop's: the volume is one gain, the one everything goes through.
    expect(audio.bus.outputs).toEqual([audio.master]);
    for (const value of audio.bus.gain.seen) expect([1, MUSIC.ducked]).toContain(value);
    // With the volume at nothing the cabinet goes on playing into silence, so that turning it up is heard at once.
    expect(audio.sources[audio.sources.length - 1].started).toHaveLength(1);
  });

  it('is harmless where there is no audio, and where the audio will not have it', async () => {
    expect(() => setVolume(1.2)).not.toThrow();
    resetAudio();
    const audio = await switchOn();
    vi.spyOn(audio.master.gain, 'setTargetAtTime').mockImplementation(() => {
      throw new Error('the context is closed');
    });
    expect(() => setVolume(0.4)).not.toThrow();
    expect(() => playSound('land', true)).not.toThrow();
    expect(audio.sources).toHaveLength(1);
  });

  it('is forgotten with everything else when the audio is', async () => {
    setVolume(0.3);
    resetAudio();
    const audio = await switchOn();
    expect(audio.master.gain.value).toBe(MASTER_GAIN);
  });
});

describe('the loop switched off by itself', () => {
  it('leaves the medals exactly as they are and starts nothing of its own', async () => {
    fix(0);
    const audio = await switchOn();
    setMusic(false);
    for (const sound of ['insert', 'land', 'win', 'lost'] as const) playSound(sound, true, { bare: false });
    // Longer than the loop is: not one note of it.
    wait(audio, MUSIC.length + 4);
    expect(vi.getTimerCount()).toBe(0);
    expect(audio.sources).toHaveLength(4);
    for (const source of audio.sources) {
      expect(audio.gainOf(source).outputs).toEqual([audio.master]);
      expect(source.stopped).toHaveLength(1);
    }
    expect(audio.sources.map((source) => audio.gainOf(source).gain.value)).toEqual([SOUND_LEVELS.insert, SOUND_LEVELS.land, pourLevel(1), SOUND_LEVELS.lost]);
    // A rattle, which would turn the loop down, and a fanfare, which would rest it, play as they always do.
    playSound('win', true, { count: 12 });
    playSound('jackpot', true);
    expect(audio.sources).toHaveLength(7);
    expect(audio.sources.slice(4).map((source) => audio.gainOf(source).gain.value)).toEqual([pourLevel(8), pourLevel(4), SOUND_LEVELS.jackpot]);
    wait(audio, 6);
    expect(audio.sources).toHaveLength(7);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('can be switched off in the middle of everything: the loop stops and nothing else does', async () => {
    fix(0);
    const audio = await switchOn();
    setMusic(true);
    wait(audio, 1);
    const loop = audio.sources.length;
    expect(loop).toBeGreaterThan(2);
    playSound('seven', true);
    playSound('win', true, { count: 4 });
    const others = audio.sources.slice(loop);
    expect(others).toHaveLength(2);
    setMusic(false);
    // Every note of the loop that was sounding or lined up is cut; the jingle and the rattle are not touched.
    expect(audio.sounding(FADE)).toEqual(others);
    for (const source of others) expect(source.stopped).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    const made = audio.sources.length;
    wait(audio, 5);
    expect(audio.sources).toHaveLength(made);
    // Medals go on being heard, at their own level, and switching the loop back on brings it back from the top.
    playSound('land', true, { bare: false });
    expect(audio.gainOf(audio.sources[made]).gain.value).toBe(SOUND_LEVELS.land);
    setMusic(true);
    expect(audio.sources.length).toBeGreaterThan(made + 1);
    expect(audio.gainOf(audio.sources[audio.sources.length - 1]).outputs).toEqual([audio.bus]);
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
    FakeContext.rate = 16000;
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
    const voices = audio.own;
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
    FakeContext.rate = 16000;
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
    FakeContext.rate = 16000;
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
    FakeContext.rate = 16000;
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
    // Each is let in on that rule and may then start a few thousandths of a second late, so the rule is kept by what
    // is heard over any stretch that much shorter.
    for (const from of starts) {
      const within = starts.filter((at) => at >= from && at < from + LIMITS.window - WANDER.late - 1e-9).length;
      expect(within).toBeLessThanOrEqual(LIMITS.clinks * 3);
    }
    // And never so many in the air that a jingle would be crowded out.
    expect(LIMITS.kept).toBeGreaterThan(0);
  });

  it('never has more voices in the air than the limit, however hard it is pressed', async () => {
    FakeContext.rate = 16000;
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
    FakeContext.rate = 16000;
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

// ── The machine itself, its mechanisms, and the room it stands in ────────────

describe('the machine itself', () => {
  /** Runs the cabinet's frames for `seconds` from the machine's clock at `from`: the two clocks go on together, and the bed is asked for once a frame. */
  function frames(audio: FakeContext, seconds: number, from: number): number {
    const step = 1 / 60;
    let time = from;
    for (let frame = 0; frame < Math.round(seconds / step); frame++) {
      audio.currentTime += step;
      time += step;
      turnMotor(true, time);
    }
    return time;
  }

  it('is silent until the sound is on, and asks for no timer when it is', async () => {
    vi.stubGlobal('AudioContext', FakeContext);
    turnMotor(true, 1);
    expect(FakeContext.made).toHaveLength(0);
    const audio = await switchOn();
    turnMotor(false, 1);
    turnMotor(true, Number.NaN);
    audio.become('suspended');
    turnMotor(true, 1);
    expect(audio.sources).toHaveLength(0);
    audio.become('running');
    const timers = vi.getTimerCount();
    turnMotor(true, 1);
    expect(audio.sources).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(timers);
    // Asked again in the next frame, it has what it needs for now.
    turnMotor(true, 1.016);
    expect(audio.sources).toHaveLength(1);
  });

  it('plays one stroke of the pusher, round and round, from where the pusher is', async () => {
    const audio = await switchOn();
    audio.currentTime = 5;
    turnMotor(true, 12.34);
    const [source] = audio.sources;
    expect(source.loop).toBe(true);
    expect(source.buffer?.duration).toBeCloseTo(PUSHER.period, 9);
    expect(source.buffer?.sampleRate).toBe(LOW_RATE);
    expect(source.begins).toBe(5);
    expect(source.from).toBeCloseTo(12.34 % PUSHER.period, 9);
    expect(source.ends).toBeCloseTo(5 + MOTOR.stretch + MOTOR.overlap, 9);
    expect(source.playbackRate.value).toBe(1);
    // It goes straight into the master: it is the machine, not the loop and not the room.
    expect(audio.gainOf(source).outputs).toEqual([audio.master]);
    // It comes in and goes out over the overlap, and is at the bed's level in between.
    const { plan } = audio.gainOf(source).gain;
    expect(plan.map((step) => [step.how, step.value])).toEqual([
      ['set', 0],
      ['ramp', MOTOR.level],
      ['set', MOTOR.level],
      ['ramp', 0],
    ]);
    [5, 5 + MOTOR.overlap, 5 + MOTOR.stretch, 5 + MOTOR.stretch + MOTOR.overlap].forEach((at, step) => expect(plan[step].at).toBeCloseTo(at, 9));
    expect(audio.gainOf(source).gain.value).toBe(0);
  });

  it('follows the stroke: every stretch begins where the machine says the pusher is', async () => {
    const audio = await switchOn();
    audio.currentTime = 3;
    const from = 100.7;
    frames(audio, 20, from);
    const machineAt = (clock: number) => from + (clock - 3);
    expect(audio.sources.length).toBeGreaterThanOrEqual(16);
    expect(audio.sources.length).toBeLessThanOrEqual(18);
    audio.sources.forEach((source, index) => {
      // Where in the buffer it starts is where in its stroke the pusher is at that moment.
      const off = (((source.from - machineAt(source.begins)) % PUSHER.period) + PUSHER.period) % PUSHER.period;
      expect(Math.min(off, PUSHER.period - off)).toBeLessThan(1e-6);
      // So the start of the buffer, which is the clunk at the back, comes round as the pusher is fully back, and the
      // clunk half way through it as the pusher is fully forward.
      const back = machineAt(source.begins + (PUSHER.period - source.from));
      expect(pusherFront(back)).toBeCloseTo(PUSHER.min, 6);
      expect(pusherFront(back + PUSHER.period / 2)).toBeCloseTo(PUSHER.max, 6);
      if (index === 0) return;
      // Each begins as the one before it begins to fade, so the two fades add up to the bed's level, and there are never three.
      const before = audio.sources[index - 1];
      expect(source.begins).toBeCloseTo(before.ends - MOTOR.overlap, 9);
      expect(source.begins - before.begins).toBeCloseTo(MOTOR.stretch, 9);
      if (index > 1) expect(source.begins).toBeGreaterThanOrEqual(audio.sources[index - 2].ends - 1e-9);
      // And it was lined up before it was needed, never after.
      expect(source.begins).toBeGreaterThan(before.begins);
    });
    for (const gain of audio.own) for (const value of gain.gain.seen) expect(value).toBeLessThanOrEqual(MOTOR.level);
  });

  it('picks the stroke up from wherever the machine is, when the machine has not kept step with the clock', async () => {
    const audio = await switchOn();
    turnMotor(true, 1);
    // The machine was reset while the first stretch played: its clock is back near nought.
    audio.currentTime = 1.15;
    turnMotor(true, 0.25);
    const [first, second] = audio.sources;
    expect(first.from).toBeCloseTo(1, 9);
    expect(second.begins).toBeCloseTo(MOTOR.stretch, 9);
    expect(second.from).toBeCloseTo(0.25 + (MOTOR.stretch - 1.15), 9);
    // And a page that stalled past the end of a stretch starts the next one now, not in the past.
    audio.currentTime = 30;
    turnMotor(true, 7.5);
    expect(audio.sources[2].begins).toBe(30);
    expect(audio.sources[2].from).toBeCloseTo(7.5 % PUSHER.period, 9);
  });

  it('stops by itself when the frames stop, and a hush cuts it from where its fade had got to', async () => {
    const audio = await switchOn();
    frames(audio, 5, 0);
    const made = audio.sources.length;
    wait(audio, 3);
    expect(audio.sources).toHaveLength(made);
    expect(audio.sounding()).toHaveLength(0);

    frames(audio, 0.5, 9);
    expect(audio.sources).toHaveLength(made + 1);
    const last = audio.sources[made];
    const now = audio.currentTime;
    hush();
    expect(audio.sounding(FADE)).toHaveLength(0);
    const { gain } = audio.gainOf(last);
    expect(gain.held).toEqual([now]);
    expect(gain.plan[gain.plan.length - 1].how).toBe('ramp');
    expect(gain.plan[gain.plan.length - 1].value).toBe(0);
    expect(gain.plan[gain.plan.length - 1].at).toBeLessThanOrEqual(now + FADE);
    // The next frame starts it afresh, from where the pusher is.
    turnMotor(true, 2.5);
    expect(audio.sources).toHaveLength(made + 2);
    expect(audio.sources[made + 1].begins).toBe(now);
    expect(audio.sources[made + 1].from).toBeCloseTo(2.5, 9);
  });

  it('is cut from the level it was made at where the browser cannot say where a fade had got to', async () => {
    FakeParam.canHold = false;
    const audio = await switchOn();
    turnMotor(true, 0);
    audio.currentTime = 0.5;
    hush();
    const { gain } = audio.gainOf(audio.sources[0]);
    expect(gain.held).toHaveLength(0);
    expect(gain.cancelled).toEqual([0.5]);
    expect(gain.plan.slice(-2).map((step) => [step.how, step.value])).toEqual([
      ['set', MOTOR.level],
      ['ramp', 0],
    ]);
  });

  it('never throws into the game when it cannot be played', async () => {
    await switchOn();
    FakeContext.broken = true;
    expect(() => turnMotor(true, 1)).not.toThrow();
  });
});

describe('the cap on voices, for every sound there is', () => {
  /** Each sound as it is asked for when it has the most in it. One that is not here is asked for plainly. */
  const FULLEST: Partial<Record<PusherSound, SoundOptions>> = {
    spin: { stops: [0.7, 1.6, 1.2] },
    win: { count: 64 },
    tray: { count: 64 },
    roulette: { seconds: 2.8 },
    lift: { seconds: 2, after: 0.5 },
    bowl: { seconds: 5.64, after: 0.75, nearMiss: 4 },
    hopper: { count: 500 },
    pour: { count: 300 },
    guard: { seconds: 0.5, up: true },
    ride: { seconds: 0.9 },
    start: { gold: true },
    spark: { seconds: 0.35 },
    door: { up: true },
    shutter: { up: true },
    button: { up: true },
    pocket: { level: 4 },
  };
  /** How many sources each of the sounds with more than one thing in it starts, as it is asked for above. */
  const MADE_OF: Partial<Record<PusherSound, number>> = { spin: 3, roulette: 5, lift: 2, bowl: 4, hopper: 3 };

  it.each(SOUNDS)('holds when %s is started with the list one under it, and no more is cut short than it needs room for', async (sound) => {
    FakeContext.rate = 16000;
    fix(0);
    const audio = await switchOn();
    // Twenty-three fanfares a tenth of a second apart: every one of them is still sounding when the last has begun.
    for (let i = 0; i < LIMITS.voices - 1; i++) {
      playSound('jackpot', true);
      audio.currentTime += 0.1;
    }
    expect(audio.sounding()).toHaveLength(LIMITS.voices - 1);
    const before = audio.sources.length;
    playSound(sound, true, FULLEST[sound] ?? {});
    const made = audio.sources.length - before;
    // A medal's own sounds are kept out of the last voices, which are for the jingles: they start nothing here.
    const medal = ['land', 'insert', 'lost', 'roll', 'button', 'slit', 'ride', 'teeter', 'win', 'tray'].includes(sound);
    expect(made).toBe(medal ? 0 : (MADE_OF[sound] ?? 1));
    // Whatever it started, there are never more than the cap once what was cut has faded.
    expect(audio.sounding(FADE).length).toBeLessThanOrEqual(LIMITS.voices);
    expect(audio.sounding(FADE)).toHaveLength(medal ? LIMITS.voices - 1 : LIMITS.voices);
    // And room was made for exactly what it started: one voice was free, so one fewer than it started was cut short, the oldest first.
    const cutShort = audio.sources.slice(0, before).filter((source) => source.stopped.length > 1);
    expect(cutShort).toHaveLength(Math.max(0, made - 1));
    expect(cutShort).toEqual(audio.sources.slice(0, Math.max(0, made - 1)));
  });

  it.each([
    ['hopper', { count: 10 }, 1],
    ['bowl', { seconds: 3 }, 2],
    ['spin', { stops: [0.01, 1.6, 0.02] }, 1],
  ] as const)('cuts nothing short for a place %s does not take', async (sound, options, made) => {
    FakeContext.rate = 16000;
    fix(0);
    const audio = await switchOn();
    for (let i = 0; i < LIMITS.voices - 1; i++) {
      playSound('jackpot', true);
      audio.currentTime += 0.1;
    }
    const before = audio.sources.length;
    playSound(sound, true, options);
    // One hopper, a ball let go under the rim, one reel with time to turn: each takes fewer voices than the most its kind can.
    expect(audio.sources.length - before).toBe(made);
    expect(audio.sources.slice(0, before).filter((source) => source.stopped.length > 1)).toHaveLength(made - 1);
    expect(audio.sounding(FADE)).toHaveLength(LIMITS.voices);
  });

  it('counts a mechanism\'s voices from what it is about to start, not from a figure kept beside it', async () => {
    FakeContext.rate = 16000;
    fix(0);
    const audio = await switchOn();
    const starts = (sound: PusherSound, options: SoundOptions): number => {
      audio.currentTime += 30;
      const before = audio.sources.length;
      playSound(sound, true, options);
      return audio.sources.length - before;
    };
    // A lift is its motor and its stop; a bowl is its roll and the ball through its hole, and a landing and a near miss when it has them.
    expect(starts('lift', {})).toBe(2);
    expect(starts('bowl', {})).toBe(2);
    expect(starts('bowl', { seconds: 5, after: 0.75 })).toBe(3);
    expect(starts('bowl', { seconds: 5, after: 0.75, nearMiss: 3 })).toBe(4);
    expect(starts('bowl', { seconds: 5, nearMiss: 99 })).toBe(2);
    // A hopper is as many hoppers as its medals call for, and a spin as many reels as have time to turn.
    expect(starts('hopper', { count: 10 })).toBe(1);
    expect(starts('hopper', { count: 60 })).toBe(2);
    expect(starts('hopper', { count: 500 })).toBe(3);
    expect(starts('spin', { stops: [0.7, 1.6, 1.2] })).toBe(3);
    expect(starts('spin', { stops: [0.01, 1.6, 0.02] })).toBe(1);
    expect(starts('roulette', {})).toBe(5);
    expect(starts('pour', { count: 300 })).toBe(1);
    // An entry is four voices in all: the ride and the drop it ends in, the cabinet's answer, and the spark.
    expect(starts('ride', { seconds: 0.8 })).toBe(2);
    expect(starts('start', { gold: true })).toBe(1);
    expect(starts('spark', {})).toBe(1);
    expect(starts('teeter', {})).toBe(1);
    expect(starts('lampStep', {})).toBe(1);
    expect(starts('full', {})).toBe(1);
    // Every one of them left the list exactly as full as what it started, with nothing else in it: none was cut for a place that was not taken.
    expect(audio.sources.every((source) => source.stopped.length === 1)).toBe(true);
  });
});

describe('the rotor of the wheel', () => {
  /** Asks for the rotor once a frame for `seconds`. */
  function frames(audio: FakeContext, seconds: number): void {
    for (let frame = 0; frame < Math.round(seconds * 60); frame++) {
      audio.currentTime += 1 / 60;
      turnRotor(true);
    }
  }

  it('turns for as long as it is asked for, one unbroken sound, and runs down when it is not', async () => {
    fix(0.25);
    vi.stubGlobal('AudioContext', FakeContext);
    turnRotor(true);
    expect(FakeContext.made).toHaveLength(0);
    const audio = await switchOn();
    turnRotor(false);
    expect(audio.sources).toHaveLength(0);
    const timers = vi.getTimerCount();
    audio.currentTime = 3;
    frames(audio, 12);
    expect(vi.getTimerCount()).toBe(timers);
    // Twelve seconds of it is a couple of dozen stretches, never more than two at once.
    expect(audio.sources.length).toBeGreaterThanOrEqual(22);
    expect(audio.sources.length).toBeLessThanOrEqual(26);
    const length = audio.sources[0].buffer?.duration ?? 0;
    audio.sources.forEach((source, index) => {
      expect(source.loop).toBe(true);
      expect(audio.gainOf(source).outputs).toEqual([audio.master]);
      for (const value of audio.gainOf(source).gain.seen) expect(value).toBeLessThanOrEqual(ROTOR.level);
      if (index === 0) return;
      const before = audio.sources[index - 1];
      // Each begins as the one before it begins to fade, and at the very place in the buffer the other has got to:
      // through the fade the two are playing the same thing, so nothing is heard of the join.
      expect(source.begins).toBeCloseTo(before.ends - ROTOR.overlap, 9);
      const off = (((source.from - (before.from + (source.begins - before.begins))) % length) + length) % length;
      expect(Math.min(off, length - off)).toBeLessThan(1e-6);
      if (index > 1) expect(source.begins).toBeGreaterThanOrEqual(audio.sources[index - 2].ends - 1e-9);
    });
    // The calls stop: nothing more is lined up, and it is gone within a stretch.
    const made = audio.sources.length;
    wait(audio, 0.7);
    expect(audio.sources).toHaveLength(made);
    expect(audio.sounding()).toHaveLength(0);
    expect(ROTOR.stretch + ROTOR.overlap).toBeLessThan(0.7);
    // Asked for again it starts afresh, and a hush cuts it with everything else.
    frames(audio, 0.2);
    expect(audio.sources).toHaveLength(made + 1);
    expect(audio.sources[made].begins).toBeCloseTo(audio.currentTime - 0.2 + 1 / 60, 9);
    hush();
    expect(audio.sounding(FADE)).toHaveLength(0);
    FakeContext.broken = true;
    expect(() => frames(audio, 1)).not.toThrow();
  });

  it('is low and steady, and quieter than the machine it is part of', () => {
    const samples = rendered('rotor');
    expect(brightness(samples, RATE)).toBeLessThan(1200);
    const tenths = Array.from({ length: 15 }, (_, index) => energy(samples, (index * RATE) / 10, ((index + 1) * RATE) / 10));
    expect(Math.max(...tenths) / Math.min(...tenths)).toBeLessThan(2);
    expect(ROTOR.level).toBeLessThan(MOTOR.level);
  });
});

describe('a mechanism that runs', () => {
  const RUNNING = ['roulette', 'lift', 'bowl', 'hopper', 'pour', 'ride'] as const;
  /** How much of the time it is told a mechanism is heard for: the roulette's ball has stopped rolling when it strikes a pocket's lip, 0.72 of the way through its turn. */
  const heardFor = (sound: (typeof RUNNING)[number]): number => (sound === 'roulette' ? 0.72 : 1);
  /** The sources that go round and round: a mechanism's own. */
  const turning = (audio: FakeContext): FakeSource[] => audio.sources.filter((source) => source.loop);

  it.each(RUNNING)('%s goes round for as long as it is told, comes in and dies away, and is never above its level', async (sound) => {
    fix(0);
    const audio = await switchOn();
    audio.currentTime = 2;
    playSound(sound, true, { seconds: 4 });
    const [source] = turning(audio);
    expect(turning(audio)).toHaveLength(1);
    expect(LOOPING).toContain(sound);
    expect(firstDifference(source.buffer?.data ?? new Float32Array(0), rendered(sound))).toBe(-1);
    expect(source.begins).toBe(2);
    expect(source.ends).toBeCloseTo(2 + 4 * heardFor(sound), 9);
    expect(audio.gainOf(source).outputs).toEqual([audio.master]);
    const { plan } = audio.gainOf(source).gain;
    expect(plan[0]).toEqual({ how: 'set', value: 0, at: 2 });
    expect(plan[plan.length - 1].value).toBe(0);
    expect(plan[plan.length - 1].at).toBeCloseTo(source.ends, 9);
    expect(Math.max(...plan.map((step) => step.value))).toBe(SOUND_LEVELS[sound]);
    plan.forEach((step, index) => {
      expect(step.value).toBeGreaterThanOrEqual(0);
      expect(step.at).toBeGreaterThanOrEqual(index > 0 ? plan[index - 1].at - 1e-9 : 2);
      expect(step.at).toBeLessThanOrEqual(source.ends + 1e-9);
    });
    // It has slowed, or at least not sped up, by the time it stops; and it is never played far from its own speed.
    const speeds = source.playbackRate.plan;
    expect(speeds.length).toBeGreaterThanOrEqual(2);
    expect(speeds[0].at).toBe(2);
    expect(speeds[speeds.length - 1].at).toBeCloseTo(source.ends, 9);
    expect(speeds[speeds.length - 1].value).toBeLessThanOrEqual(Math.max(...speeds.map((step) => step.value)));
    for (const step of speeds) {
      expect(step.value).toBeGreaterThan(0.4);
      expect(step.value).toBeLessThan(1.5);
    }
  });

  it('runs as long as it usually does when nobody says, and never for less or for longer than it may', async () => {
    fix(0);
    const audio = await switchOn();
    const usual = { roulette: 2.8, lift: 1.6, bowl: 3, hopper: 2, pour: 2, ride: 0.8 };
    for (const sound of RUNNING) {
      const lasting = (options: { seconds?: number }): number => {
        audio.currentTime += 20;
        const made = turning(audio).length;
        playSound(sound, true, options);
        const source = turning(audio)[made];
        return source.ends - source.begins;
      };
      const longest = sound === 'hopper' ? HOPPER.longest : RUN.longest;
      expect(lasting({}), sound).toBeCloseTo(usual[sound] * heardFor(sound), 9);
      expect(lasting({ seconds: Number.NaN }), sound).toBeCloseTo(usual[sound] * heardFor(sound), 9);
      expect(lasting({ seconds: 0.001 }), sound).toBeCloseTo(RUN.shortest * heardFor(sound), 9);
      expect(lasting({ seconds: -3 }), sound).toBeCloseTo(RUN.shortest * heardFor(sound), 9);
      expect(lasting({ seconds: 5000 }), sound).toBeCloseTo(longest * heardFor(sound), 9);
    }
    // However short, its level is never asked to be in two places at once.
    for (const source of turning(audio)) {
      const { plan } = audio.gainOf(source).gain;
      plan.forEach((step, index) => expect(step.at).toBeGreaterThanOrEqual(index > 0 ? plan[index - 1].at - 1e-9 : source.begins));
    }
  });

  it('ends a lift in its stop and a bowl in the ball going through its hole, at the moment it is told', async () => {
    fix(0);
    const audio = await switchOn();
    audio.currentTime = 1;
    playSound('lift', true, { seconds: 2 });
    const [whirr, stop] = audio.sources;
    expect(audio.sources).toHaveLength(2);
    expect(whirr.loop).toBe(true);
    expect(stop.loop).toBe(false);
    expect(firstDifference(stop.buffer?.data ?? new Float32Array(0), rendered('liftStop'))).toBe(-1);
    expect(stop.begins).toBeGreaterThan(whirr.ends - 0.05);
    expect(stop.begins).toBeLessThanOrEqual(whirr.ends);
    expect(audio.gainOf(stop).gain.value).toBeLessThanOrEqual(LEVEL.ceiling);

    audio.currentTime = 10;
    playSound('bowl', true, { seconds: 6.11 });
    const [roll, drop] = audio.sources.slice(2);
    expect(roll.ends).toBeCloseTo(16.11, 9);
    expect(firstDifference(drop.buffer?.data ?? new Float32Array(0), rendered('drop', 0))).toBe(-1);
    expect(audio.gainOf(drop).gain.value).toBe(SOUND_LEVELS.drop);
    // The loudest thing in `drop` is the knock of the ball going through, and it falls on the moment the bowl was told.
    for (const variant of takesOf('drop')) {
      const samples = rendered('drop', variant);
      let peakAt = 0;
      for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]) > Math.abs(samples[peakAt])) peakAt = i;
      expect(drop.begins + peakAt / RATE).toBeGreaterThan(16.11 - 0.005);
      expect(drop.begins + peakAt / RATE).toBeLessThan(16.11 + 0.012);
    }
    // And a ball can go through a hole with no bowl to go round first.
    audio.currentTime = 30;
    playSound('drop', true);
    expect(audio.sources).toHaveLength(5);
    expect(audio.sources[4].loop).toBe(false);
    expect(audio.sources[4].begins).toBe(30);
  });

  it('begins a little from now when it is told to, and still ends when it was told', async () => {
    fix(0);
    const audio = await switchOn();
    audio.currentTime = 4;
    // A ball that has dropped into a bowl is in the air for a third of a second before it rolls.
    playSound('bowl', true, { seconds: 5, after: 0.35 });
    const [roll, lands, drop] = audio.sources;
    expect(audio.sources).toHaveLength(3);
    // It lands as it begins to roll, with a knock of its own, which a ball let go under the rim of the top bowl has not.
    expect(firstDifference(lands.buffer?.data ?? new Float32Array(0), rendered('bowlLand'))).toBe(-1);
    expect(lands.begins).toBeCloseTo(4.35, 9);
    expect(lands.loop).toBe(false);
    expect(roll.begins).toBeCloseTo(4.35, 9);
    expect(roll.ends).toBeCloseTo(9, 9);
    expect(audio.gainOf(roll).gain.plan[0]).toEqual({ how: 'set', value: 0, at: roll.begins });
    expect(roll.playbackRate.plan[0].at).toBe(roll.begins);
    expect(drop.begins).toBeCloseTo(9 - 0.17, 9);
    // However late it is told to begin there is something of it left, and nonsense is no wait at all.
    const begun = (after: number): number => {
      audio.currentTime += 20;
      const made = turning(audio).length;
      playSound('bowl', true, { seconds: 2, after });
      const source = turning(audio)[made];
      expect(source.ends).toBeCloseTo(audio.currentTime + 2, 9);
      return source.begins - audio.currentTime;
    };
    expect(begun(50)).toBeCloseTo(2 - RUN.shortest, 9);
    expect(begun(-1)).toBe(0);
    expect(begun(Number.NaN)).toBe(0);
    expect(begun(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('lets the ball go faster and faster in a funnel, where in a bowl it slows', async () => {
    fix(0);
    const audio = await switchOn();
    playSound('bowl', true, { seconds: 4 });
    audio.currentTime = 20;
    playSound('bowl', true, { seconds: 4, quickens: true });
    const [bowl, , funnel, funnelDrop] = audio.sources;
    const first = (source: FakeSource) => source.playbackRate.plan[0].value;
    const last = (source: FakeSource) => source.playbackRate.plan[source.playbackRate.plan.length - 1].value;
    expect(last(bowl)).toBeLessThan(first(bowl) * 0.5);
    expect(last(funnel)).toBeGreaterThan(first(funnel) * 2);
    // It is the same ball in the same kind of bowl, and it ends through its hole on the moment all the same.
    expect(funnel.buffer).toBe(bowl.buffer);
    expect(funnel.ends).toBeCloseTo(24, 9);
    expect(funnelDrop.begins).toBeCloseTo(24 - 0.17, 9);
    // In a bowl it is all but still by the end and nearly silent; in a funnel it is going its fastest, and is not.
    const levelAtTheEnd = (source: FakeSource) => audio.gainOf(source).gain.plan[audio.gainOf(source).gain.plan.length - 2].value;
    expect(levelAtTheEnd(bowl)).toBeLessThan(SOUND_LEVELS.bowl * 0.3);
    expect(levelAtTheEnd(funnel)).toBe(SOUND_LEVELS.bowl);
    for (const source of [bowl, funnel]) for (const step of source.playbackRate.plan) {
      expect(step.value).toBeGreaterThan(0.4);
      expect(step.value).toBeLessThan(1.5);
    }
  });

  it('makes a turn of the roulette one sound with its moments in it, at their shares of however long the turn is', async () => {
    fix(0);
    const audio = await switchOn();
    for (const [at, seconds] of [
      [10, 2.8],
      [40, 5],
    ]) {
      audio.currentTime = at;
      const made = audio.sources.length;
      playSound('roulette', true, { seconds });
      const [roll, shot, lip, hop, settle] = audio.sources.slice(made);
      expect(audio.sources.length - made).toBe(5);
      // The ball is shot on to the track as the turn begins, and rolls from then until it strikes the lip of a pocket.
      expect(firstDifference(shot.buffer?.data ?? new Float32Array(0), rendered('shot'))).toBe(-1);
      expect(shot.begins).toBe(at);
      expect(roll.loop).toBe(true);
      expect(roll.begins).toBe(at);
      expect(roll.ends).toBeCloseTo(at + seconds * 0.72, 9);
      // It runs round the track slowing until 0.44 of the turn, and comes down the bank slower still.
      const speeds = roll.playbackRate.plan;
      expect(speeds.map((step) => step.at - at)).toEqual([0, expect.closeTo(seconds * 0.44, 9), expect.closeTo(seconds * 0.72, 9)]);
      expect(speeds[1].value).toBeLessThan(speeds[0].value);
      expect(speeds[2].value).toBeLessThan(speeds[1].value);
      // The strike on the lip, the hop over the divider and the settle, each a take of its own at its share of the turn.
      expect(firstDifference(lip.buffer?.data ?? new Float32Array(0), rendered('lip'))).toBe(-1);
      expect(lip.begins).toBeCloseTo(at + seconds * 0.72, 9);
      expect(firstDifference(hop.buffer?.data ?? new Float32Array(0), rendered('tick'))).toBe(-1);
      expect(hop.begins).toBeCloseTo(at + seconds * 0.8, 9);
      expect(firstDifference(settle.buffer?.data ?? new Float32Array(0), rendered('settle'))).toBe(-1);
      expect(settle.begins).toBeCloseTo(at + seconds * 0.92, 9);
      // All of it is over by the end of the turn, and none of it is loud.
      for (const source of [roll, shot, lip, hop, settle]) expect(source.ends).toBeLessThanOrEqual(at + seconds + 1e-9);
      for (const source of [shot, lip, hop, settle]) expect(audio.gainOf(source).gain.value).toBeLessThanOrEqual(0.06);
    }
  });

  it('lets a ball in a bowl all but go down a hole that is not its own', async () => {
    fix(0);
    const audio = await switchOn();
    audio.currentTime = 2;
    playSound('bowl', true, { seconds: 5.64, after: 0.75, nearMiss: 4 });
    const [roll, lands, drop, near] = audio.sources;
    expect(audio.sources).toHaveLength(4);
    expect(lands.begins).toBeCloseTo(2.75, 9);
    expect(firstDifference(near.buffer?.data ?? new Float32Array(0), rendered('lip'))).toBe(-1);
    expect(near.begins).toBeCloseTo(6, 9);
    expect(near.playbackRate.value).toBeLessThan(1);
    expect(roll.ends).toBeCloseTo(7.64, 9);
    expect(drop.begins).toBeCloseTo(7.64 - 0.17, 9);
    // One that would come before the ball has landed, or after it has gone, is not heard.
    for (const nearMiss of [0.2, 5.6, 99, -1, Number.NaN]) {
      audio.currentTime += 30;
      const made = audio.sources.length;
      playSound('bowl', true, { seconds: 5.64, after: 0.75, nearMiss });
      expect(audio.sources.length - made).toBe(3);
    }
  });

  it('rushes medals down a chute for as long as they take at three dozen a second, or as long as it is told', async () => {
    fix(0);
    const audio = await switchOn();
    const pouring = (options: { count?: number; seconds?: number }): FakeSource => {
      audio.currentTime += 20;
      const made = audio.sources.length;
      playSound('pour', true, options);
      expect(audio.sources.length - made).toBe(1);
      return audio.sources[made];
    };
    expect(CHUTE.rate).toBe(36);
    const short = pouring({ count: 72 });
    expect(short.ends - short.begins).toBeCloseTo(2, 9);
    expect(short.loop).toBe(true);
    const long = pouring({ count: 300 });
    expect(long.ends - long.begins).toBeCloseTo(300 / 36, 9);
    const told = pouring({ count: 300, seconds: 1.5 });
    expect(told.ends - told.begins).toBeCloseTo(1.5, 9);
    expect(pouring({ count: 1e9 }).ends - audio.currentTime).toBeCloseTo(RUN.longest, 9);
    // It comes in quickly, thins at the end, and the loop makes room for it.
    const { plan } = audio.gainOf(long).gain;
    expect(Math.max(...plan.map((step) => step.value))).toBe(SOUND_LEVELS.pour);
    expect(plan[plan.length - 2].value).toBeLessThan(SOUND_LEVELS.pour * 0.5);
    expect(audio.bus.gain.targets.some((target) => target.value === MUSIC.ducked)).toBe(true);
  });

  it('pays a hopper out for as long as its medals take, and a big payout out of two or three at once', async () => {
    fix(0);
    const audio = await switchOn();
    const paying = (options: { count?: number; seconds?: number }): FakeSource[] => {
      audio.currentTime += 20;
      const made = audio.sources.length;
      playSound('hopper', true, options);
      return audio.sources.slice(made);
    };
    const [ten] = paying({ count: 10 });
    expect(ten.ends - ten.begins).toBeCloseTo(10 / HOPPER.rate, 9);
    const forty = paying({ count: 40 });
    expect(forty).toHaveLength(1);
    expect(forty[0].ends - forty[0].begins).toBeCloseTo(40 / HOPPER.rate, 9);
    // More than one can get through in the time it is fair to take is shared out.
    const sixty = paying({ count: 60 });
    expect(sixty).toHaveLength(2);
    expect(sixty[0].ends - sixty[0].begins).toBeCloseTo(60 / (HOPPER.rate * 2), 9);
    const jackpot = paying({ count: 200 });
    expect(jackpot).toHaveLength(3);
    expect(jackpot[0].ends - jackpot[0].begins).toBeCloseTo(200 / (HOPPER.rate * 3), 9);
    const flood = paying({ count: 100000 });
    expect(flood).toHaveLength(3);
    expect(flood[0].ends - flood[0].begins).toBeCloseTo(HOPPER.longest, 9);
    // Each joins after the one before it and leaves before it, at its own speed and level: a sheet that rises and thins.
    jackpot.forEach((source, layer) => {
      expect(source.loop).toBe(true);
      expect(source.begins - jackpot[0].begins).toBeCloseTo(HOPPER.apart * layer, 9);
      expect(jackpot[0].ends - source.ends).toBeCloseTo(HOPPER.apart * layer, 9);
      const { plan } = audio.gainOf(source).gain;
      expect(Math.max(...plan.map((step) => step.value))).toBeCloseTo(SOUND_LEVELS.hopper * HOPPER.levels[layer], 12);
      expect(plan[plan.length - 2].value).toBeLessThan(SOUND_LEVELS.hopper * HOPPER.levels[layer] * 0.5);
      expect(plan[plan.length - 1].value).toBe(0);
      const speeds = source.playbackRate.plan;
      expect(speeds[speeds.length - 1].value).toBeCloseTo(HOPPER.speeds[layer], 12);
    });
    // All three in step are still only two voices' worth.
    expect(SOUND_LEVELS.hopper * HOPPER.levels.reduce((sum, level) => sum + level, 0)).toBeLessThan(LEVEL.ceiling * 2);
    // Told how long, it takes that long, with as many hoppers as the medals call for; and a count that makes no sense is one hopper.
    const told = paying({ count: 200, seconds: 2 });
    expect(told).toHaveLength(3);
    expect(told[0].ends - told[0].begins).toBeCloseTo(2, 9);
    expect(paying({ count: -5 })).toHaveLength(1);
    expect(paying({ count: Number.NaN })).toHaveLength(1);
    // The loop makes room for a payout as it does for the tray.
    expect(audio.bus.gain.targets.some((target) => target.value === MUSIC.ducked)).toBe(true);
    expect(audio.bus.gain.targets[audio.bus.gain.targets.length - 1].value).toBe(1);
  });

  it('takes its place among the voices, and is cut short with them', async () => {
    FakeContext.rate = 16000;
    const audio = await switchOn();
    for (let round = 0; round < 60; round++) {
      for (const sound of RUNNING) playSound(sound, true, { seconds: 1 + (round % 5), count: round * 7 });
      for (const sound of ['land', 'insert', 'prize', 'button'] as const) playSound(sound, true);
      wait(audio, 0.1);
      expect(audio.sounding().length).toBeLessThanOrEqual(LIMITS.voices);
    }
    expect(turning(audio).length).toBeGreaterThan(50);
    const now = audio.currentTime;
    const live = audio.sounding();
    hush();
    expect(audio.sounding(FADE)).toHaveLength(0);
    for (const source of live.filter((one) => one.loop)) {
      // What was on its way up or down is stopped where it had got to, and faded from there.
      expect(audio.gainOf(source).gain.held).toEqual([now]);
      const { plan } = audio.gainOf(source).gain;
      expect(plan[plan.length - 1]).toEqual({ how: 'ramp', value: 0, at: now + 0.03 });
    }
    for (const gain of audio.own) for (const value of gain.gain.seen) expect(value).toBeLessThanOrEqual(LEVEL.ceiling);
  });
});

describe('the buttons and the tray', () => {
  it('gives a button one sound going down and another coming up, each one of two takes and never quite the same', async () => {
    fix(0);
    const audio = await switchOn();
    playSound('button', true);
    audio.currentTime = 0.3;
    playSound('button', true, { up: true });
    const [down, up] = audio.sources;
    expect(firstDifference(down.buffer?.data ?? new Float32Array(0), rendered('button', 0))).toBe(-1);
    expect(firstDifference(up.buffer?.data ?? new Float32Array(0), rendered('buttonUp', 0))).toBe(-1);
    expect(firstDifference(rendered('button', 0), rendered('buttonUp', 0))).not.toBe(-1);
    expect(down.begins).toBe(0);
    expect(audio.gainOf(down).gain.value).toBe(SOUND_LEVELS.button);
    expect(audio.gainOf(down).outputs).toEqual([audio.master]);
    // With other dice it is the other take, a shade quieter, at another speed, a few thousandths of a second later.
    fix(0.999);
    audio.currentTime = 1;
    playSound('button', true);
    const other = audio.sources[2];
    expect(firstDifference(other.buffer?.data ?? new Float32Array(0), rendered('button', 1))).toBe(-1);
    expect(audio.gainOf(other).gain.value).toBeLessThan(SOUND_LEVELS.button);
    expect(audio.gainOf(other).gain.value).toBeGreaterThan(SOUND_LEVELS.button * (1 - WANDER.level) - 1e-9);
    expect(other.playbackRate.value).toBeGreaterThan(down.playbackRate.value);
    expect(other.begins).toBeGreaterThan(1);
    expect(other.begins).toBeLessThanOrEqual(1 + WANDER.late);
  });

  it('gives a door, a shutter and a guard one sound one way and another the way back', async () => {
    fix(0);
    const audio = await switchOn();
    const played = (sound: 'door' | 'shutter' | 'guard', options: { up?: boolean; seconds?: number }): FakeSource => {
      audio.currentTime += 5;
      playSound(sound, true, options);
      return audio.sources[audio.sources.length - 1];
    };
    for (const [sound, back] of [
      ['door', 'doorShut'],
      ['shutter', 'shutterOpen'],
      ['guard', 'guardUp'],
    ] as const) {
      const there = played(sound, {});
      const again = played(sound, { up: true });
      expect(firstDifference(there.buffer?.data ?? new Float32Array(0), rendered(sound, 0)), sound).toBe(-1);
      expect(firstDifference(again.buffer?.data ?? new Float32Array(0), rendered(back, 0)), sound).toBe(-1);
      expect(firstDifference(rendered(sound, 0), rendered(back, 0)), sound).not.toBe(-1);
      for (const source of [there, again]) {
        expect(source.loop).toBe(false);
        expect(source.playbackRate.value).toBe(1);
        expect(audio.gainOf(source).gain.value).toBe(SOUND_LEVELS[sound]);
        expect(audio.gainOf(source).outputs).toEqual([audio.master]);
      }
    }
    // A guard seats at the end of its travel: 0.45 s coming down and 0.5 s going up when nobody says, and sooner or
    // later when it is told, within what still sounds like a guard.
    const clackAt = (source: FakeSource, travel: number) => travel / source.playbackRate.value;
    expect(clackAt(played('guard', {}), GUARD.down)).toBeCloseTo(0.45, 9);
    expect(clackAt(played('guard', { up: true }), GUARD.up)).toBeCloseTo(0.5, 9);
    expect(clackAt(played('guard', { seconds: 0.6 }), GUARD.down)).toBeCloseTo(0.6, 9);
    expect(clackAt(played('guard', { up: true, seconds: 0.4 }), GUARD.up)).toBeCloseTo(0.4, 9);
    expect(played('guard', { seconds: 50 }).playbackRate.value).toBe(0.6);
    expect(played('guard', { seconds: 0.001 }).playbackRate.value).toBe(1.6);
    expect(played('guard', { seconds: Number.NaN }).playbackRate.value).toBe(1);
    // The clack is where the take says it is: the loudest thing in it, at the end of the travel.
    for (const [sample, travel] of [
      ['guard', GUARD.down],
      ['guardUp', GUARD.up],
    ] as const) {
      const samples = rendered(sample);
      let peakAt = 0;
      for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]) > Math.abs(samples[peakAt])) peakAt = i;
      expect(peakAt / RATE).toBeGreaterThan(travel - 0.005);
      expect(peakAt / RATE).toBeLessThan(travel + 0.02);
    }
  });

  it('gives a medal down a START slot a sound of its own, held to a few like any clink', async () => {
    fix(0);
    const audio = await switchOn();
    for (let i = 0; i < 200; i++) playSound('slit', true);
    expect(audio.sources).toHaveLength(1);
    expect(firstDifference(audio.sources[0].buffer?.data ?? new Float32Array(0), rendered('slit', 0))).toBe(-1);
    expect(audio.gainOf(audio.sources[0]).gain.value).toBe(SOUND_LEVELS.slit);
    fix(0.5);
    audio.currentTime += 1;
    playSound('slit', true);
    expect(firstDifference(audio.sources[1].buffer?.data ?? new Float32Array(0), rendered('slit', 1))).toBe(-1);
    expect(audio.sources[1].playbackRate.value).not.toBe(audio.sources[0].playbackRate.value);
  });

  it('holds a hammered button to a few clicks, like any clink', async () => {
    const audio = await switchOn();
    for (let i = 0; i < 200; i++) playSound('button', true, { up: i % 2 === 1 });
    expect(audio.sources).toHaveLength(1);
    audio.currentTime += LIMITS.window;
    for (let i = 0; i < 200; i++) playSound('button', true);
    expect(audio.sources).toHaveLength(2);
  });

  it('lets a medal that is seen to land in the tray be heard at once, on the same books as the ones that fall into it', async () => {
    fix(0);
    const audio = await switchOn();
    audio.currentTime = 1;
    playSound('tray', true);
    expect(audio.sources).toHaveLength(1);
    expect(audio.sources[0].begins).toBe(1);
    expect(firstDifference(audio.sources[0].buffer?.data ?? new Float32Array(0), rendered('win', 0))).toBe(-1);
    expect(audio.gainOf(audio.sources[0]).gain.value).toBe(SOUND_LEVELS.tray);
    // One that went over the front is heard after its fall.
    audio.currentTime = 3;
    playSound('win', true);
    expect(audio.sources[1].begins).toBeCloseTo(3 + TRAY.fall[0], 9);
    // A handful seen to land is a rattle that starts now, each source a moment after the last, and no more of them than the tray may hold.
    audio.currentTime = 6;
    playSound('tray', true, { count: 30 });
    const handful = audio.sources.slice(2);
    expect(handful.length).toBeGreaterThan(1);
    expect(handful.length).toBeLessThanOrEqual(TRAY.atOnce);
    expect(handful[0].begins).toBe(6);
    handful.forEach((source, index) => {
      if (index > 0) expect(source.begins - handful[index - 1].begins).toBeCloseTo(TRAY.spacing, 9);
    });
    for (let round = 0; round < 100; round++) {
      playSound('tray', true, { count: 50 });
      playSound('win', true, { count: 50 });
      wait(audio, 0.05);
      expect(audio.sounding().length).toBeLessThanOrEqual(LIMITS.tray);
    }
  });
});

describe('the room', () => {
  /** The sources the room has made: everything that plays into its own gain. */
  const ofTheRoom = (audio: FakeContext): FakeSource[] => audio.into(audio.room);
  /** The stretches of its tone, which go round, and the things that come from far off, which do not. */
  const tone = (audio: FakeContext): FakeSource[] => ofTheRoom(audio).filter((source) => source.loop);
  const farOff = (audio: FakeContext): FakeSource[] => ofTheRoom(audio).filter((source) => !source.loop);

  it('is off unless it is asked for, whatever else is on', async () => {
    FakeContext.rate = 16000;
    seedDice();
    const audio = await switchOn(true);
    setMusic(true);
    for (let round = 0; round < 30; round++) {
      for (const sound of SOUNDS) playSound(sound, true, { count: 3 });
      turnMotor(true, round);
      wait(audio, 0.25);
    }
    expect(ofTheRoom(audio)).toHaveLength(0);
    expect(audio.room.gain.seen).toEqual([1]);
    // None of it has even been worked out.
    expect(audio.buffers).toHaveLength(EVERY_TAKE);
    for (const buffer of audio.buffers) expect(buffer.sampleRate === LOW_RATE ? buffer.duration : 0).toBeLessThanOrEqual(PUSHER.period + 1e-9);
  });

  it('makes nothing before the sound is switched on, and waits for it', async () => {
    vi.stubGlobal('AudioContext', FakeContext);
    setAmbience(true);
    vi.advanceTimersByTime(5000);
    expect(FakeContext.made).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    const audio = await switchOn();
    setAmbience(true);
    wait(audio, 2);
    expect(ofTheRoom(audio).length).toBeGreaterThan(0);
  });

  it('has nothing to do with the loop: either plays without the other', async () => {
    seedDice();
    const audio = await switchOn();
    setAmbience(true);
    wait(audio, 20);
    expect(ofTheRoom(audio).length).toBeGreaterThan(5);
    expect(audio.into(audio.bus)).toHaveLength(0);
    expect(audio.sources).toHaveLength(ofTheRoom(audio).length);
    // The loop comes on over it and goes off again, and the room neither stops nor starts over.
    const stretches = tone(audio).length;
    setMusic(true);
    wait(audio, 2);
    expect(audio.into(audio.bus).length).toBeGreaterThan(0);
    setMusic(false);
    expect(audio.into(audio.bus).every((note) => note.ends <= audio.currentTime + FADE)).toBe(true);
    expect(tone(audio).length).toBeLessThanOrEqual(stretches + 1);
    expect(ofTheRoom(audio).filter((source) => source.ends > audio.currentTime + FADE).length).toBeGreaterThan(0);
    // And the room goes off under the loop the same way.
    setMusic(true);
    setAmbience(false);
    expect(ofTheRoom(audio).every((source) => source.ends <= audio.currentTime + FADE)).toBe(true);
    const made = ofTheRoom(audio).length;
    const notes = audio.into(audio.bus).length;
    wait(audio, 5);
    expect(ofTheRoom(audio)).toHaveLength(made);
    expect(audio.into(audio.bus).length).toBeGreaterThan(notes);
  });

  it('goes through a gain of its own into the master, so the volume and the limiter have it like everything else', async () => {
    seedDice();
    const audio = await switchOn();
    setAmbience(true);
    wait(audio, 30);
    expect(audio.room.outputs).toEqual([audio.master]);
    expect(audio.sources.length).toBeGreaterThan(10);
    for (const source of audio.sources) expect(audio.gainOf(source).outputs).toEqual([audio.room]);
    // The volume is still the one gain everything goes through, and the room's own gain is left wide open.
    setVolume(VOLUME.most);
    expect(audio.master.gain.targets[audio.master.gain.targets.length - 1].value).toBeCloseTo(masterGain(VOLUME.most), 12);
    expect(audio.room.gain.seen).toEqual([1]);
  });

  it('is quiet: a tone under everything, and nothing from far off as loud as a medal of the player\'s own', async () => {
    seedDice();
    const audio = await switchOn();
    setAmbience(true);
    wait(audio, 120);
    expect(farOff(audio).length).toBeGreaterThan(40);
    for (const source of tone(audio)) {
      const { plan } = audio.gainOf(source).gain;
      expect(Math.max(...plan.map((step) => step.value))).toBe(AMBIENCE.room.level);
      expect(plan[0].value).toBe(0);
      expect(plan[plan.length - 1].value).toBe(0);
    }
    const levels = farOff(audio).map((source) => audio.gainOf(source).gain.value);
    for (const level of levels) {
      expect(level).toBeLessThanOrEqual(AMBIENCE.level);
      expect(level).toBeGreaterThanOrEqual(AMBIENCE.level * (1 - AMBIENCE.wander.level) - 1e-12);
    }
    // They are not all one level: some are nearer than others.
    expect(Math.max(...levels) / Math.min(...levels)).toBeGreaterThan(1.8);
  });

  it('never holds more sources than it is allowed, and lines nothing up far ahead or in the past', async () => {
    seedDice(7);
    const audio = await switchOn();
    setAmbience(true);
    let seen = 0;
    for (let turn = 0; turn < 1200; turn++) {
      wait(audio, AMBIENCE.every, AMBIENCE.every);
      const live = audio.sources.filter((source) => source.ends > audio.currentTime);
      expect(live.length).toBeLessThanOrEqual(AMBIENCE.voices);
      for (const source of audio.sources.slice(seen)) {
        expect(source.begins).toBeGreaterThanOrEqual(audio.currentTime - AMBIENCE.every - 1e-9);
        expect(source.begins).toBeLessThanOrEqual(audio.currentTime + AMBIENCE.ahead + AMBIENCE.room.cross + 1e-9);
      }
      seen = audio.sources.length;
    }
    // Five minutes of it is a few hundred sources, not thousands.
    expect(audio.sources.length).toBeGreaterThan(150);
    expect(audio.sources.length).toBeLessThan(700);
  });

  it('keeps to its count when everything from far off comes as thick as it can, with places kept for its tone', async () => {
    // Every roll of the dice at its least: the shortest wait there can be before the next of each kind, and each
    // played at its slowest, so at its longest. More is asked for than the room may hold.
    fix(0);
    const audio = await switchOn();
    setAmbience(true);
    let most = 0;
    let mostFarOff = 0;
    for (let turn = 0; turn < 240; turn++) {
      wait(audio, AMBIENCE.every, AMBIENCE.every);
      const live = audio.sources.filter((source) => source.ends > audio.currentTime);
      most = Math.max(most, live.length);
      mostFarOff = Math.max(mostFarOff, live.filter((source) => !source.loop).length);
      expect(live.length).toBeLessThanOrEqual(AMBIENCE.voices);
      // The tone is never crowded out: a stretch of it is always there, and two while one fades into the next.
      expect(live.filter((source) => source.loop).length).toBeGreaterThanOrEqual(1);
      expect(live.filter((source) => source.loop).length).toBeLessThanOrEqual(AMBIENCE.kept);
    }
    // It was pressed against its limit, and the limit is what held it.
    expect(mostFarOff).toBe(AMBIENCE.voices - AMBIENCE.kept);
    expect(most).toBe(AMBIENCE.voices);
  });

  it('keeps its tone going without a gap and without coming round: each stretch from somewhere else, at its own speed', async () => {
    seedDice(3);
    const audio = await switchOn();
    setAmbience(true);
    wait(audio, 90);
    const stretches = tone(audio);
    expect(stretches.length).toBeGreaterThan(15);
    const { room } = AMBIENCE;
    stretches.forEach((source, index) => {
      expect(source.ends - source.begins).toBeCloseTo(room.seconds, 9);
      // One stretch is shorter than the buffer it is taken from, however slowly it is played, so no stretch repeats itself.
      expect(room.seconds * (1 + room.wander / 2)).toBeLessThan(source.buffer?.duration ?? 0);
      expect(source.from).toBeGreaterThanOrEqual(0);
      expect(source.from).toBeLessThan(source.buffer?.duration ?? 0);
      expect(source.playbackRate.value).toBeGreaterThanOrEqual(1 - room.wander / 2);
      expect(source.playbackRate.value).toBeLessThanOrEqual(1 + room.wander / 2);
      // Each begins as the one before it begins to fade.
      if (index > 0) expect(source.begins).toBeCloseTo(stretches[index - 1].ends - room.cross, 9);
    });
    expect(new Set(stretches.map((source) => source.from.toFixed(3))).size).toBe(stretches.length);
    expect(new Set(stretches.map((source) => source.playbackRate.value.toFixed(4))).size).toBe(stretches.length);
    expect(stretches[0].buffer?.sampleRate).toBe(LOW_RATE);
  });

  it('does not nag: what comes from far off comes at no beat, and never twice the same', async () => {
    seedDice(11);
    const audio = await switchOn();
    setAmbience(true);
    wait(audio, 600, AMBIENCE.every);
    const kinds = new Map<number, FakeSource[]>();
    for (const source of farOff(audio)) {
      // A kind is told by how long its buffer is: no two kinds' takes are one length.
      const kind = [...kinds.keys()].find((length) => Math.abs(length - (source.buffer?.length ?? 0)) < 1) ?? source.buffer?.length ?? 0;
      kinds.set(kind, [...(kinds.get(kind) ?? []), source]);
    }
    const everyGap: number[] = [];
    const starts = farOff(audio).map((source) => source.begins).sort((a, b) => a - b);
    for (let i = 1; i < starts.length; i++) everyGap.push(starts[i] - starts[i - 1]);
    // About one a second on average, taking every kind together, and the gaps between them all over the place:
    // as far from their own mean as the mean is from nothing, which is what things with no beat do.
    const average = mean(everyGap);
    expect(average).toBeGreaterThan(0.5);
    expect(average).toBeLessThan(1.6);
    const spread = Math.sqrt(mean(everyGap.map((gap) => (gap - average) ** 2)));
    expect(spread / average).toBeGreaterThan(0.6);
    // No two in the ten minutes are the same thing: the same take at the same speed and the same level.
    const told = farOff(audio).map((source) => `${source.buffer?.length}:${source.playbackRate.value.toFixed(5)}:${audio.gainOf(source).gain.value.toFixed(6)}`);
    expect(new Set(told).size).toBe(told.length);
    // And a tune from another machine is a rare thing: fewer than one in eight of them, and each of the six takes
    // there are of it comes round less than once a minute.
    const tunes = farOff(audio).filter((source) => (source.buffer?.length ?? 0) === Math.round(2.6 * LOW_RATE));
    expect(tunes.length).toBeGreaterThan(20);
    expect(tunes.length / told.length).toBeLessThan(1 / 8);
    expect(new Set(tunes.map((source) => source.buffer)).size).toBe(VARIANTS.farTune);
    expect(tunes.length / (VARIANTS.farTune ?? 1)).toBeLessThan(600 / 60);
    for (const source of farOff(audio)) {
      expect(source.playbackRate.value).toBeGreaterThanOrEqual(1 - AMBIENCE.wander.speed / 2);
      expect(source.playbackRate.value).toBeLessThanOrEqual(1 + AMBIENCE.wander.speed / 2);
    }
  });

  it('works its buffers out only when it is asked for, one in a turn, at the low rate', async () => {
    seedDice();
    const audio = await switchOn();
    expect(audio.buffers).toHaveLength(0);
    setAmbience(true);
    expect(audio.buffers).toHaveLength(1);
    for (let turn = 0; turn < 12; turn++) {
      const before = audio.buffers.length;
      wait(audio, AMBIENCE.every, AMBIENCE.every);
      expect(audio.buffers.length - before).toBeLessThanOrEqual(1);
    }
    wait(audio, 300);
    // The tone, three clinks, two rattles, a payout and six tunes.
    expect(audio.buffers).toHaveLength(13);
    for (const buffer of audio.buffers) {
      expect(buffer.sampleRate).toBe(LOW_RATE);
      expect(peakOf(buffer.data)).toBeCloseTo(1, 5);
    }
  });

  it('stops with the page hidden and with the audio stopped, and comes back with them', async () => {
    seedDice();
    const listeners = new Set<() => void>();
    const page = {
      hidden: false,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    };
    vi.stubGlobal('document', page);
    const audio = await switchOn();
    setAmbience(true);
    expect(listeners.size).toBe(1);
    wait(audio, 5);

    page.hidden = true;
    listeners.forEach((listener) => listener());
    expect(audio.sounding(FADE)).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    let made = audio.sources.length;
    wait(audio, 10);
    expect(audio.sources).toHaveLength(made);

    page.hidden = false;
    listeners.forEach((listener) => listener());
    wait(audio, 2);
    expect(audio.sources.length).toBeGreaterThan(made);

    audio.become('suspended');
    expect(vi.getTimerCount()).toBe(0);
    made = audio.sources.length;
    audio.become('running');
    wait(audio, 2);
    expect(audio.sources.length).toBeGreaterThan(made);

    // The page is watched once, whether it is the loop, the room or both that want it watched, and not at all for neither.
    setMusic(true);
    expect(listeners.size).toBe(1);
    setAmbience(false);
    expect(listeners.size).toBe(1);
    setMusic(false);
    expect(listeners.size).toBe(0);
    setAmbience(true);
    setAmbience(true);
    expect(listeners.size).toBe(1);
    setAmbience(false);
    expect(listeners.size).toBe(0);
  });

  it('does not start on a page that is hidden', async () => {
    vi.stubGlobal('document', { hidden: true, addEventListener: () => undefined, removeEventListener: () => undefined });
    const audio = await switchOn();
    setAmbience(true);
    wait(audio, 5);
    expect(audio.sources).toHaveLength(0);
  });

  it('is cut at once when it is switched off, and is not the cabinet\'s to hush: a reset leaves it playing', async () => {
    seedDice();
    const audio = await switchOn();
    setAmbience(true);
    wait(audio, 10);
    playSound('jackpot', true);
    turnMotor(true, 1);
    const room = ofTheRoom(audio).filter((source) => source.ends > audio.currentTime + FADE);
    expect(room.length).toBeGreaterThan(0);
    hush();
    // The cabinet's own sounds are gone, its bed with them.
    expect(audio.into(audio.master).every((source) => source.ends <= audio.currentTime + FADE)).toBe(true);
    for (const source of room) expect(source.ends).toBeGreaterThan(audio.currentTime + FADE);
    wait(audio, 5);
    expect(ofTheRoom(audio).filter((source) => source.ends > audio.currentTime).length).toBeGreaterThan(0);
    // Switched off, it is gone within a fade, and nothing more of it is lined up.
    setAmbience(false);
    expect(audio.sounding(FADE)).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    const made = audio.sources.length;
    wait(audio, 20);
    expect(audio.sources).toHaveLength(made);
    // And it is forgotten with everything else.
    setAmbience(true);
    resetAudio();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never throws into the game when it cannot be played', async () => {
    const audio = await switchOn();
    FakeContext.broken = true;
    expect(() => setAmbience(true)).not.toThrow();
    expect(() => wait(audio, 3)).not.toThrow();
    expect(audio.sources).toHaveLength(0);
  });
});

// ── An entry: a medal down a tongue into a START pocket, and what the cabinet says about it ──

describe('an entry', () => {
  const of = (sample: Sample, variant = 0): number => brightness(rendered(sample, variant), RATE);
  const peakAt = (samples: Float32Array): number => {
    let best = 0;
    for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]) > Math.abs(samples[best])) best = i;
    return best / RATE;
  };
  /** What comes out of the chain for a steady level going in with the volume at `volume`, by the compressor's own rule. */
  const through = (level: number, volume: number = VOLUME.usual): number => {
    const makeUp = -0.6 * COMPRESSOR.threshold * (1 - 1 / COMPRESSOR.ratio);
    const into = 20 * Math.log10(level * masterGain(volume));
    const out = into <= COMPRESSOR.threshold ? into : COMPRESSOR.threshold + (into - COMPRESSOR.threshold) / COMPRESSOR.ratio;
    return 10 ** ((out + makeUp) / 20);
  };

  it('rides a medal down its tongue for as long as it is told, faster all the way, and drops it into its pocket on the moment', async () => {
    fix(0);
    const audio = await switchOn();
    for (const [at, seconds] of [
      [5, 0.7],
      [15, 0.9],
    ]) {
      audio.currentTime = at;
      const made = audio.sources.length;
      playSound('ride', true, { seconds });
      const [slide, drop] = audio.sources.slice(made);
      expect(audio.sources.length - made).toBe(2);
      expect(slide.loop).toBe(true);
      expect(slide.begins).toBe(at);
      expect(slide.ends).toBeCloseTo(at + seconds, 9);
      // It speeds up all the way down, to nearly twice what it set off at, and is never louder than a slide should be.
      const speeds = slide.playbackRate.plan;
      expect(speeds[speeds.length - 1].value).toBeGreaterThan(speeds[0].value * 1.7);
      for (const step of audio.gainOf(slide).gain.plan) expect(step.value).toBeLessThanOrEqual(SOUND_LEVELS.ride);
      // The drop is a take of its own, and its clack is the first thing in it: it falls where the slide ends.
      expect(firstDifference(drop.buffer?.data ?? new Float32Array(0), rendered('rideDrop', 0))).toBe(-1);
      expect(drop.loop).toBe(false);
      expect(drop.begins + peakAt(rendered('rideDrop', 0)) / drop.playbackRate.value).toBeGreaterThan(at + seconds - 0.002);
      expect(drop.begins + peakAt(rendered('rideDrop', 0)) / drop.playbackRate.value).toBeLessThan(at + seconds + 0.004);
      expect(audio.gainOf(drop).gain.value).toBe(ENTRY.drop.level);
    }
    // When nobody says, it is 0.8 s. And no two medals are one medal: with other dice the slide is at another speed and the drop is the other take, a shade quieter.
    audio.currentTime = 30;
    playSound('ride', true);
    const usual = audio.sources[audio.sources.length - 2];
    expect(usual.ends - usual.begins).toBeCloseTo(0.8, 9);
    fix(0.999);
    audio.currentTime = 40;
    playSound('ride', true);
    const [other, otherDrop] = audio.sources.slice(-2);
    expect(other.playbackRate.plan[0].value).toBeGreaterThan(usual.playbackRate.plan[0].value);
    expect(firstDifference(otherDrop.buffer?.data ?? new Float32Array(0), rendered('rideDrop', 1))).toBe(-1);
    expect(audio.gainOf(otherDrop).gain.value).toBeLessThan(ENTRY.drop.level);
    expect(audio.gainOf(otherDrop).gain.value).toBeGreaterThan(ENTRY.drop.level * (1 - WANDER.level) - 1e-9);
  });

  it('holds a stream of entries to a few rides, like any clink, and still plays the slot that main plays today', async () => {
    const audio = await switchOn();
    for (let i = 0; i < 200; i++) playSound('ride', true, { seconds: 0.8 });
    expect(audio.sources).toHaveLength(2);
    // Three tongues fed as fast as they can be for two seconds: never more rides in the air than leave the jingles their voices.
    for (let frame = 0; frame < 120; frame++) {
      audio.currentTime += 1 / 60;
      playSound('ride', true, { seconds: 0.9 });
      expect(audio.sounding().length).toBeLessThanOrEqual(LIMITS.voices - LIMITS.kept);
    }
    // Until the cabinet is wired to the ride, a medal through a START pocket is still heard as it was.
    audio.currentTime += 5;
    const made = audio.sources.length;
    playSound('slit', true);
    expect(audio.sources.length - made).toBe(1);
    expect(audio.gainOf(audio.sources[made]).gain.value).toBeLessThanOrEqual(SOUND_LEVELS.slit);
  });

  it('answers an entry with two notes, and a gold one with three and a shimmer', async () => {
    const audio = await switchOn();
    playSound('start', true);
    audio.currentTime = 2;
    playSound('start', true, { gold: true });
    audio.currentTime = 4;
    playSound('start', true, { gold: false });
    const [plain, gold, again] = audio.sources;
    expect(firstDifference(plain.buffer?.data ?? new Float32Array(0), rendered('start'))).toBe(-1);
    expect(firstDifference(gold.buffer?.data ?? new Float32Array(0), rendered('startGold'))).toBe(-1);
    expect(again.buffer).toBe(plain.buffer);
    expect(audio.gainOf(plain).gain.value).toBe(SOUND_LEVELS.start);
    expect(audio.gainOf(gold).gain.value).toBe(ENTRY.gold.level);
    // The same every time: it is the cabinet speaking, not a medal.
    for (const source of [plain, gold]) expect(source.playbackRate.value).toBe(1);
    /** Everything a score plays: each part's voice and level, and its notes as their pitch and how many steps they are held. */
    const playedBy = (music: Score, step: number) => music.parts.map((part) => [part.voice, part.level, part.notes.map((note) => [note.hz, Math.round(note.length / step)])]);
    const notes = (...written: [name: string, steps: number][]) => written.map(([name, steps]) => [pitch(name), steps]);
    // The plain one is all of this and nothing more: the call, up a fourth on to the key note, and the same two notes
    // an octave down at a third of its level, which is its body on a small speaker and not another voice.
    expect(playedBy(SCORES.start, 0.07)).toEqual([
      ['bell', 1, notes(['G6', 1], ['C7', 4])],
      ['second', 0.3, notes(['G5', 1], ['C6', 3])],
    ]);
    const [call, octave] = SCORES.start.parts;
    octave.notes.forEach((note, index) => expect(note.hz * 2).toBeCloseTo(call.notes[index].hz, 9));
    expect(octave.notes).toHaveLength(call.notes.length);
    expect(octave.notes.map((note) => note.at)).toEqual(call.notes.map((note) => note.at));
    // The gold one is all of this: the call with a third note on top; a voice in harmony under each note of it where
    // the plain one has its octave; the key note held under both; and the bells.
    expect(playedBy(GOLD_START, 0.07)).toEqual([
      ['bell', 1, notes(['G6', 1], ['C7', 1], ['E7', 5])],
      ['second', 0.35, notes(['E6', 1], ['G6', 1], ['C7', 4])],
      ['bass', 0.3, notes(['C5', 6])],
    ]);
    // So what a gold entry has that a plain one has not is pinned: a note more in the call, a part more, a second
    // voice that is harmony and not an octave, and bells that the plain one has none of.
    const [goldCall, harmony] = GOLD_START.parts;
    expect(goldCall.notes.slice(0, 2).map((note) => note.hz)).toEqual(call.notes.map((note) => note.hz));
    expect(goldCall.notes).toHaveLength(call.notes.length + 1);
    expect(GOLD_START.parts).toHaveLength(SCORES.start.parts.length + 1);
    harmony.notes.forEach((note, index) => {
      const under = goldCall.notes[index].hz / note.hz;
      expect(under).toBeGreaterThan(1.18);
      expect(under).toBeLessThan(1.34);
    });
    expect(GOLD_SHIMMER.hz).toHaveLength(10);
    for (const hz of GOLD_SHIMMER.hz) {
      expect(hz).toBeGreaterThan(pitch('E7') * 1.5);
      expect(hz).toBeLessThan(7000);
    }
    expect(GOLD_SHIMMER.fade).toBeLessThan(1);
    expect(GOLD_SHIMMER.from + GOLD_SHIMMER.every * GOLD_SHIMMER.hz.length).toBeLessThan(GOLD_START.length + GOLD_START.tail);
    expect(rendered('start').length / RATE).toBeLessThan(0.8);
    // The gold one is longer and fuller: a third note above the two, and above that its shimmer, small bells from 4 kHz up.
    expect(rendered('startGold').length).toBeGreaterThan(rendered('start').length * 1.3);
    expect(rendered('startGold').length / RATE).toBeLessThan(1.1);
    expect(shareBetween('startGold', 0, 2500, 8000)).toBeGreaterThan(shareBetween('start', 0, 2500, 8000) * 5);
    expect(shareBetween('startGold', 0, 4000, 8000)).toBeGreaterThan(shareBetween('start', 0, 4000, 8000) * 2);
    expect(shareBetween('startGold', 0, 4000, 8000)).toBeGreaterThan(0.04);
    expect(of('startGold')).toBeGreaterThan(of('start'));
    expect(ENTRY.gold.level).toBeGreaterThan(SOUND_LEVELS.start);
    expect(ENTRY.gold.level).toBeLessThanOrEqual(LEVEL.ceiling);
    // Both are brighter than the chime they take over from, and both come out of the cabinet's speaker.
    expect(of('start')).toBeGreaterThan(of('gate'));
    for (const sample of ['start', 'startGold'] as const) expect(shareBelow(rendered(sample), 110, RATE), sample).toBeLessThan(0.06);
  });

  it('runs a spark up to its lamp in as long as it is told, a few ticks each higher than the last and the lamp\'s tink at the end', async () => {
    const audio = await switchOn();
    const played = (options: SoundOptions): FakeSource => {
      audio.currentTime += 5;
      playSound('spark', true, options);
      return audio.sources[audio.sources.length - 1];
    };
    expect(ENTRY.spark.seconds).toBe(0.35);
    expect(played({}).playbackRate.value).toBe(1);
    expect(ENTRY.spark.seconds / played({ seconds: 0.5 }).playbackRate.value).toBeCloseTo(0.5, 9);
    expect(ENTRY.spark.seconds / played({ seconds: 0.25 }).playbackRate.value).toBeCloseTo(0.25, 9);
    expect(played({ seconds: 0.01 }).playbackRate.value).toBe(1.6);
    expect(played({ seconds: 9 }).playbackRate.value).toBe(0.6);
    expect(played({ seconds: Number.NaN }).playbackRate.value).toBe(1);
    expect(audio.gainOf(audio.sources[0]).gain.value).toBe(SOUND_LEVELS.spark);
    const samples = rendered('spark');
    // The tink is the loudest thing in it, and it is where the light arrives.
    expect(peakAt(samples)).toBeGreaterThan(ENTRY.spark.seconds - 0.002);
    expect(peakAt(samples)).toBeLessThan(ENTRY.spark.seconds + 0.01);
    // Before it, ticks: at least four that can be told apart, each higher than the one before.
    const ticks = strikeTimes(samples, 2).filter((time) => time < ENTRY.spark.seconds - 0.02);
    expect(ticks.length).toBeGreaterThanOrEqual(4);
    const pitches = ticks.map((time) => brightness(samples.subarray(Math.round(time * RATE), Math.round((time + 0.02) * RATE)), RATE));
    pitches.forEach((value, index) => {
      if (index > 0) expect(value).toBeGreaterThan(pitches[index - 1]);
    });
    expect(samples.length / RATE).toBeLessThan(0.7);
  });

  it('rocks a medal on a rail, quicker each time, and tips it over the side with a duller clack than a pocket\'s, never louder than an entry', () => {
    expect(SOUND_LEVELS.teeter).toBeLessThan(ENTRY.drop.level);
    expect(SOUND_LEVELS.teeter).toBeLessThan(SOUND_LEVELS.start);
    for (const variant of takesOf('teeter')) {
      const samples = rendered('teeter', variant);
      const times = strikeTimes(samples, 2);
      expect(times.length).toBeGreaterThanOrEqual(4);
      // The rocking quickens: each gap is shorter than the one before it.
      expect(times[2] - times[1]).toBeLessThan(times[1] - times[0]);
      expect(times[3] - times[2]).toBeLessThan(times[2] - times[1]);
      // The last of it, over the side, is the loudest, and duller than the rocking and than a medal into a pocket.
      const over = peakAt(samples);
      expect(over).toBeGreaterThan(times[2]);
      const rocking = brightness(samples.subarray(0, Math.round((over - 0.01) * RATE)), RATE);
      const gone = brightness(samples.subarray(Math.round(over * RATE)), RATE);
      expect(gone).toBeLessThan(rocking * 0.8);
      expect(gone).toBeLessThan(Math.min(...takesOf('rideDrop').map((take) => of('rideDrop', take))));
      expect(samples.length / RATE).toBeLessThanOrEqual(0.5);
    }
    expect(firstDifference(rendered('teeter', 0), rendered('teeter', 1))).not.toBe(-1);
  });

  it('steps the lucky lamp with a relay\'s click, too quiet and too short to be noticed seventeen times a minute', async () => {
    const samples = rendered('lampStep');
    expect(samples.length / RATE).toBeLessThan(0.08);
    expect(mostlyOverBy(samples)).toBeLessThan(0.02);
    expect(peakAt(samples)).toBeLessThan(0.01);
    // Nothing on the cabinet that is a thing struck is as quiet: a fifth of a medal landing, and under the bed's own clunk.
    expect(SOUND_LEVELS.lampStep).toBeLessThanOrEqual(0.02);
    expect(SOUND_LEVELS.lampStep).toBeLessThanOrEqual(SOUND_LEVELS.land / 5);
    expect(SOUND_LEVELS.lampStep).toBeLessThan(MOTOR.level);
    // Every stroke of the pusher, it is heard: it is not held back as a stream of clinks is.
    const audio = await switchOn();
    for (let stroke = 0; stroke < 17; stroke++) {
      playSound('lampStep', true);
      audio.currentTime += PUSHER.period;
    }
    expect(audio.sources).toHaveLength(17);
    for (const source of audio.sources) expect(audio.gainOf(source).gain.value).toBe(SOUND_LEVELS.lampStep);
  });

  it('says a dull, short no to a medal the hold has no place for: a knock on wood and a softer one after it, not a buzzer', () => {
    const samples = rendered('full');
    expect(samples.length / RATE).toBeLessThanOrEqual(0.2);
    expect(of('full')).toBeLessThan(900);
    expect(of('full')).toBeLessThan(of('lampStep'));
    // Two knocks, the first the loudest thing in it and the second softer.
    expect(peakAt(samples)).toBeLessThan(0.01);
    const times = strikeTimes(samples, 2);
    expect(times.length).toBeGreaterThanOrEqual(2);
    const second = Math.round(times[1] * RATE);
    expect(peakOf(samples.subarray(second))).toBeLessThan(0.7);
    // It does not go on, as a buzzer does: nine tenths of it is over in a tenth of a second, where the cross's buzz is still going at three.
    expect(mostlyOverBy(samples)).toBeLessThan(0.11);
    expect(mostlyOverBy(rendered('cross'))).toBeGreaterThan(0.2);
    // And it is quiet: the cabinet shrugs, it does not scold.
    expect(SOUND_LEVELS.full).toBeLessThan(SOUND_LEVELS.teeter);
  });

  it('stays under the limiter with an entry, a spark and a pour all at their loudest in one instant', () => {
    // The loudest instant of an entry: the medal's clack in its pocket and the cabinet's gold answer. The slide has ended by then.
    const entry = ENTRY.drop.level + ENTRY.gold.level;
    expect(SOUND_LEVELS.ride).toBeLessThan(ENTRY.drop.level);
    // With a spark and a pour, over the machine's bed and the loop, which is turned down under a pour.
    const loop = MUSIC.parts.reduce((sum, part) => sum + part.level, 0) * MUSIC.ducked;
    const together = entry + SOUND_LEVELS.spark + SOUND_LEVELS.pour + MOTOR.level + loop;
    expect(together).toBeGreaterThan(0.29);
    expect(together).toBeLessThan(0.32);
    // 0.39 is where the compressor begins to work as the cabinet was made: this goes through untouched, at 0.31.
    expect(through(together)).toBeCloseTo(together, 10);
    // With the volume right up it is twice that going in, and comes out at 0.41.
    expect(through(together, VOLUME.most)).toBeGreaterThan(0.39);
    expect(through(together, VOLUME.most)).toBeLessThan(0.41);
    // And with the room on as well, its tone and two far-off sounds at their loudest landing on the same instant: 0.39 and 0.42.
    const withTheRoom = together + AMBIENCE.room.level + 2 * AMBIENCE.level;
    expect(through(withTheRoom)).toBeLessThan(0.4);
    expect(through(withTheRoom, VOLUME.most)).toBeLessThan(0.42);
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
  const power = powerOf(rendered(sample, variant));
  spectra.set(key, power);
  return power;
}

/** The same for any stretch of samples: `rate / (2 · (length − 1))` hertz apart at the rate they were worked out at. */
function powerOf(samples: Float32Array): Float64Array {
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
    // A medal on the table, five sizes of rattle and the loop's two notes are kept besides the sounds that have names;
    // and a button coming up, a lift stopping and the machine's own bed; a door, a shutter and a guard going back up;
    // the four moments of a ball on a wheel and in a bowl, and the wheel's rotor; and the five things the room is made of.
    // And a medal dropping off a tongue into its pocket, and the cabinet's answer to a gold entry.
    expect(SAMPLES).toHaveLength(SOUNDS.length + 1 + (POURS.length - 1) + MUSIC.parts.length + 3 + 3 + 5 + 2 + 5);
    for (const extra of ['rideDrop', 'startGold'] as const) expect(SAMPLES).toContain(extra);
    for (const extra of ['buttonUp', 'liftStop', 'motor', 'doorShut', 'shutterOpen', 'guardUp', 'shot', 'lip', 'settle', 'bowlLand', 'rotor'] as const) expect(SAMPLES).toContain(extra);
    for (const extra of ['room', 'farClink', 'farRattle', 'farPour', 'farTune'] as const) expect(SAMPLES).toContain(extra);
    expect(SAMPLES.slice(0, 4)).toEqual(['land', 'plate', 'insert', 'win']);
    // What is worked out in the background is all of it but the room, and the tray's medal, which is the `win` over again.
    expect(WARMED).toHaveLength(SAMPLES.length - 5 - 1);
    for (const sample of WARMED) expect(sample.startsWith('far') || sample === 'room' || sample === 'tray', sample).toBe(false);
    for (const variant of takesOf('tray')) expect(firstDifference(rendered('tray', variant), rendered('win', variant))).toBe(-1);
    for (const name of Object.keys(SCORES)) expect(SOUNDS).toContain(name);
    // The names the cabinet has always used are still there.
    const old = ['land', 'win', 'lost', 'gate', 'full', 'spin', 'reelStop', 'tick', 'hop', 'reach', 'small', 'big', 'seven', 'dice', 'chest', 'open'];
    for (const name of [...old, 'prize', 'ball', 'roulette', 'pocket', 'tower', 'cross', 'crash', 'fever', 'jackpot']) expect(SOUNDS).toContain(name);
    // And the mechanisms have names of their own.
    for (const name of ['button', 'tray', 'hopper', 'shutter', 'lift', 'bowl', 'drop', 'door', 'pour', 'guard', 'slit']) expect(SOUNDS).toContain(name);
    // And an entry has its own: the ride, the cabinet's answer, the spark, the near miss, the lucky lamp, and the dull no that was there already.
    for (const name of ['ride', 'start', 'spark', 'teeter', 'lampStep', 'full']) expect(SOUNDS).toContain(name);
  });

  it.each(takes)('%s (take %i) is finite, peaks at exactly 1, begins and ends in silence or joins up with itself, and is the same every time', (sample, variant) => {
    const samples = renderSound(sample, RATE, variant);
    expect(firstDifference(samples, rendered(sample, variant))).toBe(-1);
    expect(samples.length).toBeGreaterThan(RATE * 0.03);
    expect(samples.length).toBeLessThan(RATE * 7.5);
    let sum = 0;
    for (const value of samples) sum += value;
    expect(Number.isFinite(sum)).toBe(true);
    expect(peakOf(samples)).toBeCloseTo(1, 6);
    if (LOOPING.includes(sample)) {
      // What goes round and round has no silence to begin and end in. Its last sample runs into its first with no
      // more of a step than it takes anywhere else, which is what there is to hear of a join.
      let steepest = 0;
      for (let i = 1; i < samples.length; i++) steepest = Math.max(steepest, Math.abs(samples[i] - samples[i - 1]));
      expect(Math.abs(samples[0] - samples[samples.length - 1])).toBeLessThanOrEqual(steepest);
      expect(Math.abs(samples[0] - samples[samples.length - 1])).toBeLessThan(0.2);
    } else {
      expect(Math.abs(samples[0])).toBe(0);
      expect(Math.abs(samples[samples.length - 1])).toBeLessThan(1e-3);
    }
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
      // What goes round is as long as one round of it, and what comes from far off rings on in the room.
      const most = LOOPING.includes(sample) ? 7.5 : sample.startsWith('far') ? 3 : 1.5;
      expect(rendered(sample, variant).length / RATE, sample).toBeLessThan(most);
    }
    // The machine's bed is one stroke of the pusher to the sample, so that it can be played in step with it.
    expect(rendered('motor')).toHaveLength(Math.round(PUSHER.period * RATE));
    expect(rendered('motor', 0, LOW_RATE)).toHaveLength(Math.round(PUSHER.period * LOW_RATE));
  });

  it('lasts about as long as the notes say, and the jackpot longer than anything', () => {
    for (const [name, score] of scores) {
      expect(rendered(name as PusherSound).length / RATE).toBeCloseTo(score.length + score.tail, 3);
    }
    const jackpot = rendered('jackpot').length;
    for (const [sample, variant] of takes) if (sample !== 'jackpot' && sample !== 'room') expect(rendered(sample, variant).length, sample).toBeLessThan(jackpot);
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

// ── The machine, its mechanisms and the room, measured ──────────────────────

describe('the bed of the machine', () => {
  const bed = (): Float32Array => rendered('motor', 0, LOW_RATE);
  const at = (seconds: number): number => Math.round(seconds * LOW_RATE);
  const level = (from: number, to: number): number => Math.sqrt(energy(bed(), at(from), at(to)) / (at(to) - at(from)));
  const peak = (from: number, to: number): number => peakOf(bed().subarray(at(from), at(to)));
  const half = PUSHER.period / 2;

  it('is laid out as the stroke is: back at its start, forward half way through', () => {
    expect(pusherFront(0)).toBe(PUSHER.min);
    expect(pusherFront(half)).toBeCloseTo(PUSHER.max, 9);
    expect(pusherFront(PUSHER.period)).toBeCloseTo(PUSHER.min, 9);
    expect(bed()).toHaveLength(at(PUSHER.period));
  });

  it('clunks at each end of the stroke, the back the loudest thing in it', () => {
    expect(peak(0, 0.03)).toBeCloseTo(1, 6);
    expect(peak(half, half + 0.03)).toBeGreaterThan(0.6);
    // Each stands well clear of what is round it.
    expect(peak(half, half + 0.03)).toBeGreaterThan(peak(half - 0.3, half - 0.02) * 1.8);
    expect(peak(0, 0.03)).toBeGreaterThan(peak(PUSHER.period - 0.3, PUSHER.period - 0.02) * 2.5);
    // Between them nothing comes near the back clunk: the hum and the scrape peak at about two thirds of it.
    expect(peak(0.15, half - 0.02)).toBeLessThan(0.75);
    expect(peak(half + 0.15, PUSHER.period - 0.02)).toBeLessThan(0.6);
  });

  it('strains as the pusher shoves and runs easy as it comes back', () => {
    const shoving = level(0.5, 1.3);
    const coming = level(2.3, 3.1);
    expect(shoving).toBeGreaterThan(coming * 1.3);
    expect(shoving).toBeLessThan(coming * 2.5);
    // It is a bed: on average a sixth of its clunk at the most.
    expect(shoving).toBeLessThan(0.2);
    // The whine of the gears is a shade flat under load and a shade sharp without it: about two and a half percent either way.
    const whine = (from: number, to: number): number => {
      const power = powerOf(bed().subarray(at(from), at(to)));
      const apart = LOW_RATE / (2 * (power.length - 1));
      let best = Math.round(270 / apart);
      for (let bin = best; bin * apart < 330; bin++) if (power[bin] > power[best]) best = bin;
      return best * apart;
    };
    expect(whine(0.5, 1.3)).toBeGreaterThan(289);
    expect(whine(0.5, 1.3)).toBeLessThan(297);
    expect(whine(2.3, 3.1)).toBeGreaterThan(303);
    expect(whine(2.3, 3.1)).toBeLessThan(311);
  });

  it('scrapes its medals where the pusher moves fastest, and not at all where it turns', () => {
    /** How much there is above 3 kHz in a stretch, for each second of it: that is the medals, not the motor. */
    const scrape = (from: number, to: number): number => {
      const power = powerOf(bed().subarray(at(from), at(to)));
      const apart = LOW_RATE / (2 * (power.length - 1));
      let sum = 0;
      for (let bin = Math.round(3000 / apart); bin < power.length; bin++) sum += power[bin];
      return sum / (power.length - 1) / (to - from);
    };
    const moving = scrape(0.6, 1.2);
    expect(moving).toBeGreaterThan(scrape(3.42, 3.58) * 8);
    expect(moving).toBeGreaterThan(scrape(1.62, 1.78) * 8);
    // It is faint: a small part of what the bed is made of.
    const all = powerOf(bed().subarray(at(0.6), at(1.2))).reduce((sum, value) => sum + value, 0);
    const power = powerOf(bed().subarray(at(0.6), at(1.2)));
    const apart = LOW_RATE / (2 * (power.length - 1));
    let above = 0;
    for (let bin = Math.round(3000 / apart); bin < power.length; bin++) above += power[bin];
    expect(above / all).toBeGreaterThan(0.01);
    expect(above / all).toBeLessThan(0.25);
  });

  it('is low: a motor and its gears, with nearly all of it under a kilohertz or two', () => {
    expect(brightness(bed(), LOW_RATE)).toBeLessThan(2500);
    expect(shareBelow(bed(), 1500, LOW_RATE)).toBeGreaterThan(0.6);
  });
});

describe('the mechanisms', () => {
  const of = (sample: Sample, variant = 0): number => brightness(rendered(sample, variant), RATE);
  const peakAt = (samples: Float32Array): number => {
    let best = 0;
    for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]) > Math.abs(samples[best])) best = i;
    return best / RATE;
  };

  it('are knocks and clicks, not notes: each strikes at once and is over in a moment', () => {
    for (const sample of ['button', 'buttonUp', 'shutter', 'liftStop'] as const) {
      for (const variant of takesOf(sample)) {
        const samples = rendered(sample, variant);
        expect(peakAt(samples), sample).toBeLessThan(0.025);
        expect(mostlyOverBy(samples), sample).toBeLessThan(0.12);
        expect(samples.length / RATE, sample).toBeLessThan(0.35);
      }
    }
  });

  it('give a big button a hollow knock going down and a click coming up', () => {
    for (const variant of takesOf('button')) {
      expect(of('button', variant)).toBeLessThan(2500);
      expect(shareBetween('button', variant, 60, 1000)).toBeGreaterThan(0.6);
      // The switch under it clicks over before the dome lands: two strikes, a fiftieth of a second apart or less.
      const times = strikeTimes(rendered('button', variant), 2);
      expect(times.length).toBeGreaterThanOrEqual(2);
      expect(times[1] - times[0]).toBeLessThan(0.025);
    }
    for (const variant of takesOf('buttonUp')) expect(of('buttonUp', variant)).toBeGreaterThan(Math.max(...takesOf('button').map((take) => of('button', take))) * 1.3);
    expect(firstDifference(rendered('button', 0), rendered('button', 1))).not.toBe(-1);
    expect(firstDifference(rendered('buttonUp', 0), rendered('buttonUp', 1))).not.toBe(-1);
  });

  it('are low where there is weight: a shutter slamming, a lift at its stop, a ball through its hole', () => {
    for (const sample of ['shutter', 'liftStop', 'drop'] as const) {
      for (const variant of takesOf(sample)) {
        expect(of(sample, variant), sample).toBeLessThan(2000);
        expect(shareBetween(sample, variant, 60, 1000), sample).toBeGreaterThan(0.7);
      }
    }
    // The shutter's flap chatters to rest after the slam.
    for (const variant of takesOf('shutter')) expect(strikes(rendered('shutter', variant))).toBeGreaterThanOrEqual(2);
  });

  it('knock the ball round the rim, through its hole, and twice more on its way down inside', () => {
    for (const variant of takesOf('drop')) {
      const samples = rendered('drop', variant);
      expect(peakAt(samples)).toBeGreaterThan(0.165);
      expect(peakAt(samples)).toBeLessThan(0.185);
      const times = strikeTimes(samples, 2);
      expect(times.filter((time) => time < 0.16).length).toBeGreaterThanOrEqual(2);
      expect(times.filter((time) => time > 0.25).length).toBeGreaterThanOrEqual(1);
      // It is deeper inside than it was on the rim.
      const rim = brightness(samples.subarray(0, Math.round(0.16 * RATE)), RATE);
      const inside = brightness(samples.subarray(Math.round(0.28 * RATE)), RATE);
      expect(inside).toBeLessThan(rim);
    }
  });

  it('whine like a geared motor on the lift, and rumble like a ball on the wheel and in the bowl', () => {
    // The whine and its octave carry the lift.
    expect(shareBetween('lift', 0, 400, 460)).toBeGreaterThan(0.25);
    expect(shareBetween('lift', 0, 820, 900)).toBeGreaterThan(0.04);
    // A ball rolling is noise with a note in it, steady from one tenth of a second to the next, and comes past as it goes round.
    for (const sample of ['roulette', 'bowl'] as const) {
      const samples = rendered(sample);
      const tenths = Array.from({ length: 10 }, (_, index) => energy(samples, (index * RATE) / 10, ((index + 1) * RATE) / 10));
      expect(Math.max(...tenths) / Math.min(...tenths), sample).toBeLessThan(4);
      expect(samples.length / RATE, sample).toBeCloseTo(1, 3);
    }
    // The bowl is plastic and the ball in it slow: lower than the ball on the wheel's track.
    expect(of('bowl')).toBeLessThan(of('roulette') * 0.8);
    expect(of('roulette')).toBeLessThan(4000);
  });

  it('throw a medal out of the hopper about every tenth of a second, each one a medal on steel, over the hum of the disc', () => {
    const samples = rendered('hopper');
    expect(samples.length / RATE).toBeCloseTo(HOPPER.loop, 3);
    // Every medal strikes and bounces; strikes that fall together count once.
    const count = strikes(samples);
    expect(count).toBeGreaterThanOrEqual(HOPPER.rate * HOPPER.loop * 0.8);
    expect(count).toBeLessThanOrEqual(HOPPER.rate * HOPPER.loop * 2.6);
    // They come at no beat: the gaps between them are not all one length.
    const times = strikeTimes(samples);
    const gaps = times.slice(1).map((time, index) => time - times[index]);
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeGreaterThan(2);
    // Bright as the tray is bright, with the medal's own ring in it and the motor under it.
    expect(of('hopper')).toBeGreaterThan(4000);
    expect(of('hopper')).toBeLessThan(9000);
    expect(shareBetween('hopper', 0, MEDAL.hz * 0.9, MEDAL.hz * 1.12)).toBeGreaterThan(0.08);
    expect(shareBetween('hopper', 0, 200, 800)).toBeGreaterThan(0.02);
    // And however it is laid over itself, a hopper's worth of medals is not a wall: its peaks stand well above its average.
    expect(Math.sqrt(energy(samples) / samples.length)).toBeLessThan(0.25);
  });

  it('are things and not tones where they used to be tones: a fret, a piece on a board, a chest lid', () => {
    // The roulette's lamp is the ball on a fret: a click with a ring to it, over in a few hundredths of a second.
    expect(of('tick')).toBeGreaterThan(1500);
    expect(of('tick')).toBeLessThan(4500);
    expect(mostlyOverBy(rendered('tick'))).toBeLessThan(0.03);
    // The piece on the board is plastic set down on wood, and it rocks once.
    expect(of('hop')).toBeLessThan(2000);
    expect(strikeTimes(rendered('hop'), 2).length).toBeGreaterThanOrEqual(2);
    // The chest ends with its lid on its stop, not with a swoop up: nearly all of it is over before the last third.
    const open = rendered('open');
    expect(energy(open, 0.72 * RATE) / energy(open)).toBeLessThan(0.1);
    expect(strikeTimes(open).some((time) => time > 0.57 && time < 0.6)).toBe(true);
  });

  it('play the jingles out of a speaker in a cabinet, which has no bottom octave', () => {
    for (const name of ['jackpot', 'fever', 'prize', 'gate', 'reach', 'cross', 'pocket', 'arp'] as const) {
      expect(shareBelow(rendered(name), 110, RATE), name).toBeLessThan(0.06);
      expect(peakOf(rendered(name)), name).toBeCloseTo(1, 6);
    }
  });
});

describe('what the builders asked for', () => {
  const of = (sample: Sample, variant = 0): number => brightness(rendered(sample, variant), RATE);
  const peakAt = (samples: Float32Array): number => {
    let best = 0;
    for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]) > Math.abs(samples[best])) best = i;
    return best / RATE;
  };

  it('drops a hopper\'s door open on its stays with a clank and a shiver, and shuts it with a knock and a latch', () => {
    const open = rendered('door');
    // The latch lets go first; the clank is the flap caught on its stays, and it bounces on them, quicker each time.
    expect(peakAt(open)).toBeGreaterThan(0.08);
    expect(peakAt(open)).toBeLessThan(0.11);
    const times = strikeTimes(open, 2).filter((time) => time > 0.08);
    expect(times.length).toBeGreaterThanOrEqual(3);
    expect(times[2] - times[1]).toBeLessThan(times[1] - times[0]);
    // Sheet steel: it has a ring to it that the knock of its shutting has not.
    expect(of('door')).toBeGreaterThan(of('doorShut'));
    expect(mostlyOverBy(rendered('doorShut'))).toBeLessThan(0.12);
    expect(peakAt(rendered('doorShut'))).toBeLessThan(0.06);
  });

  it('makes a rush of medals too thick to count, bright, and steady from one tenth of a second to the next', () => {
    const samples = rendered('pour');
    expect(samples.length / RATE).toBeCloseTo(CHUTE.loop, 3);
    // Strikes that fall within six thousandths of a second of one another count once: there are still more than a dozen a second.
    expect(strikes(samples)).toBeGreaterThan(CHUTE.loop * 12);
    expect(of('pour')).toBeGreaterThan(4000);
    expect(of('pour')).toBeLessThan(9000);
    const tenths = Array.from({ length: 20 }, (_, index) => energy(samples, (index * RATE) / 10, ((index + 1) * RATE) / 10));
    expect(Math.max(...tenths) / Math.min(...tenths)).toBeLessThan(3);
    // It is thicker than a hopper counting medals out one at a time: more of it is sound, less of it gaps.
    const fill = (sample: Sample) => Math.sqrt(energy(rendered(sample)) / rendered(sample).length);
    expect(fill('pour')).toBeGreaterThan(fill('hopper') * 1.2);
  });

  it('rings a medal down a slot: a zip that rises, and a clink at the bottom', () => {
    for (const variant of takesOf('slit')) {
      const samples = rendered('slit', variant);
      const lands = peakAt(samples);
      expect(lands).toBeGreaterThan(0.13);
      expect(lands).toBeLessThan(0.19);
      // Before the clink it is a rattle that gets higher and louder as the medal falls.
      const early = samples.subarray(0, Math.round(lands * 0.45 * RATE));
      const late = samples.subarray(Math.round(lands * 0.55 * RATE), Math.round((lands - 0.004) * RATE));
      expect(brightness(late, RATE)).toBeGreaterThan(brightness(early, RATE) * 1.1);
      expect(energy(late) / late.length).toBeGreaterThan(energy(early) / early.length);
      // The clink is a medal's, and rings on after the rattle has stopped.
      expect(shareBetween('slit', variant, MEDAL.hz * 0.9, MEDAL.hz * 1.12)).toBeGreaterThan(0.1);
      expect(energy(samples, (lands + 0.03) * RATE)).toBeGreaterThan(0);
      expect(samples.length / RATE).toBeLessThan(0.4);
    }
    expect(firstDifference(rendered('slit', 0), rendered('slit', 1))).not.toBe(-1);
    expect(firstDifference(rendered('slit', 1), rendered('slit', 2))).not.toBe(-1);
  });

  it('gives the ball its moments: a shot, a strike on a lip, a settle, a landing', () => {
    for (const sample of ['shot', 'lip', 'settle', 'bowlLand', 'shutterOpen'] as const) {
      const samples = rendered(sample);
      expect(peakAt(samples), sample).toBeLessThan(sample === 'shutterOpen' ? 0.16 : 0.02);
      expect(samples.length / RATE, sample).toBeLessThan(0.35);
    }
    // A lip is hard and a landing in a bowl is hollow; a ball that settles rocks more than once.
    expect(of('lip')).toBeGreaterThan(of('bowlLand') * 1.5);
    expect(strikeTimes(rendered('settle'), 2).length).toBeGreaterThanOrEqual(2);
    expect(strikeTimes(rendered('bowlLand'), 2).length).toBeGreaterThanOrEqual(2);
    expect(mostlyOverBy(rendered('lip'))).toBeLessThan(0.03);
  });
});

describe('what comes from far off', () => {
  const NEAR = { farClink: 'win', farRattle: 'pour8', farPour: 'pour16' } as const;

  it('has lost its top and has the room in it: duller than the same medals close to, and ringing on after them', () => {
    for (const far of ['farClink', 'farRattle', 'farPour'] as const) {
      const near = Math.min(...takesOf(NEAR[far]).map((variant) => brightness(rendered(NEAR[far], variant), RATE)));
      for (const variant of takesOf(far)) {
        const samples = rendered(far, variant, LOW_RATE);
        expect(brightness(samples, LOW_RATE), far).toBeLessThan(near * 0.75);
        expect(brightness(samples, LOW_RATE), far).toBeGreaterThan(1200);
        expect(1 - shareBelow(samples, 7000, LOW_RATE), far).toBeLessThan(0.05);
        // The room goes on sounding after the medals have stopped: there is still something half a second from the end.
        const tail = energy(samples, samples.length - 0.7 * LOW_RATE, samples.length - 0.3 * LOW_RATE);
        expect(tail / energy(samples), far).toBeGreaterThan(1e-5);
        expect(peakOf(samples)).toBeCloseTo(1, 6);
      }
    }
  });

  it('keeps several takes of the clinks, the rattles and the tunes, no two alike', () => {
    for (const far of ['farClink', 'farRattle', 'farTune'] as const) {
      const all = takesOf(far).map((variant) => rendered(far, variant, LOW_RATE));
      expect(all.length).toBeGreaterThan(1);
      for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) expect(firstDifference(all[a], all[b]), far).not.toBe(-1);
    }
  });

  it('makes its tunes up: a few notes that are no jingle of this cabinet, soft and far away', () => {
    const jingles = Object.keys(SCORES) as PusherSound[];
    for (const variant of takesOf('farTune')) {
      const samples = rendered('farTune', variant, LOW_RATE);
      expect(samples.length / LOW_RATE).toBeCloseTo(2.6, 3);
      expect(brightness(samples, LOW_RATE)).toBeLessThan(2600);
      // Notes, with gaps and the room between them: not one steady tone.
      const tenths = Array.from({ length: 20 }, (_, index) => energy(samples, (index * LOW_RATE) / 10, ((index + 1) * LOW_RATE) / 10));
      expect(Math.max(...tenths) / (Math.min(...tenths.slice(0, 15)) + 1e-9)).toBeGreaterThan(3);
      for (const jingle of jingles) expect(firstDifference(samples.subarray(0, 2000), rendered(jingle, 0, LOW_RATE).subarray(0, 2000)), jingle).not.toBe(-1);
    }
  });

  it('has a tone under it with nothing in it to count: steady, low, and seven seconds before it comes round', () => {
    const samples = rendered('room', 0, LOW_RATE);
    expect(samples.length / LOW_RATE).toBeCloseTo(7, 3);
    const seconds = Array.from({ length: 7 }, (_, index) => energy(samples, index * LOW_RATE, (index + 1) * LOW_RATE));
    expect(Math.max(...seconds) / Math.min(...seconds)).toBeLessThan(2);
    expect(brightness(samples, LOW_RATE)).toBeLessThan(2500);
    expect(shareBelow(samples, 1000, LOW_RATE)).toBeGreaterThan(0.5);
    // The medals of the floor are in it, far too many to count, as a wash a long way under the air and the murmur.
    expect(1 - shareBelow(samples, 2000, LOW_RATE)).toBeGreaterThan(0.02);
    expect(1 - shareBelow(samples, 2000, LOW_RATE)).toBeLessThan(0.3);
    // No instant of it stands out: its peak is a few times its average, as noise is, not tens of times as a strike is.
    expect(1 / Math.sqrt(energy(samples) / samples.length)).toBeLessThan(9);
  });
});
