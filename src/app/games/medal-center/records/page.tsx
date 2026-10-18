import type { Metadata } from 'next';
import { MyPageForPlayer } from '@/components/game/MedalCenter/MyPageForPlayer';
import { MY_PAGE_PATH } from '@/components/game/MedalCenter/paths';

// A page of the medal center's own, linked from its front, not a game of the catalog: it is not in the games list or
// the sitemap. What it shows is the player's own, read in their browser, so search engines are asked not to list it.
export const metadata: Metadata = {
  title: 'My Page · Medal Game Center',
  description:
    'Your medals at the medal game center: what happened to them, machine by machine, and your records at every machine. Medals are for playing the games on this site only; they are not money.',
  alternates: { canonical: MY_PAGE_PATH },
  robots: { index: false, follow: true },
};

export default function MedalCenterMyPage() {
  // The page's main landmark: everything of the page but the site's toolbar.
  return (
    <main>
      <MyPageForPlayer />
    </main>
  );
}
