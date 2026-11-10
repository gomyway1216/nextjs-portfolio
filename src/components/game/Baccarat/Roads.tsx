'use client';

import { useEffect, useRef } from 'react';
import { ROAD_ROWS, beadPosition, bigRoad, type RoadEntry, type Side, type Winner } from './engine';
import { DERIVED_ROADS, derivedCells, derivedMarks, nextMarks, type DerivedMark, type DerivedRoadId } from './derivedRoads';
import styles from './Baccarat.module.css';
import { ScrollArea } from '../common/ScrollArea';

const COLOR: Record<Winner, string> = {
  banker: 'var(--bc-banker)',
  player: 'var(--bc-player)',
  tie: 'var(--bc-tie)',
};

interface RoadProps {
  entries: readonly RoadEntry[];
  name: string;
  ariaLabel: string;
}

/**
 * Keeps the newest column in view as the board grows. It scrolls to the last
 * filled column, not to the end of the grid, which is padded with empty ones.
 */
function useScrollToColumn(rightEdge: number) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = Math.max(0, rightEdge - el.clientWidth);
  }, [rightEdge]);
  return ref;
}

const Grid = ({ cols, cell }: { cols: number; cell: number }) => (
  <g stroke="var(--bc-grid)" strokeWidth={1}>
    {Array.from({ length: cols + 1 }, (_, i) => (
      <line key={`c${i}`} x1={i * cell + 0.5} x2={i * cell + 0.5} y1={0} y2={ROAD_ROWS * cell} />
    ))}
    {Array.from({ length: ROAD_ROWS + 1 }, (_, i) => (
      <line key={`r${i}`} x1={0} x2={cols * cell} y1={i * cell + 0.5} y2={i * cell + 0.5} />
    ))}
  </g>
);

/**
 * The column of the newest mark, which is not always the rightmost one: after a run has turned right along the
 * bottom, a change of colour starts again near the left.
 */
export const newestCol = (cells: readonly { col: number }[]) => cells[cells.length - 1]?.col ?? 0;

const BEAD = 24;

/** Every hand in order, six to a column, as a filled bead with its letter. */
export const BeadPlate = ({ entries, name, ariaLabel, letters }: RoadProps & { letters: Record<Winner, string> }) => {
  const cols = Math.max(12, Math.ceil(entries.length / ROAD_ROWS));
  const ref = useScrollToColumn((Math.ceil(entries.length / ROAD_ROWS) + 1) * BEAD);
  return (
    <div className={styles.road}>
      <div className={styles.roadName}>{name}</div>
      <ScrollArea className={styles.roadScroll} ref={ref} label={name}>
        <svg
          width={cols * BEAD + 1}
          height={ROAD_ROWS * BEAD + 1}
          role="img"
          aria-label={ariaLabel}
          data-road="bead"
        >
          <Grid cols={cols} cell={BEAD} />
          {entries.map((e, i) => {
            const { col, row } = beadPosition(i);
            const cx = col * BEAD + BEAD / 2 + 0.5;
            const cy = row * BEAD + BEAD / 2 + 0.5;
            return (
              <g key={i} data-cell={e.winner} data-col={col} data-row={row}>
                <circle cx={cx} cy={cy} r={BEAD / 2 - 2.5} fill={COLOR[e.winner]} />
                <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fontWeight={800} fill="#fff">
                  {letters[e.winner]}
                </text>
                {e.bankerPair && <circle cx={cx - 6.5} cy={cy - 6.5} r={2.6} fill="var(--bc-banker)" stroke="#fff" strokeWidth={1} />}
                {e.playerPair && <circle cx={cx + 6.5} cy={cy + 6.5} r={2.6} fill="var(--bc-player)" stroke="#fff" strokeWidth={1} />}
              </g>
            );
          })}
        </svg>
      </ScrollArea>
    </div>
  );
};

const BIG = 18;

/** Streaks down each column, turning right into a "dragon tail" when blocked. */
export const BigRoad = ({ entries, name, ariaLabel }: RoadProps) => {
  const { cells, leadingTies } = bigRoad(entries);
  const lastCol = cells.reduce((m, c) => Math.max(m, c.col), 0);
  const cols = Math.max(24, lastCol + 2);
  const ref = useScrollToColumn((newestCol(cells) + 2) * BIG);
  const r = BIG / 2 - 3;
  return (
    <div className={styles.road}>
      <div className={styles.roadName}>{name}</div>
      <ScrollArea className={styles.roadScroll} ref={ref} label={name}>
        <svg width={cols * BIG + 1} height={ROAD_ROWS * BIG + 1} role="img" aria-label={ariaLabel} data-road="big">
          <Grid cols={cols} cell={BIG} />
          {cells.length === 0 && leadingTies > 0 && (
            <line x1={4} y1={BIG - 4} x2={BIG - 4} y2={4} stroke={COLOR.tie} strokeWidth={2.4} data-cell="tie" />
          )}
          {cells.map((c, i) => {
            const cx = c.col * BIG + BIG / 2 + 0.5;
            const cy = c.row * BIG + BIG / 2 + 0.5;
            const ties = c.ties + (i === 0 ? leadingTies : 0);
            return (
              <g key={i} data-cell={c.winner} data-col={c.col} data-row={c.row} data-ties={ties || undefined}>
                <circle cx={cx} cy={cy} r={r} fill="none" stroke={COLOR[c.winner]} strokeWidth={2.4} />
                {ties > 0 && (
                  <line x1={cx - r} y1={cy + r} x2={cx + r} y2={cy - r} stroke={COLOR.tie} strokeWidth={2.2} />
                )}
                {ties > 1 && (
                  <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize={9} fontWeight={800} fill={COLOR.tie}>
                    {ties}
                  </text>
                )}
                {c.bankerPair && <circle cx={cx - r + 1} cy={cy - r + 1} r={2.2} fill="var(--bc-banker)" />}
                {c.playerPair && <circle cx={cx + r - 1} cy={cy + r - 1} r={2.2} fill="var(--bc-player)" />}
              </g>
            );
          })}
        </svg>
      </ScrollArea>
    </div>
  );
};

const MARK_COLOR: Record<DerivedMark, string> = { red: 'var(--bc-banker)', blue: 'var(--bc-player)' };

/** One derived-road mark: a ring on the big eye boy, a disc on the small road, a slash on the cockroach pig. */
const Mark = ({ road, mark, cx, cy, r }: { road: DerivedRoadId; mark: DerivedMark; cx: number; cy: number; r: number }) => {
  const color = MARK_COLOR[mark];
  if (road === 'bigEye') return <circle cx={cx} cy={cy} r={r - 0.5} fill="none" stroke={color} strokeWidth={2} />;
  if (road === 'small') return <circle cx={cx} cy={cy} r={r} fill={color} />;
  return <line x1={cx - r} y1={cy + r} x2={cx + r} y2={cy - r} stroke={color} strokeWidth={2.4} strokeLinecap="round" />;
};

const SMALL = 12;

/** One of the three roads read off the big road: red where it repeats an earlier column, blue where it breaks from it. */
export const DerivedRoad = ({
  entries,
  road,
  name,
  ariaLabel,
  minCols = 12,
}: {
  entries: readonly RoadEntry[];
  road: DerivedRoadId;
  name: string;
  ariaLabel: (red: number, blue: number) => string;
  minCols?: number;
}) => {
  const marks = derivedMarks(entries, road);
  const cells = derivedCells(marks);
  const lastCol = cells.reduce((m, c) => Math.max(m, c.col), 0);
  const cols = Math.max(minCols, lastCol + 2);
  const ref = useScrollToColumn((newestCol(cells) + 2) * SMALL);
  const red = marks.filter((m) => m === 'red').length;
  return (
    <div className={styles.road}>
      <div className={styles.roadName}>{name}</div>
      <ScrollArea className={styles.roadScroll} ref={ref} label={name}>
        <svg width={cols * SMALL + 1} height={ROAD_ROWS * SMALL + 1} role="img" aria-label={ariaLabel(red, marks.length - red)} data-road={road}>
          <Grid cols={cols} cell={SMALL} />
          {cells.map((c, i) => (
            <g key={i} data-cell={c.mark} data-col={c.col} data-row={c.row}>
              <Mark road={road} mark={c.mark} cx={c.col * SMALL + SMALL / 2 + 0.5} cy={c.row * SMALL + SMALL / 2 + 0.5} r={SMALL / 2 - 2.5} />
            </g>
          ))}
        </svg>
      </ScrollArea>
    </div>
  );
};

const NEXT = 16;

/** What the next hand would add to each derived road, for a Banker win and for a Player win. */
export const NextMarks = ({
  entries,
  title,
  letters,
  ariaLabel,
}: {
  entries: readonly RoadEntry[];
  title: string;
  letters: Record<Winner, string>;
  ariaLabel: (side: Side, marks: Record<DerivedRoadId, DerivedMark | null>) => string;
}) => (
  <div className={styles.nextMarks} data-testid="baccarat-next-marks">
    <span className={styles.nextMarksTitle}>{title}</span>
    {(['banker', 'player'] as const).map((side) => {
      const marks = nextMarks(entries, side);
      return (
        <span key={side} className={styles.nextSide} data-side={side} role="img" aria-label={ariaLabel(side, marks)}>
          <span className={styles.nextLetter} aria-hidden>
            {letters[side]}
          </span>
          <svg width={DERIVED_ROADS.length * NEXT} height={NEXT} aria-hidden>
            {DERIVED_ROADS.map((road, i) => {
              const cx = i * NEXT + NEXT / 2;
              const mark = marks[road];
              return mark ? (
                <g key={road} data-next={road} data-mark={mark}>
                  <Mark road={road} mark={mark} cx={cx} cy={NEXT / 2} r={NEXT / 2 - 3} />
                </g>
              ) : (
                <circle key={road} data-next={road} cx={cx} cy={NEXT / 2} r={1.5} fill="var(--games-route-muted)" />
              );
            })}
          </svg>
        </span>
      );
    })}
  </div>
);
