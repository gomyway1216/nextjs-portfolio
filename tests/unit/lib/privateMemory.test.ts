import { describe, expect, it } from 'vitest';
import {
  countPrivateMemoryCategories,
  parsePrivateMemoryHistoryResponse,
  parsePrivateMemoryIndexResponse,
} from '@/lib/memory/privateMemory';

const indexItem = {
  id: 'memory-1',
  title: 'Private career context',
  indexSummary: 'A compact catalog summary.',
  category: 'career',
  sensitivity: 'sensitive',
  visibility: 'private',
  tags: ['career', 'leadership'],
  revision: 3,
  memoryKind: 'current_state',
  updatedAt: '2026-08-29T10:00:00.000Z',
  lastAccessedAt: '2026-08-29T11:00:00.000Z',
};

describe('private memory dashboard response helpers', () => {
  it('keeps only the allowlisted private index fields', () => {
    const result = parsePrivateMemoryIndexResponse({
      view: 'index',
      items: [{
        ...indexItem,
        canonicalSummaryJa: 'DETAIL MUST NOT ENTER THE INDEX',
        evidence: [{ text: 'RAW EVIDENCE' }],
        apiKey: 'SECRET',
      }],
    });
    expect(result).toEqual([indexItem]);
    expect(JSON.stringify(result)).not.toContain('EVIDENCE');
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });

  it('parses a revision snapshot but discards aliases, source, and evidence', () => {
    const snapshot = {
      title: 'Private career context',
      canonicalSummaryJa: '背景、判断、結果を保った詳細case record。',
      category: 'career',
      sensitivity: 'sensitive',
      visibility: 'private',
      tags: ['career'],
      revision: 3,
      memoryKind: 'current_state',
      updatedAt: '2026-08-29T10:00:00.000Z',
    };
    const result = parsePrivateMemoryHistoryResponse({
      view: 'history',
      memoryId: 'memory-1',
      items: [{
        id: 'memory-1.0000000003',
        memoryId: 'memory-1',
        lineageId: 'memory-1',
        revision: 3,
        committedAt: '2026-08-29T10:00:00.000Z',
        snapshot: { ...snapshot, aliases: ['secret alias'], source: 'private source', evidence: [{ text: 'quote' }] },
      }],
    }, 'memory-1');

    expect(result[0].snapshot).toEqual(snapshot);
    expect(result[0].snapshot).not.toHaveProperty('evidence');
    expect(result[0].snapshot).not.toHaveProperty('source');
  });

  it('rejects mismatched history and counts index categories', () => {
    expect(() => parsePrivateMemoryHistoryResponse({
      view: 'history', memoryId: 'other', items: [],
    }, 'memory-1')).toThrow('Invalid private memory history response');
    expect(countPrivateMemoryCategories([
      parsePrivateMemoryIndexResponse({ view: 'index', items: [indexItem] })[0],
      parsePrivateMemoryIndexResponse({ view: 'index', items: [{ ...indexItem, id: 'memory-2' }] })[0],
    ])).toEqual([{ category: 'career', count: 2 }]);
  });
});
