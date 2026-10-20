import { CarouselPusherForPlayer } from '@/components/game/CarouselPusher/CarouselPusherForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('carousel-pusher');

export default function CarouselPusherPage() {
  // The page's main landmark: everything of the page but the site's toolbar.
  return (
    <main>
      <CarouselPusherForPlayer />
    </main>
  );
}
