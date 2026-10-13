'use client';

import { createContext, memo, useContext, useId } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { StepGlyph } from './PlateArt';
import { PLATE_STEPS } from './plateData';
import { getPlateStrings } from './plateStrings';
import styles from './InstructionPlate.module.css';

/**
 * How the compact plate asks for the full one: whoever owns the full plate
 * provides this, and it is called with `true` to open it. With nobody to ask,
 * the compact plate is a sticker and nothing more.
 */
export const PlateSwitch = createContext<((open: boolean) => void) | null>(null);

/**
 * The compact plate: a sticker on the front of the cabinet, under the control
 * panel, where a real cabinet has its instructions in sight of whoever is
 * playing. There is room on it for the steps' numbers and pictures and a word
 * each, not for their sentences, so pressing it opens the full plate.
 *
 * It is one block with nothing outside it, so it can be mounted anywhere on
 * the cabinet. While the cabinet fills the screen it is not shown: that is
 * the game and its controls and nothing else, laid out to fit, and the
 * stylesheet puts the sticker away with the cabinet's other strips.
 */
export const PlateSticker = memo(function PlateSticker() {
  const open = useContext(PlateSwitch);
  const { language } = useGameLanguage();
  const t = getPlateStrings(language);
  const sayId = useId();
  const says = t.stickerSays(PLATE_STEPS.map((step) => t.steps[step].head));
  const print = (
    <>
      <span className={styles.stickerTitle} aria-hidden>
        {t.title}
      </span>
      <span className={styles.stickerSteps} aria-hidden>
        {PLATE_STEPS.map((step, index) => (
          <span key={step} className={styles.stickerStep} data-plate-mini={step}>
            <span className={styles.stickerPic}>
              <StepGlyph step={step} />
              <span className={styles.stickerNum}>{index + 1}</span>
            </span>
            {/* A word where the sticker is narrow, and the step's own heading where there is room for it. */}
            <span className={styles.stickerWord}>{t.steps[step].short}</span>
            <span className={styles.stickerHead}>{t.steps[step].head}</span>
          </span>
        ))}
      </span>
    </>
  );
  if (!open) {
    return (
      <div className={styles.sticker} data-plate-lang={language} data-testid="pusher-plate-strip" role="img" aria-label={says}>
        {print}
      </div>
    );
  }
  return (
    <button type="button" className={styles.sticker} data-plate-lang={language} data-testid="pusher-plate-strip" aria-label={t.open} aria-describedby={sayId} aria-haspopup="dialog" onClick={() => open(true)}>
      {print}
      <span className={styles.stickerMore} aria-hidden>
        <svg viewBox="0 0 24 24" focusable="false">
          <circle cx="10" cy="10" r="6.2" fill="none" stroke="currentColor" strokeWidth="2.4" />
          <path d="M14.8 14.8L21 21" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <path d="M10 7.2v5.6M7.2 10h5.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
      <span id={sayId} className={styles.srOnly}>
        {says}
      </span>
    </button>
  );
});
