// Human-readable label for a hyphenated category slug
// ("system-design" -> "System Design"). Tolerates missing values so a
// malformed post record can't crash metadata generation.
// Slugs whose words are not plain title-case (acronyms). Everything else
// is derived from the slug.
const SPECIAL_LABELS: Record<string, string> = {
  'ai-engineering': 'AI Engineering',
};

export function categoryLabel(category?: string | null): string {
  if (!category) return '';
  const special = SPECIAL_LABELS[category];
  if (special) return special;
  return category
    .split('-')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}
