import { describe, expect, it } from 'vitest';

import { parseStudyArticleFeedback, toggleStudyFeedbackSignal } from '@/lib/studyArticleFeedback';

describe('parseStudyArticleFeedback', () => {
  it('accepts usefulness and specific reasons without removing legacy reactions', () => {
    const signals = ['not_useful', 'too_niche', 'not_relevant', 'already_knew'];
    expect(parseStudyArticleFeedback({ signals, skipped: false })).toEqual({
      ok: true, value: { signals, skipped: false },
    });
    expect(parseStudyArticleFeedback({ signals: ['useful', 'not_useful'], skipped: false }).ok).toBe(false);
  });

  it('switches the usefulness vote while preserving optional reasons and supports undo', () => {
    expect(toggleStudyFeedbackSignal(['useful', 'interesting'], 'not_useful')).toEqual(['interesting', 'not_useful']);
    expect(toggleStudyFeedbackSignal(['not_useful', 'already_knew'], 'useful')).toEqual(['already_knew', 'useful']);
    expect(toggleStudyFeedbackSignal(['useful', 'interesting'], 'useful')).toEqual(['interesting']);
    expect(toggleStudyFeedbackSignal(['not_useful'], 'too_niche')).toEqual(['not_useful', 'too_niche']);
  });
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
