import 'server-only';

import { unstable_cache } from 'next/cache';
import { HOME_PROJECTS_CACHE_TAG } from '@/lib/home/cacheTags';
import { buildProjectSlugMap, resolveProjectRouteId, type ProjectSlugMap } from '@/lib/projectRoutes';
import { getProjectsServer } from '@/lib/projects/getProjectsServer';
import type { Project } from '@/services/projectsService';

export const getProjectsCached = unstable_cache(
  getProjectsServer,
  ['public-projects'],
  { revalidate: 3600, tags: [HOME_PROJECTS_CACHE_TAG] },
);

export interface ResolvedProject {
  project: Project;
  /** Canonical URL segment for this project (slug, or id when no unique slug). */
  segment: string;
  slugMap: ProjectSlugMap;
}

/**
 * Look a route param up as a slug or a Firestore id against the cached
 * project list. Slugs are derived from titles, so the whole list is the
 * only source of truth for "which project owns this segment".
 */
export async function getProjectByRouteIdCached(routeId: string): Promise<ResolvedProject | null> {
  const projects = await getProjectsCached();
  const slugMap = buildProjectSlugMap(projects);
  const id = resolveProjectRouteId(routeId, slugMap);
  const project = projects.find((candidate) => candidate.id === id);
  if (!project) return null;
  return { project, segment: slugMap.slugById.get(project.id) ?? project.id, slugMap };
}
