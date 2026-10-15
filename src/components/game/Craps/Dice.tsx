/** Pip centres (viewBox 0–100) for each face. */
const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
};

interface DieFaceProps {
  value: number;
  className?: string;
  title?: string;
}

/** A translucent red casino die showing `value`. */
export const DieFace = ({ value, className, title }: DieFaceProps) => (
  <svg
    viewBox="0 0 100 100"
    className={className}
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    focusable="false"
    data-value={value}
  >
    <rect x={3} y={3} width={94} height={94} rx={18} fill="#c8102e" stroke="#7f0a1c" strokeWidth={3} />
    <rect x={10} y={8} width={80} height={22} rx={10} fill="#fff" opacity={0.14} />
    {PIPS[value].map(([cx, cy], i) => (
      <circle key={i} cx={cx} cy={cy} r={9} fill="#fff" stroke="#f1d5d9" strokeWidth={1} />
    ))}
  </svg>
);
