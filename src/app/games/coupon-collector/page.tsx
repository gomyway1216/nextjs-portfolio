import { CouponCollector } from '@/components/game/CouponCollector';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('coupon-collector');

export default function CouponCollectorPage() {
  return <CouponCollector />;
}
