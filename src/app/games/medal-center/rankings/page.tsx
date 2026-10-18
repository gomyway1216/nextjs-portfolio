import type { Metadata } from 'next';
import { FloorRankingsForPlayer } from '@/components/game/MedalCenter/floor/FloorRankingsForPlayer';
import { MEDAL_RANKINGS_PATH } from '@/components/game/MedalCenter/floor/paths';

const description =
  'Today’s and this week’s rankings at the Medal Game Center: medals won on every machine, the biggest win at each one, and the big wins just now on the floor.';

export const metadata: Metadata = {
  title: 'Medal Center Rankings',
  description,
  alternates: { canonical: MEDAL_RANKINGS_PATH },
  openGraph: { type: 'website', title: 'Medal Center Rankings | Yudai Yaguchi', description, url: MEDAL_RANKINGS_PATH },
};

export default function MedalCenterRankingsPage() {
  // The page's main landmark: everything of the page but the site's toolbar.
  return (
    <main>
      <FloorRankingsForPlayer />
    </main>
  );
}
