/**
 * What the player has set the sound to: how loud the cabinet is, whether its
 * background loop plays, and whether the arcade round it is heard. It is kept
 * on this device under a key of its own, apart from the machine's save: it
 * belongs to the device and its speakers, not to the machine, and it should
 * not travel with the machine to another one.
 *
 * Whether the sound is on at all is not kept. A browser lets a page make noise
 * only after a press, so the sound is switched on by hand on every visit, and
 * what is remembered is how it sounds once it is.
 */

import { VOLUME } from './sounds';

/** The key the settings are kept under. The machine's own save has another. */
export const SOUND_SETTINGS_KEY = 'medal-pusher-sound';

/**
 * The volume as its slider has it: whole percent of the level the cabinet was
 * made at, in steps, from silent to the most `setVolume` takes.
 */
export const VOLUME_PERCENT = { min: VOLUME.least * 100, max: VOLUME.most * 100, usual: VOLUME.usual * 100, step: 5 } as const;

export interface SoundSettings {
  /** Percent of the level the cabinet was made at: a whole number of steps within `VOLUME_PERCENT`. */
  volume: number;
  /** Whether the background loop plays while the sound is on. */
  music: boolean;
  /** Whether the room the cabinet stands in is heard while the sound is on: the floor of an arcade, far off. */
  arcade: boolean;
}

/** What a player who has set nothing gets: the level the cabinet was made at, with its loop, and no room round it. */
export const USUAL_SOUND_SETTINGS: Readonly<SoundSettings> = { volume: VOLUME_PERCENT.usual, music: true, arcade: false };

/** Settings with everything in them brought to what can be kept: the volume to a step, each switch to on or off. */
const tidy = (settings: SoundSettings): SoundSettings => ({ volume: tidyVolume(settings.volume), music: settings.music !== false, arcade: settings.arcade === true });

/** A volume in percent, brought to the nearest step inside the range. Anything that is not a number is the usual volume. */
export function tidyVolume(percent: unknown): number {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) return VOLUME_PERCENT.usual;
  const stepped = Math.round(percent / VOLUME_PERCENT.step) * VOLUME_PERCENT.step;
  return Math.min(VOLUME_PERCENT.max, Math.max(VOLUME_PERCENT.min, stepped));
}

/** The multiple of the cabinet's own level that a percent stands for, which is what `setVolume` takes. */
export const volumeOf = (percent: number): number => tidyVolume(percent) / 100;

/** The text that is kept for some settings. */
export const packSoundSettings = (settings: SoundSettings): string => JSON.stringify(tidy(settings));

/**
 * The settings in a text that was kept. Each of them is read on its own: a
 * volume that makes no sense is the usual volume, and does not take the
 * music's switch with it, and a text kept before there was a room to switch
 * on has the room off. A text that is missing, or is not the kind of thing
 * that was written, gives the usual settings.
 */
export function readSoundSettings(text: unknown): SoundSettings {
  if (typeof text !== 'string') return { ...USUAL_SOUND_SETTINGS };
  let kept: unknown;
  try {
    kept = JSON.parse(text);
  } catch {
    return { ...USUAL_SOUND_SETTINGS };
  }
  if (typeof kept !== 'object' || kept === null || Array.isArray(kept)) return { ...USUAL_SOUND_SETTINGS };
  const { volume, music, arcade } = kept as { volume?: unknown; music?: unknown; arcade?: unknown };
  return {
    volume: tidyVolume(volume),
    music: typeof music === 'boolean' ? music : USUAL_SOUND_SETTINGS.music,
    arcade: typeof arcade === 'boolean' ? arcade : USUAL_SOUND_SETTINGS.arcade,
  };
}

/** Where the settings are kept. Asking a browser for its storage can itself be refused, so it is asked for inside the attempt. */
type Shelf = () => Pick<Storage, 'getItem' | 'setItem'>;
const deviceShelf: Shelf = () => window.localStorage;

/** The settings this device remembers, or the usual ones where it remembers none, will not say, or holds something else. */
export function loadSoundSettings(shelf: Shelf = deviceShelf): SoundSettings {
  try {
    return readSoundSettings(shelf().getItem(SOUND_SETTINGS_KEY));
  } catch {
    return { ...USUAL_SOUND_SETTINGS };
  }
}

/** Keeps the settings on this device. Returns whether it could: storage may be blocked, switched off or full, and the game goes on. */
export function saveSoundSettings(settings: SoundSettings, shelf: Shelf = deviceShelf): boolean {
  try {
    shelf().setItem(SOUND_SETTINGS_KEY, packSoundSettings(settings));
    return true;
  } catch {
    return false;
  }
}

// ── The settings while the page is open ─────────────────────────────────────

let held: SoundSettings | null = null;
const watchers = new Set<() => void>();

/**
 * The settings as the page has them, for whatever on it shows or uses them.
 * The device is read the first time they are looked at in the browser; after
 * that every change is kept here, written to the device, and told to whoever
 * is watching. On the server, and in the browser's first render, which has to
 * match it, they are the usual ones.
 */
export const soundSettingsStore = {
  watch(watcher: () => void): () => void {
    watchers.add(watcher);
    return () => {
      watchers.delete(watcher);
    };
  },
  now(): SoundSettings {
    held ??= loadSoundSettings();
    return held;
  },
  onServer(): SoundSettings {
    return USUAL_SOUND_SETTINGS;
  },
  change(next: SoundSettings): void {
    held = tidy(next);
    saveSoundSettings(held);
    for (const watcher of [...watchers]) watcher();
  },
  /** Forgets what was read, so that the next look reads the device again. The tests start from here. */
  forget(): void {
    held = null;
  },
};
