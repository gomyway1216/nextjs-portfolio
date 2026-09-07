import { describe, expect, it } from 'vitest';
import { categoryLabel } from '@/lib/blog/categoryLabel';

describe('categoryLabel (server-side metadata label)', () => {
  it('title-cases ordinary hyphenated slugs', () => {
    expect(categoryLabel('system-design')).toBe('System Design');
    expect(categoryLabel('fintech-payments')).toBe('Fintech Payments');
  });

  it('keeps acronyms upper-case for curated slugs', () => {
    expect(categoryLabel('ai-engineering')).toBe('AI Engineering');
  });

  it('returns an empty label for a missing category', () => {
    expect(categoryLabel(undefined)).toBe('');
    expect(categoryLabel(null)).toBe('');
    expect(categoryLabel('')).toBe('');
  });
});
