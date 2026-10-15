'use client';

import { memo, useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import { MEDAL_PAINT } from '../MedalPusher/medalLook';
import { DieFace } from './Dice';
import { HARD_PAYS, LAY_ODDS, ONE_ROLL_PAYS, PLACE_PAYS, TRUE_ODDS, hardNumber, maxOdds, placeNumber, type BetId, type Bets, type PointNumber, type Ratio } from './engine';
import type { CrapsStrings } from './i18n';
import { pressAmount, stakeStep } from './medalTable';
import { TABLES, mirrored, share, type Box, type Felt, type LiveArea, type TableKind, type TableLayout } from './tableLayout';
import { diceAt, planThrow, restOf, type DieState, type ThrowPlan } from './throwPhysics';
import { playThrowSound } from './throwSounds';
import styles from './Craps.module.css';

/** A throw to show: the roll the game drew, the seed its look is made from, and how it is shown. */
export interface ShownThrow {
  /** A new number for every throw. */
  id: number;
  faces: readonly [number, number];
  seed: number;
  /**
   * `animate`: thrown from the hand, flying, hitting the wall, coming to rest.
   * `quick`: at rest at once. `calm` (reduced motion): at rest, faded in.
   * `rest`: at rest, as it was left (after a reload), with nothing to settle.
   */
  mode: 'animate' | 'quick' | 'calm' | 'rest';
}

export interface CrapsFeltProps {
  bets: Bets;
  point: PointNumber | null;
  /** The BET size a press puts on: areas it cannot go on now are dimmed. */
  size: number;
  canPlay: boolean;
  onPress: (id: BetId) => void;
  t: CrapsStrings;
  language: 'en' | 'ja';
  shown: ShownThrow | null;
  /** The throw `id` has come to rest. */
  onSettled: (id: number) => void;
  sound: boolean;
}

const ratioText = ([n, d]: Ratio) => `${n}:${d}`;
const toText = ([n, d]: Ratio) => (d === 1 ? `${n} TO 1` : `${n} FOR ${d}`);
const KINDS: TableKind[] = ['half', 'full'];
/** How long the dice take to fade in where motion is reduced, in milliseconds. */
const CALM_MS = 260;

/** What each area pays, as the game shows it. */
function paysOf(id: BetId, point: PointNumber | null, t: CrapsStrings): string {
  const place = placeNumber(id);
  if (place !== null) return ratioText(PLACE_PAYS[place]);
  const hard = hardNumber(id);
  if (hard !== null) return ratioText(HARD_PAYS[hard]);
  switch (id) {
    case 'passOdds':
      return point === null ? t.trueOdds : ratioText(TRUE_ODDS[point]);
    case 'dontPassOdds':
      return point === null ? t.trueOdds : ratioText(LAY_ODDS[point]);
    case 'field':
      return t.fieldNote;
    case 'dontPass':
      return '1:1 · Bar 12';
    case 'any7':
    case 'anyCraps':
    case 'yo':
    case 'aces':
    case 'twelve':
      return ratioText(ONE_ROLL_PAYS[id]);
    default:
      return '1:1';
  }
}

// ── The felt's art ─────────────────────────────────────────────────────────

/** A die as the felt prints it: a white rounded square with its pips. */
const PrintedDie = ({ x, y, size, value }: { x: number; y: number; size: number; value: number }) => {
  const pips: Record<number, [number, number][]> = {
    1: [[0.5, 0.5]],
    2: [[0.28, 0.28], [0.72, 0.72]],
    3: [[0.26, 0.26], [0.5, 0.5], [0.74, 0.74]],
    4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
    5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
    6: [[0.28, 0.24], [0.72, 0.24], [0.28, 0.5], [0.72, 0.5], [0.28, 0.76], [0.72, 0.76]],
  };
  return (
    <g>
      <rect x={x} y={y} width={size} height={size} rx={size * 0.2} fill="#c8102e" stroke="#ffffff" strokeWidth={size * 0.06} />
      {pips[value].map(([px, py], i) => (
        <circle key={i} cx={x + px * size} cy={y + py * size} r={size * 0.085} fill="#ffffff" />
      ))}
    </g>
  );
};

const PrintedPair = ({ cx, y, size, values }: { cx: number; y: number; size: number; values: [number, number] }) => (
  <g>
    <PrintedDie x={cx - size - size * 0.08} y={y} size={size} value={values[0]} />
    <PrintedDie x={cx + size * 0.08} y={y} size={size} value={values[1]} />
  </g>
);

const LINE = 'rgba(255, 255, 255, 0.86)';
const GOLD = '#ffd65c';
const RED = '#ff5a4f';

/** Words on the felt: English as a real felt has them, and Japanese help under them for a Japanese reader. */
function Words({ box, main, help, language, size, color = '#ffffff', at = 0.5, helpSize }: { box: Box; main: string; help?: string; language: 'en' | 'ja'; size: number; color?: string; at?: number; helpSize: number }) {
  const showHelp = language === 'ja' && help;
  const cy = box.y + box.h * at;
  return (
    <g>
      <text x={box.x + box.w / 2} y={showHelp ? cy - helpSize * 0.35 : cy} fontSize={size} fill={color} fontWeight={850} textAnchor="middle" dominantBaseline="middle" letterSpacing="0.04em">
        {main}
      </text>
      {showHelp && (
        <text x={box.x + box.w / 2} y={cy + size * 0.55} fontSize={helpSize} fill="rgba(255,255,255,0.86)" fontWeight={700} textAnchor="middle" dominantBaseline="middle">
          {help}
        </text>
      )}
    </g>
  );
}

/** The art of one betting area. */
function AreaArt({ area, layout, t, language, stroke, muted = false }: { area: LiveArea; layout: Felt; t: CrapsStrings; language: 'en' | 'ja'; stroke: number; muted?: boolean }) {
  const { box } = area;
  const { number, label, small } = layout.type;
  const outline = <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="none" stroke={LINE} strokeWidth={stroke} />;
  const place = placeNumber(area.id);
  if (place !== null) {
    const step = stakeStep(area.id, null);
    return (
      <g opacity={muted ? 0.55 : 1}>
        {outline}
        <text
          x={box.x + box.w / 2}
          y={box.y + box.h * 0.4}
          fontSize={place === 6 || place === 9 ? Math.min(number, box.w * 0.34) : Math.min(number, box.w * 0.62)}
          fill="#ffffff"
          fontWeight={900}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {place === 6 ? 'SIX' : place === 9 ? 'NINE' : place}
        </text>
        {!muted && (
          <>
            <text x={box.x + box.w / 2} y={box.y + box.h * 0.72} fontSize={small} fill="rgba(255,255,255,0.9)" fontWeight={700} textAnchor="middle" dominantBaseline="middle">
              {ratioText(PLACE_PAYS[place])}
            </text>
            <text x={box.x + box.w / 2} y={box.y + box.h * 0.88} fontSize={small * 0.92} fill={GOLD} fontWeight={800} textAnchor="middle" dominantBaseline="middle">
              {t.stepTag(step)}
            </text>
          </>
        )}
      </g>
    );
  }
  const hard = hardNumber(area.id);
  if (hard !== null) {
    const die = Math.min(box.h * 0.32, box.w * 0.2);
    return (
      <g>
        {outline}
        <PrintedPair cx={box.x + box.w / 2} y={box.y + box.h * 0.12} size={die} values={[hard / 2, hard / 2]} />
        <text x={box.x + box.w / 2} y={box.y + box.h * 0.66} fontSize={label * 0.95} fill={GOLD} fontWeight={850} textAnchor="middle" dominantBaseline="middle">
          {toText(HARD_PAYS[hard])}
        </text>
        {language === 'ja' && (
          <text x={box.x + box.w / 2} y={box.y + box.h * 0.86} fontSize={small} fill="rgba(255,255,255,0.86)" fontWeight={700} textAnchor="middle" dominantBaseline="middle">
            {t.betName[area.id]}
          </text>
        )}
      </g>
    );
  }
  switch (area.id) {
    case 'field': {
      const numbers = [2, 3, 4, 9, 10, 11, 12];
      const left = box.x + box.w * 0.16;
      const span = box.w * 0.8;
      return (
        <g>
          {outline}
          <text x={box.x + box.w * 0.085} y={box.y + box.h / 2} fontSize={label * 0.95} fill="#ffffff" fontWeight={900} textAnchor="middle" dominantBaseline="middle">
            FIELD
          </text>
          {numbers.map((n, i) => {
            const cx = left + (span * (i + 0.5)) / numbers.length;
            const cy = box.y + box.h * 0.42;
            return (
              <g key={n}>
                {(n === 2 || n === 12) && <circle cx={cx} cy={cy} r={label * 0.95} fill="none" stroke={GOLD} strokeWidth={stroke} />}
                <text x={cx} y={cy} fontSize={label * 1.1} fill={GOLD} fontWeight={900} textAnchor="middle" dominantBaseline="middle">
                  {n}
                </text>
              </g>
            );
          })}
          <text x={left + span / 2} y={box.y + box.h * 0.84} fontSize={small} fill="#ffffff" fontWeight={700} textAnchor="middle" dominantBaseline="middle">
            {language === 'ja' ? '2 は 2 倍 · 12 は 3 倍' : '2 PAYS DOUBLE · 12 PAYS TRIPLE'}
          </text>
        </g>
      );
    }
    case 'dontPass': {
      const die = box.h * 0.46;
      return (
        <g>
          {outline}
          <Words box={{ ...box, w: box.w * 0.7 }} main="DON'T PASS BAR" help="ドントパス" language={language} size={label * 0.92} helpSize={small} />
          <PrintedPair cx={box.x + box.w * 0.84} y={box.y + (box.h - die) / 2} size={die} values={[6, 6]} />
        </g>
      );
    }
    case 'pass': {
      const [turn] = area.more ?? [];
      return (
        <g>
          {/* The Pass Line: along the near rail and round the end, by the wall, as one band. */}
          <path
            d={`M ${box.x + box.w} ${box.y} H ${turn.x + turn.w} V ${turn.y} H ${turn.x} V ${box.y + box.h} H ${box.x + box.w} Z`}
            fill="rgba(255,255,255,0.05)"
            stroke={LINE}
            strokeWidth={stroke}
          />
          <Words box={box} main="PASS LINE" help="パスライン" language={language} size={label * 1.25} helpSize={small} />
          <text
            x={turn.x + turn.w / 2}
            y={turn.y + turn.h / 2}
            fontSize={label}
            fill="#ffffff"
            fontWeight={900}
            letterSpacing="0.12em"
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(-90 ${turn.x + turn.w / 2} ${turn.y + turn.h / 2})`}
          >
            PASS LINE
          </text>
        </g>
      );
    }
    case 'passOdds':
    case 'dontPassOdds':
      return (
        <g>
          <rect x={box.x + stroke} y={box.y + stroke} width={box.w - 2 * stroke} height={box.h - 2 * stroke} fill="none" stroke={LINE} strokeWidth={stroke * 0.8} strokeDasharray={`${stroke * 3} ${stroke * 2.5}`} />
          <text x={box.x + box.w / 2} y={box.y + box.h * 0.3} fontSize={small * 1.05} fill="#ffffff" fontWeight={850} textAnchor="middle" dominantBaseline="middle">
            {area.id === 'passOdds' ? t.oddsShort : t.layShort}
          </text>
        </g>
      );
    case 'any7':
      return (
        <g>
          {outline}
          <Words box={box} main={`SEVEN  ${toText(ONE_ROLL_PAYS.any7)}`} help="エニーセブン" language={language} size={label} color={RED} helpSize={small} />
        </g>
      );
    case 'anyCraps':
      return (
        <g>
          {outline}
          <Words box={box} main={`ANY CRAPS  ${toText(ONE_ROLL_PAYS.anyCraps)}`} help="エニークラップス" language={language} size={label} color={RED} helpSize={small} />
        </g>
      );
    case 'aces':
    case 'yo':
    case 'twelve': {
      const values: [number, number] = area.id === 'aces' ? [1, 1] : area.id === 'yo' ? [5, 6] : [6, 6];
      const die = Math.min(box.h * 0.36, box.w * 0.2);
      return (
        <g>
          {outline}
          <PrintedPair cx={box.x + box.w / 2} y={box.y + box.h * 0.1} size={die} values={values} />
          <text x={box.x + box.w / 2} y={box.y + box.h * 0.74} fontSize={small * 1.05} fill={GOLD} fontWeight={850} textAnchor="middle" dominantBaseline="middle">
            {toText(ONE_ROLL_PAYS[area.id])}
          </text>
        </g>
      );
    }
    default:
      return outline;
  }
}

/** What a real felt has printed that this table does not take: Come and Don't Come. */
function PrintedArt({ id, box, layout, language, stroke }: { id: 'come' | 'dontCome'; box: Box; layout: Felt; language: 'en' | 'ja'; stroke: number }) {
  const { label, small } = layout.type;
  if (id === 'come') {
    return (
      <g>
        <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="none" stroke={LINE} strokeWidth={stroke} />
        <Words box={box} main="COME" help="カム（このテーブルではなし）" language={language} size={label * 2.1} color={RED} helpSize={small} />
      </g>
    );
  }
  const die = box.h * 0.6;
  return (
    <g>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="none" stroke={LINE} strokeWidth={stroke} />
      <text x={box.x + box.w * 0.42} y={box.y + box.h / 2} fontSize={small * 1.05} fill="#ffffff" fontWeight={850} textAnchor="middle" dominantBaseline="middle" letterSpacing="0.06em">
        DON&apos;T COME BAR
      </text>
      <PrintedPair cx={box.x + box.w * 0.78} y={box.y + (box.h - die) / 2} size={die} values={[6, 6]} />
    </g>
  );
}

/** The rubber that lines an end wall: rows of small pyramids, lit from the top left. */
const Rubber = ({ box, id }: { box: Box; id: string }) => {
  const cell = box.w;
  return (
    <g>
      <defs>
        <pattern id={id} width={cell} height={cell} patternUnits="userSpaceOnUse" x={box.x} y={box.y}>
          <rect width={cell} height={cell} fill="#1d1d22" />
          <path d={`M0 0 L${cell / 2} ${cell / 2} L0 ${cell} Z`} fill="#4a4a52" />
          <path d={`M0 0 L${cell} 0 L${cell / 2} ${cell / 2} Z`} fill="#5d5d66" />
          <path d={`M${cell} 0 L${cell} ${cell} L${cell / 2} ${cell / 2} Z`} fill="#141417" />
          <path d={`M0 ${cell} L${cell / 2} ${cell / 2} L${cell} ${cell} Z`} fill="#0c0c0e" />
        </pattern>
      </defs>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={`url(#${id})`} />
    </g>
  );
};

/** The tub: rail, felt, the far wall's rubber, and every area's art. */
const TubArt = memo(function TubArt({ layout, t, language }: { layout: TableLayout; t: CrapsStrings; language: 'en' | 'ja' }) {
  const stroke = layout.kind === 'full' ? 2.4 : 1.4;
  const { width, height, rail } = layout;
  const gradient = `craps-felt-${layout.kind}`;
  const wood = `craps-rail-${layout.kind}`;
  return (
    <svg className={styles.tableArt} viewBox={`0 0 ${width} ${height}`} aria-hidden focusable="false">
      <defs>
        <radialGradient id={gradient} cx="45%" cy="50%" r="75%">
          <stop offset="0%" stopColor="#13894c" />
          <stop offset="70%" stopColor="#0b6b3a" />
          <stop offset="100%" stopColor="#07502b" />
        </radialGradient>
        <linearGradient id={wood} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7a4a1e" />
          <stop offset="55%" stopColor="#5b3716" />
          <stop offset="100%" stopColor="#3d240c" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={width} height={height} rx={rail * 1.6} fill={`url(#${wood})`} />
      <rect x={rail * 0.35} y={rail * 0.35} width={width - rail * 0.7} height={height - rail * 0.7} rx={rail * 1.2} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={rail * 0.12} />
      <rect x={rail} y={rail} width={width - 2 * rail} height={height - 2 * rail} rx={rail * 0.5} fill={`url(#${gradient})`} />
      <Rubber box={layout.rubber} id={`craps-rubber-${layout.kind}`} />
      {layout.nearRubber && <Rubber box={layout.nearRubber} id={`craps-rubber-near-${layout.kind}`} />}
      {layout.printed.map((area) => (
        <PrintedArt key={area.id} id={area.id} box={area.box} layout={layout} language={language} stroke={stroke} />
      ))}
      {layout.live.map((area) => (
        <AreaArt key={area.id} area={area} layout={layout} t={t} language={language} stroke={stroke} />
      ))}
      {layout.middle && (
        <g>
          <rect x={layout.middle.x - 4} y={layout.middle.y - 4} width={layout.middle.w + 8} height={layout.middle.h + 8} fill="none" stroke={GOLD} strokeWidth={stroke} rx={8} />
          <text x={layout.middle.x + layout.middle.w / 2} y={layout.middle.y + layout.middle.h - 34} fontSize={layout.type.small} fill="rgba(255,255,255,0.8)" fontWeight={800} textAnchor="middle" letterSpacing="0.12em">
            {language === 'ja' ? 'プロポジション' : 'PROPOSITION BETS'}
          </text>
          <text x={layout.middle.x + layout.middle.w / 2} y={layout.middle.y + layout.middle.h - 14} fontSize={layout.type.small * 0.9} fill="rgba(255,255,255,0.65)" fontWeight={700} textAnchor="middle" letterSpacing="0.1em">
            STICKMAN
          </text>
        </g>
      )}
      {layout.mirror && (
        /* The other end: the same layout, for the players who stand there. Nothing is bet on it here. */
        <g opacity={0.5} data-testid="craps-other-end">
          {layout.printed.map((area) => (
            <PrintedArt key={area.id} id={area.id} box={mirrored(layout, area.box)} layout={layout} language="en" stroke={stroke} />
          ))}
          {layout.live
            .filter((area) => !layout.middle || area.box.x + area.box.w <= layout.middle.x)
            .map((area) => (
              <AreaArt
                key={area.id}
                area={{ ...area, box: mirrored(layout, area.box), more: area.more?.map((box) => mirrored(layout, box)) }}
                layout={layout}
                t={t}
                language="en"
                stroke={stroke}
                muted
              />
            ))}
        </g>
      )}
    </svg>
  );
});

/** The stickman's box under a half table: the proposition bets on a felt of their own. */
const CenterArt = memo(function CenterArt({ felt, t, language }: { felt: Felt; t: CrapsStrings; language: 'en' | 'ja' }) {
  const { width, height, rail } = felt;
  return (
    <svg className={styles.tableArt} viewBox={`0 0 ${width} ${height}`} aria-hidden focusable="false">
      <rect x={0} y={0} width={width} height={height} rx={rail * 1.6} fill="#5b3716" />
      <rect x={rail * 0.5} y={rail * 0.5} width={width - rail} height={height - rail} rx={rail} fill="#0b6b3a" />
      {felt.live.map((area) => (
        <AreaArt key={area.id} area={area} layout={felt} t={t} language={language} stroke={1.4} />
      ))}
    </svg>
  );
});

// ── Medals on the layout ───────────────────────────────────────────────────

/** A stack of medals, taller for more of them: the medal center's silver. */
const MedalPile = ({ count }: { count: number }) => {
  const layers = Math.min(7, 1 + Math.floor(Math.log2(count)));
  return (
    <svg className={styles.pile} viewBox={`0 0 24 ${12 + layers * 3}`} aria-hidden focusable="false">
      {Array.from({ length: layers }, (_, i) => {
        const y = 12 + (layers - 1 - i) * 3;
        const top = i === layers - 1;
        return (
          <g key={i}>
            <ellipse cx="12" cy={y + 1.6} rx="10.5" ry="4.4" fill={MEDAL_PAINT.edge} />
            <ellipse cx="12" cy={y} rx="10.5" ry="4.4" fill={top ? MEDAL_PAINT.face : MEDAL_PAINT.dark} stroke={MEDAL_PAINT.rim} strokeWidth="0.6" />
            {top && <ellipse cx="10" cy={y - 1.2} rx="5" ry="1.4" fill={MEDAL_PAINT.light} opacity="0.8" />}
          </g>
        );
      })}
    </svg>
  );
};

interface AreasProps {
  felt: Felt;
  areas: LiveArea[];
  props: CrapsFeltProps;
}

/** The areas a player taps, over the art: one button per bet, with the medals on it. */
function Areas({ felt, areas, props }: AreasProps) {
  const { bets, point, size, canPlay, onPress, t } = props;
  return (
    <>
      {areas.map((area) => {
        const amount = bets[area.id] ?? 0;
        const step = stakeStep(area.id, point);
        const pays = paysOf(area.id, point, t);
        const unavailable = 'error' in pressAmount(area.id, size, point, bets);
        const off = amount > 0 && point === null && (placeNumber(area.id) !== null || hardNumber(area.id) !== null);
        const odds = area.id === 'passOdds' || area.id === 'dontPassOdds' ? maxOdds(area.id, point, bets) : 0;
        return (
          <div key={area.id} className={styles.areaGroup}>
            <button
              type="button"
              className={`${styles.area} ${area.box.w > area.box.h * 2.4 ? styles.areaWide : ''} ${unavailable ? styles.areaUnavailable : ''}`}
              style={share(felt, area.box)}
              onClick={() => onPress(area.id)}
              disabled={!canPlay}
              aria-label={t.betAria(t.betName[area.id], pays, amount, step)}
              data-bet={area.id}
              data-step={step}
            >
              {odds > 0 && <span className={styles.areaMax}>{t.oddsMax(odds)}</span>}
              {amount > 0 && (
                <span className={styles.areaMedals} data-amount={amount}>
                  <MedalPile count={amount} />
                  <span className={styles.areaCount}>{amount}</span>
                  {off && <span className={styles.areaOff}>{t.puckOff}</span>}
                </span>
              )}
            </button>
            {area.more?.map((box, i) => (
              /* The rest of the same area (the Pass Line's turn up the end): the same bet, by touch or mouse. */
              <button
                key={i}
                type="button"
                tabIndex={-1}
                aria-hidden
                className={`${styles.area} ${unavailable ? styles.areaUnavailable : ''}`}
                style={share(felt, box)}
                onClick={() => onPress(area.id)}
                disabled={!canPlay}
                data-bet-part={area.id}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

// ── The dice ───────────────────────────────────────────────────────────────

interface DiceRefs {
  dice: (HTMLDivElement | null)[];
  shadows: (HTMLDivElement | null)[];
  scale: number;
}

/** The dice as they lie in the hand before the first throw. */
const inHand = (layout: TableLayout): readonly [DieState, DieState] => {
  const { hand, die } = layout.throw;
  return [
    { x: hand.x - 0.35 * die, y: hand.y - 0.75 * die, z: 0, angle: -12, face: 5 },
    { x: hand.x + 0.35 * die, y: hand.y + 0.75 * die, z: 0, angle: 9, face: 2 },
  ];
};

function place(layout: TableLayout, refs: DiceRefs, states: readonly [DieState, DieState]) {
  const { scale } = refs;
  if (scale <= 0) return;
  const size = layout.throw.die * scale;
  states.forEach((state, i) => {
    const die = refs.dice[i];
    const shadow = refs.shadows[i];
    const lift = state.z / layout.throw.die;
    if (die) {
      die.style.width = `${size}px`;
      die.style.height = `${size}px`;
      die.style.transform = `translate3d(${(state.x * scale - size / 2).toFixed(2)}px, ${(state.y * scale - size / 2).toFixed(2)}px, 0) rotate(${state.angle.toFixed(1)}deg) scale(${(1 + lift * 0.14).toFixed(3)})`;
      if (die.dataset.face !== String(state.face)) die.dataset.face = String(state.face);
    }
    if (shadow) {
      shadow.style.width = `${size}px`;
      shadow.style.height = `${size}px`;
      shadow.style.transform = `translate3d(${((state.x + state.z * 0.45) * scale - size / 2).toFixed(2)}px, ${((state.y + state.z * 0.7) * scale - size / 2).toFixed(2)}px, 0) rotate(${state.angle.toFixed(1)}deg)`;
      shadow.style.opacity = String(Math.max(0.12, 0.55 - lift * 0.12));
    }
  });
}

/** One table: the tub (and, on a phone, the stickman's box under it). */
function TableView({ layout, props, refs, label }: { layout: TableLayout; props: CrapsFeltProps; refs: RefObject<Record<TableKind, DiceRefs>>; label: string }) {
  const { point, t, language } = props;
  const tub = layout.live;
  const puckBox = point === null ? null : tub.find((area) => area.id === `place${point}`)?.box;
  const puck = puckBox ? { x: puckBox.x + puckBox.w / 2, y: puckBox.y + layout.puck * 0.62 } : layout.puckOff;
  return (
    <div className={styles.tableView} data-table-kind={layout.kind}>
      <div className={styles.tub} style={{ aspectRatio: `${layout.width} / ${layout.height}` }} data-testid={`craps-tub-${layout.kind}`}>
        <TubArt layout={layout} t={t} language={language} />
        <Areas felt={layout} areas={tub} props={props} />
        <span
          className={`${styles.tablePuck} ${point === null ? styles.tablePuckOff : styles.tablePuckOn}`}
          style={{ left: `${(puck.x / layout.width) * 100}%`, top: `${(puck.y / layout.height) * 100}%`, width: `${(layout.puck / layout.width) * 100}%` }}
          data-testid={point === null ? undefined : 'craps-puck'}
          aria-hidden
        >
          {point === null ? t.puckOff : t.puckOn}
        </span>
        <div className={styles.diceLayer} aria-hidden>
          {[0, 1].map((i) => (
            <div
              key={`shadow-${i}`}
              ref={(element) => {
                refs.current[layout.kind].shadows[i] = element;
              }}
              className={styles.tableDieShadow}
            />
          ))}
          {[0, 1].map((i) => (
            <div
              key={`die-${i}`}
              ref={(element) => {
                refs.current[layout.kind].dice[i] = element;
              }}
              className={styles.tableDie}
              data-die={i}
              data-face={i === 0 ? 5 : 2}
            >
              {[1, 2, 3, 4, 5, 6].map((value) => (
                <DieFace key={value} value={value} className={styles.dieFace} />
              ))}
            </div>
          ))}
        </div>
        <span className={styles.srOnly} data-testid="craps-dice">
          {label}
        </span>
      </div>
      {layout.center && (
        <div className={styles.centerBox} style={{ aspectRatio: `${layout.center.width} / ${layout.center.height}` }}>
          <CenterArt felt={layout.center} t={t} language={language} />
          <Areas felt={layout.center} areas={layout.center.live} props={props} />
        </div>
      )}
    </div>
  );
}

/**
 * The craps table: a full table on a desk and a half one on a phone (CSS
 * shows the one that fits), the layout the player bets on, and the dice,
 * thrown down the felt to land on the roll the game drew.
 */
export function CrapsFelt(props: CrapsFeltProps) {
  const { shown, onSettled, sound } = props;
  const refs = useRef<Record<TableKind, DiceRefs>>({ half: { dice: [], shadows: [], scale: 0 }, full: { dice: [], shadows: [], scale: 0 } });
  const wrapper = useRef<HTMLDivElement | null>(null);
  /** What each table shows now: a throw at a moment, at rest, or the dice in the hand. */
  const pose = useRef<{ plans: Record<TableKind, ThrowPlan> | null; t: number }>({ plans: null, t: Infinity });
  const settledRef = useRef(onSettled);
  const soundRef = useRef(sound);
  useEffect(() => {
    settledRef.current = onSettled;
    soundRef.current = sound;
  }, [onSettled, sound]);

  const faces = shown?.faces;
  const seed = shown?.seed;
  const plans = useMemo(
    () =>
      faces && seed !== undefined
        ? { half: planThrow(faces, TABLES.half.throw, seed), full: planThrow(faces, TABLES.full.throw, seed) }
        : null,
    [faces, seed],
  );

  const draw = useCallback(() => {
    const { plans: current, t } = pose.current;
    for (const kind of KINDS) {
      const layout = TABLES[kind];
      const states = current ? (Number.isFinite(t) ? diceAt(current[kind], t) : restOf(current[kind])) : inHand(layout);
      place(layout, refs.current[kind], states);
    }
  }, []);

  // Each table's dice are placed in pixels: they follow the table's width.
  useEffect(() => {
    const root = wrapper.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      for (const kind of KINDS) {
        const tub = root.querySelector<HTMLElement>(`[data-table-kind="${kind}"] [data-testid="craps-tub-${kind}"]`);
        refs.current[kind].scale = tub ? tub.clientWidth / TABLES[kind].width : 0;
      }
      draw();
    };
    const observer = new ResizeObserver(measure);
    root.querySelectorAll('[data-testid^="craps-tub-"]').forEach((tub) => observer.observe(tub));
    measure();
    return () => observer.disconnect();
  }, [draw]);

  const id = shown?.id;
  const mode = shown?.mode;
  useEffect(() => {
    const root = wrapper.current;
    if (!plans || id === undefined || !mode) {
      pose.current = { plans: null, t: Infinity };
      draw();
      return;
    }
    root?.setAttribute('data-rolling', mode === 'animate' || mode === 'calm' ? 'true' : 'false');
    /** The throw is at rest: the table says so, and so does the page that threw it. */
    const finish = () => {
      root?.setAttribute('data-rolling', 'false');
      root?.setAttribute('data-settled', String(id));
      settledRef.current(id);
    };
    if (mode !== 'animate') {
      pose.current = { plans, t: Infinity };
      draw();
      if (mode === 'rest') {
        root?.setAttribute('data-rolling', 'false');
        return;
      }
      if (mode === 'calm') {
        root?.classList.add(styles.diceCalm);
        const timer = window.setTimeout(() => {
          root?.classList.remove(styles.diceCalm);
          finish();
        }, CALM_MS);
        return () => {
          window.clearTimeout(timer);
          root?.classList.remove(styles.diceCalm);
        };
      }
      finish();
      return;
    }
    // Thrown: the dice are moved on every frame, and the throw's sounds are made as the dice reach them.
    let frame = 0;
    let start: number | null = null;
    let heard = 0;
    const visible = (): TableKind => (root?.querySelector<HTMLElement>('[data-table-kind="full"]')?.offsetWidth ? 'full' : 'half');
    const tick = (now: number) => {
      start ??= now;
      const t = (now - start) / 1000;
      const kind = visible();
      const plan = plans[kind];
      pose.current = { plans, t };
      draw();
      if (soundRef.current) {
        while (heard < plan.events.length && plan.events[heard].t <= t) {
          const event = plan.events[heard];
          playThrowSound(event.kind, event.strength);
          heard += 1;
        }
      } else {
        while (heard < plan.events.length && plan.events[heard].t <= t) heard += 1;
      }
      if (t >= Math.max(plans.half.duration, plans.full.duration)) {
        pose.current = { plans, t: Infinity };
        draw();
        finish();
        return;
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [plans, id, mode, draw]);

  const label = shown ? props.t.diceLabel(shown.faces[0], shown.faces[1]) : props.t.trayIdle;
  return (
    <div ref={wrapper} className={styles.table} data-testid="craps-table" data-rolling="false">
      {KINDS.map((kind) => (
        <TableView key={kind} layout={TABLES[kind]} props={props} refs={refs} label={label} />
      ))}
    </div>
  );
}
