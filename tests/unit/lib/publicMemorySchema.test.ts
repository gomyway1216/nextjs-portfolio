import { describe, expect, it } from 'vitest';
import { parsePublicMemoryPayload } from '@/lib/publicMemory/schema';

describe('parsePublicMemoryPayload', () => {
  it('returns only the explicitly public fields and sorts newest first', () => {
    const result = parsePublicMemoryPayload({
      items: [
        {
          id: 'first-job',
          title: 'Started a new role',
          summary: 'Joined a product team.',
          category: 'Career',
          occurredAt: '2024-02-01',
          tags: ['fintech', 'systems'],
          salary: 250_000,
          privateNotes: 'This must never reach the browser.',
        },
        {
          id: 'community',
          title: 'Hosted a community event',
          summary: 'Brought local builders together.',
          category: 'Community',
          occurredAt: '2025-06-12T12:00:00Z',
        },
      ],
    });

    expect(result).toEqual([
      {
        id: 'community',
        title: 'Hosted a community event',
        summary: 'Brought local builders together.',
        category: 'Community',
        occurredAt: '2025-06-12T12:00:00.000Z',
        tags: [],
      },
      {
        id: 'first-job',
        title: 'Started a new role',
        summary: 'Joined a product team.',
        category: 'Career',
        occurredAt: '2024-02-01T00:00:00.000Z',
        tags: ['fintech', 'systems'],
      },
    ]);
    expect(result?.[1]).not.toHaveProperty('salary');
    expect(result?.[1]).not.toHaveProperty('privateNotes');
  });

  it('accepts equivalent safe field names and a nested data envelope', () => {
    expect(parsePublicMemoryPayload({
      data: {
        items: [{
          slug: 'learned-rust',
          name: 'Learned Rust',
          description: 'Built a small systems project.',
          theme: 'Learning',
          date: '2026-01-03',
          tags: ['rust', 'rust', 42, 'systems'],
        }],
      },
    })).toEqual([{
      id: 'learned-rust',
      title: 'Learned Rust',
      summary: 'Built a small systems project.',
      category: 'Learning',
      occurredAt: '2026-01-03T00:00:00.000Z',
      tags: ['rust', 'systems'],
    }]);
  });

  it('drops incomplete rows and duplicate ids', () => {
    const result = parsePublicMemoryPayload({
      items: [
        { id: 'missing-fields' },
        {
          id: 'valid', title: 'First', summary: 'Summary', category: 'Work', occurredAt: '2025-01-01',
        },
        {
          id: 'valid', title: 'Duplicate', summary: 'Summary', category: 'Work', occurredAt: '2026-01-01',
        },
        {
          id: 'bad-date', title: 'Bad date', summary: 'Summary', category: 'Work', occurredAt: 'not-a-date',
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result?.[0].title).toBe('First');
  });

  it('rejects an invalid response envelope', () => {
    expect(parsePublicMemoryPayload({ items: 'not-an-array' })).toBeNull();
    expect(parsePublicMemoryPayload({ data: {} })).toBeNull();
    expect(parsePublicMemoryPayload(null)).toBeNull();
  });
});
