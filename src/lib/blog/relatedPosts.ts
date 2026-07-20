// Shared rules for the post-to-post "related posts" links.

// Upper bound on related links per post. Enforced when saving a post and
// when serving the related-summaries endpoint, so a longer list can only
// come from a hand-crafted request and is truncated anyway.
export const MAX_RELATED_POSTS = 6;

// Sanitize a client-supplied relatedPostIds value: strings only, trimmed,
// deduped, never pointing at the post itself, capped at MAX_RELATED_POSTS.
// Ids containing '/' are rejected — a slash would turn `.doc(id)` into a
// multi-segment path and throw, surfacing as a 500 on otherwise-valid
// requests.
export function normalizeRelatedPostIds(value: unknown, selfId?: string): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value
    .filter((id): id is string => typeof id === 'string')
    .map((id) => id.trim())
    .filter((id) => id.length > 0 && !id.includes('/') && id !== selfId);
  return Array.from(new Set(ids)).slice(0, MAX_RELATED_POSTS);
}
