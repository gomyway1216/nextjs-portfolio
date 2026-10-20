'use client';

import type { RefObject } from 'react';
import { HOLDS } from './engine';
import { BOARD_H, BOARD_W, SCREEN } from './scene';
import styles from './Pachinko.module.css';

const pct = (value: number, of: number) => `${((value / of) * 100).toFixed(3)}%`;

export interface BoardProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  label: string;
  reels: readonly { face: number; spinning: boolean }[];
  caption: string;
  modeLine: string;
  spinKind: string;
  phase: number;
  won: boolean;
  stage: string;
  count: string;
  h1: number;
  h2: number;
  right: string;
  calm: boolean;
}

/**
 * The board under its glass: the canvas the board and the balls are painted on (PlayTab.tsx, draw.ts), and over it the
 * screen with its three lanterns, the hold lamps under it, and the 右打ち sign. Those are few, and change only as the
 * machine does: elements. The balls, a hundred a minute, are only ever painted.
 */
export const Board = ({ canvasRef, label, reels, caption, modeLine, spinKind, phase, won, stage, count, h1, h2, right, calm }: BoardProps) => (
  <div className={styles.boardBox} data-testid="pk-board" role="img" aria-label={label}>
    <canvas ref={canvasRef} className={styles.canvas} width={BOARD_W} height={BOARD_H} aria-hidden="true" />
    <div
      className={styles.screen}
      data-testid="pk-lcd"
      data-spin={spinKind}
      data-phase={phase}
      data-won={won ? 'true' : 'false'}
      data-stage={stage}
      data-calm={calm ? 'true' : 'false'}
      style={{ left: pct(SCREEN.x, BOARD_W), top: pct(SCREEN.y, BOARD_H), width: pct(SCREEN.w, BOARD_W), height: pct(SCREEN.h, BOARD_H) }}
      aria-hidden="true"
    >
      {stage === '' ? (
        <div className={styles.reels} data-testid="pk-reels">
          {reels.map((reel, i) => (
            <span key={i} className={styles.reel} data-spinning={reel.spinning ? 'true' : 'false'} data-face={reel.face}>
              <span className={styles.reelFace}>{reel.spinning && calm ? '·' : reel.face}</span>
            </span>
          ))}
        </div>
      ) : (
        <div className={styles.roundBox}>
          <span className={styles.roundCount}>{count}</span>
        </div>
      )}
      {spinKind === 'sp' && phase >= 2 && <span className={styles.goldfish} />}
      <span className={styles.caption} data-testid="pk-caption">
        {caption}
      </span>
      <span className={styles.modeLine} data-testid="pk-mode-line">
        {modeLine}
      </span>
    </div>
    <div className={styles.lamps} data-testid="pk-hold-lamps" data-h1={h1} data-h2={h2} aria-hidden="true" style={{ top: pct(SCREEN.y + SCREEN.h + 12, BOARD_H) }}>
      {Array.from({ length: HOLDS }, (_, i) => (
        <span key={`a${i}`} className={styles.lamp} data-lit={i < h1 ? 'true' : 'false'} />
      ))}
      <span className={styles.lampGap} />
      {Array.from({ length: HOLDS }, (_, i) => (
        <span key={`b${i}`} className={`${styles.lamp} ${styles.lampTulip}`} data-lit={i < h2 ? 'true' : 'false'} />
      ))}
    </div>
    {right && (
      <span className={styles.rightSign} data-testid="pk-right-sign" aria-hidden="true">
        {right}
      </span>
    )}
  </div>
);
