// Posts authored before the language field existed have it missing. We treat
// missing as 'en' since /api/post POST defaults new posts to 'en'. Pass a
// null/empty target to disable filtering.
export function postMatchesLanguage(
  postLanguage: string | null | undefined,
  target: string | null | undefined,
): boolean {
  if (!target) return true;
  const effective = postLanguage || 'en';
  return effective === target;
}
