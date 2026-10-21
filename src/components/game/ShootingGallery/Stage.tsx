'use client';

import { memo, type RefObject } from 'react';
import { CORKS, KINDS, PER_TIER, SHELF, TARGETS, tierOf, type KindId } from './engine';
import type { ShootingGalleryStrings } from './i18n';
import { COUNTER_Y, CORK_BOX, GUN_BOX, GUN_PIVOT, MUZZLE_REACH, NOREN_H, PUFF_BOX, SIGHT_BOX, STAGE_H, STAGE_W, TIER_PLACES, figureHome, figureLayer, figureSpot, type LayerBox } from './scene';
import styles from './ShootingGallery.module.css';

/**
 * The stall: the static picture (the noren, the dark curtain, the three tiers of red felt, the counter), drawn once and
 * never again while a play goes on; and over it, each thing that moves in a layer of its own, which the page moves by
 * its transform alone, a frame at a time (PlayTab.tsx): each figure, the gun, the sight, the cork in flight and the puff
 * at the muzzle. A browser moves such a layer on its compositor without painting anything, so the picture under it is
 * never painted again for a frame of the play. The lanterns at the corners sway by a CSS animation, on the compositor
 * too.
 *
 * The figures' buttons lie over the stall, one on each figure's place on the shelf (`figureSpot`), with its tag in
 * medals on it: a tap anywhere on a figure's place puts the sight on it.
 */

/** A layer's place over the stall, in percent of it; and the viewBox of the picture in it, in the stall's units. */
export const layerStyle = (box: LayerBox) => ({
  left: `${(box.x / STAGE_W) * 100}%`,
  top: `${(box.y / STAGE_H) * 100}%`,
  width: `${(box.w / STAGE_W) * 100}%`,
  height: `${(box.h / STAGE_H) * 100}%`,
});
const viewOf = (box: LayerBox) => `${box.x} ${box.y} ${box.w} ${box.h}`;

/** The sweet boxes' wrappings, left to right on the bottom tier. */
const BOX_PAINT = [
  { face: '#d83a3a', side: '#9e2323', top: '#ef6a5e' },
  { face: '#2f6fbf', side: '#1f4a85', top: '#5b93d8' },
  { face: '#e8b923', side: '#b38710', top: '#f5d35e' },
] as const;

/** A figure, drawn with its foot's middle at the origin, as big as it is on the front tier. */
function FigureArt({ kind, variant }: { kind: KindId; variant: number }) {
  switch (kind) {
    case 'box': {
      const paint = BOX_PAINT[variant % BOX_PAINT.length];
      return (
        <g>
          <ellipse cx="0" cy="0.5" rx="18" ry="2.6" fill="#000" opacity="0.35" />
          <path d="M -17 -32 L -12 -38 L 21 -38 L 17 -32 Z" fill={paint.top} />
          <path d="M 17 -32 L 21 -38 L 21 -6 L 17 0 Z" fill={paint.side} />
          <rect x="-17" y="-32" width="34" height="32" rx="1.5" fill={paint.face} />
          <rect x="-13" y="-23" width="26" height="13" rx="3" fill="#fff8e8" />
          <circle cx="0" cy="-16.5" r="4" fill={paint.face} />
          <path d={`M -4 -16.5 L -8.5 -19.5 L -8.5 -13.5 Z M 4 -16.5 L 8.5 -19.5 L 8.5 -13.5 Z`} fill={paint.face} />
          <rect x="-17" y="-32" width="34" height="3" fill="#ffffff" opacity="0.25" />
        </g>
      );
    }
    case 'daruma':
      return (
        <g>
          <ellipse cx="0" cy="0.5" rx="19" ry="3" fill="#000" opacity="0.35" />
          <path d="M 0 -48 C 16 -48 21 -32 20 -18 C 19 -6 12 0 0 0 C -12 0 -19 -6 -20 -18 C -21 -32 -16 -48 0 -48 Z" fill="#c62828" stroke="#7d1414" strokeWidth="1.2" />
          <ellipse cx="0" cy="-30" rx="12" ry="10.5" fill="#fbf1e0" />
          <path d="M -9 -36 Q -5 -39 -2 -36 M 2 -36 Q 5 -39 9 -36" fill="none" stroke="#1d1d1d" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="-5" cy="-30.5" r="2.6" fill="#fff" stroke="#1d1d1d" strokeWidth="1.2" />
          <circle cx="5" cy="-30.5" r="2.6" fill="#fff" stroke="#1d1d1d" strokeWidth="1.2" />
          <circle cx="-5" cy="-30.5" r="1.1" fill="#1d1d1d" />
          <circle cx="5" cy="-30.5" r="1.1" fill="#1d1d1d" />
          <path d="M -6 -24 Q 0 -21 6 -24" fill="none" stroke="#1d1d1d" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M -11 -13 Q -6 -8 0 -12 Q 6 -8 11 -13" fill="none" stroke="#e8b923" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M -8 -6 Q 0 -2 8 -6" fill="none" stroke="#e8b923" strokeWidth="1.6" strokeLinecap="round" />
          <ellipse cx="-11" cy="-36" rx="3.5" ry="6" fill="#ffffff" opacity="0.18" />
        </g>
      );
    case 'kokeshi':
      return (
        <g>
          <ellipse cx="0" cy="0.5" rx="11" ry="2.2" fill="#000" opacity="0.35" />
          <rect x="-9" y="-50" width="18" height="50" rx="3" fill="#ecd29f" stroke="#a9834b" strokeWidth="0.9" />
          <rect x="-9" y="-4" width="18" height="4" rx="1.5" fill="#8a5a2b" />
          <rect x="-9" y="-50" width="18" height="5" fill="#2e7d4f" />
          <circle cx="0" cy="-34" r="4.6" fill="#d83a3a" />
          <circle cx="0" cy="-34" r="1.6" fill="#f6c343" />
          <circle cx="-4" cy="-21" r="3.6" fill="#d83a3a" />
          <circle cx="4.5" cy="-14" r="3.2" fill="#d83a3a" />
          <path d="M 2 -22 q 3 -3 6 -1 M -6 -13 q -2 -3 1 -5" fill="none" stroke="#2e7d4f" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="0" cy="-59" r="11.5" fill="#f6e2c8" stroke="#a9834b" strokeWidth="0.9" />
          <path d="M -11.5 -59 C -11.5 -69 -6 -71 0 -71 C 6 -71 11.5 -69 11.5 -59 C 8 -63 4 -64 0 -63 C -4 -64 -8 -63 -11.5 -59 Z" fill="#1d1d1d" />
          <path d="M -5 -57 q 1.6 1.2 3 0 M 2 -57 q 1.6 1.2 3 0" fill="none" stroke="#1d1d1d" strokeWidth="1.1" strokeLinecap="round" />
          <circle cx="-6" cy="-53.5" r="1.8" fill="#f28b82" opacity="0.8" />
          <circle cx="6" cy="-53.5" r="1.8" fill="#f28b82" opacity="0.8" />
          <path d="M -1.2 -51.5 q 1.2 0.8 2.4 0" fill="none" stroke="#c62828" strokeWidth="1" strokeLinecap="round" />
        </g>
      );
    case 'manju':
      return (
        <g>
          <ellipse cx="0" cy="0.6" rx="33" ry="3" fill="#000" opacity="0.35" />
          <path d="M -32 -24 L -27 -30 L 36 -30 L 32 -24 Z" fill="#fbefd6" />
          <path d="M 32 -24 L 36 -30 L 36 -5 L 32 0 Z" fill="#cdb488" />
          <rect x="-32" y="-24" width="64" height="24" rx="1.5" fill="#f3e3c3" stroke="#b79a68" strokeWidth="0.8" />
          <rect x="-5" y="-24" width="10" height="24" fill="#c0392b" />
          <path d="M -5 -24 L -0.5 -30 L 9.5 -30 L 5 -24 Z" fill="#d9584a" />
          {/* The town's steam over a bowl, on either side of the band. */}
          {[-19, 19].map((x) => (
            <g key={x} fill="none" stroke="#8a5a2b" strokeWidth="1.5" strokeLinecap="round">
              <path d={`M ${x - 7} -8 Q ${x} -2 ${x + 7} -8`} />
              <path d={`M ${x - 3.5} -11 c -2.5 -3 2.5 -4 0 -8 M ${x} -11 c -2.5 -3 2.5 -4 0 -8 M ${x + 3.5} -11 c -2.5 -3 2.5 -4 0 -8`} />
            </g>
          ))}
        </g>
      );
    case 'cat':
      return (
        <g>
          <ellipse cx="0" cy="0.8" rx="34" ry="3.6" fill="#000" opacity="0.4" />
          {/* The cushion it sits on. */}
          <rect x="-31" y="-9" width="62" height="9" rx="4" fill="#b3261e" stroke="#6e1410" strokeWidth="1" />
          <path d="M -24 -9 L -28 -1 M 24 -9 L 28 -1" stroke="#f6c343" strokeWidth="1.6" />
          {/* Its body, sitting. */}
          <path d="M -22 -9 C -25 -26 -22 -40 -14 -46 L 14 -46 C 22 -40 25 -26 22 -9 Z" fill="#fbfaf6" stroke="#9a9184" strokeWidth="1.1" />
          <ellipse cx="11" cy="-28" rx="7" ry="5" fill="#e98a3a" opacity="0.9" />
          <ellipse cx="-14" cy="-18" rx="5" ry="4" fill="#3a3330" opacity="0.85" />
          {/* The raised paw, by its head. */}
          <path d="M -15 -44 C -24 -50 -26 -62 -22 -70 C -19 -76 -12 -75 -11 -69 C -10 -62 -11 -54 -9 -47 Z" fill="#fbfaf6" stroke="#9a9184" strokeWidth="1.1" />
          <path d="M -21 -71 q 2 -2 4 0 M -17 -72 q 2 -2 4 0" fill="none" stroke="#c7bfb2" strokeWidth="0.9" />
          {/* The head. */}
          <circle cx="3" cy="-58" r="20" fill="#fbfaf6" stroke="#9a9184" strokeWidth="1.1" />
          <path d="M -12 -70 L -10 -84 L 0 -76 Z" fill="#fbfaf6" stroke="#9a9184" strokeWidth="1.1" />
          <path d="M 18 -70 L 16 -84 L 6 -76 Z" fill="#fbfaf6" stroke="#9a9184" strokeWidth="1.1" />
          <path d="M -9 -73 L -9.5 -80 L -3 -75.5 Z M 15 -73 L 15.5 -80 L 9 -75.5 Z" fill="#f4a7b0" />
          <path d="M 12 -74 C 18 -72 21 -66 22 -61 C 17 -64 13 -69 12 -74 Z" fill="#e98a3a" opacity="0.9" />
          <path d="M -6 -60 q 3 -3 6 0 M 6 -60 q 3 -3 6 0" fill="none" stroke="#2b2522" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M 3 -54 l -2 2 l 2 1.5 l 2 -1.5 Z" fill="#f28b82" />
          <path d="M 3 -51.5 q -3 3 -5 1 M 3 -51.5 q 3 3 5 1" fill="none" stroke="#2b2522" strokeWidth="1" strokeLinecap="round" />
          <path d="M -9 -53 l -9 -2 M -9 -51 l -9 1 M 15 -53 l 9 -2 M 15 -51 l 9 1" stroke="#9a9184" strokeWidth="0.8" />
          {/* The collar and its bell. */}
          <path d="M -15 -43 Q 3 -36 21 -43 L 21 -40 Q 3 -33 -15 -40 Z" fill="#c62828" />
          <circle cx="3" cy="-35" r="4" fill="#f2c230" stroke="#9c7412" strokeWidth="0.9" />
          <path d="M 0.5 -35 L 5.5 -35 M 3 -35 L 3 -32" stroke="#7a5a10" strokeWidth="0.9" />
          {/* The other paw, on its chest. */}
          <ellipse cx="11" cy="-24" rx="6" ry="4.5" fill="#fbfaf6" stroke="#9a9184" strokeWidth="1" />
          <ellipse cx="-6" cy="-62" rx="4" ry="6" fill="#ffffff" opacity="0.5" />
        </g>
      );
  }
}

/** One figure on the shelf, in its layer: the page moves the inner one (`movers[target]`) and clips the outer (`clips[target]`) as it falls behind its shelf. */
const FigureLayerView = memo(function FigureLayerView({ target, clip, mover }: { target: number; clip: (el: HTMLDivElement | null) => void; mover: (el: HTMLDivElement | null) => void }) {
  const box = figureLayer(target);
  const home = figureHome(target);
  const scale = TIER_PLACES[tierOf(target)].scale;
  return (
    <div className={styles.layer} style={layerStyle(box)} ref={clip} data-figure={target}>
      <div className={styles.mover} ref={mover}>
        <svg className={styles.layerSvg} viewBox={viewOf(box)} focusable="false" aria-hidden="true">
          <g transform={`translate(${home.x} ${home.y}) scale(${scale})`}>
            <FigureArt kind={SHELF[target]} variant={target % PER_TIER} />
          </g>
        </svg>
      </div>
    </div>
  );
});

/** The noren over the stall: four panels of indigo cloth, the stall's name in white across the middle two, waves of steam along the hem. */
const Noren = ({ text }: { text: string }) => {
  const panels = 4;
  const width = STAGE_W / panels;
  return (
    <g aria-hidden="true">
      <rect x="0" y="0" width={STAGE_W} height="6" fill="#3a2414" />
      {Array.from({ length: panels }, (_, i) => (
        <g key={i}>
          <path d={`M ${i * width + 1} 5 L ${(i + 1) * width - 1} 5 L ${(i + 1) * width - 1} ${NOREN_H - 2} Q ${(i + 0.5) * width} ${NOREN_H + 2} ${i * width + 1} ${NOREN_H - 2} Z`} fill="#22306b" />
          <path d={`M ${i * width + 6} ${NOREN_H - 8} q 6 -4 12 0 t 12 0 t 12 0 t 12 0 t 12 0 t 12 0 t 12 0`} fill="none" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="1.4" />
        </g>
      ))}
      <text x={STAGE_W / 2 - width / 2} y="29" textAnchor="middle" className={styles.norenText}>
        {text.charAt(0)}
      </text>
      <text x={STAGE_W / 2 + width / 2} y="29" textAnchor="middle" className={styles.norenText}>
        {text.slice(1)}
      </text>
    </g>
  );
};

/** A tier of the shelf: its shadow, the red felt on its top, the cloth hanging from its front with its folds and fringe. */
const Tier = ({ tier }: { tier: number }) => {
  const { y, back, clothTo, x0, x1 } = TIER_PLACES[tier];
  const folds = Math.round((x1 - x0) / 18);
  return (
    <g aria-hidden="true">
      <rect x={x0 - 4} y={back - 4} width={x1 - x0 + 8} height="6" fill="#000" opacity="0.45" />
      <path d={`M ${x0} ${back} L ${x1} ${back} L ${x1 + 4} ${y} L ${x0 - 4} ${y} Z`} fill="#cf3a40" />
      <path d={`M ${x0} ${back} L ${x1} ${back}`} stroke="#e66a6e" strokeWidth="1" />
      <rect x={x0 - 4} y={y} width={x1 - x0 + 8} height={clothTo - y} fill="#a31f2a" />
      {Array.from({ length: folds }, (_, i) => {
        const x = x0 - 4 + ((i + 0.5) * (x1 - x0 + 8)) / folds;
        return <path key={i} d={`M ${x} ${y + 1} L ${x} ${clothTo - 2}`} stroke="#c63b45" strokeOpacity="0.55" strokeWidth="2" />;
      })}
      <rect x={x0 - 4} y={y} width={x1 - x0 + 8} height="2" fill="#7a1219" />
      <path d={`M ${x0 - 4} ${clothTo} ${Array.from({ length: folds * 2 }, (_, i) => `L ${x0 - 4 + ((i + 0.5) * (x1 - x0 + 8)) / (folds * 2)} ${clothTo + (i % 2 === 0 ? 3 : 0)}`).join(' ')} L ${x1 + 4} ${clothTo}`} fill="none" stroke="#e8b923" strokeWidth="1.2" />
    </g>
  );
};

/** The picture that never moves: the wall, the curtain behind the shelves, the shelves, the counter and its cork tray, and the noren. */
const StallScene = memo(function StallScene({ noren }: { noren: string }) {
  return (
    <svg className={styles.stageSvg} viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} focusable="false" aria-hidden="true">
      <defs>
        <radialGradient id="sht-lamp" cx="50%" cy="8%" r="75%">
          <stop offset="0" stopColor="#ffcf7a" stopOpacity="0.38" />
          <stop offset="0.55" stopColor="#ff9d4d" stopOpacity="0.08" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sht-curtain" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b1220" />
          <stop offset="1" stopColor="#0d0910" />
        </linearGradient>
        <linearGradient id="sht-counter" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d8a96c" />
          <stop offset="1" stopColor="#a8743e" />
        </linearGradient>
        <linearGradient id="sht-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6e4424" />
          <stop offset="1" stopColor="#3d2410" />
        </linearGradient>
      </defs>
      {/* The wall round the stall, and the dark curtain behind the shelves, its folds. */}
      <rect x="0" y="0" width={STAGE_W} height={STAGE_H} fill="#3b2617" />
      <rect x="8" y={NOREN_H - 4} width={STAGE_W - 16} height={COUNTER_Y - NOREN_H + 4} fill="url(#sht-curtain)" />
      {Array.from({ length: 15 }, (_, i) => (
        <path key={i} d={`M ${20 + i * 23} ${NOREN_H} L ${20 + i * 23} ${COUNTER_Y}`} stroke="#2a1d30" strokeWidth="5" strokeOpacity="0.7" />
      ))}
      <rect x="8" y={NOREN_H - 4} width={STAGE_W - 16} height={COUNTER_Y - NOREN_H + 4} fill="url(#sht-lamp)" />
      {/* The posts either side. */}
      <rect x="0" y="0" width="10" height={STAGE_H} fill="#4a2e19" />
      <rect x={STAGE_W - 10} y="0" width="10" height={STAGE_H} fill="#4a2e19" />
      {TIER_PLACES.map((_, tier) => (
        <Tier key={tier} tier={tier} />
      ))}
      {/* The counter: its worn top, the boards of its front. */}
      <rect x="0" y={COUNTER_Y} width={STAGE_W} height="20" fill="url(#sht-counter)" />
      <path d={`M 0 ${COUNTER_Y + 6} Q 90 ${COUNTER_Y + 3} 180 ${COUNTER_Y + 7} T 360 ${COUNTER_Y + 5} M 0 ${COUNTER_Y + 14} Q 120 ${COUNTER_Y + 16} 240 ${COUNTER_Y + 12} T 360 ${COUNTER_Y + 15}`} fill="none" stroke="#b9854a" strokeWidth="1" />
      <rect x="0" y={COUNTER_Y} width={STAGE_W} height="2" fill="#f0c48a" />
      <rect x="0" y={COUNTER_Y + 20} width={STAGE_W} height={STAGE_H - COUNTER_Y - 20} fill="url(#sht-front)" />
      {Array.from({ length: 7 }, (_, i) => (
        <path key={i} d={`M ${i * 60} ${COUNTER_Y + 20} L ${i * 60} ${STAGE_H}`} stroke="#2e1a0b" strokeWidth="2" />
      ))}
      <rect x="0" y={COUNTER_Y + 20} width={STAGE_W} height="3" fill="#000" opacity="0.35" />
      {/* The tray the corks lie in, at the left of the counter. */}
      <rect x="16" y={COUNTER_Y + 3} width="104" height="14" rx="3" fill="#5a3418" stroke="#2e1a0b" strokeWidth="1" />
      <Noren text={noren} />
    </svg>
  );
});

/** The corks still to fire, in their tray. */
const CorkTray = memo(function CorkTray({ left }: { left: number }) {
  return (
    <div className={styles.tray} aria-hidden="true">
      {Array.from({ length: CORKS }, (_, i) => (
        <span key={i} className={styles.trayCork} data-there={i < left ? 'true' : 'false'} />
      ))}
    </div>
  );
});

/** The cork gun on the counter, pointing up at the shelves: its stock, its barrel, the lever at its side, and a cork in its muzzle once loaded. */
const GunArt = ({ lever, cork }: { lever: RefObject<SVGGElement | null>; cork: RefObject<SVGGElement | null> }) => {
  const muzzle = 540 - MUZZLE_REACH;
  return (
    <g>
      {/* The lever at the right of the receiver, swung back as it is pulled. */}
      <g ref={lever} className={styles.lever}>
        <path d="M 191 378 L 214 414 L 219 411 L 196 376 Z" fill="#8a929c" stroke="#2c3036" strokeWidth="1" />
        <circle cx="216.5" cy="413" r="5.5" fill="#3b2a1c" stroke="#160d06" strokeWidth="1" />
        <circle cx="193.5" cy="377.5" r="2.6" fill="#2c3036" />
      </g>
      {/* The stock, old dark wood, wide at the player's end, its grain and its butt plate. */}
      <path d="M 148 456 Q 180 462 212 456 L 199 404 L 161 404 Z" fill="#7a4a24" stroke="#3a210c" strokeWidth="1.2" />
      <path d="M 160 452 L 167 410 M 178 455 L 179 408 M 196 452 L 192 410" stroke="#9a6236" strokeWidth="1.2" strokeOpacity="0.7" />
      <path d="M 152 448 Q 180 453 208 448" fill="none" stroke="#2a1608" strokeWidth="3" strokeOpacity="0.6" />
      {/* The fore-end under the barrel. */}
      <path d="M 165 410 L 169 362 L 191 362 L 195 410 Z" fill="#8c5a2e" stroke="#3a210c" strokeWidth="1" />
      {/* The cylinder with the spring and piston in it. */}
      <rect x="166" y="370" width="28" height="34" rx="5" fill="#3c4148" stroke="#1d2024" strokeWidth="1.2" />
      <rect x="170" y="374" width="6" height="26" rx="2" fill="#6b737d" />
      <path d="M 166 386 L 194 386" stroke="#1d2024" strokeWidth="1" />
      {/* The barrel, narrowing to the muzzle, and the blade of its front sight. */}
      <path d={`M 171.5 372 L 174.5 ${muzzle + 2} L 185.5 ${muzzle + 2} L 188.5 372 Z`} fill="#4b525b" stroke="#1d2024" strokeWidth="1.1" />
      <path d={`M 176.5 370 L 177.8 ${muzzle + 4}`} stroke="#9aa2ac" strokeWidth="1.4" />
      <rect x="173.5" y={muzzle} width="13" height="6" rx="2" fill="#2b2f35" />
      <rect x="179" y={muzzle - 3} width="2" height="4" fill="#2b2f35" />
      {/* The cork, pushed into the muzzle. */}
      <g ref={cork} className={styles.loadedCork} style={{ opacity: 0 }}>
        <path d={`M 176 ${muzzle + 1} L 177 ${muzzle - 5} L 183 ${muzzle - 5} L 184 ${muzzle + 1} Z`} fill="#c99a62" stroke="#7a5528" strokeWidth="0.8" />
        <ellipse cx="180" cy={muzzle - 5} rx="3" ry="1.2" fill="#e2b984" />
      </g>
    </g>
  );
};

/** The parts the page moves. */
export interface StageParts {
  gun: RefObject<HTMLDivElement | null>;
  lever: RefObject<SVGGElement | null>;
  loaded: RefObject<SVGGElement | null>;
  sight: RefObject<HTMLDivElement | null>;
  sightLabel: RefObject<HTMLSpanElement | null>;
  cork: RefObject<HTMLDivElement | null>;
  puff: RefObject<HTMLDivElement | null>;
  /** Hands the page each figure's layer (clipped as it falls behind its shelf) and the part of it that moves. */
  figure: (target: number, part: 'clip' | 'mover', el: HTMLDivElement | null) => void;
}

/** The layers that move, drawn once: the page moves them (PlayTab.tsx). */
export const MovingLayers = memo(function MovingLayers({ parts: { gun, lever, loaded, sight, sightLabel, cork, puff, figure } }: { parts: StageParts }) {
  return (
    <>
      {Array.from({ length: TARGETS }, (_, target) => (
        <FigureLayerView
          key={target}
          target={target}
          clip={(el) => figure(target, 'clip', el)}
          mover={(el) => figure(target, 'mover', el)}
        />
      ))}
      <div
        className={`${styles.layer} ${styles.gunLayer}`}
        style={{ ...layerStyle(GUN_BOX), transformOrigin: `${((GUN_PIVOT.x - GUN_BOX.x) / GUN_BOX.w) * 100}% ${((GUN_PIVOT.y - GUN_BOX.y) / GUN_BOX.h) * 100}%` }}
        ref={gun}
        data-testid="sht-gun"
      >
        <svg className={styles.layerSvg} viewBox={viewOf(GUN_BOX)} focusable="false" aria-hidden="true">
          <GunArt lever={lever} cork={loaded} />
        </svg>
      </div>
      <div className={`${styles.layer} ${styles.puffLayer}`} style={{ ...layerStyle(PUFF_BOX), opacity: 0 }} ref={puff} aria-hidden="true">
        <svg className={styles.layerSvg} viewBox={viewOf(PUFF_BOX)} focusable="false">
          <defs>
            <radialGradient id="sht-puff">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={PUFF_BOX.x + PUFF_BOX.w / 2} cy={PUFF_BOX.y + PUFF_BOX.h / 2} r={PUFF_BOX.w / 2} fill="url(#sht-puff)" />
        </svg>
      </div>
      <div className={`${styles.layer} ${styles.corkLayer}`} style={{ ...layerStyle(CORK_BOX), opacity: 0 }} ref={cork} aria-hidden="true" data-testid="sht-cork">
        <svg className={styles.layerSvg} viewBox={viewOf(CORK_BOX)} focusable="false">
          <g transform={`translate(${CORK_BOX.x + CORK_BOX.w / 2} ${CORK_BOX.y + CORK_BOX.h / 2})`}>
            <path d="M -7 -4.8 L 7 -3.4 L 7 3.4 L -7 4.8 Z" fill="#c99a62" stroke="#5e3f1c" strokeWidth="1.1" />
            <ellipse cx="7" cy="0" rx="1.8" ry="3.4" fill="#e9c592" stroke="#5e3f1c" strokeWidth="0.6" />
            <path d="M -3 -3.6 L -3 3.6 M 2 -3.2 L 2 3.2" stroke="#a87a45" strokeWidth="0.8" />
          </g>
        </svg>
      </div>
      <div className={`${styles.layer} ${styles.sightLayer}`} style={{ ...layerStyle(SIGHT_BOX), opacity: 0 }} ref={sight} aria-hidden="true" data-testid="sht-sight">
        <svg className={styles.layerSvg} viewBox={viewOf(SIGHT_BOX)} focusable="false">
          <g transform={`translate(${SIGHT_BOX.x + SIGHT_BOX.w / 2} ${SIGHT_BOX.y + SIGHT_BOX.h / 2})`} fill="none" strokeLinecap="round">
            <circle r="9" stroke="#1a0f06" strokeWidth="4" strokeOpacity="0.6" />
            <circle r="9" stroke="#ffe066" strokeWidth="2" />
            <path d="M -15 0 L -5 0 M 5 0 L 15 0 M 0 -15 L 0 -5 M 0 5 L 0 15" stroke="#1a0f06" strokeWidth="3.6" strokeOpacity="0.6" />
            <path d="M -15 0 L -5 0 M 5 0 L 15 0 M 0 -15 L 0 -5 M 0 5 L 0 15" stroke="#ffe066" strokeWidth="1.8" />
            <circle r="1.4" fill="#ff5a3c" stroke="none" />
          </g>
        </svg>
        <span className={styles.sightLabel} ref={sightLabel} data-side="right" />
      </div>
    </>
  );
});

/** The paper lanterns at the stall's corners, swaying a little (a CSS animation, which the compositor runs). */
const Lanterns = memo(function Lanterns() {
  return (
    <>
      {[0, 1].map((side) => (
        <div key={side} className={styles.lantern} data-side={side === 0 ? 'left' : 'right'} aria-hidden="true">
          <svg viewBox="0 0 34 64" className={styles.lanternSvg} focusable="false">
            <defs>
              <radialGradient id={`sht-lantern-${side}`} cx="45%" cy="45%" r="60%">
                <stop offset="0" stopColor="#ffd27a" />
                <stop offset="0.55" stopColor="#e2452e" />
                <stop offset="1" stopColor="#8e1d12" />
              </radialGradient>
            </defs>
            <path d="M 17 0 L 17 12" stroke="#1a120c" strokeWidth="1.4" />
            <rect x="9" y="11" width="16" height="5" rx="1.5" fill="#1a120c" />
            <ellipse cx="17" cy="35" rx="15" ry="19" fill={`url(#sht-lantern-${side})`} />
            {[-12, -6, 0, 6, 12].map((dy) => (
              <path key={dy} d={`M ${17 - Math.sqrt(1 - (dy / 19) ** 2) * 15} ${35 + dy} Q 17 ${35 + dy + 2.5} ${17 + Math.sqrt(1 - (dy / 19) ** 2) * 15} ${35 + dy}`} fill="none" stroke="#8e1d12" strokeOpacity="0.55" strokeWidth="0.9" />
            ))}
            <text x="17" y="40" textAnchor="middle" className={styles.lanternText}>
              湯
            </text>
            <rect x="9" y="53" width="16" height="5" rx="1.5" fill="#1a120c" />
            <path d="M 14 58 L 13 64 M 17 58 L 17 64 M 20 58 L 21 64" stroke="#e8b923" strokeWidth="1" />
          </svg>
        </div>
      ))}
    </>
  );
});

export interface StageProps {
  t: ShootingGalleryStrings;
  label: string;
  parts: StageParts;
  /** Where each figure stands, as the stall shows it (`FALLEN`: off the shelf). */
  positions: readonly number[];
  /** The figure the sight is on. */
  picked: number;
  /** Corks still in the tray. */
  corksLeft: number;
  /** Figures off the shelf, for the plaque. */
  down: number;
  onPick: (target: number) => void;
  /** Whether the figures' buttons take a press (not while the medals are elsewhere). */
  picking: boolean;
}

/** A figure's tag: its medals, as the stall writes them. */
const Tag = ({ medals, unit, top }: { medals: number; unit: string; top: number }) => (
  <span className={styles.tag} style={{ top: `${top}%` }} aria-hidden="true">
    <span className={styles.tagNum}>{medals}</span>
    {unit && <span className={styles.tagUnit}>{unit}</span>}
  </span>
);

/** The stall. The picture is drawn again only when what it shows changes; what moves is moved on its layers. */
export const Stage = memo(function Stage({ t, label, parts, positions, picked, corksLeft, down, onPick, picking }: StageProps) {
  return (
    <div className={styles.stage} role="group" aria-label={label}>
      <StallScene noren={t.noren} />
      <Lanterns />
      <CorkTray left={corksLeft} />
      <MovingLayers parts={parts} />
      {/* The figures' places: each a button, its tag on it. */}
      {Array.from({ length: TARGETS }, (_, target) => {
        const spot = figureSpot(target);
        const kind = SHELF[target];
        const off = positions[target] < 0;
        return (
          <button
            key={target}
            type="button"
            className={styles.spot}
            style={layerStyle(spot)}
            data-testid={`sht-figure-${target}`}
            data-target={target}
            data-kind={kind}
            data-position={positions[target]}
            data-picked={picked === target ? 'true' : 'false'}
            aria-pressed={picked === target}
            aria-label={t.figureAria(target, positions[target], picked === target)}
            disabled={off || !picking}
            onClick={() => onPick(target)}
          >
            <Tag medals={KINDS[kind].medals} unit={t.tagUnit} top={((TIER_PLACES[tierOf(target)].y + 3 - spot.y) / spot.h) * 100} />
          </button>
        );
      })}
      {/* The plaque on the counter: how many figures are off the shelf this play. */}
      <div className={styles.plaque} aria-hidden="true">
        <span className={styles.plaqueLabel}>{t.down}</span>
        <span className={styles.plaqueCount} data-testid="sht-down">
          {down}
        </span>
      </div>
      <span className={styles.perPlay} aria-hidden="true">
        {t.perPlay}
      </span>
    </div>
  );
});
