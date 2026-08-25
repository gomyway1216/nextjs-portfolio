import { describe, expect, it } from 'vitest';
import {
  buildPublicMemoryConnections,
  countPublicMemoryCategories,
  parsePublicMemoryResponse,
  sortPublicMemories,
  type PublicMemoryItem,
} from '@/lib/memory/publicMemory';

const items: PublicMemoryItem[] = [
  {
    id: 'career-1',
    title: 'Joined a fintech team',
    summary: 'Started building payment systems.',
    category: 'career',
    occurredAt: '2024-04-01T00:00:00.000Z',
    tags: ['fintech', 'payments'],
  },
  {
    id: 'achievement-1',
    title: 'Shipped a safer checkout',
    summary: 'Improved payment reliability.',
    category: 'achievement',
    occurredAt: '2025-02-03T00:00:00.000Z',
    tags: ['payments', 'reliability'],
  },
  {
    id: 'goal-1',
    title: 'Grow as a technical leader',
    summary: 'Support teams through clear architecture.',
    category: 'goal',
    tags: ['leadership'],
  },
];

describe('public memory projection helpers', () => {
  it('keeps only the explicit public projection fields', () => {
    const parsed = parsePublicMemoryResponse({
      items: [{
        ...items[0],
        canonicalSummaryJa: 'PRIVATE CANONICAL TEXT',
        evidence: [{ text: 'PRIVATE EVIDENCE' }],
        sensitivity: 'restricted',
        visibility: 'private',
        accessToken: 'PRIVATE TOKEN',
      }],
    });

    expect(parsed).toEqual([items[0]]);
    expect(JSON.stringify(parsed)).not.toContain('PRIVATE');
  });

  it('drops malformed, duplicate, and unsupported projections', () => {
    const parsed = parsePublicMemoryResponse({
      items: [
        items[0],
        { ...items[0], title: 'Duplicate id' },
        { ...items[1], category: 'secret' },
        { ...items[2], occurredAt: 'not-a-date' },
        { ...items[2], id: 'valid-goal' },
      ],
    });

    expect(parsed.map(({ id }) => id)).toEqual(['career-1', 'valid-goal']);
  });

  it('rejects a malformed response envelope', () => {
    expect(() => parsePublicMemoryResponse({ memories: items })).toThrow('Invalid public memory response');
    expect(() => parsePublicMemoryResponse(null)).toThrow('Invalid public memory response');
  });

  it('sorts dated memories newest first and leaves undated entries last', () => {
    expect(sortPublicMemories(items).map(({ id }) => id)).toEqual([
      'achievement-1',
      'career-1',
      'goal-1',
    ]);
  });

  it('counts categories and derives connections only from shared public tags', () => {
    expect(countPublicMemoryCategories([...items, { ...items[0], id: 'career-2' }])).toEqual([
      { category: 'career', count: 2 },
      { category: 'achievement', count: 1 },
      { category: 'goal', count: 1 },
    ]);

    expect(buildPublicMemoryConnections(items)).toEqual([{
      sourceId: 'career-1',
      targetId: 'achievement-1',
      sharedTags: ['payments'],
    }]);
  });
});
