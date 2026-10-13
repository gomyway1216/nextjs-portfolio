'use client';

import { useEffect, useId, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import type { PusherStrings } from './i18n';
import { setVolume } from './sounds';
import { VOLUME_PERCENT, soundSettingsStore, volumeOf, type SoundSettings } from './soundSettings';
import styles from './MedalPusher.module.css';

/**
 * The sound settings as the cabinet holds them: what they are, whether the
 * row they are changed in is open, and the names the button and the row know
 * each other by.
 */
export interface SoundControl {
  settings: SoundSettings;
  change: (next: SoundSettings) => void;
  open: boolean;
  toggle: () => void;
  /** Closes the row and puts the focus back on the button that opened it. */
  close: () => void;
  buttonId: string;
  panelId: string;
}

/**
 * The player's sound settings. On the server, and in the browser's first
 * render, they are the usual ones; what this device remembers takes their
 * place as soon as the page is the browser's. The cabinet is as loud as they
 * say from that moment, before the sound has ever been switched on, and every
 * change after that is heard at once and kept on the device.
 */
export function useSoundSettings(): SoundControl {
  const settings = useSyncExternalStore(soundSettingsStore.watch, soundSettingsStore.now, soundSettingsStore.onServer);
  const [open, setOpen] = useState(false);
  const buttonId = useId();
  const panelId = useId();

  useEffect(() => {
    setVolume(volumeOf(settings.volume));
  }, [settings.volume]);

  const close = () => {
    setOpen(false);
    document.getElementById(buttonId)?.focus();
  };
  return { settings, change: soundSettingsStore.change, open, toggle: () => setOpen((was) => !was), close, buttonId, panelId };
}

/**
 * The button beside Sound that opens the settings and closes them again. It
 * has no words on it, only three faders, drawn in the button's own colour so
 * that they show on it whatever the device's emoji look like; it is named for
 * a screen reader.
 */
export const SoundSettingsButton = ({ control, strings }: { control: SoundControl; strings: PusherStrings }) => (
  <button
    id={control.buttonId}
    type="button"
    className={`${styles.toggle} ${styles.soundMore}`}
    aria-expanded={control.open}
    aria-controls={control.open ? control.panelId : undefined}
    aria-label={strings.soundSettings}
    title={strings.soundSettings}
    data-testid="pusher-sound-settings"
    onClick={control.toggle}
  >
    <svg className={styles.soundMoreIcon} viewBox="0 0 16 16" aria-hidden focusable="false">
      <path d="M3 2v12M8 2v12M13 2v12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="3" cy="10" r="2.1" fill="currentColor" />
      <circle cx="8" cy="5" r="2.1" fill="currentColor" />
      <circle cx="13" cy="9" r="2.1" fill="currentColor" />
    </svg>
  </button>
);

/**
 * The settings themselves, in a row of their own under the switches: a slider
 * for the volume, with the level the cabinet was made at marked in its middle,
 * and a switch for the background loop alone. Escape closes the row.
 */
export const SoundSettingsPanel = ({ control, strings }: { control: SoundControl; strings: PusherStrings }) => {
  const volumeId = useId();
  if (!control.open) return null;
  const { settings, change } = control;
  const mark = strings.volumeMark(settings.volume);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    control.close();
  };
  return (
    <div id={control.panelId} className={styles.soundPanel} role="group" aria-label={strings.soundSettings} data-testid="pusher-sound-panel" onKeyDown={onKeyDown}>
      <div className={styles.volume}>
        <label htmlFor={volumeId} className={styles.volumeLabel}>
          {strings.volume}
          <span className={styles.volumeValue} aria-hidden data-testid="pusher-volume-value">
            {settings.volume}%{mark && <span className={styles.volumeMark}>{mark}</span>}
          </span>
        </label>
        <div className={styles.volumeTrack}>
          <input
            id={volumeId}
            type="range"
            className={styles.volumeSlider}
            min={VOLUME_PERCENT.min}
            max={VOLUME_PERCENT.max}
            step={VOLUME_PERCENT.step}
            value={settings.volume}
            aria-valuetext={strings.volumeValue(settings.volume)}
            data-testid="pusher-volume"
            onChange={(event) => change({ ...settings, volume: Number(event.target.value) })}
          />
        </div>
      </div>
      <button type="button" className={styles.toggle} aria-pressed={settings.music} data-testid="pusher-music" onClick={() => change({ ...settings, music: !settings.music })}>
        <span aria-hidden>♪</span> {strings.music}
      </button>
    </div>
  );
};
