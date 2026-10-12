import type { ReactNode } from 'react';
import { TIER_DIGITS, type Tier } from './lottery';
import styles from './MedalPusher.module.css';

/** Which prize a digit belongs to: the seven, the odd digits or the even ones. */
export const tierOfDigit = (digit: number): Exclude<Tier, 'miss'> => (digit === 7 ? 'seven' : TIER_DIGITS.big.includes(digit) ? 'big' : 'small');

/** A four-pointed glint, `size` from its middle to a point. */
const Glint = ({ x, y, size }: { x: number; y: number; size: number }) => {
  /** The point `reach` from the middle, `turn` eighths of a turn round from the top. */
  const at = (turn: number, reach: number) => {
    const angle = (turn * Math.PI) / 4;
    return `${(x + Math.sin(angle) * reach).toFixed(1)},${(y - Math.cos(angle) * reach).toFixed(1)}`;
  };
  // Out to a point and in to the waist, four times round.
  const points = [0, 2, 4, 6].flatMap((turn) => [at(turn, size), at(turn + 1, size * 0.24)]);
  return <polygon points={points.join(' ')} fill="#fff7c2" />;
};

/** What is behind every picture of a family, so that the family can be told from the colour of the tile alone. */
const BACKDROP: Record<Exclude<Tier, 'miss'>, ReactNode> = {
  // The seven: a cream tile.
  seven: <rect width="130" height="100" fill="#fff6d6" />,
  // The treasures: a jewel case lined in purple.
  big: (
    <>
      <rect width="130" height="100" fill="#2a1470" />
      <rect x="6" y="5" width="118" height="90" rx="12" fill="#3b1f9a" />
      <Glint x={17} y={17} size={8} />
      <Glint x={114} y={84} size={7} />
    </>
  ),
  // The journeys: sky over a green field.
  small: (
    <>
      <rect width="130" height="100" fill="#8fd6ff" />
      <ellipse cx="22" cy="20" rx="14" ry="6" fill="#ffffff" opacity="0.85" />
      <ellipse cx="110" cy="30" rx="12" ry="5" fill="#ffffff" opacity="0.85" />
      <rect y="80" width="130" height="20" fill="#3aa655" />
      <rect y="80" width="130" height="3" fill="#7bd66a" />
    </>
  ),
};

const OUTLINE = { stroke: '#3a2504', strokeWidth: 3, strokeLinejoin: 'round' as const };
const DARK = { stroke: '#10224a', strokeWidth: 3, strokeLinejoin: 'round' as const };

/** The picture on each digit's tile, and where on it the digit is written: the height of its baseline and its size. */
const ART: Record<number, { picture: ReactNode; at: number; size: number }> = {
  // A gold medal.
  1: {
    at: 65,
    size: 46,
    picture: (
      <>
        <circle cx="65" cy="53" r="39" fill="#b47c06" {...OUTLINE} />
        <circle cx="65" cy="49" r="39" fill="#ffd65c" {...OUTLINE} />
        <circle cx="65" cy="49" r="30" fill="#ffe98a" stroke="#c9900a" strokeWidth="2.5" />
        <path d="M41 40 A26 26 0 0 1 62 24" fill="none" stroke="#fffbe0" strokeWidth="5" strokeLinecap="round" />
      </>
    ),
  },
  // A cut jewel.
  3: {
    at: 62,
    size: 44,
    picture: (
      <>
        <polygon points="24,40 42,18 88,18 106,40 65,90" fill="#39c6ef" {...OUTLINE} stroke="#06324d" />
        <polygon points="42,18 54,40 24,40" fill="#9be9ff" />
        <polygon points="42,18 88,18 76,40 54,40" fill="#d4f7ff" />
        <polygon points="88,18 106,40 76,40" fill="#27a5d6" />
        <polygon points="24,40 54,40 65,90" fill="#2fb4e2" />
        <polygon points="76,40 106,40 65,90" fill="#1380b0" />
        <polygon points="24,40 42,18 88,18 106,40 65,90" fill="none" {...OUTLINE} stroke="#06324d" />
      </>
    ),
  },
  // A crown.
  5: {
    at: 72,
    size: 42,
    picture: (
      <>
        <path d="M27 70 L20 31 L43 49 L65 21 L87 49 L110 31 L103 70 Z" fill="#ffd65c" {...OUTLINE} />
        <rect x="25" y="68" width="80" height="17" rx="4" fill="#f0a91a" {...OUTLINE} />
        <circle cx="20" cy="29" r="6.5" fill="#ff4f7d" {...OUTLINE} strokeWidth="2.5" />
        <circle cx="65" cy="19" r="7" fill="#5fd6f7" {...OUTLINE} strokeWidth="2.5" />
        <circle cx="110" cy="29" r="6.5" fill="#6ee07a" {...OUTLINE} strokeWidth="2.5" />
        <circle cx="38" cy="76.5" r="3.5" fill="#ff4f7d" />
        <circle cx="92" cy="76.5" r="3.5" fill="#ff4f7d" />
      </>
    ),
  },
  // A sack of gold.
  9: {
    at: 80,
    size: 42,
    picture: (
      <>
        <path d="M51 32 L43 13 L56 20 L65 11 L74 20 L87 13 L79 32 Z" fill="#f6c544" {...OUTLINE} />
        <path d="M65 31 C40 31 25 52 25 68 C25 85 42 92 65 92 C88 92 105 85 105 68 C105 52 90 31 65 31 Z" fill="#f6c544" {...OUTLINE} />
        <path d="M36 62 C38 50 46 42 54 39" fill="none" stroke="#fff3b0" strokeWidth="5" strokeLinecap="round" />
        <rect x="47" y="27" width="36" height="9" rx="4.5" fill="#d1123f" {...OUTLINE} strokeWidth="2.5" />
      </>
    ),
  },
  // A car.
  2: {
    at: 76,
    size: 42,
    picture: (
      <>
        <path
          d="M15 80 L15 60 Q15 52 24 50 L37 47 L47 29 Q49 25 55 25 L85 25 Q91 25 94 30 L104 47 L109 49 Q116 51 116 60 L116 80 Z"
          fill="#f0433a"
          {...OUTLINE}
          stroke="#4d0a0a"
        />
        <path d="M53 31 L45 47 L67 47 L67 31 Z" fill="#dff5ff" />
        <path d="M73 31 L73 47 L97 47 L88 31 Z" fill="#dff5ff" />
        <rect x="108" y="56" width="8" height="7" rx="2" fill="#ffe98a" />
        <circle cx="39" cy="82" r="12" fill="#1b1b2a" />
        <circle cx="39" cy="82" r="5" fill="#c9c9d6" />
        <circle cx="93" cy="82" r="12" fill="#1b1b2a" />
        <circle cx="93" cy="82" r="5" fill="#c9c9d6" />
      </>
    ),
  },
  // A sailing boat.
  4: {
    at: 64,
    size: 42,
    picture: (
      <>
        <rect y="78" width="130" height="22" fill="#1f7fd6" />
        <path d="M0 80 Q11 74 22 80 T44 80 T66 80 T88 80 T110 80 T132 80 V84 H0 Z" fill="#7cc4ff" />
        <rect x="63" y="10" width="4" height="58" fill="#5a3a00" />
        <path d="M70 12 L70 62 L108 62 Z" fill="#fffdf2" {...DARK} />
        <path d="M60 22 L60 62 L26 62 Z" fill="#ffe98a" {...DARK} />
        <path d="M67 10 L82 15 L67 20 Z" fill="#d1123f" />
        <path d="M17 67 L113 67 L100 88 L30 88 Z" fill="#c2452b" {...DARK} />
        <rect x="24" y="71" width="82" height="4" fill="#fffdf2" />
      </>
    ),
  },
  // A hot-air balloon.
  6: {
    at: 62,
    size: 42,
    picture: (
      <>
        <path d="M58 76 L57 86 M72 76 L73 86" fill="none" stroke="#5a3a00" strokeWidth="2.5" />
        <path d="M65 8 C39 8 25 27 25 43 C25 60 44 71 56 78 L74 78 C86 71 105 60 105 43 C105 27 91 8 65 8 Z" fill="#ff5a4f" {...DARK} />
        <path d="M65 8 C53 8 47 27 47 43 C47 60 55 71 60 78 L70 78 C75 71 83 60 83 43 C83 27 77 8 65 8 Z" fill="#ffd65c" />
        <path d="M65 8 C39 8 25 27 25 43 C25 60 44 71 56 78 L74 78 C86 71 105 60 105 43 C105 27 91 8 65 8 Z" fill="none" {...DARK} />
        <rect x="55" y="84" width="20" height="12" rx="2.5" fill="#a5651f" {...DARK} strokeWidth="2.5" />
      </>
    ),
  },
  // A rocket.
  8: {
    at: 72,
    size: 40,
    picture: (
      <>
        <path d="M53 80 Q65 108 77 80 Z" fill="#ff8a1f" />
        <path d="M59 80 Q65 96 71 80 Z" fill="#fff07a" />
        <path d="M45 54 L24 84 L47 78 Z" fill="#d1123f" {...DARK} />
        <path d="M85 54 L106 84 L83 78 Z" fill="#d1123f" {...DARK} />
        <path d="M65 5 C84 20 90 46 87 80 L43 80 C40 46 46 20 65 5 Z" fill="#f4f4fb" {...DARK} />
        <path d="M65 5 C74 12 80 22 84 34 L46 34 C50 22 56 12 65 5 Z" fill="#d1123f" {...DARK} />
      </>
    ),
  },
  // The lucky seven, on the prize ball it brings.
  7: {
    at: 80,
    size: 84,
    picture: (
      <>
        <circle cx="65" cy="52" r="42" fill="#a86b00" />
        <circle cx="65" cy="49" r="42" fill="#ffc21f" stroke="#7a4f06" strokeWidth="3" />
        <circle cx="65" cy="49" r="33" fill="#ffe27a" />
        <path d="M38 40 A30 30 0 0 1 62 20" fill="none" stroke="#fffbe0" strokeWidth="5" strokeLinecap="round" />
      </>
    ),
  },
};

/**
 * The picture a digit wears on the reels, with the digit written on it. The
 * odd digits, which lead to the treasure chests, are treasures; the even
 * ones, which lead to the sugoroku board, are ways of travelling; and the
 * seven is the lucky seven. It is decoration: whoever shows it says the digit in words.
 */
export const ReelSymbol = ({ digit }: { digit: number }) => {
  const tier = tierOfDigit(digit);
  const { picture, at, size } = ART[digit];
  return (
    <svg className={styles.symbol} viewBox="0 0 130 100" data-family={tier} aria-hidden>
      {BACKDROP[tier]}
      {picture}
      <text className={styles.symbolDigit} x="65" y={at} fontSize={size} textAnchor="middle">
        {digit}
      </text>
    </svg>
  );
};
