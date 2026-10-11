'use client';

import type { PusherStrings } from './i18n';
import { BOWL, CHAIN_GOAL, FEVER_SQUARE, ROULETTE, TIER_DIGITS, type Tier } from './lottery';
import {
  BOARD_SQUARES,
  BOWL_SHAPE,
  REEL_DIGITS,
  bowlBall,
  holeSpot,
  type BallSpot,
  type Banner,
  type BowlPoint,
  type ChestView,
  type ScreenState,
} from './screen';
import { MAX_STOCK } from './session';
import styles from './MedalPusher.module.css';

/** The digits the reels show before the first spin. */
export const IDLE_DIGITS: [number, number, number] = [3, 5, 8];

/** A reel's strip: the last digit, the nine digits, and the first two again, so the window always has a neighbour to show. */
const STRIP = [REEL_DIGITS[REEL_DIGITS.length - 1], ...REEL_DIGITS, REEL_DIGITS[0], REEL_DIGITS[1]];
/** How far down its window a reel's digit sits, in cells: the window shows a little of the digits above and below. */
const WINDOW_INSET = 0.3;

/** The CSS transform that puts `position` along REEL_DIGITS on the pay line. */
export const stripOffset = (position: number): string => `translateY(${(-(position + 1 - WINDOW_INSET) * 100) / STRIP.length}%)`;

/** Which prize a digit belongs to, for its colour on the reel. */
const tierOfDigit = (digit: number): Exclude<Tier, 'miss'> => (digit === 7 ? 'seven' : TIER_DIGITS.big.includes(digit) ? 'big' : 'small');

/** Where the dots of each face of a die sit, on a 3 × 3 grid counted from the top left. */
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

const Die = ({ face, rolling }: { face: number; rolling: boolean }) => (
  <svg className={styles.die} viewBox="0 0 100 100" data-rolling={rolling} data-testid="pusher-die" data-face={face}>
    <rect x="6" y="6" width="88" height="88" rx="18" fill="#fffdf5" stroke="#b8860b" strokeWidth="4" />
    {(PIPS[face] ?? []).map((cell) => (
      <circle key={cell} cx={26 + (cell % 3) * 24} cy={26 + Math.floor(cell / 3) * 24} r={face === 1 ? 13 : 9} fill={face === 1 ? '#d61f4c' : '#1b1140'} />
    ))}
  </svg>
);

const Chest = ({ view }: { view: ChestView }) => (
  <svg className={styles.chestArt} viewBox="0 0 120 100" aria-hidden>
    {view.state === 'open' && <ellipse cx="60" cy="46" rx="44" ry="20" fill="#fff3a8" opacity={view.chosen ? 0.95 : 0.35} />}
    <rect x="14" y="48" width="92" height="44" rx="6" fill="#8a4b12" stroke="#4a2504" strokeWidth="3" />
    <rect x="14" y="62" width="92" height="8" fill="#f6c544" />
    <rect x="52" y="56" width="16" height="20" rx="3" fill="#f6c544" stroke="#4a2504" strokeWidth="2" />
    {view.state === 'open' ? (
      <path d="M14 48 L24 14 L96 14 L106 48 L96 40 L24 40 Z" fill="#a85d18" stroke="#4a2504" strokeWidth="3" />
    ) : (
      <path d="M14 50 Q14 18 60 18 Q106 18 106 50 Z" fill="#a85d18" stroke="#4a2504" strokeWidth="3" />
    )}
    {view.state !== 'open' && <path d="M22 44 Q22 26 60 26 Q98 26 98 44" fill="none" stroke="#f6c544" strokeWidth="5" />}
  </svg>
);

/** The roulette as a wheel of twelve sectors, the lit one bright. A cross ends the run. */
const Wheel = ({ lit }: { lit: number }) => {
  const count = ROULETTE.length;
  const point = (index: number, radius: number) => {
    const angle = ((index / count) * 2 - 0.5) * Math.PI;
    return [50 + Math.cos(angle) * radius, 50 + Math.sin(angle) * radius];
  };
  return (
    <svg className={styles.wheel} viewBox="0 0 100 100" data-testid="pusher-wheel" data-lit={lit}>
      <circle cx="50" cy="50" r="49" fill="#12061f" stroke="#ffd65c" strokeWidth="1.5" />
      {ROULETTE.map((pocket, index) => {
        const [x1, y1] = point(index - 0.5, 47);
        const [x2, y2] = point(index + 0.5, 47);
        const [tx, ty] = point(index, 36);
        const on = lit === index;
        const stop = pocket === 'stop';
        return (
          <g key={index} data-pocket={index} data-lit={on}>
            <path
              d={`M50 50 L${x1.toFixed(2)} ${y1.toFixed(2)} A47 47 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`}
              fill={on ? (stop ? '#ff6b81' : '#ffd65c') : stop ? '#4a0d1c' : index % 2 === 0 ? '#2a1c5c' : '#1b1140'}
              stroke="#0a0520"
              strokeWidth="0.6"
            />
            <text x={tx} y={ty + 2.8} textAnchor="middle" fontSize={stop ? 9 : 7} fontWeight={900} fill={on ? '#1a1200' : stop ? '#ff9db1' : '#e6e0ff'}>
              {stop ? '×' : pocket}
            </text>
          </g>
        );
      })}
      <circle cx="50" cy="50" r="19" fill="#0a0520" stroke="#ffd65c" strokeWidth="1.5" />
    </svg>
  );
};

/** The bowl's drawing, in the units of its view box: its middle, its radius, the ball's, and the share of its size the ball loses as it sinks. */
const BOWL_VIEW = { middle: 50, radius: 46, ball: 3.9, sink: 0.3 } as const;

const inBowl = (point: BowlPoint): [number, number] => [BOWL_VIEW.middle + point.x * BOWL_VIEW.radius, BOWL_VIEW.middle + point.y * BOWL_VIEW.radius];

/** The SVG transform that draws the ball on `spot`. */
export function ballTransform(spot: BallSpot): string {
  const [x, y] = inBowl(spot);
  return `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${(1 - BOWL_VIEW.sink * spot.sunk).toFixed(3)})`;
}

/**
 * Where a hole's label is written: above the hole at the top, and out to the side of the two
 * below it, so that the ball does not cover it while it rests on the hole's lip.
 */
function labelSpot(hole: number): [number, number] {
  const [x, y] = inBowl(holeSpot(hole));
  const side = Math.sign(Math.round(x - BOWL_VIEW.middle));
  return side === 0 ? [x, y - 15.6] : [x + side * 17, y - 3];
}

/**
 * The jackpot challenge: a bowl seen from above with a hole for each prize.
 * The ball is moved by whoever it is registered with; here it only waits where it is let go.
 */
const Bowl = ({ hole, jackpot, registerBall }: { hole: number; jackpot: string; registerBall: (element: SVGGElement | null) => void }) => (
  <svg className={styles.bowl} viewBox="0 0 100 100" data-testid="pusher-bowl" data-landed={hole}>
    <circle cx="50" cy="50" r="49" fill="#12061f" stroke="#ffd65c" strokeWidth="1.5" />
    <circle cx="50" cy="50" r={BOWL_VIEW.radius} fill="#2a1c5c" stroke="#0a0520" strokeWidth="0.6" />
    {/* The floor the holes are in, out to where the ball runs round them. */}
    <circle cx="50" cy="50" r={((BOWL_SHAPE.ring + BOWL_SHAPE.lip) * BOWL_VIEW.radius + BOWL_VIEW.ball).toFixed(2)} fill="#1b1140" />
    {BOWL.map((prize, index) => {
      const [cx, cy] = inBowl(holeSpot(index));
      const [tx, ty] = labelSpot(index);
      const best = prize === 'jackpot';
      const on = hole === index;
      const size = best ? 6.5 : 7.5;
      return (
        <g key={index} data-hole={index} data-in={on}>
          <circle
            cx={cx.toFixed(2)}
            cy={cy.toFixed(2)}
            r={(BOWL_SHAPE.hole * BOWL_VIEW.radius).toFixed(2)}
            fill={on ? (best ? '#ffd65c' : '#ff6b81') : '#05020f'}
            stroke={best ? '#ffd65c' : '#ff9db1'}
            strokeWidth="1.2"
          />
          <text x={tx.toFixed(2)} y={(ty + size * 0.36).toFixed(2)} textAnchor="middle" fontSize={size} fontWeight={900} fill={best ? '#ffe98a' : '#ffe0f1'}>
            {best ? jackpot : prize}
          </text>
        </g>
      );
    })}
    <g ref={registerBall} transform={ballTransform(bowlBall(0, 0))} data-testid="pusher-bowl-ball">
      <circle r={BOWL_VIEW.ball} fill="#f4f4fb" stroke="#4a4a66" strokeWidth="0.6" />
      <circle cx={(-BOWL_VIEW.ball * 0.3).toFixed(2)} cy={(-BOWL_VIEW.ball * 0.34).toFixed(2)} r={(BOWL_VIEW.ball * 0.3).toFixed(2)} fill="#ffffff" />
    </g>
  </svg>
);

export interface ScreenProps {
  state: ScreenState;
  stock: number;
  strings: PusherStrings;
  /** Hands the screen's three reel strips to whoever drives them. */
  registerStrip: (reel: number, element: HTMLDivElement | null) => void;
  /** Hands over the ball in the bowl, while the bowl is on. */
  registerBall: (element: SVGGElement | null) => void;
  onPick: (chest: number) => void;
}

/** The headline for a banner, in the machine's own words. */
export function bannerText(state: ScreenState, t: PusherStrings): string | null {
  const text: Record<Banner, string | null> = {
    none: null,
    reach: t.reach,
    line: state.line === 'big' ? t.chestTitle : t.sugorokuTitle,
    ball: t.ballWin,
    medals: t.spinWin(state.amount),
    towers: t.towerWin(state.amount),
    fever: t.feverWin(state.amount),
    finish: t.finishWin(state.amount),
    jackpot: t.jackpotWon(state.amount),
  };
  return text[state.banner];
}

/** The centre screen: the slot, the three games it leads to, and the sugoroku board along the bottom. */
export const Screen = ({ state, stock, strings: t, registerStrip, registerBall, onPick }: ScreenProps) => {
  const banner = bannerText(state, t);
  const titles: Record<ScreenState['mode'], string> = {
    slot: t.slotName,
    sugoroku: t.sugorokuTitle,
    chest: t.chestTitle,
    roulette: t.chance,
    bowl: t.challenge,
  };
  const title = titles[state.mode];
  const choosing = state.mode === 'chest' && state.chests?.every((chest) => chest.state === 'closed');
  return (
    <div className={styles.screen} role="group" aria-label={t.screenAria} data-mode={state.mode} data-banner={state.banner} data-testid="pusher-screen">
      <div className={styles.rays} aria-hidden />
      <div className={styles.screenTop}>
        <span className={styles.screenTitle} data-testid="pusher-mode">
          {title}
        </span>
        <div className={styles.stock} role="img" aria-label={t.stockAria(stock, MAX_STOCK)} data-testid="pusher-stock" data-held={stock}>
          <span className={styles.stockLabel} aria-hidden>
            {t.stock}
          </span>
          {Array.from({ length: MAX_STOCK }, (_, index) => (
            <span key={index} className={styles.lamp} data-lit={index < stock} aria-hidden />
          ))}
        </div>
      </div>

      <div className={styles.stage}>
        <div className={styles.reels} aria-hidden data-hidden={state.mode !== 'slot'} data-line={state.line ?? 'none'}>
          {IDLE_DIGITS.map((idle, reel) => (
            <div key={reel} className={styles.reel}>
              <div className={styles.strip} ref={(element) => registerStrip(reel, element)} style={{ transform: stripOffset(idle - 1) }}>
                {STRIP.map((digit, index) => (
                  <span key={index} className={styles.digit} data-tier={tierOfDigit(digit)}>
                    {digit}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {state.mode === 'sugoroku' && (
          <div className={styles.bonus} aria-hidden>
            {state.die > 0 ? <Die face={state.die} rolling={state.rolling} /> : <span className={styles.bonusHint}>{t.sugorokuRolling}</span>}
            {state.die > 0 && !state.rolling && <span className={styles.bonusHint}>{t.sugorokuMove(state.die)}</span>}
          </div>
        )}

        {state.mode === 'chest' && state.chests && (
          <div className={styles.bonus}>
            <div className={styles.chests} role="group" aria-label={t.chestPrompt}>
              {state.chests.map((chest, index) => (
                <button
                  key={index}
                  type="button"
                  className={styles.chest}
                  data-state={chest.state}
                  data-chosen={chest.chosen}
                  data-testid={`pusher-chest-${index}`}
                  disabled={!choosing}
                  aria-label={chest.prize === null ? t.chestName(index + 1) : t.chestHeld(index + 1, chest.prize)}
                  onClick={() => onPick(index)}
                >
                  <Chest view={chest} />
                  <span className={styles.chestPrize}>{chest.prize ?? '?'}</span>
                </button>
              ))}
            </div>
            {choosing && (
              <span className={styles.bonusHint} data-testid="pusher-countdown">
                {t.chestCountdown(state.secondsLeft)}
              </span>
            )}
          </div>
        )}

        {(state.mode === 'roulette' || state.mode === 'bowl') && (
          <div className={styles.bonus} data-row="true" aria-hidden>
            {state.mode === 'bowl' ? <Bowl hole={state.hole} jackpot={t.jackpot} registerBall={registerBall} /> : <Wheel lit={state.lit} />}
            <div className={styles.chain} data-testid="pusher-chain" data-level={state.level}>
              <span className={styles.chainLabel}>{t.chainLevel(state.level, CHAIN_GOAL)}</span>
              <span className={styles.chainLamps}>
                {Array.from({ length: CHAIN_GOAL }, (_, index) => (
                  <span key={index} className={styles.lamp} data-lit={index < state.level} data-goal={index === CHAIN_GOAL - 1} />
                ))}
              </span>
              <span className={styles.chainTotal}>{t.chainTotal(state.total)}</span>
            </div>
          </div>
        )}
      </div>

      <div className={styles.caption} aria-hidden data-testid="pusher-caption">
        {banner ? (
          <span className={styles.banner} data-banner={state.banner}>
            {banner}
          </span>
        ) : (
          <span className={styles.legend}>
            <span data-tier="seven">{t.legendSeven}</span>
            <span data-tier="big">{t.legendOdd}</span>
            <span data-tier="small">{t.legendEven}</span>
          </span>
        )}
      </div>

      <ol className={styles.board} aria-label={t.boardAria(state.square + 1, BOARD_SQUARES[state.square])} data-testid="pusher-board" data-square={state.square}>
        {BOARD_SQUARES.map((medals, index) => (
          <li key={index} className={styles.square} data-here={index === state.square} data-fever={index === FEVER_SQUARE} aria-hidden>
            {index === FEVER_SQUARE ? <span className={styles.squareTag}>{t.feverTag}</span> : null}
            {medals}
          </li>
        ))}
      </ol>
    </div>
  );
};
