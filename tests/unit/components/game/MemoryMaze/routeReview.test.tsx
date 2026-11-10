import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { RouteReview as RouteReviewData, ScoreBreakdown } from '@/components/game/MemoryMaze/engine';
import { getStrings } from '@/components/game/MemoryMaze/i18n';
import { RouteReview } from '@/components/game/MemoryMaze/RouteReview';

const cleared: RouteReviewData = {
  reachedGoal: true,
  steps: 10,
  shortestSteps: 8,
  extraSteps: 2,
  repeatedSteps: 1,
  wallHits: 3,
  wallsHit: 2,
  stepsFromGoal: 0,
};
const breakdown: ScoreBreakdown = { base: 120, efficiency: 64, timeBonus: 40, livesBonus: 50, multiplier: 1.5, total: 411 };

const render = (lang: 'en' | 'ja', review: RouteReviewData, parts: ScoreBreakdown | null) =>
  renderToStaticMarkup(<RouteReview t={getStrings(lang)} review={review} breakdown={parts} onBack={() => {}} />);

describe('RouteReview', () => {
  it('shows the route figures and the score parts of a cleared stage', () => {
    const markup = render('en', cleared, breakdown);
    expect(markup).toContain('2 steps longer than the shortest route.');
    expect(markup).toMatch(/<dt>Your steps<\/dt><dd>10<\/dd>/);
    expect(markup).toMatch(/<dt>Shortest route<\/dt><dd>8<\/dd>/);
    expect(markup).toMatch(/<dt>Wall hits<\/dt><dd>3 \(2 different walls\)<\/dd>/);
    expect(markup).toMatch(/<dt>Route efficiency<\/dt><dd>\+64<\/dd>/);
    expect(markup).toMatch(/<dt>Difficulty multiplier<\/dt><dd>×1\.5<\/dd>/);
    expect(markup).toMatch(/>Total<\/dt><dd[^>]*>411<\/dd>/);
    expect(markup).toContain('>Back to result</button>');
  });

  it('praises a shortest-route clear and uses the singular for one extra step', () => {
    expect(render('en', { ...cleared, steps: 8, extraSteps: 0 }, breakdown)).toContain('You matched the shortest route.');
    expect(render('en', { ...cleared, steps: 9, extraSteps: 1 }, breakdown)).toContain('1 step longer than the shortest route.');
  });

  it('says how far a lost run stopped from the goal and leaves the score parts out', () => {
    const markup = render('en', { ...cleared, reachedGoal: false, extraSteps: 0, stepsFromGoal: 5, wallHits: 2, wallsHit: 2 }, null);
    expect(markup).toContain('You stopped 5 steps from the goal.');
    expect(markup).toMatch(/<dt>Wall hits<\/dt><dd>2<\/dd>/);
    expect(markup).not.toContain('Route efficiency');
  });

  it('is translated into Japanese, with no English text left in it', () => {
    const markup = render('ja', cleared, breakdown);
    expect(markup).toContain('最短経路より2歩多くかかりました。');
    expect(markup).toMatch(/<dt>壁にぶつかった回数<\/dt><dd>3（壁2か所）<\/dd>/);
    expect(markup).toContain('aria-label="凡例"');
    expect(markup).toContain('>結果に戻る</button>');
    const text = markup.replace(/<[^>]*>/g, ' ');
    expect(text).not.toMatch(/[A-Za-z]{3,}/);
  });
});
