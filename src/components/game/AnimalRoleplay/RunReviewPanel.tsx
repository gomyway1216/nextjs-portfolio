/**
 * Animal Roleplay - post-run review panel
 */

'use client';

import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { LocalStrings } from './i18n';
import type { RunReview as RunReviewData } from './runReview';
import { MAX_HP, MAX_HUNGER, MAX_TURNS } from './types';

import styles from './AnimalRoleplay.module.css';

const CHART_WIDTH = 100;
const CHART_HEIGHT = 40;
const HP_COLOR = '#4ade80';
const HUNGER_COLOR = '#fbbf24';

function chartPoints(values: number[], max: number): string {
  return values
    .map((value, index) => {
      const x = (index / MAX_TURNS) * CHART_WIDTH;
      const y = CHART_HEIGHT - (value / max) * CHART_HEIGHT;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function formatDelta(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

interface RunReviewPanelProps {
  review: RunReviewData;
  local: LocalStrings;
}

export function RunReviewPanel({ review, local }: RunReviewPanelProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const strings = local.review;
  const total = review.turns.length;
  const hpLabel = t('games.animal-roleplay.ui.hpLabel');
  const hungerLabel = t('games.animal-roleplay.ui.hungerLabel');
  const hpSeries = [MAX_HP, ...review.turns.map((turn) => turn.hpAfter)];
  const hungerSeries = [MAX_HUNGER, ...review.turns.map((turn) => turn.hungerAfter)];

  return (
    <section className={styles.card} data-testid="animal-run-review" aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.reviewHeading}>
        {strings.heading}
      </h3>

      <div className={styles.reviewLegend} aria-hidden="true">
        <span className={styles.reviewLegendItem} style={{ color: HP_COLOR }}>
          <svg width="22" height="6" viewBox="0 0 22 6">
            <line x1="0" y1="3" x2="22" y2="3" stroke={HP_COLOR} strokeWidth="2" />
          </svg>
          {hpLabel}
        </span>
        <span className={styles.reviewLegendItem} style={{ color: HUNGER_COLOR }}>
          <svg width="22" height="6" viewBox="0 0 22 6">
            <line
              x1="0"
              y1="3"
              x2="22"
              y2="3"
              stroke={HUNGER_COLOR}
              strokeWidth="2"
              strokeDasharray="4 3"
            />
          </svg>
          {hungerLabel}
        </span>
      </div>
      <svg
        className={styles.reviewChart}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={strings.chartLabel}
      >
        <line
          x1="0"
          y1={CHART_HEIGHT / 2}
          x2={CHART_WIDTH}
          y2={CHART_HEIGHT / 2}
          className={styles.reviewChartGuide}
        />
        <polyline
          points={chartPoints(hpSeries, MAX_HP)}
          className={styles.reviewChartLine}
          stroke={HP_COLOR}
        />
        <polyline
          points={chartPoints(hungerSeries, MAX_HUNGER)}
          className={styles.reviewChartLine}
          stroke={HUNGER_COLOR}
          strokeDasharray="4 3"
        />
      </svg>

      <ul className={styles.reviewSummary}>
        <li>
          {strings.successes(review.successes, total, review.expectedSuccesses.toFixed(1))}{' '}
          <span data-testid="animal-run-luck" data-luck={review.luck}>
            {strings.luck[review.luck]}
          </span>
        </li>
        <li>
          {strings.topPicks(review.topPicks, total)}{' '}
          <span className={styles.reviewNote}>{strings.topNote}</span>
        </li>
        <li>{strings.lowest(review.lowestHp, review.lowestHunger)}</li>
      </ul>

      <div className={styles.sectionLabel}>{strings.turnsLabel}</div>
      <ol className={styles.reviewTurns}>
        {review.turns.map((turn) => (
          <li key={turn.turn} className={styles.logItem} data-testid="animal-run-turn">
            <div className={styles.logHead}>
              <div className={styles.logTurn}>
                {t('games.animal-roleplay.ui.turnLabel', { current: turn.turn, total: MAX_TURNS })}
              </div>
              <span
                className={`${styles.logTag} ${turn.success ? styles.logTagSuccess : styles.logTagFail}`}
              >
                {turn.success
                  ? t('games.animal-roleplay.ui.resultTag.success')
                  : t('games.animal-roleplay.ui.resultTag.fail')}
              </span>
            </div>
            <div className={styles.logBody}>
              {t(`games.animal-roleplay.ui.events.${turn.eventId}.title`)} /{' '}
              {t(`games.animal-roleplay.ui.actions.${turn.actionId}.label`)} · {local.successChance}{' '}
              {turn.chance}%
            </div>
            <div className={styles.logDeltas}>
              <span>
                {hpLabel} {turn.hpBefore} → {turn.hpAfter}
              </span>
              <span>
                {hungerLabel} {turn.hungerBefore} → {turn.hungerAfter}
              </span>
              <span>
                {t('games.animal-roleplay.ui.scoreLabel')} {formatDelta(turn.scoreDelta)}
              </span>
            </div>
            {turn.pickedTop ? null : (
              <div className={styles.reviewAlt}>
                {strings.highest(
                  t(`games.animal-roleplay.ui.actions.${turn.topActionId}.label`),
                  turn.topChance,
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default RunReviewPanel;
