import { slugifyTitle } from '@/lib/blog/postSlug';

export const COMMUNITY_PROJECT_ID = 'Wr6YDXliDrUvcAAuXAS3';

// Hand-picked slugs that must never change (linked from outside the site).
// Every other project gets a slug derived from its title; a curated entry
// always wins over the derived one.
export const PROJECT_SLUG_BY_ID: Record<string, string> = {
  [COMMUNITY_PROJECT_ID]: 'bayarea-ai-jtpa-community-hub',
};

const CURATED_ID_BY_SLUG = Object.fromEntries(
  Object.entries(PROJECT_SLUG_BY_ID).map(([id, slug]) => [slug, id]),
);

export interface ProjectSlugSource {
  id: string;
  title: string;
}

export interface ProjectSlugMap {
  slugById: Map<string, string>;
  idBySlug: Map<string, string>;
}

/** Curated slug, else the title-derived one, else '' (caller falls back to the id). */
export function projectSlugCandidate(project: ProjectSlugSource): string {
  return PROJECT_SLUG_BY_ID[project.id] ?? slugifyTitle(project.title ?? '');
}

/**
 * Slug ↔ id for a whole project list. Two projects whose titles derive
 * the same slug both keep their Firestore id as the URL segment (the
 * curated table is exempt: a derived slug can never shadow a curated
 * one), so every URL resolves to exactly one project.
 */
export function buildProjectSlugMap(projects: readonly ProjectSlugSource[]): ProjectSlugMap {
  const curatedSlugs = new Set(Object.values(PROJECT_SLUG_BY_ID));
  const counts = new Map<string, number>();
  const candidates = projects.map((project) => {
    const slug = projectSlugCandidate(project);
    if (slug) counts.set(slug, (counts.get(slug) ?? 0) + 1);
    return [project.id, slug] as const;
  });

  const slugById = new Map<string, string>();
  const idBySlug = new Map<string, string>();
  for (const [id, slug] of candidates) {
    const curated = PROJECT_SLUG_BY_ID[id] !== undefined;
    const usable =
      slug !== '' && (curated || ((counts.get(slug) ?? 0) === 1 && !curatedSlugs.has(slug)));
    const segment = usable ? slug : id;
    slugById.set(id, segment);
    idBySlug.set(segment, id);
  }
  return { slugById, idBySlug };
}

/**
 * Route id → Firestore id. Uses the full map when available; without one
 * (API handlers hit with a raw id) only the curated table applies.
 */
export function resolveProjectRouteId(routeId: string, slugMap?: ProjectSlugMap): string {
  return slugMap?.idBySlug.get(routeId) ?? CURATED_ID_BY_SLUG[routeId] ?? routeId;
}

/**
 * Canonical path for a project. Pass the project (with the list-wide map
 * when you have one) to get its slug; the plain-id form is for callers
 * that only know a curated project's id.
 */
export function getProjectPath(
  project: string | ProjectSlugSource,
  slugMap?: ProjectSlugMap,
): string {
  const segment =
    typeof project === 'string'
      ? (PROJECT_SLUG_BY_ID[project] ?? project)
      : (slugMap?.slugById.get(project.id) ?? projectSlugCandidate(project) ?? '') || project.id;
  return `/projects/${encodeURIComponent(segment)}`;
}
