import type { ReactElement } from 'react';
import type { FishId, Shadow } from './engine';

/**
 * The harbor's fish, its treasure chest and its lord, drawn here for this
 * machine alone: every one is its own invention, in plain shapes, facing
 * right in a box of 120 × 72.
 */

const Eye = ({ x, y, r = 3.2 }: { x: number; y: number; r?: number }) => (
  <g>
    <circle cx={x} cy={y} r={r} fill="#fff" />
    <circle cx={x + r * 0.25} cy={y} r={r * 0.55} fill="#14202b" />
    <circle cx={x + r * 0.45} cy={y - r * 0.35} r={r * 0.2} fill="#fff" />
  </g>
);

const FRY = (
  <g>
    <path d="M26 36 L10 24 L13 36 L10 48 Z" fill="#7cc8e8" />
    <ellipse cx="54" cy="36" rx="28" ry="20" fill="#9fdcf4" stroke="#3d8db3" strokeWidth="2" />
    <ellipse cx="50" cy="42" rx="18" ry="8" fill="#d8f3fd" />
    <path d="M44 20 Q52 12 60 18" fill="none" stroke="#3d8db3" strokeWidth="2" strokeLinecap="round" />
    <Eye x={68} y={31} r={5} />
    <circle cx="92" cy="22" r="5" fill="none" stroke="#bfe9fb" strokeWidth="1.6" />
    <circle cx="100" cy="12" r="3" fill="none" stroke="#bfe9fb" strokeWidth="1.4" />
    <circle cx="96" cy="31" r="2.2" fill="none" stroke="#bfe9fb" strokeWidth="1.2" />
  </g>
);

const GOBY = (
  <g>
    <path d="M22 38 L6 28 L10 40 L6 50 Z" fill="#a37b4f" />
    <path d="M20 40 Q40 22 74 26 Q100 28 104 40 Q100 50 74 50 Q40 52 20 40 Z" fill="#c99b67" stroke="#7a5530" strokeWidth="2" />
    <path d="M40 26 Q50 14 62 24" fill="#b58654" stroke="#7a5530" strokeWidth="1.5" />
    {[
      [38, 38],
      [50, 34],
      [58, 42],
      [70, 36],
      [46, 44],
    ].map(([x, y]) => (
      <circle key={`${x}-${y}`} cx={x} cy={y} r="3" fill="#8f6a44" />
    ))}
    <Eye x={88} y={33} r={4.4} />
    <path d="M98 44 Q102 46 104 42" fill="none" stroke="#7a5530" strokeWidth="1.6" strokeLinecap="round" />
  </g>
);

const SARDINE = (
  <g>
    <path d="M18 36 L4 24 L8 36 L4 48 Z" fill="#6f8fb5" />
    <path d="M16 36 Q46 18 90 26 Q112 32 114 36 Q112 42 90 46 Q46 54 16 36 Z" fill="#c8d6e6" stroke="#4d6d93" strokeWidth="2" />
    <path d="M18 36 Q46 22 90 28 Q110 32 114 36 Q80 30 18 36 Z" fill="#5c7fa8" />
    <path d="M28 40 Q38 34 48 40 T68 40 T88 40" fill="none" stroke="#3a6fb0" strokeWidth="2" />
    <Eye x={98} y={34} r={3.6} />
  </g>
);

const BREAM = (
  <g>
    <path d="M26 36 Q12 18 4 20 Q12 36 4 52 Q12 54 26 36 Z" fill="#f08aa6" />
    <path d="M24 36 Q50 6 86 20 Q108 30 108 38 Q104 50 84 56 Q50 64 24 36 Z" fill="#f7a8bc" stroke="#c4466b" strokeWidth="2" />
    <path d="M50 14 Q66 0 82 18" fill="#f08aa6" stroke="#c4466b" strokeWidth="1.5" />
    <path d="M58 58 Q60 70 48 70 M58 58 Q66 70 74 64" fill="none" stroke="#e05a85" strokeWidth="3" strokeLinecap="round" />
    <circle cx="58" cy="56" r="3.6" fill="#e05a85" />
    <path d="M44 30 Q60 26 76 32" fill="none" stroke="#fff" strokeWidth="2" opacity="0.7" />
    <Eye x={90} y={32} r={4.4} />
  </g>
);

const SQUID = (
  <g>
    {[0, 1, 2, 3, 4].map((i) => (
      <path key={i} d={`M30 ${28 + i * 4} Q16 ${24 + i * 6} 4 ${20 + i * 8}`} fill="none" stroke="#e98a3a" strokeWidth="3.2" strokeLinecap="round" />
    ))}
    <path d="M28 24 Q60 14 92 24 L112 36 L92 48 Q60 58 28 48 Q22 36 28 24 Z" fill="#ffb067" stroke="#c4621f" strokeWidth="2" />
    <path d="M92 24 L112 36 L92 48 Z" fill="#ff9a45" stroke="#c4621f" strokeWidth="1.5" />
    {[44, 58, 72].map((x) => (
      <circle key={x} cx={x} cy={36} r="4" fill="#fff6b0" opacity="0.95" />
    ))}
    <circle cx="58" cy="36" r="9" fill="#fff6b0" opacity="0.35" />
    <Eye x={34} y={32} r={3.4} />
  </g>
);

const TUNA = (
  <g>
    <path d="M22 36 L4 16 L12 36 L4 56 Z" fill="#26457d" />
    <path d="M20 36 Q48 10 90 22 Q114 30 116 36 Q114 42 90 50 Q48 62 20 36 Z" fill="#33589c" stroke="#1a2f57" strokeWidth="2" />
    <path d="M20 36 Q50 50 90 48 Q110 44 116 36 Q96 46 60 46 Q36 46 20 36 Z" fill="#c9d6ea" />
    <path d="M40 30 L56 30 L50 38 L66 38 L46 50 L52 41 L38 41 Z" fill="#ffd23f" stroke="#c99a00" strokeWidth="1" />
    {[30, 38, 46].map((x) => (
      <path key={x} d={`M${x} 52 l3 4 l3 -4`} fill="#ffd23f" />
    ))}
    <Eye x={100} y={33} r={3.8} />
  </g>
);

const MARLIN = (
  <g>
    <path d="M22 36 Q4 10 2 14 Q14 36 2 58 Q4 62 22 36 Z" fill="#5b3fa0" />
    <path d="M20 36 Q46 14 84 26 L118 34 L84 42 Q46 58 20 36 Z" fill="#6f55c2" stroke="#3a2775" strokeWidth="2" />
    <path d="M40 24 Q50 4 74 10 Q70 20 66 26 Z" fill="#8a72db" stroke="#3a2775" strokeWidth="1.5" />
    <path d="M20 36 Q46 50 84 42 Q60 46 20 36 Z" fill="#c8bff0" />
    <path d="M38 30 Q46 36 38 42" fill="none" stroke="#f3e9a0" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M50 28 Q58 36 50 44" fill="none" stroke="#f3e9a0" strokeWidth="2.4" strokeLinecap="round" />
    <Eye x={80} y={32} r={3.6} />
  </g>
);

const CHEST_ART = (
  <g>
    <rect x="22" y="30" width="76" height="36" rx="4" fill="#9a5b2b" stroke="#5a3214" strokeWidth="2.4" />
    <path d="M22 32 Q22 10 60 10 Q98 10 98 32 Z" fill="#b5703a" stroke="#5a3214" strokeWidth="2.4" />
    <rect x="22" y="30" width="76" height="6" fill="#e2b53e" stroke="#8a6512" strokeWidth="1.4" />
    <rect x="34" y="10" width="7" height="56" fill="#e2b53e" opacity="0.9" />
    <rect x="79" y="10" width="7" height="56" fill="#e2b53e" opacity="0.9" />
    <rect x="53" y="34" width="14" height="16" rx="2" fill="#e2b53e" stroke="#8a6512" strokeWidth="1.4" />
    <circle cx="60" cy="42" r="2.4" fill="#5a3214" />
    <path d="M100 14 l3 -7 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 Z" fill="#fff7c2" />
    <path d="M14 22 l2 -5 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 Z" fill="#fff7c2" />
  </g>
);

const LORD = (
  <g>
    <path d="M24 36 Q2 4 0 10 Q12 36 0 62 Q2 68 24 36 Z" fill="#6e6aa8" />
    <path d="M22 36 Q40 2 82 8 Q116 16 118 36 Q116 56 82 64 Q40 70 22 36 Z" fill="#b9b6e3" stroke="#3f3a78" strokeWidth="2.4" />
    <path d="M46 8 L52 0 L58 6 L64 -1 L70 6 L76 0 L80 9" fill="#f2d16b" stroke="#a07f16" strokeWidth="1.4" />
    {[
      [44, 26],
      [56, 22],
      [68, 26],
      [44, 40],
      [56, 36],
      [68, 40],
      [50, 52],
      [62, 50],
    ].map(([x, y]) => (
      <path key={`${x}-${y}`} d={`M${x - 5} ${y} Q${x} ${y - 7} ${x + 5} ${y}`} fill="#e6e3ff" stroke="#7b76b8" strokeWidth="1.2" />
    ))}
    <circle cx="96" cy="24" r="7" fill="#fff" stroke="#3f3a78" strokeWidth="1.6" />
    <circle cx="98" cy="24" r="4" fill="#1d1a3a" />
    <path d="M95 21 a4 4 0 0 1 6 2 a3 3 0 0 0 -6 -2 Z" fill="#f2d16b" />
    <path d="M104 44 Q110 46 114 42" fill="none" stroke="#3f3a78" strokeWidth="2" strokeLinecap="round" />
    <path d="M100 50 Q108 60 98 66" fill="none" stroke="#3f3a78" strokeWidth="1.6" strokeLinecap="round" />
  </g>
);

const ART: Record<FishId, ReactElement> = {
  fry: FRY,
  goby: GOBY,
  sardine: SARDINE,
  bream: BREAM,
  squid: SQUID,
  tuna: TUNA,
  marlin: MARLIN,
  chest: CHEST_ART,
  lord: LORD,
};

/** A fish of the harbor, drawn: its picture is for show, and its name goes beside it in type. */
export const FishArt = ({ id, className }: { id: FishId; className?: string }) => (
  <svg className={className} viewBox="-2 -4 124 78" aria-hidden focusable="false" data-fish={id}>
    {ART[id]}
  </svg>
);

/** A fish's shadow in the water: dark and soft, its size the size class of what it is. */
export const ShadowArt = ({ shadow, className }: { shadow: Shadow; className?: string }) => (
  <svg className={className} viewBox="0 0 120 60" aria-hidden focusable="false" data-shadow={shadow}>
    {shadow === 'chest' ? (
      <g>
        <rect x="30" y="18" width="60" height="30" rx="6" fill="currentColor" />
        <path d="M96 10 l2 -5 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 Z" fill="#fffbe0" opacity="0.9" />
      </g>
    ) : (
      <path d="M8 30 L0 14 L4 30 L0 46 Z M10 30 Q40 6 84 14 Q118 22 118 30 Q118 38 84 46 Q40 54 10 30 Z" fill="currentColor" />
    )}
  </svg>
);

/** The float: red over white, with a light on top. */
export const FloatArt = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 44" aria-hidden focusable="false">
    <line x1="12" y1="0" x2="12" y2="8" stroke="#2a2a2a" strokeWidth="2" />
    <circle cx="12" cy="4" r="3" fill="#ffe36b" />
    <path d="M12 8 Q22 14 20 24 L4 24 Q2 14 12 8 Z" fill="#e2333a" />
    <path d="M4 24 L20 24 Q20 34 12 40 Q4 34 4 24 Z" fill="#f7f7f2" />
    <line x1="12" y1="40" x2="12" y2="44" stroke="#2a2a2a" strokeWidth="2" />
  </svg>
);

/** A medal, small, as the machine's counters show it. */
export const MedalArt = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 20 20" aria-hidden focusable="false">
    <circle cx="10" cy="10" r="9" fill="#d9dde3" stroke="#8a929c" strokeWidth="1.4" />
    <circle cx="10" cy="10" r="5.6" fill="none" stroke="#9aa2ac" strokeWidth="1.2" />
    <ellipse cx="7.5" cy="7" rx="3" ry="1.4" fill="#fff" opacity="0.8" />
  </svg>
);
