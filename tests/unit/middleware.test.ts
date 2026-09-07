import { describe, expect, it } from 'vitest';
import { isAdminRoute, legacyProjectParam } from '../../middleware';

describe('middleware admin route matching', () => {
  it('protects the memory preview and nested memory paths', () => {
    expect(isAdminRoute('/memory')).toBe(true);
    expect(isAdminRoute('/memory/candidate-1')).toBe(true);
  });

  it('does not protect unrelated paths that merely share a prefix', () => {
    expect(isAdminRoute('/memory-game')).toBe(false);
    expect(isAdminRoute('/administrator')).toBe(false);
    expect(isAdminRoute('/hobbies-and-more')).toBe(false);
  });
});

describe('legacy project URL detection', () => {
  it('matches a 20-character Firestore id segment', () => {
    expect(legacyProjectParam('/projects/uF6jbN53qdfZBamwsKHF')).toBe('uF6jbN53qdfZBamwsKHF');
  });

  it('ignores slugs, the index, nested admin routes and other lengths', () => {
    expect(legacyProjectParam('/projects/guitar-scale-practice')).toBeNull();
    expect(legacyProjectParam('/projects')).toBeNull();
    expect(legacyProjectParam('/projects/uF6jbN53qdfZBamwsKHF/edit')).toBeNull();
    expect(legacyProjectParam('/projects/uF6jbN53qdfZBamwsKH')).toBeNull();
    expect(legacyProjectParam('/blog/career/uF6jbN53qdfZBamwsKHF')).toBeNull();
  });
});
