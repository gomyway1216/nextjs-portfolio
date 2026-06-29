export const COMMUNITY_PROJECT_ID = 'Wr6YDXliDrUvcAAuXAS3';

export const PROJECT_SLUG_BY_ID: Record<string, string> = {
  [COMMUNITY_PROJECT_ID]: 'bayarea-ai-jtpa-community-hub',
};

const PROJECT_ID_BY_SLUG = Object.fromEntries(
  Object.entries(PROJECT_SLUG_BY_ID).map(([id, slug]) => [slug, id]),
);

export function resolveProjectRouteId(routeId: string): string {
  return PROJECT_ID_BY_SLUG[routeId] ?? routeId;
}

export function getProjectPath(projectId: string): string {
  const slugOrId = PROJECT_SLUG_BY_ID[projectId] ?? projectId;
  return `/projects/${encodeURIComponent(slugOrId)}`;
}
