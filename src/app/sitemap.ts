import type { MetadataRoute } from 'next';
import { getFirestore } from '@/lib/firebase-admin';
import { POSTS_COLLECTION } from '@/app/api/constants';
import { games } from '@/components/game/constants/games';
import { SITE_URL } from '@/lib/siteConfig';

// Regenerate at most once per hour; new posts appear without a deploy.
export const revalidate = 3600;

// firebase-admin refuses to initialize during `next build`; skip the
// fetch instead of logging a noisy (but otherwise handled) error.
const isBuildPhase = () => process.env.NEXT_PHASE === 'phase-production-build';

interface BlogEntry {
  id: string;
  category: string;
  lastUpdated?: Date;
}

async function getPublicPosts(): Promise<BlogEntry[]> {
  if (isBuildPhase()) return [];
  try {
    const snapshot = await getFirestore()
      .collection(POSTS_COLLECTION)
      .where('isPublic', '==', true)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        // Empty string would render /blog//{id}; treat it like missing.
        category: typeof data.category === 'string' && data.category ? data.category : 'all',
        lastUpdated: data.lastUpdated?.toDate?.() ?? undefined,
      };
    });
  } catch (error) {
    console.error('[sitemap] Failed to load posts:', error);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getPublicPosts();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/blog`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/games`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/study`, changeFrequency: 'weekly', priority: 0.5 },
  ];

  const categoryRoutes: MetadataRoute.Sitemap = Array.from(
    new Set(posts.map((post) => post.category).filter((category) => category && category !== 'all')),
  ).map((category) => ({
    url: `${SITE_URL}/blog/${encodeURIComponent(category)}`,
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  const postRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/blog/${encodeURIComponent(post.category)}/${encodeURIComponent(post.id)}`,
    lastModified: post.lastUpdated,
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  const gameRoutes: MetadataRoute.Sitemap = games.map((game) => ({
    url: `${SITE_URL}${game.path}`,
    changeFrequency: 'monthly',
    priority: 0.3,
  }));

  return [...staticRoutes, ...categoryRoutes, ...postRoutes, ...gameRoutes];
}
