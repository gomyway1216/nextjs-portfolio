// Human-readable label for a hyphenated category slug
// ("system-design" -> "System Design"). Tolerates missing values so a
// malformed post record can't crash metadata generation.
export function categoryLabel(category?: string | null): string {
  if (!category) return '';
  return category
    .split('-')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}
