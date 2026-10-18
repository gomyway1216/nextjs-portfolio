import type { Face } from './engine';

/** Pip centres (viewBox 0–100) for each face. */
export const PIPS: Record<Face, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [27, 27],
    [73, 73],
  ],
  3: [
    [26, 26],
    [50, 50],
    [74, 74],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [27, 27],
    [73, 27],
    [50, 50],
    [27, 73],
    [73, 73],
  ],
  6: [
    [29, 25],
    [71, 25],
    [29, 50],
    [71, 50],
    [29, 75],
    [71, 75],
  ],
};

/** The pips of a face: black, but for the one and the four, which are red, as on the dice of a dice table in Asia. */
const pipColour = (face: Face): string => (face === 1 || face === 4 ? '#c1121f' : '#1d1b26');
const pipSize = (face: Face): number => (face === 1 ? 15 : 9.2);

/** The pips of `face`, to go inside an SVG of viewBox 0 0 100 100. */
export const Pips = ({ face }: { face: Face }) => (
  <>
    {PIPS[face].map(([cx, cy], i) => (
      <circle key={i} cx={cx} cy={cy} r={pipSize(face)} fill={pipColour(face)} />
    ))}
  </>
);

/** A die seen square on: an ivory face with its pips. */
export const DieFace = ({ face, className }: { face: Face; className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden="true" focusable="false" data-face={face}>
    <rect x={3} y={3} width={94} height={94} rx={20} fill="#fbf6e9" stroke="#b9ad8f" strokeWidth={4} />
    <Pips face={face} />
  </svg>
);
