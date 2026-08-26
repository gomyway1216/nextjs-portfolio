import { describe, expect, it } from 'vitest';
import { isAdminRoute } from '../../middleware';

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
