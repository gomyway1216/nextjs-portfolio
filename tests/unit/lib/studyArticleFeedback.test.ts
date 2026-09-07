import { describe, expect, it } from 'vitest';

import { parseStudyArticleFeedback } from '@/lib/studyArticleFeedback';

describe('parseStudyArticleFeedback', () => {
  it('accepts and deduplicates supported feedback signals', () => {
    expect(
      parseStudyArticleFeedback({
        signals: ['interesting', 'want_more', 'interesting'],
        skipped: false,
      })
    ).toEqual({
      ok: true,
      value: { signals: ['interesting', 'want_more'], skipped: false },
    });
  });

  it('accepts an exclusive skipped state', () => {
    expect(parseStudyArticleFeedback({ signals: [], skipped: true })).toEqual({
      ok: true,
      value: { signals: [], skipped: true },
    });
  });

  it('rejects unknown signals and reactions combined with skip', () => {
    expect(parseStudyArticleFeedback({ signals: ['love_it'], skipped: false })).toEqual({
      ok: false,
      error: 'Feedback contains an unsupported signal',
    });
    expect(parseStudyArticleFeedback({ signals: ['interesting'], skipped: true })).toEqual({
      ok: false,
      error: 'Skipped feedback cannot include reaction signals',
    });
  });

  it('rejects incomplete feedback objects', () => {
    expect(parseStudyArticleFeedback(null).ok).toBe(false);
    expect(parseStudyArticleFeedback({ signals: [] }).ok).toBe(false);
  });
});
