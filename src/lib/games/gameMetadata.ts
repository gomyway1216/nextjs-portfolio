import type { Metadata } from 'next';
import { games, getGameCoverPath } from '@/components/game/constants/games';

const SITE_NAME = 'Yudai Yaguchi';

/**
 * Per-game <title>/description/canonical/social card, derived from the
 * shared catalog so the listing card and the page never drift apart.
 * Every /games/<id> route exports this: without it all 37 games shared the
 * /games layout's generic title and looked like one page to search engines.
 * Unknown ids throw at build/render time — a typo should fail loudly, not
 * silently ship a default title.
 */
export function buildGameMetadata(gameId: string): Metadata {
  const game = games.find((entry) => entry.id === gameId);
  if (!game) {
    throw new Error(`[gameMetadata] unknown game id "${gameId}" — add it to games.ts first`);
  }

  const title = game.title;
  const socialTitle = `${title} | ${SITE_NAME}`;
  const description = `${game.description} Play ${title} free in your browser — a ${game.difficulty.toLowerCase()} ${game.category.toLowerCase()} game by ${SITE_NAME}.`;
  const cover = getGameCoverPath(game.id);

  return {
    title,
    description,
    alternates: { canonical: game.path },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title: socialTitle,
      description,
      url: game.path,
      images: [{ url: cover, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description,
      images: [cover],
    },
  };
}
