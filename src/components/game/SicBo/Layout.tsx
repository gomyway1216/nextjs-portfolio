'use client';

import type { CSSProperties } from 'react';
import { BET_IDS, FACES, PAIRS, PAYTABLE, TOTALS, betInfo, type BetId, type Bets, type BetInfo } from './engine';
import { DieFace } from './Dice';
import { SECTIONS, type Section, type SicBoStrings } from './i18n';
import styles from './SicBo.module.css';

/**
 * The layout: the 50 areas a Sic Bo table's cloth has, each a button that
 * puts medals on it, lit when the dice win it.
 *
 * On a desk it is the whole cloth at once, laid out as a table's is: Small and
 * Big at the ends of the top band with the doubles and the triples between
 * them, then the totals, the two-dice combinations and the single numbers. On
 * a phone the same areas are shown one part of the cloth at a time (a picker
 * over it chooses which), each area at least 44 px to touch, and every part
 * the same height, so that nothing under it moves when another is chosen.
 *
 * Where each area stands on the desk's cloth is given as grid lines of a grid
 * of 210 columns (the 30 of the top band, the 14 totals, the 15 combinations
 * and the 6 numbers all divide it).
 */

/** Which part of the cloth an area is in, on a phone. */
export function sectionOf(id: BetId): Section {
  const { kind } = betInfo(id);
  if (kind === 'small' || kind === 'big' || kind === 'any-triple') return 'bigSmall';
  if (kind === 'triple' || kind === 'double') return 'triples';
  if (kind === 'total') return 'totals';
  if (kind === 'pair') return 'pairs';
  return 'singles';
}

/** Where an area stands on the desk's cloth: its column (1 to 210), how many it spans, its row and how many rows. */
export function placeOf(id: BetId): { col: number; span: number; row: number; rows: number } {
  const info = betInfo(id);
  const unit = 7;
  switch (info.kind) {
    case 'small':
      return { col: 1, span: 4 * unit, row: 1, rows: 3 };
    case 'double': {
      const i = info.face! - 1;
      return { col: 1 + (i < 3 ? 4 + 2 * i : 20 + 2 * (i - 3)) * unit, span: 2 * unit, row: 1, rows: 3 };
    }
    case 'triple': {
      const i = info.face! - 1;
      return { col: 1 + (i < 3 ? 10 : 17) * unit, span: 3 * unit, row: 1 + (i % 3), rows: 1 };
    }
    case 'any-triple':
      return { col: 1 + 13 * unit, span: 4 * unit, row: 1, rows: 3 };
    case 'big':
      return { col: 1 + 26 * unit, span: 4 * unit, row: 1, rows: 3 };
    case 'total':
      return { col: 1 + TOTALS.indexOf(info.total!) * 15, span: 15, row: 4, rows: 1 };
    case 'pair':
      return { col: 1 + PAIRS.findIndex(([a, b]) => a === info.pair![0] && b === info.pair![1]) * 14, span: 14, row: 5, rows: 1 };
    case 'single':
      return { col: 1 + (info.face! - 1) * 35, span: 35, row: 6, rows: 1 };
  }
}

/** What an area pays, as the cloth prints it. */
export function paysLabel(info: BetInfo): string {
  switch (info.kind) {
    case 'small':
    case 'big':
      return `${PAYTABLE.smallBig}:1`;
    case 'any-triple':
      return `${PAYTABLE.anyTriple}:1`;
    case 'triple':
      return `${PAYTABLE.triple}:1`;
    case 'double':
      return `${PAYTABLE.double}:1`;
    case 'total':
      return `${PAYTABLE.total[info.total!]}:1`;
    case 'pair':
      return `${PAYTABLE.pair}:1`;
    case 'single':
      return '1:1';
  }
}

/** What an area shows: the dice it names, its total, or its sign. */
function AreaFace({ info, t }: { info: BetInfo; t: SicBoStrings }) {
  switch (info.kind) {
    case 'small':
    case 'big':
      return (
        <>
          <span className={styles.areaGlyph} lang="ja">
            {info.kind === 'small' ? '小' : '大'}
          </span>
          <span className={styles.areaRange}>{info.kind === 'small' ? t.smallRange : t.bigRange}</span>
          <span className={styles.areaRule}>{t.losesOnTriples}</span>
        </>
      );
    case 'any-triple':
      return (
        <>
          <span className={styles.areaDiceGrid} aria-hidden="true">
            {FACES.map((face) => (
              <DieFace key={face} face={face} className={styles.areaDieTiny} />
            ))}
          </span>
          <span className={styles.areaWords}>{t.anyTriple}</span>
        </>
      );
    case 'triple':
      return (
        <span className={styles.areaDice} aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <DieFace key={i} face={info.face!} className={styles.areaDieSmall} />
          ))}
        </span>
      );
    case 'double':
      return (
        <span className={`${styles.areaDice} ${styles.areaDiceStack}`} aria-hidden="true">
          {[0, 1].map((i) => (
            <DieFace key={i} face={info.face!} className={styles.areaDie} />
          ))}
        </span>
      );
    case 'total':
      return <span className={styles.areaTotal}>{info.total}</span>;
    case 'pair':
      return (
        <span className={styles.areaDice} aria-hidden="true">
          <DieFace face={info.pair![0]} className={styles.areaDie} />
          <DieFace face={info.pair![1]} className={styles.areaDie} />
        </span>
      );
    case 'single':
      return (
        <span className={styles.areaDice} aria-hidden="true">
          <DieFace face={info.face!} className={styles.areaDieBig} />
        </span>
      );
  }
}

export interface LayoutProps {
  /** The medals on each area now. */
  bets: Bets;
  /** The bets of the roll just settled, shown faint on a layout that has none yet. */
  ghost: Bets | null;
  /** The areas the last roll won, lit. */
  lit: ReadonlySet<BetId>;
  /** The part of the cloth a phone shows. */
  section: Section;
  canPlay: boolean;
  onPress: (id: BetId) => void;
  t: SicBoStrings;
}

export const Layout = ({ bets, ghost, lit, section, canPlay, onPress, t }: LayoutProps) => (
  <div className={styles.layout} data-testid="sb-layout" data-section={section}>
    {SECTIONS.map((part) => (
      <div key={part} className={styles.layoutPart} data-part={part} data-shown={part === section ? 'true' : 'false'}>
        {BET_IDS.filter((id) => sectionOf(id) === part).map((id) => {
          const info = betInfo(id);
          const onIt = bets[id] ?? 0;
          const faint = onIt === 0 ? (ghost?.[id] ?? 0) : 0;
          const place = placeOf(id);
          const pays = paysLabel(info);
          return (
            <button
              key={id}
              type="button"
              className={styles.area}
              style={{ '--col': place.col, '--span': place.span, '--row': place.row, '--rows': place.rows } as CSSProperties}
              data-testid={`sb-area-${id}`}
              data-kind={info.kind}
              data-amount={onIt}
              data-win={lit.has(id) ? 'true' : 'false'}
              aria-label={t.areaAria(info, pays, onIt)}
              disabled={!canPlay}
              onClick={() => onPress(id)}
            >
              <span className={styles.areaFace} aria-hidden="true">
                <AreaFace info={info} t={t} />
              </span>
              <span className={styles.areaPays} aria-hidden="true">
                {pays}
              </span>
              <span className={styles.areaChip} data-on={onIt > 0 ? 'true' : faint > 0 ? 'faint' : 'false'} aria-hidden="true">
                {onIt > 0 ? onIt : faint > 0 ? faint : ''}
              </span>
            </button>
          );
        })}
      </div>
    ))}
  </div>
);
