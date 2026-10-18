import { memo, type CSSProperties } from 'react';
import { BLOWHOLE, BOARD, BOARD_SIZE, LANE, LAMP_COUNT, LAP_PAYS, STAR, medalsFor, type SquareKind } from './engine';
import { DieFace } from './Die';
import { timesOf, type SugorokuStrings } from './i18n';
import { cellOf, lampsOf, type Scene } from './scene';
import styles from './Sugoroku.module.css';

/**
 * The cabinet's board: the 30 squares round the edge, the whale in the middle with the ten squares of its back and the
 * blowhole in a ring, the 12 lamps round the dome, and the die in the dome. Everything is placed in cells of the
 * board's 8 × 9 grid, so it scales with the board; the boat moves from cell to cell by transform alone, a hop at a
 * time.
 */

/** The middle of the whale: the dome. */
const CENTER = { x: 4, y: 4.5 };
/** The ring of lamps round the dome, and the ring of the whale's back round them, in cells. */
const LAMP_RADIUS = 1.55;
const LANE_RADIUS = 2.35;
/** Where a step of the whale ride is: 0 the top (where the boat comes aboard from the gate), 1 to 10 the squares of its back clockwise, 11 the blowhole. */
export function laneCell(step: number): { x: number; y: number } {
  const angle = ((-90 + 30 * step) * Math.PI) / 180;
  return { x: CENTER.x + LANE_RADIUS * Math.cos(angle), y: CENTER.y + LANE_RADIUS * Math.sin(angle) };
}
function lampCell(lamp: number): { x: number; y: number } {
  const angle = ((-90 + (360 / LAMP_COUNT) * lamp) * Math.PI) / 180;
  return { x: CENTER.x + LAMP_RADIUS * Math.cos(angle), y: CENTER.y + LAMP_RADIUS * Math.sin(angle) };
}
/** A cell position as the CSS of an element one cell (or `size` cells) across, its middle at (x, y). */
const placed = (x: number, y: number, size = 1): CSSProperties =>
  ({ '--x': (x - size / 2).toFixed(4), '--y': (y - size / 2).toFixed(4), '--size': size } as CSSProperties);

/** A square's little picture. */
function SquareIcon({ kind }: { kind: SquareKind }) {
  switch (kind) {
    case 'start':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 3v15M7 7h10M5 14a7 7 0 0 0 14 0" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="12" cy="3.5" r="1.8" fill="currentColor" />
        </svg>
      );
    case 'shell':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 20 3.5 10a8.5 8.5 0 0 1 17 0Z" fill="#f7b58c" stroke="#8a4b1f" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M12 20 8 6.5M12 20V3.5M12 20l4-13.5" stroke="#8a4b1f" strokeWidth="1.3" />
        </svg>
      );
    case 'pearl':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="8" fill="#fff6fb" stroke="#b5527c" strokeWidth="1.6" />
          <circle cx="9.3" cy="9.2" r="2.4" fill="#ffffff" />
        </svg>
      );
    case 'rest':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 21c0-6 .5-9 1.5-11" stroke="#7a4a1c" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M13.5 10C10 6 6 6 3.5 8.5 7 8 10 9 13.5 10ZM13.5 10c2-4 6-5 8-3.5-3.5.2-6 1.6-8 3.5ZM13.5 10c-1-4.5 0-7 3-8.5-1 3-1.8 5.6-3 8.5Z" fill="#2f8a3a" />
        </svg>
      );
    case 'tailwind':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case 'current':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M2 10c3-3 5 3 8 0s5 3 8 0 3-1 4-1M2 16c3-3 5 3 8 0s5 3 8 0 3-1 4-1" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case 'storm':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 15a4 4 0 0 1 .6-8A5.5 5.5 0 0 1 17 8a3.5 3.5 0 0 1 1 7Z" fill="#6b7280" />
          <path d="m12 14-2 4h3l-2 4" fill="none" stroke="#facc15" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );
    case 'whirlpool':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 12a1.5 1.5 0 1 1 1.5 1.5A3.5 3.5 0 1 1 15 9a5.5 5.5 0 1 1-6.5-1.5A7.5 7.5 0 1 1 4.5 15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'lamp':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="9" fill="#ffe36b" stroke="#a16207" strokeWidth="1.6" />
          <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 16.5v.5" fill="none" stroke="#7c2d12" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'jp':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="m12 2.5 2.8 6 6.6.7-5 4.4 1.5 6.5L12 16.7 6.1 20.1l1.5-6.5-5-4.4 6.6-.7Z" fill="#fde047" stroke="#92400e" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      );
    case 'whale':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M3 13c0-4 4-6 9-6 4.5 0 8 2 8 6 0 3-3 5-8 5H8c-3 0-5-2-5-5Z" fill="#2f7fd1" />
          <path d="M20 12c1-2 2-3 3.5-3-1 1.5-1 3.5 0 5-1.5 0-2.5-1-3.5-2Z" fill="#2f7fd1" />
          <circle cx="8" cy="11.5" r="1.1" fill="#fff" />
          <path d="M10 5c0-2 1-3 2-3M10 5c-1-1.5-2-2-3-2" stroke="#7cc4ff" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </svg>
      );
  }
}

/** The boat: a little sailing boat, red hull and white sail. */
const Boat = () => (
  <svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">
    <ellipse cx="20" cy="34" rx="14" ry="3" fill="rgba(0,0,0,0.25)" />
    <path d="M5 25h30l-5 8H10Z" fill="#e23b3b" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
    <path d="M20 4v20" stroke="#5b3a1a" strokeWidth="2.4" />
    <path d="M21 5 33 22H21Z" fill="#fff" stroke="#1f3b63" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M19 9 10 22h9Z" fill="#ffd34d" stroke="#1f3b63" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

/** The whale the middle of the board is: a round blue back the ring of its squares runs round, its tail, its flippers and its spout. */
const Whale = ({ spout }: { spout: boolean }) => (
  <svg className={styles.whale} viewBox="1 1 6 7" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id="sg-whale-back" cx="0.45" cy="0.35" r="0.75">
        <stop offset="0" stopColor="#5fb4f0" />
        <stop offset="0.7" stopColor="#2d78c4" />
        <stop offset="1" stopColor="#1d5a9a" />
      </radialGradient>
    </defs>
    {/* The tail, its two flukes out of the water at the bottom left. */}
    <path
      d="M2.45 6.35C2.1 6.8 1.85 7.05 1.62 7.2 1.4 6.95 1.12 6.9 1.05 7.05c.12.3.32.48.55.55-.05.25.05.5.3.7.12-.22.12-.5.05-.72.3-.1.75-.45 1.2-1.05Z"
      fill="#2d78c4"
      stroke="#123a66"
      strokeWidth="0.05"
      strokeLinejoin="round"
    />
    {/* The flippers. */}
    <path d="M1.75 4.9c-.45.2-.6.6-.5 1 .35-.1.65-.35.85-.7Z" fill="#2d78c4" stroke="#123a66" strokeWidth="0.05" />
    <path d="M6.25 4.9c.45.2.6.6.5 1-.35-.1-.65-.35-.85-.7Z" fill="#2d78c4" stroke="#123a66" strokeWidth="0.05" />
    <circle cx="4" cy="4.5" r="2.75" fill="url(#sg-whale-back)" stroke="#123a66" strokeWidth="0.06" />
    {/* The path the ride takes round the back. */}
    <circle cx="4" cy="4.5" r="2.35" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.1" strokeDasharray="0.12 0.14" />
    <circle cx="4" cy="4.5" r="1.95" fill="#1a5d9f" opacity="0.35" />
    {/* The water the blowhole throws up, shown as the ride reaches it. */}
    <g className={styles.spout} data-on={spout ? 'true' : 'false'}>
      <path d="M2.85 1.9c-.2-.5-.05-.8.25-.9-.05.3.05.55.25.7.1-.45.4-.65.75-.6-.2.2-.3.45-.25.75" fill="none" stroke="#bfe6ff" strokeWidth="0.09" strokeLinecap="round" />
    </g>
  </svg>
);

export interface IslandBoardProps {
  scene: Scene;
  bet: number;
  t: SugorokuStrings;
  attract: boolean;
  calm: boolean;
  /** Counted up each hop, so that the boat's hop plays again. */
  hop: number;
  /** Whether the whirlpool has just taken the boat: it is put down at START at once, not sailed there. */
  warp: boolean;
  label: string;
  onTap: () => void;
}

/** The 30 squares round the edge, drawn once for a bet: they change only with the bet, the boat and the lights. */
const Squares = memo(function Squares({ bet, lit, here, flash, t }: { bet: number; lit: readonly number[]; here: number | null; flash: boolean; t: SugorokuStrings }) {
  const litSet = new Set(lit);
  return (
    <ol className={styles.squares} aria-label={t.ringLabel}>
      {BOARD.map((square, s) => {
        const { x, y } = cellOf(s);
        const distance = square.to === null ? 0 : Math.abs(square.to - s) || BOARD_SIZE;
        const medals = square.kind === 'start' ? medalsFor(bet, LAP_PAYS) : medalsFor(bet, square.pays);
        const words = t.squareText(square.kind, distance);
        return (
          <li
            key={s}
            className={styles.square}
            data-kind={square.kind}
            data-lit={litSet.has(s) ? 'true' : 'false'}
            data-here={here === s ? 'true' : 'false'}
            data-flash={s === 0 && flash ? 'true' : 'false'}
            data-square={s}
            style={{ ...placed(x + 0.5, y + 0.5), '--i': s } as CSSProperties}
            aria-label={t.squareAria(s, square.kind, medals, square.to, here === s)}
          >
            <span className={styles.squareIcon} aria-hidden="true">
              <SquareIcon kind={square.kind} />
            </span>
            {square.kind === 'shell' || square.kind === 'pearl' ? (
              <span className={styles.squarePays} aria-hidden="true">
                +{medals}
              </span>
            ) : words ? (
              <span className={styles.squareWords} aria-hidden="true">
                {words}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
});

/** The board of the machine, with everything on it as `scene` has it. */
export function IslandBoard({ scene, bet, t, attract, calm, hop, warp, label, onTap }: IslandBoardProps) {
  const boat = scene.boat.on === 'board' ? cellOf(scene.boat.square) : null;
  const lane = scene.boat.on === 'lane' ? laneCell(scene.boat.step) : null;
  const boatAt = boat ? { x: boat.x + 0.5, y: boat.y + 0.5 } : lane!;
  const here = scene.boat.on === 'board' ? scene.boat.square : null;
  const laneLit = new Set(scene.laneLit);
  const lamps = scene.lamps.set ? lampsOf(scene.lamps.set) : null;
  const atBlowhole = scene.boat.on === 'lane' && scene.boat.step === BLOWHOLE;
  const bannerText = t.banner(scene.banner, bet);
  return (
    <div
      className={styles.board}
      data-testid="sg-board"
      data-phase={scene.phase}
      data-attract={attract ? 'true' : 'false'}
      data-calm={calm ? 'true' : 'false'}
      data-boat={scene.boat.on === 'board' ? scene.boat.square : `lane-${scene.boat.step}`}
      onClick={onTap}
    >
      <p className={styles.srOnly}>{label}</p>
      <Whale spout={atBlowhole || scene.phase === 'jp' || scene.phase === 'final'} />
      {/* The gangway from the whale's gate down to its back. */}
      <span className={styles.gangway} style={placed(4, 1.55, 0.3)} aria-hidden="true" />

      <Squares bet={bet} lit={scene.lit} here={scene.phase === 'idle' || scene.phase === 'done' ? here : null} flash={scene.lapFlash} t={t} />

      <ol className={styles.lane} aria-label={t.laneLabel}>
        {Array.from({ length: BLOWHOLE }, (_, i) => i + 1).map((step) => {
          const { x, y } = laneCell(step);
          const pays = step === BLOWHOLE ? 0 : LANE[step - 1];
          const medals = medalsFor(bet, pays);
          return (
            <li
              key={step}
              className={styles.stone}
              data-blowhole={step === BLOWHOLE ? 'true' : 'false'}
              data-big={pays > 1 ? 'true' : 'false'}
              data-lit={laneLit.has(step) ? 'true' : 'false'}
              style={placed(x, y, step === BLOWHOLE ? 0.78 : 0.64)}
              aria-label={t.laneAria(step, medals)}
            >
              <span aria-hidden="true">{step === BLOWHOLE ? 'JP' : `+${medals}`}</span>
            </li>
          );
        })}
      </ol>

      {/* The lamps round the dome: dark until a chance puts its prizes up on them. */}
      <div className={styles.lamps} data-set={scene.lamps.set ?? 'none'} data-stopped={scene.lamps.stopped ? 'true' : 'false'} data-testid="sg-lamps" data-lit={scene.lamps.lit ?? ''}>
        <span className={styles.srOnly}>{t.lampsLabel(scene.lamps.set)}</span>
        {Array.from({ length: LAMP_COUNT }, (_, i) => {
          const { x, y } = lampCell(i);
          const value = lamps ? lamps[i] : null;
          return (
            <span
              key={i}
              className={styles.lamp}
              data-lit={scene.lamps.lit === i ? 'true' : 'false'}
              data-star={value === STAR ? 'true' : 'false'}
              data-empty={value === 0 ? 'true' : 'false'}
              style={{ ...placed(x, y, 0.66), '--i': i } as CSSProperties}
              aria-hidden="true"
            >
              <span className={styles.lampText}>{value === null ? '' : value === STAR ? 'JP' : value === 0 ? '–' : timesOf(value)}</span>
            </span>
          );
        })}
      </div>

      {/* The dome, and the die tumbling in it. */}
      <div className={styles.dome} style={placed(CENTER.x, CENTER.y, 2.05)} data-rolling={scene.rolling ? 'true' : 'false'}>
        <span className={styles.domeGlass} aria-hidden="true" />
        <span className={styles.die} data-testid="sg-die" data-face={scene.face} data-rolling={scene.rolling ? 'true' : 'false'} role="img" aria-label={t.dieAria(scene.face, scene.rolling)}>
          <DieFace face={scene.face} className={styles.dieFace} />
        </span>
      </div>

      {/* The boat: moved from cell to cell by transform alone, each hop played again by its key. */}
      <span className={styles.boat} data-warp={warp ? 'true' : 'false'} style={{ '--bx': (boatAt.x - 0.5).toFixed(4), '--by': (boatAt.y - 0.5).toFixed(4) } as CSSProperties} data-testid="sg-boat" aria-hidden="true">
        <span key={hop} className={styles.boatHop} data-hop={hop > 0 && !calm && !warp ? 'true' : 'false'}>
          <Boat />
        </span>
      </span>

      {/* Words over the island: always there, shown only when they have something to say, so nothing moves when they do. */}
      <span className={styles.banner} data-testid="sg-banner" data-show={bannerText ? 'true' : 'false'} data-kind={scene.banner.kind} aria-hidden="true">
        {bannerText}
      </span>
    </div>
  );
}
