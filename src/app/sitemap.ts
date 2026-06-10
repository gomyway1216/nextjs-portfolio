import type { MetadataRoute } from 'next';
import { getFirestore } from '@/lib/firebase-admin';
import { POSTS_COLLECTION, HOBBIES_COLLECTION } from '@/app/api/constants';
import { games } from '@/components/game/constants/games';

const SITE_URL = 'https://meetyudai.com';

// Regenerate at most once per hour; new posts/hobbies appear without a deploy.
export const revalidate = 3600;

interface BlogEntry {
  id: string;
  category: string;
  lastUpdated?: Date;
}

async function getPublicPosts(): Promise<BlogEntry[]> {
  try {
    const snapshot = await getFirestore()
      .collection(POSTS_COLLECTION)
      .where('isPublic', '==', true)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        category: typeof data.category === 'string' ? data.category : 'all',
        lastUpdated: data.lastUpdated?.toDate?.() ?? undefined,
      };
    });
  } catch (error) {
    console.error('[sitemap] Failed to load posts:', error);
    return [];
  }
}

async function getPublicHobbySlugs(): Promise<string[]> {
  try {
    const snapshot = await getFirestore()
      .collection(HOBBIES_COLLECTION)
      .where('isPublic', '==', true)
      .get();

    return snapshot.docs
      .map((doc) => doc.data().slug)
      .filter((slug): slug is string => typeof slug === 'string' && slug.length > 0);
  } catch (error) {
    console.error('[sitemap] Failed to load hobbies:', error);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, hobbySlugs] = await Promise.all([getPublicPosts(), getPublicHobbySlugs()]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/blog/all`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/hobbies`, changeFrequency: 'weekly', priority: 0.6 },
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
    url: `${SITE_URL}/blog/${encodeURIComponent(post.category)}/${post.id}`,
    lastModified: post.lastUpdated,
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  const hobbyRoutes: MetadataRoute.Sitemap = hobbySlugs.map((slug) => ({
    url: `${SITE_URL}/hobbies/${encodeURIComponent(slug)}`,
    changeFrequency: 'weekly',
    priority: 0.5,
  }));

  const gameRoutes: MetadataRoute.Sitemap = games.map((game) => ({
    url: `${SITE_URL}${game.path}`,
    changeFrequency: 'monthly',
    priority: 0.3,
  }));

  return [...staticRoutes, ...categoryRoutes, ...postRoutes, ...hobbyRoutes, ...gameRoutes];
}
