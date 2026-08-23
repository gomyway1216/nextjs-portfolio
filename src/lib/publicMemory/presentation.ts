import type { PublicMemoryItem } from './schema';

export interface CategorySummary {
  name: string;
  count: number;
  percentage: number;
}

export interface GrowthSummary {
  categories: CategorySummary[];
  firstYear: number | null;
}

export function summarizeGrowthItems(items: PublicMemoryItem[]): GrowthSummary {
  if (items.length === 0) return { categories: [], firstYear: null };

  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }

  const largestCount = Math.max(1, ...counts.values());
  const categories = Array.from(counts, ([name, count]) => ({
    name,
    count,
    percentage: Math.max(8, Math.round((count / largestCount) * 100)),
  })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));

  return {
    categories,
    firstYear: Math.min(...items.map((item) => new Date(item.occurredAt).getUTCFullYear())),
  };
}
