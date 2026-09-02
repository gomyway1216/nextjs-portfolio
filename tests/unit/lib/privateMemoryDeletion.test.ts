import { describe, expect, it } from 'vitest';
import {
  isExactMemoryDeleteConfirmation,
  parsePrivateMemoryDeleteRequest,
  parsePrivateMemoryDeleteResponse,
} from '@/lib/memory/privateMemoryDeletion';

describe('private memory deletion contract', () => {
  const request = {
    memoryId: 'memory-1',
    expectedRevision: 3,
    confirmationTitle: 'Current record title',
    confirmed: true as const,
  };

  it('requires the exact title without trimming or case folding', () => {
    expect(isExactMemoryDeleteConfirmation('Current record title', 'Current record title')).toBe(true);
    expect(isExactMemoryDeleteConfirmation('current record title', 'Current record title')).toBe(false);
    expect(isExactMemoryDeleteConfirmation('Current record title ', 'Current record title')).toBe(false);
  });

  it('accepts only the bounded confirmed request shape', () => {
    expect(parsePrivateMemoryDeleteRequest(request)).toEqual(request);
    expect(() => parsePrivateMemoryDeleteRequest({...request, confirmed: false})).toThrow();
    expect(() => parsePrivateMemoryDeleteRequest({...request, expectedRevision: 0})).toThrow();
    expect(() => parsePrivateMemoryDeleteRequest({...request, extra: true})).toThrow();
  });

  it('accepts only the exact success response for the requested record', () => {
    expect(parsePrivateMemoryDeleteResponse({memoryId: 'memory-1', deleted: true}, 'memory-1'))
      .toEqual({memoryId: 'memory-1', deleted: true});
    expect(() => parsePrivateMemoryDeleteResponse({memoryId: 'memory-2', deleted: true}, 'memory-1'))
      .toThrow();
    expect(() => parsePrivateMemoryDeleteResponse({memoryId: 'memory-1', deleted: 1}, 'memory-1'))
      .toThrow();
  });
});
