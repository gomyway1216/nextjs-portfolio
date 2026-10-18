/** Where the pips of each face sit on a die of 100 × 100: the classic layouts, the 1 in red as on a Japanese die. */
const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
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
    [29, 24],
    [71, 24],
    [29, 50],
    [71, 50],
    [29, 76],
    [71, 76],
  ],
};

/** One face of the die, drawn: a white die with rounded corners, its pips black but for the big red 1. */
export const DieFace = ({ face, className }: { face: number; className?: string }) => (
  <svg className={className} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <rect x="3" y="3" width="94" height="94" rx="20" fill="#fffdf7" stroke="#2b2b3a" strokeWidth="3" />
    <rect x="9" y="9" width="82" height="82" rx="15" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="4" />
    {(PIPS[face] ?? PIPS[1]).map(([cx, cy], i) => (
      <circle key={i} cx={cx} cy={cy} r={face === 1 ? 15 : 8.5} fill={face === 1 ? '#d11f2f' : '#1d1d28'} />
    ))}
  </svg>
);
