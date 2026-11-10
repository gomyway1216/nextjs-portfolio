import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { ReviewPanel, type ReviewState } from '@/components/game/Bandit/ReviewPanel';
import { mulberry32 } from '@/components/game/Bandit/engine';
import { getBanditStrings } from '@/components/game/Bandit/i18n';
import { REVIEW_TRIALS, reviewGame } from '@/components/game/Bandit/review';
import { createI18nInstance } from '@/lib/i18n';

const render = (state: ReviewState, lang: 'ja' | 'en') =>
  renderToStaticMarkup(
    <I18nextProvider i18n={createI18nInstance(lang)}>
      <ReviewPanel state={state} />
    </I18nextProvider>,
  );
const text = (markup: string) =>
  markup.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');

describe('ReviewPanel', () => {
  const probs = [0.2, 0.8, 0.5];
  // Always the best arm: zero regret, so every strategy is strictly worse.
  const pulls = Array.from({ length: 30 }, (_, i) => ({ arm: 1, reward: i % 2 }));

  for (const lang of ['ja', 'en'] as const) {
    const t = getBanditStrings(lang);

    it(`shows the verdict, table and note in ${lang}`, async () => {
      const review = await reviewGame(pulls, probs, { trials: 40, rng: mulberry32(3) });
      const markup = render({ status: 'ready', review: review! }, lang);
      const body = text(markup);
      expect(body).toContain(t.reviewTitle);
      expect(body).toContain(t.reviewVerdict(5, 5));
      expect(body).toContain(t.reviewBestArm(t.armLabel(2), 30, 30));
      expect(body).toContain(t.reviewNote(40, 30));
      expect(body).toContain(`▶ ${t.reviewYou}`);
      expect(body).toContain('ε-greedy (ε=0.1)');
      // Player row first (lowest regret), reward shown as the whole number won.
      expect(markup.indexOf(`▶ ${t.reviewYou}`)).toBeLessThan(markup.indexOf('Thompson sampling</th>'));
      expect(markup).toContain('>15</td>');
      expect(markup).toContain('>0.00</td>');
      expect(markup).toContain(`aria-label="${t.reviewTableLabel}"`);
      expect(markup).toContain(`aria-label="${t.reviewChartLabel}"`);
      expect(markup).toContain('tabindex="0"');
      // One line per series: the player plus five strategies.
      expect(markup.match(/<polyline/g)).toHaveLength(6);
    });

    it(`shows progress and failure messages in ${lang}`, () => {
      expect(text(render({ status: 'computing' }, lang))).toContain(t.reviewComputing(REVIEW_TRIALS));
      expect(text(render({ status: 'failed' }, lang))).toContain(t.reviewFailed);
    });
  }
});
