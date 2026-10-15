/**
 * The machine's pictures, drawn here: the calico cat whose face the cabinet
 * is, its paw that shows its hand, the hands on the buttons, and a medal.
 *
 * The cat is this machine's own: a white cat with an orange patch over its
 * left ear and a black one on its right, a red collar with a bell, and a
 * ω mouth, that raises its left paw the way a shop's beckoning cat does. Its
 * paw is a cat's paw, so its scissors are two toes and its paper five, each
 * with a pink bean.
 */

import { FACE_STAR, MEDAL_PAINT } from '../MedalPusher/medalLook';
import type { Hand } from './engine';

// ── The hands on the buttons ────────────────────────────────────────────────

/** A person's hand as a button shows it: a fist, two fingers in a V, or five spread. */
export const HandIcon = ({ hand, className }: { hand: Hand; className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" aria-hidden focusable="false">
    <g fill="#fff7ec" stroke="#2a1d14" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round">
      {hand === 'gu' && (
        <>
          <rect x="21" y="49" width="20" height="12" rx="3" />
          <rect x="13" y="20" width="38" height="33" rx="12" />
          <path d="M22 21 v9 M31 19 v10 M40 20 v9" fill="none" />
          <path d="M12 36 q2 -6 12 -5 l10 2 q5 1.5 4 6 q-1 4.5 -6 4 l-13 -1 q-7 -1 -7 -6 z" />
        </>
      )}
      {hand === 'choki' && (
        <>
          <rect x="21" y="51" width="20" height="10" rx="3" />
          <rect x="20" y="6" width="10" height="34" rx="5" transform="rotate(-15 25 38)" />
          <rect x="33" y="5" width="10" height="35" rx="5" transform="rotate(13 38 38)" />
          <rect x="16" y="31" width="34" height="24" rx="10" />
          <path d="M40 33 q6 0 7 6 M38 41 q6 0 8 5" fill="none" />
          <path d="M14 42 q1 -5 9 -4 l9 2 q4 1 3.5 5 q-0.5 4 -5 3.5 l-11 -1 q-6 -0.5 -5.5 -5.5 z" />
        </>
      )}
      {hand === 'pa' && (
        <>
          <rect x="22" y="52" width="20" height="10" rx="3" />
          <rect x="16" y="9" width="9" height="28" rx="4.5" transform="rotate(-18 21 37)" />
          <rect x="25.5" y="4" width="9" height="32" rx="4.5" transform="rotate(-5 30 36)" />
          <rect x="35" y="5" width="9" height="31" rx="4.5" transform="rotate(7 39 36)" />
          <rect x="43" y="12" width="8.5" height="26" rx="4.25" transform="rotate(20 47 38)" />
          <rect x="17" y="30" width="32" height="26" rx="11" />
          <rect x="13" y="30" width="9" height="22" rx="4.5" transform="rotate(-35 18 50)" />
        </>
      )}
    </g>
  </svg>
);

// ── The cat's paw ───────────────────────────────────────────────────────────

const FUR = '#fffaf2';
const LINE = '#4a3a30';
const BEAN = '#f5a3b5';
const ORANGE = '#f2a03d';
const BLACK = '#2f2a28';

/**
 * The cat's raised left paw, showing a hand, or beckoning (a fist, bent), and
 * the arm it is raised on, with the orange of its calico fur at the wrist.
 */
export const CatPaw = ({ hand }: { hand: Hand | 'beckon' }) => (
  <g stroke={LINE} strokeWidth="3" strokeLinejoin="round">
    {/* The arm, coming up from below the collar. */}
    <path d="M30 140 L36 84 Q50 70 66 84 L72 140 Z" fill={FUR} />
    <path d="M33 118 Q50 108 70 116 L72 140 L30 140 Z" fill={ORANGE} stroke="none" />
    {(hand === 'gu' || hand === 'beckon') && (
      <g>
        {[26, 41, 57, 72].map((x) => (
          <circle key={x} cx={x} cy={hand === 'beckon' ? 44 : 40} r="11" fill={FUR} />
        ))}
        <ellipse cx="50" cy="62" rx="34" ry="27" fill={FUR} />
        <path d="M33 45 v6 M48 43 v7 M64 45 v6" fill="none" />
        <ellipse cx="50" cy="68" rx="13" ry="10" fill={BEAN} strokeWidth="1.6" />
        {[30, 43, 57, 70].map((x, i) => (
          <ellipse key={x} cx={x} cy={i === 0 || i === 3 ? 55 : 52} rx="4.5" ry="5" fill={BEAN} strokeWidth="1.2" />
        ))}
      </g>
    )}
    {hand === 'choki' && (
      <g>
        <rect x="27" y="4" width="18" height="48" rx="9" fill={FUR} transform="rotate(-16 36 50)" />
        <rect x="55" y="4" width="18" height="48" rx="9" fill={FUR} transform="rotate(16 64 50)" />
        <ellipse cx="50" cy="64" rx="32" ry="25" fill={FUR} />
        <circle cx="26" cy="58" r="9" fill={FUR} />
        <circle cx="74" cy="58" r="9" fill={FUR} />
        <ellipse cx="29" cy="13" rx="5" ry="6" fill={BEAN} strokeWidth="1.2" transform="rotate(-16 29 13)" />
        <ellipse cx="71" cy="13" rx="5" ry="6" fill={BEAN} strokeWidth="1.2" transform="rotate(16 71 13)" />
        <ellipse cx="50" cy="70" rx="12" ry="9" fill={BEAN} strokeWidth="1.6" />
      </g>
    )}
    {hand === 'pa' && (
      <g>
        {[-58, -27, 0, 27, 58].map((angle) => (
          <g key={angle} transform={`rotate(${angle} 50 66)`}>
            <rect x="41" y="8" width="18" height="46" rx="9" fill={FUR} />
            <ellipse cx="50" cy="17" rx="5" ry="6" fill={BEAN} strokeWidth="1.2" />
          </g>
        ))}
        <ellipse cx="50" cy="64" rx="31" ry="25" fill={FUR} />
        <ellipse cx="50" cy="69" rx="13" ry="10" fill={BEAN} strokeWidth="1.6" />
      </g>
    )}
  </g>
);

// ── The cat ─────────────────────────────────────────────────────────────────

/** How the cat looks: waiting, calling, thrown and watching, or as the throw went for the player. */
export type CatMood = 'idle' | 'calling' | 'won' | 'lost' | 'draw';

/**
 * The cat's face, in a box 200 wide and 200 high: its ears at the top, its
 * collar and bell at the bottom. `won` and `lost` are the player's: the cat
 * screws its eyes up when it loses, and laughs when it wins.
 */
export const CatFace = ({ mood, clipId }: { mood: CatMood; clipId: string }) => {
  const eyes = (() => {
    if (mood === 'lost')
      return (
        <g fill="none" stroke={LINE} strokeWidth="5" strokeLinecap="round">
          <path d="M60 108 Q72 92 84 108" />
          <path d="M116 108 Q128 92 140 108" />
        </g>
      );
    if (mood === 'won')
      return (
        <g fill="none" stroke={LINE} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M62 94 L82 103 L62 112" />
          <path d="M138 94 L118 103 L138 112" />
        </g>
      );
    if (mood === 'draw')
      return (
        <g>
          {[72, 128].map((x) => (
            <g key={x}>
              <circle cx={x} cy="102" r="13" fill="#fff" stroke={LINE} strokeWidth="3" />
              <circle cx={x} cy="103" r="5" fill={LINE} />
            </g>
          ))}
        </g>
      );
    return (
      <g>
        {[72, 128].map((x) => (
          <g key={x}>
            <ellipse cx={x} cy="103" rx="9.5" ry={mood === 'calling' ? 10 : 12.5} fill={LINE} />
            <circle cx={x - 3} cy="98" r="3.4" fill="#fff" />
          </g>
        ))}
        {mood === 'calling' && (
          <g stroke={LINE} strokeWidth="4" strokeLinecap="round">
            <path d="M58 84 L84 90" />
            <path d="M142 84 L116 90" />
          </g>
        )}
      </g>
    );
  })();
  const mouth =
    mood === 'lost' ? (
      <g stroke={LINE} strokeWidth="3" strokeLinejoin="round">
        <path d="M84 128 Q100 156 116 128 Z" fill="#a8323a" />
        <path d="M92 140 Q100 132 108 140 Q104 148 100 148 Q96 148 92 140 Z" fill={BEAN} strokeWidth="2" />
      </g>
    ) : mood === 'won' ? (
      <path d="M84 136 q4 -6 8 0 q4 6 8 0 q4 -6 8 0 q4 6 8 0" fill="none" stroke={LINE} strokeWidth="3" strokeLinecap="round" />
    ) : mood === 'draw' ? (
      <ellipse cx="100" cy="136" rx="6" ry="7" fill="#a8323a" stroke={LINE} strokeWidth="3" />
    ) : (
      <path d="M100 124 Q100 134 91 134 Q83 134 82 127 M100 124 Q100 134 109 134 Q117 134 118 127" fill="none" stroke={LINE} strokeWidth="3" strokeLinecap="round" />
    );
  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <path d="M40 82 L50 18 L94 46 Q100 45 106 46 L150 18 L160 82 Q178 104 176 126 Q172 178 100 180 Q28 178 24 126 Q22 104 40 82 Z" />
        </clipPath>
      </defs>
      {/* The head and ears, white, with the calico's patches inside the outline. */}
      <path d="M40 82 L50 18 L94 46 Q100 45 106 46 L150 18 L160 82 Q178 104 176 126 Q172 178 100 180 Q28 178 24 126 Q22 104 40 82 Z" fill={FUR} />
      <g clipPath={`url(#${clipId})`}>
        <path d="M20 10 L104 10 Q96 54 70 64 Q46 72 30 100 L20 100 Z" fill={ORANGE} />
        <path d="M118 10 L190 10 L190 98 Q172 94 160 80 Q146 66 134 56 Q120 40 118 10 Z" fill={BLACK} />
        <ellipse cx="164" cy="132" rx="16" ry="12" fill={ORANGE} opacity="0.9" />
      </g>
      <path d="M50 26 L56 62 L82 48 Z" fill={BEAN} opacity="0.85" />
      <path d="M150 26 L144 62 L118 48 Z" fill="#8a5a62" opacity="0.9" />
      <path d="M40 82 L50 18 L94 46 Q100 45 106 46 L150 18 L160 82 Q178 104 176 126 Q172 178 100 180 Q28 178 24 126 Q22 104 40 82 Z" fill="none" stroke={LINE} strokeWidth="4" strokeLinejoin="round" />
      {/* Cheeks, whiskers, eyes, nose and mouth. */}
      <ellipse cx="54" cy="130" rx="11" ry="7" fill={BEAN} opacity="0.55" />
      <ellipse cx="146" cy="130" rx="11" ry="7" fill={BEAN} opacity="0.55" />
      <g stroke={LINE} strokeWidth="2.2" strokeLinecap="round">
        <path d="M58 122 L18 114 M58 128 L16 128 M58 134 L20 142" />
        <path d="M142 122 L182 114 M142 128 L184 128 M142 134 L180 142" />
      </g>
      {eyes}
      <path d="M93 117 L107 117 L100 125 Z" fill="#e8798f" stroke={LINE} strokeWidth="2" strokeLinejoin="round" />
      {mouth}
      {/* The collar and its bell. */}
      <path d="M46 162 Q100 196 154 162 L156 172 Q100 208 44 172 Z" fill="#d93a3a" stroke={LINE} strokeWidth="3" strokeLinejoin="round" />
      <circle cx="100" cy="190" r="11" fill="#f6c443" stroke={LINE} strokeWidth="3" />
      <path d="M91 188 L109 188 M100 192 L100 200" stroke={LINE} strokeWidth="2.4" strokeLinecap="round" />
    </g>
  );
};

// ── A medal ─────────────────────────────────────────────────────────────────

/** The star on a medal's face, in a medal of radius 15 about (16, 16). */
const STAR = FACE_STAR.map(([x, y]) => `${(16 + x * 15).toFixed(2)},${(16 + y * 15).toFixed(2)}`).join(' ');

/** One of the medal center's medals, copper-nickel with a raised rim and its star, as the other machines strike them. */
export const MedalIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 32 32" aria-hidden focusable="false">
    <circle cx="16" cy="16" r="15" fill={MEDAL_PAINT.face} stroke={MEDAL_PAINT.edge} strokeWidth="1.4" />
    <circle cx="16" cy="16" r="12.2" fill="none" stroke={MEDAL_PAINT.light} strokeWidth="1.6" />
    <circle cx="16.4" cy="16.5" r="12.2" fill="none" stroke={MEDAL_PAINT.rim} strokeWidth="0.8" opacity="0.7" />
    <polygon points={STAR} fill={MEDAL_PAINT.dark} />
  </svg>
);
