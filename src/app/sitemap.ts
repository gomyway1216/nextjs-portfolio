import type { MetadataRoute } from 'next';
import { getFirestore } from '@/lib/firebase-admin';
import { POSTS_COLLECTION } from '@/app/api/constants';
import { games } from '@/components/game/constants/games';
import { getProjectPath } from '@/lib/projectRoutes';
import { getProjectsServer } from '@/lib/projects/getProjectsServer';
import { SITE_URL } from '@/lib/siteConfig';

// Render per request. With ISR (`revalidate`) this route was emitted as a
// fully static snapshot at build time — when firebase-admin cannot initialize —
// so the deployed sitemap was permanently frozen without posts/projects.
// Sitemap traffic is rare enough that on-demand rendering is effectively free.
export const dynamic = 'force-dynamic';

interface BlogEntry {
  id: string;
  category: string;
  lastUpdated?: Date;
  hasJa: boolean;
}

async function getPublicPosts(): Promise<BlogEntry[]> {
  try {
    const snapshot = await getFirestore()
      .collection(POSTS_COLLECTION)
      .where('isPublic', '==', true)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      const ja = data.translations?.ja;
      return {
        id: doc.id,
        // Empty string would render /blog//{id}; treat it like missing.
        category: typeof data.category === 'string' && data.category ? data.category : 'all',
        lastUpdated: data.lastUpdated?.toDate?.() ?? undefined,
        // Mirrors availableLanguages(): a translation counts when it has
        // a non-empty title or body.
        hasJa: !!ja && (!!ja.title?.trim() || !!ja.body?.trim()),
      };
    });
  } catch (error) {
    console.error('[sitemap] Failed to load posts:', error);
    return [];
  }
}

async function getPublicProjects() {
  try {
    return await getProjectsServer();
  } catch (error) {
    console.error('[sitemap] Failed to load projects:', error);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, projects] = await Promise.all([
    getPublicPosts(),
    getPublicProjects(),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/projects`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/tools`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/blog`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/games`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/study`, changeFrequency: 'weekly', priority: 0.5 },
  ];

  const toolRoutes: MetadataRoute.Sitemap = [
    '/tools/settli',
    '/tools/kaimono',
    '/tools/kuizu',
    '/tools/score-tracker',
    '/tools/markdown-preview',
    '/tools/railway-planner',
    '/tools/todo',
  ].map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  const categoryRoutes: MetadataRoute.Sitemap = Array.from(
    new Set(posts.map((post) => post.category).filter((category) => category && category !== 'all')),
  ).map((category) => ({
    url: `${SITE_URL}/blog/${encodeURIComponent(category)}`,
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  // Bare post URLs are the English/default entries; posts with a Japanese
  // translation also get their language-pinned /ja URL, and both carry
  // hreflang alternates pointing at each other.
  const postRoutes: MetadataRoute.Sitemap = posts.flatMap((post) => {
    const enUrl = `${SITE_URL}/blog/${encodeURIComponent(post.category)}/${encodeURIComponent(post.id)}`;
    const base = {
      lastModified: post.lastUpdated,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    };

    if (!post.hasJa) {
      return [{ url: enUrl, ...base }];
    }

    const jaUrl = `${SITE_URL}/ja/blog/${encodeURIComponent(post.category)}/${encodeURIComponent(post.id)}`;
    const alternates = { languages: { en: enUrl, ja: jaUrl } };
    return [
      { url: enUrl, ...base, alternates },
      { url: jaUrl, ...base, alternates },
    ];
  });

  const projectRoutes: MetadataRoute.Sitemap = projects.map((project) => ({
    url: `${SITE_URL}${getProjectPath(project.id)}`,
    lastModified: project.date ? new Date(project.date) : undefined,
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  const gameRoutes: MetadataRoute.Sitemap = games.map((game) => ({
    url: `${SITE_URL}${game.path}`,
    changeFrequency: 'monthly',
    priority: 0.3,
  }));

  return [...staticRoutes, ...toolRoutes, ...categoryRoutes, ...postRoutes, ...projectRoutes, ...gameRoutes];
}
