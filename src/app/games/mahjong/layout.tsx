import { buildGameMetadata } from '@/lib/games/gameMetadata';

// The mahjong page is a client component (worker setup in hooks) and cannot
// export metadata itself; the layout carries it instead.
export const metadata = buildGameMetadata('mahjong');

export default function MahjongLayout({ children }: { children: React.ReactNode }) {
  return children;
}
