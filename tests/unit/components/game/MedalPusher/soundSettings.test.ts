import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SOUND_SETTINGS_KEY,
  USUAL_SOUND_SETTINGS,
  VOLUME_PERCENT,
  loadSoundSettings,
  packSoundSettings,
  readSoundSettings,
  saveSoundSettings,
  soundSettingsStore,
  tidyVolume,
  volumeOf,
  type SoundSettings,
} from '@/components/game/MedalPusher/soundSettings';
import { VOLUME } from '@/components/game/MedalPusher/sounds';
import { STORAGE_KEY } from '@/components/game/MedalPusher/storage';

/** A stand-in for a browser's storage that writes down what it is asked. */
function shelfOf(start: Record<string, string> = {}) {
  const kept = new Map(Object.entries(start));
  const reads: string[] = [];
  const writes: [string, string][] = [];
  return {
    kept,
    reads,
    writes,
    getItem(key: string): string | null {
      reads.push(key);
      return kept.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      writes.push([key, value]);
      kept.set(key, value);
    },
  };
}

beforeEach(() => {
  soundSettingsStore.forget();
});

afterEach(() => {
  soundSettingsStore.forget();
  vi.unstubAllGlobals();
});

describe('the scale of the volume', () => {
  it('is whole percent of the level the cabinet was made at, from silent to as loud as it goes', () => {
    expect(VOLUME_PERCENT).toEqual({ min: 0, max: 200, usual: 100, step: 5 });
    expect(VOLUME_PERCENT.max).toBe(VOLUME.most * 100);
    expect(VOLUME_PERCENT.usual).toBe(VOLUME.usual * 100);
    // The usual level is one of the steps, and is the middle of the slider, where its mark is drawn.
    expect(VOLUME_PERCENT.usual % VOLUME_PERCENT.step).toBe(0);
    expect(VOLUME_PERCENT.usual).toBe((VOLUME_PERCENT.min + VOLUME_PERCENT.max) / 2);
    // And nobody is given the arcade round the cabinet who has not asked for it.
    expect(USUAL_SOUND_SETTINGS).toEqual({ volume: 100, music: true, arcade: false });
  });

  it('brings a volume to the nearest step inside the range', () => {
    expect(tidyVolume(100)).toBe(100);
    expect(tidyVolume(62)).toBe(60);
    expect(tidyVolume(63)).toBe(65);
    expect(tidyVolume(97.6)).toBe(100);
    expect(tidyVolume(2.4)).toBe(0);
    expect(tidyVolume(-20)).toBe(0);
    expect(tidyVolume(900)).toBe(200);
    expect(tidyVolume(1e300)).toBe(200);
    for (let percent = VOLUME_PERCENT.min; percent <= VOLUME_PERCENT.max; percent += VOLUME_PERCENT.step) expect(tidyVolume(percent)).toBe(percent);
  });

  it('takes anything that is not a number for the usual volume', () => {
    for (const nonsense of ['80', '', null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, true, {}, [50], () => 50]) {
      expect(tidyVolume(nonsense)).toBe(100);
    }
  });

  it('turns a percent into what the cabinet is set to', () => {
    expect(volumeOf(0)).toBe(VOLUME.least);
    expect(volumeOf(100)).toBe(VOLUME.usual);
    expect(volumeOf(200)).toBe(VOLUME.most);
    expect(volumeOf(50)).toBe(0.5);
    expect(volumeOf(135)).toBe(1.35);
    expect(volumeOf(5000)).toBe(VOLUME.most);
    expect(volumeOf(-5)).toBe(VOLUME.least);
  });
});

describe('what is kept', () => {
  it('has a key of its own, apart from the machine', () => {
    expect(SOUND_SETTINGS_KEY).toBe('medal-pusher-sound');
    expect(SOUND_SETTINGS_KEY).not.toBe(STORAGE_KEY);
  });

  it('comes back as it was written, for every volume and either way of each switch', () => {
    for (let volume = VOLUME_PERCENT.min; volume <= VOLUME_PERCENT.max; volume += VOLUME_PERCENT.step) {
      for (const music of [true, false]) {
        for (const arcade of [true, false]) {
          const settings: SoundSettings = { volume, music, arcade };
          expect(readSoundSettings(packSoundSettings(settings))).toEqual(settings);
        }
      }
    }
    // What is written is small and plain: three things, and nothing of the machine.
    expect(packSoundSettings({ volume: 130, music: false, arcade: false })).toBe('{"volume":130,"music":false,"arcade":false}');
    expect(packSoundSettings({ volume: 133, music: true, arcade: true })).toBe('{"volume":135,"music":true,"arcade":true}');
  });

  it('reads what was kept before there was an arcade to switch on, with the arcade off', () => {
    expect(readSoundSettings('{"volume":60,"music":false}')).toEqual({ volume: 60, music: false, arcade: false });
    expect(readSoundSettings('{"volume":145,"music":true}')).toEqual({ volume: 145, music: true, arcade: false });
    // And the two switches have nothing to do with one another: either can be on without the other.
    expect(readSoundSettings('{"volume":60,"music":false,"arcade":true}')).toEqual({ volume: 60, music: false, arcade: true });
    expect(readSoundSettings('{"volume":60,"music":true,"arcade":false}')).toEqual({ volume: 60, music: true, arcade: false });
    // Only a plain yes switches it on.
    for (const nonsense of ['"yes"', '1', 'null', '{}', '[true]']) {
      expect(readSoundSettings(`{"volume":60,"music":false,"arcade":${nonsense}}`), nonsense).toEqual({ volume: 60, music: false, arcade: false });
    }
  });

  it('gives the usual settings for anything that is not what was written', () => {
    const texts = [null, undefined, '', ' ', 'not json', '{', '42', 'null', 'true', '"loud"', '[]', '[100,true]', '{}', 7, {}, '{"volume":'];
    for (const text of texts) expect(readSoundSettings(text), String(text)).toEqual(USUAL_SOUND_SETTINGS);
  });

  it('reads each setting on its own, so that one that makes no sense does not take the other with it', () => {
    expect(readSoundSettings('{"volume":"loud","music":7}')).toEqual({ volume: 100, music: true, arcade: false });
    expect(readSoundSettings('{"volume":"loud","music":false}')).toEqual({ volume: 100, music: false, arcade: false });
    expect(readSoundSettings('{"volume":35,"music":"yes"}')).toEqual({ volume: 35, music: true, arcade: false });
    expect(readSoundSettings('{"music":false}')).toEqual({ volume: 100, music: false, arcade: false });
    expect(readSoundSettings('{"volume":60}')).toEqual({ volume: 60, music: true, arcade: false });
    expect(readSoundSettings('{"volume":null,"music":null}')).toEqual({ volume: 100, music: true, arcade: false });
    // A volume that is a number but not one the slider has is brought to one it has.
    expect(readSoundSettings('{"volume":1e9,"music":false}')).toEqual({ volume: 200, music: false, arcade: false });
    expect(readSoundSettings('{"volume":-40}')).toEqual({ volume: 0, music: true, arcade: false });
    expect(readSoundSettings('{"volume":72.5}')).toEqual({ volume: 75, music: true, arcade: false });
    // Whatever else is in there is nothing to do with it.
    expect(readSoundSettings('{"volume":45,"music":false,"credits":999,"__proto__":{"music":true}}')).toEqual({ volume: 45, music: false, arcade: false });
  });

  it('never hands out the usual settings themselves, which whoever asked might change', () => {
    const first = readSoundSettings(null);
    first.volume = 0;
    first.music = false;
    expect(readSoundSettings(null)).toEqual({ volume: 100, music: true, arcade: false });
    expect(loadSoundSettings(() => shelfOf())).toEqual({ volume: 100, music: true, arcade: false });
    expect(USUAL_SOUND_SETTINGS).toEqual({ volume: 100, music: true, arcade: false });
  });
});

describe('the device', () => {
  it('is read and written under the one key', () => {
    const shelf = shelfOf({ [STORAGE_KEY]: '{"credits":5}' });
    expect(loadSoundSettings(() => shelf)).toEqual(USUAL_SOUND_SETTINGS);
    expect(saveSoundSettings({ volume: 40, music: false, arcade: false }, () => shelf)).toBe(true);
    expect(shelf.writes).toEqual([[SOUND_SETTINGS_KEY, '{"volume":40,"music":false,"arcade":false}']]);
    expect(loadSoundSettings(() => shelf)).toEqual({ volume: 40, music: false, arcade: false });
    expect(shelf.reads).toEqual([SOUND_SETTINGS_KEY, SOUND_SETTINGS_KEY]);
    // The machine's own save is not touched.
    expect(shelf.kept.get(STORAGE_KEY)).toBe('{"credits":5}');
  });

  it('is done without when the browser will not give its storage, read it or write to it', () => {
    const refused = () => {
      throw new Error('SecurityError');
    };
    expect(loadSoundSettings(refused)).toEqual(USUAL_SOUND_SETTINGS);
    expect(saveSoundSettings({ volume: 40, music: false, arcade: false }, refused)).toBe(false);
    const deaf = { getItem: refused, setItem: refused };
    expect(loadSoundSettings(() => deaf)).toEqual(USUAL_SOUND_SETTINGS);
    expect(saveSoundSettings({ volume: 40, music: false, arcade: false }, () => deaf)).toBe(false);
    // Where there is no browser at all, as on the server, it is the same.
    expect(typeof window).toBe('undefined');
    expect(loadSoundSettings()).toEqual(USUAL_SOUND_SETTINGS);
    expect(saveSoundSettings({ volume: 40, music: false, arcade: false })).toBe(false);
  });
});

describe('the settings while the page is open', () => {
  it('are the usual ones on the server, the same ones every time', () => {
    expect(soundSettingsStore.onServer()).toEqual({ volume: 100, music: true, arcade: false });
    expect(soundSettingsStore.onServer()).toBe(soundSettingsStore.onServer());
  });

  it('are read from the device once, and are the same thing until they change', () => {
    const shelf = shelfOf({ [SOUND_SETTINGS_KEY]: '{"volume":55,"music":false}' });
    vi.stubGlobal('window', { localStorage: shelf });
    const first = soundSettingsStore.now();
    expect(first).toEqual({ volume: 55, music: false, arcade: false });
    // React asks again on every render and must be handed the very same thing, or it would render for ever.
    expect(soundSettingsStore.now()).toBe(first);
    expect(soundSettingsStore.now()).toBe(first);
    expect(shelf.reads).toEqual([SOUND_SETTINGS_KEY]);
  });

  it('keep a change, write it to the device and tell whoever is watching', () => {
    const shelf = shelfOf();
    vi.stubGlobal('window', { localStorage: shelf });
    const before = soundSettingsStore.now();
    expect(before).toEqual(USUAL_SOUND_SETTINGS);
    let told = 0;
    const stop = soundSettingsStore.watch(() => {
      told += 1;
    });
    soundSettingsStore.change({ volume: 132, music: false, arcade: false });
    expect(told).toBe(1);
    expect(soundSettingsStore.now()).toEqual({ volume: 130, music: false, arcade: false });
    expect(soundSettingsStore.now()).not.toBe(before);
    expect(shelf.writes).toEqual([[SOUND_SETTINGS_KEY, '{"volume":130,"music":false,"arcade":false}']]);
    // Whoever has stopped watching is not told.
    stop();
    soundSettingsStore.change({ volume: 20, music: true, arcade: true });
    expect(told).toBe(1);
    expect(soundSettingsStore.now()).toEqual({ volume: 20, music: true, arcade: true });
    // Forgotten, they are read from the device again: what was written is what comes back, the arcade with it.
    soundSettingsStore.forget();
    expect(soundSettingsStore.now()).toEqual({ volume: 20, music: true, arcade: true });
  });

  it('go on working, for as long as the page is open, where nothing can be kept', () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new Error('SecurityError');
      },
    });
    expect(soundSettingsStore.now()).toEqual(USUAL_SOUND_SETTINGS);
    let told = 0;
    const stop = soundSettingsStore.watch(() => {
      told += 1;
    });
    expect(() => soundSettingsStore.change({ volume: 150, music: false, arcade: false })).not.toThrow();
    expect(told).toBe(1);
    expect(soundSettingsStore.now()).toEqual({ volume: 150, music: false, arcade: false });
    stop();
  });
});
