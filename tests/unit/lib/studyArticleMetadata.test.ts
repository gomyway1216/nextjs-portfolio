import { describe, expect, it } from 'vitest';
import { formatArticleMetadataDate, getArticleGenerationDetail } from '@/lib/studyArticleMetadata';

describe('study article metadata', () => {
  const iso = '2026-09-15T04:00:00Z';
  it.each([iso, new Date(iso), Date.parse(iso), { _seconds: Date.parse(iso) / 1000 },
    { seconds: Date.parse(iso) / 1000 }, { toDate: () => new Date(iso) }])('formats supported date shapes consistently: %j', value => {
    expect(formatArticleMetadataDate(value)).toBe('Sep 14, 2026, 09:00 PM');
  });
  it.each([null, undefined, '', 'invalid', {}, { _seconds: NaN }, new Date(NaN),
    { toDate: () => { throw new Error('invalid timestamp'); } }])('does not invent dates for %j', value => {
    expect(formatArticleMetadataDate(value)).toBe('Unavailable');
  });
  it('labels an MCP client identifier as a source rather than a model', () => {
    expect(getArticleGenerationDetail('personal-memory-mcp:client-id')).toEqual({ label: 'Source', value: 'Personal Memory MCP' });
    expect(getArticleGenerationDetail('model-name')).toEqual({ label: 'Model', value: 'model-name' });
    expect(getArticleGenerationDetail(undefined)).toEqual({ label: 'Model', value: 'Unavailable' });
  });
});
