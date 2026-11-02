/**
 * One colour's pieces in moulded plastic, drawn from pieceArt's paths.
 *
 * The shine on the raised squares is one gradient that repeats every board unit, so
 * every square gets it from a single path. That is why a piece is always drawn on
 * whole-number coordinates: to sit anywhere else, move a <g> around it.
 */

'use client';

import { memo, useMemo } from 'react';
import { facePath, litPath, markPath, platePath, shadePath, type Cells } from './pieceArt';
import styles from './Blokus.module.css';

export const gradientId = (prefix: string, color: number) => `${prefix}-face-${color}`;

/** The gradients for these colours. Their ids need `prefix`, as a page holds several of these. */
export const PlasticDefs = ({ prefix, colors }: { prefix: string; colors: readonly number[] }) => (
  <defs>
    {colors.map((color) => (
      <linearGradient key={color} id={gradientId(prefix, color)} className={styles[`color${color}`]} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={0} y2={1} spreadMethod="repeat">
        <stop className={styles.stopHigh} offset={0.15} />
        <stop className={styles.stopMid} offset={0.5} />
        <stop className={styles.stopLow} offset={0.86} />
      </linearGradient>
    ))}
  </defs>
);

interface PlasticProps {
  prefix: string;
  cells: Cells;
  color: number;
  /** The colour-blind marks, which a tray's small squares leave out: a tray holds one colour. */
  marks?: boolean;
}

export const Plastic = memo(function Plastic({ prefix, cells, color, marks = true }: PlasticProps) {
  const paths = useMemo(
    () => ({ plate: platePath(cells), face: facePath(cells), lit: litPath(cells), shade: shadePath(cells), mark: marks ? markPath(cells, color) : '' }),
    [cells, color, marks],
  );
  return (
    <g className={styles[`color${color}`]}>
      <path className={styles.plate} d={paths.plate} />
      <path d={paths.face} fill={`url(#${gradientId(prefix, color)})`} />
      <path className={styles.bevelShade} d={paths.shade} />
      <path className={styles.bevelLit} d={paths.lit} />
      {marks && <path className={styles.mark} d={paths.mark} />}
    </g>
  );
});
