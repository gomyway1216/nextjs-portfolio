import { FACE_STAR, MEDAL_PAINT } from '../MedalPusher/medalLook';

/** The star struck on every medal of the medal center, in this icon's view box. */
const STAR = FACE_STAR.map(([x, y]) => `${(16 + x * 15).toFixed(2)},${(16 + y * 15).toFixed(2)}`).join(' ');

/** One of the medal center's medals: copper-nickel, with a raised rim and its star, as the Medal Pusher draws them. */
export const MedalIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 32 32" aria-hidden focusable="false">
    <circle cx="16" cy="16" r="15" fill={MEDAL_PAINT.face} stroke={MEDAL_PAINT.edge} strokeWidth="1.4" />
    <circle cx="16" cy="16" r="12.2" fill="none" stroke={MEDAL_PAINT.light} strokeWidth="1.6" />
    <circle cx="16.4" cy="16.5" r="12.2" fill="none" stroke={MEDAL_PAINT.rim} strokeWidth="0.8" opacity="0.7" />
    <polygon points={STAR} fill={MEDAL_PAINT.dark} />
  </svg>
);
