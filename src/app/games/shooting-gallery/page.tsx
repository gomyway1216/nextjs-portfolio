import { ShootingGalleryForPlayer } from '@/components/game/ShootingGallery/ShootingGalleryForPlayer';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('shooting-gallery');

export default function ShootingGalleryPage() {
  // The page's main landmark: everything of the page but the site's toolbar.
  return (
    <main>
      <ShootingGalleryForPlayer />
    </main>
  );
}
