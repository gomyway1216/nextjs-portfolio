import type { SymbolId } from './engine';

/**
 * Reel symbol artwork (viewBox 100×80). Flat fills with highlight shapes — no
 * gradients — so dozens of copies on the reel strips never need unique ids.
 */
const ART: Record<SymbolId, React.ReactNode> = {
  seven: (
    <>
      <path
        d="M24 10 H80 V24 L52 72 H32 L58 26 H24 Z"
        fill="#e11d2e"
        stroke="#fbbf24"
        strokeWidth={4}
        strokeLinejoin="round"
      />
      <path d="M29 14 H75 V20 H29 Z" fill="#fff" opacity={0.35} />
    </>
  ),
  bar: (
    <>
      <rect x={8} y={23} width={84} height={34} rx={7} fill="#111827" stroke="#fbbf24" strokeWidth={3} />
      <rect x={13} y={27} width={74} height={7} rx={3} fill="#fff" opacity={0.18} />
      <text
        x={50}
        y={41}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        fontSize={23}
        fontWeight={900}
        fontFamily="Arial Black, Arial, Helvetica, sans-serif"
        letterSpacing={1}
      >
        BAR
      </text>
    </>
  ),
  bell: (
    <>
      <path
        d="M50 8 C34 8 28 24 28 38 C28 51 23 57 16 62 H84 C77 57 72 51 72 38 C72 24 66 8 50 8 Z"
        fill="#f59e0b"
        stroke="#92400e"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <rect x={14} y={60} width={72} height={7} rx={3.5} fill="#d97706" stroke="#92400e" strokeWidth={2} />
      <circle cx={50} cy={72} r={6} fill="#92400e" />
      <ellipse cx={40} cy={28} rx={5} ry={11} fill="#fff" opacity={0.45} transform="rotate(18 40 28)" />
    </>
  ),
  plum: (
    <>
      <path d="M50 22 C52 14 57 9 63 7" stroke="#4d7c0f" strokeWidth={3.5} strokeLinecap="round" fill="none" />
      <path d="M52 16 C62 6 76 8 80 14 C70 20 60 20 52 16 Z" fill="#65a30d" stroke="#3f6212" strokeWidth={1.5} />
      <ellipse cx={50} cy={47} rx={27} ry={26} fill="#7c3aed" stroke="#4c1d95" strokeWidth={2.5} />
      <path d="M50 23 C46 34 46 60 50 72" stroke="#4c1d95" strokeWidth={2} fill="none" opacity={0.6} />
      <ellipse cx={39} cy={38} rx={6} ry={9} fill="#fff" opacity={0.35} transform="rotate(25 39 38)" />
    </>
  ),
  cherry: (
    <>
      <path d="M36 50 C38 32 48 18 62 10 M64 48 C62 32 62 20 62 10" stroke="#15803d" strokeWidth={3.5} strokeLinecap="round" fill="none" />
      <path d="M62 10 C70 4 82 6 86 12 C78 18 68 17 62 10 Z" fill="#22c55e" stroke="#166534" strokeWidth={1.5} />
      <circle cx={34} cy={57} r={15} fill="#dc2626" stroke="#7f1d1d" strokeWidth={2.5} />
      <circle cx={66} cy={55} r={15} fill="#dc2626" stroke="#7f1d1d" strokeWidth={2.5} />
      <circle cx={29} cy={52} r={4} fill="#fff" opacity={0.55} />
      <circle cx={61} cy={50} r={4} fill="#fff" opacity={0.55} />
    </>
  ),
  blank: null,
};

interface SlotSymbolProps {
  id: SymbolId;
  className?: string;
  /** Accessible name; omit for decorative copies (e.g. the spinning strips). */
  title?: string;
}

export const SlotSymbol = ({ id, className, title }: SlotSymbolProps) => (
  <svg
    viewBox="0 0 100 80"
    className={className}
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    focusable="false"
    data-symbol={id}
  >
    {ART[id]}
  </svg>
);
