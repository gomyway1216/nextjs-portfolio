import { describe, expect, it } from 'vitest';
import { summarizeGrowthItems } from '@/lib/publicMemory/presentation';

describe('summarizeGrowthItems', () => {
  it('keeps a defensive ready response with no items finite', () => {
    expect(summarizeGrowthItems([])).toEqual({
      categories: [],
      firstYear: null,
    });
  });

  it('summarizes categories and the earliest year', () => {
    const summary = summarizeGrowthItems([
      {
        id: 'one', title: 'One', summary: 'First', category: 'Learning', occurredAt: '2025-01-01T00:00:00.000Z', tags: [],
      },
      {
        id: 'two', title: 'Two', summary: 'Second', category: 'Building', occurredAt: '2023-01-01T00:00:00.000Z', tags: [],
      },
      {
        id: 'three', title: 'Three', summary: 'Third', category: 'Learning', occurredAt: '2026-01-01T00:00:00.000Z', tags: [],
      },
    ]);

    expect(summary.firstYear).toBe(2023);
    expect(summary.categories).toEqual([
      { name: 'Learning', count: 2, percentage: 100 },
      { name: 'Building', count: 1, percentage: 50 },
    ]);
  });
});
