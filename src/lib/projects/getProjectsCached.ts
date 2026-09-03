import 'server-only';

import { unstable_cache } from 'next/cache';
import { HOME_PROJECTS_CACHE_TAG } from '@/lib/home/cacheTags';
import { getProjectServer, getProjectsServer } from '@/lib/projects/getProjectsServer';

export const getProjectsCached = unstable_cache(
  getProjectsServer,
  ['public-projects'],
  { revalidate: 3600, tags: [HOME_PROJECTS_CACHE_TAG] },
);

export const getProjectCached = (routeId: string) =>
  unstable_cache(
    () => getProjectServer(routeId),
    ['public-project-detail', routeId],
    { revalidate: 3600, tags: [HOME_PROJECTS_CACHE_TAG] },
  )();
