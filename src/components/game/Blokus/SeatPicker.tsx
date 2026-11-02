/**
 * The setup screen's table: how many players, who sits where, and which colour
 * each of them takes.
 */

'use client';

import type { Difficulty } from '../common/types';
import { RULES } from './engine';
import type { BlokusStrings } from './i18n';
import { seatCounts, type Controller, type Seating } from './seating';
import styles from './SeatPicker.module.css';

const LEVELS: Difficulty[] = ['easy', 'medium', 'hard', 'expert', 'master'];
const FRIEND = 'friend';

interface SeatPickerProps {
  seating: Seating;
  strings: BlokusStrings;
  onCount: (count: number) => void;
  onColor: (seat: number, color: number) => void;
  onController: (seat: number, controller: Controller) => void;
}

export const SeatPicker = ({ seating, strings: t, onCount, onColor, onController }: SeatPickerProps) => {
  const { mode, seats, shared } = seating;
  const colors = Array.from({ length: RULES[mode].colors }, (_, color) => color);
  const counts = seatCounts(mode);

  return (
    <div className={styles.picker} data-mode={mode} data-testid="blokus-seats">
      {counts.length > 1 && (
        <fieldset className={styles.group}>
          <legend className={styles.title}>{t.playersTitle}</legend>
          <div className={styles.counts}>
            {counts.map((count) => (
              <button
                key={count}
                type="button"
                className={styles.count}
                aria-pressed={seats.length === count}
                data-testid={`blokus-count-${count}`}
                onClick={() => onCount(count)}
              >
                {t.playerCount(count)}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <ul className={styles.seats}>
        {seats.map((seat, index) => {
          const name = index === 0 ? t.you : t.player(index + 1);
          return (
            <li key={index} className={styles.seat} data-testid={`blokus-seat-${index}`}>
              <span className={styles.seatName}>{name}</span>
              <div className={styles.chips} role="group" aria-label={t.seatColors(name)}>
                {colors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`${styles.chip} ${styles[`chip${color}`]}`}
                    aria-label={t.colors[mode][color]}
                    aria-pressed={seat.colors.includes(color)}
                    data-testid={`blokus-seat-${index}-color-${color}`}
                    onClick={() => onColor(index, color)}
                  />
                ))}
              </div>
              {index > 0 && (
                <select
                  className={styles.control}
                  aria-label={t.seatControl(name)}
                  data-testid={`blokus-seat-${index}-control`}
                  value={seat.controller.kind === 'ai' ? seat.controller.level : FRIEND}
                  onChange={(event) => {
                    const { value } = event.target;
                    onController(index, value === FRIEND ? { kind: 'human' } : { kind: 'ai', level: value as Difficulty });
                  }}
                >
                  <option value={FRIEND}>{t.friendHere}</option>
                  {LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {t.aiLevel(t.difficulties[level].label)}
                    </option>
                  ))}
                </select>
              )}
            </li>
          );
        })}
      </ul>

      {shared !== null && <p className={styles.note}>{t.sharedNote(t.colors[mode][shared])}</p>}
      {mode === 'classic' && seats.length === 2 && <p className={styles.note}>{t.twoColorsNote}</p>}
    </div>
  );
};
