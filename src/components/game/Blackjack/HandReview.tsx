import { cardValue } from './engine';
import type { BlackjackStrings } from './i18n';
import { matchesChart, spotOf, summarize, type Decision, type MoveDecision } from './review';
import styles from './Blackjack.module.css';

/** A cost in medals, to the hundredth: anything smaller that is still a cost is written as less than a hundredth. */
export const costText = (cost: number) => (cost <= 0 ? '0' : cost < 0.005 ? '<0.01' : cost.toFixed(2));

const cardName = (value: number) => (value === 11 ? 'A' : String(value));

/** "Hard 16 vs 10", "Pair of As vs 6": a pair is named by its card, a total by its number. */
const spotText = (t: BlackjackStrings, d: MoveDecision) => {
  const spot = spotOf(d.cards);
  return t.reviewSpot(spot.kind, spot.kind === 'pair' ? cardName(spot.value) : String(spot.value), cardName(cardValue(d.dealerUp)));
};

/**
 * The plays of the hand just settled, each beside the chart's play and what it costs on average (review.ts).
 * `hands`: how many hands the round ended with, so each play says which hand it was on once there was a split.
 */
export const HandReview = ({ t, decisions, hands }: { t: BlackjackStrings; decisions: readonly Decision[]; hands: number }) => {
  if (decisions.length === 0) return null;
  const sum = summarize(decisions);
  return (
    <section className={styles.reviewPanel} aria-labelledby="bj-review-title" data-testid="bj-review">
      <h3 id="bj-review-title" className={styles.evTitle}>
        {t.reviewTitle}
      </h3>
      <ol className={styles.reviewList}>
        {decisions.map((d, i) => {
          const match = matchesChart(d);
          return (
            <li key={i} className={styles.reviewItem} data-match={match ? 'true' : 'false'}>
              <span className={styles.reviewSpot}>
                {d.kind === 'move' ? `${hands > 1 ? `${t.handLabel(d.hand + 1)} · ` : ''}${spotText(t, d)}` : t.insurance}
              </span>
              <span className={styles.reviewCost}>{d.cost > 0 ? t.reviewCost(t.medals(costText(d.cost))) : ''}</span>
              <span className={styles.reviewPlay}>{t.reviewYou(d.kind === 'move' ? t.action[d.action] : d.taken ? t.reviewInsured : t.reviewDeclined)}</span>
              <span className={styles.reviewVerdict}>{match ? t.reviewChartSame : t.reviewChartSays(d.kind === 'move' ? t.action[d.chart] : t.reviewDeclined)}</span>
            </li>
          );
        })}
      </ol>
      <p className={styles.reviewTotal} data-testid="bj-review-summary">
        {t.reviewSummary(sum.matched, sum.plays)} {sum.cost > 0 ? t.reviewCostTotal(t.medals(costText(sum.cost))) : t.reviewCostNone}
      </p>
      <p className={styles.note}>{t.reviewNote}</p>
    </section>
  );
};
