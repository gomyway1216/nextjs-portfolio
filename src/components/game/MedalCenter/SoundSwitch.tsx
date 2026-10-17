'use client';

import { SOUND_WORDS, type MachineSoundControl } from './machineSounds';

/**
 * The switch for a machine's sound: off on every visit (a browser lets a page
 * make noise only after a press), on with a press of it.
 */
export const SoundSwitch = ({
  control,
  language,
  className,
  testId,
}: {
  control: MachineSoundControl;
  language: 'en' | 'ja';
  className?: string;
  testId: string;
}) => (
  <button type="button" className={className} aria-pressed={control.on} data-testid={testId} data-sound={control.on} onClick={control.toggle}>
    <span aria-hidden>{control.on ? '🔊' : '🔈'}</span> {control.on ? SOUND_WORDS[language].on : SOUND_WORDS[language].off}
  </button>
);
