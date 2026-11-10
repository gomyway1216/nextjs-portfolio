'use client';

import { useGameLanguage } from '../contexts/GameLanguageContext';
import { getBanditStrings } from './i18n';
import { MultiLineChart } from './charts';
import type { StrategyName } from './engine';
import { REVIEW_EPSILON, REVIEW_TRIALS, formatRegret, type GameReview } from './review';

const PLAYER_COLOR = '#f8fafc';
const STRATEGY_COLORS: Record<string, string> = {
  thompson: '#4ade80',
  ucb1: '#67e8f9',
  'eps-greedy': '#a78bfa',
  greedy: '#f472b6',
  random: '#94a3b8',
};

export type ReviewState =
  | { status: 'computing' }
  | { status: 'failed' }
  | { status: 'ready'; review: GameReview };

export const ReviewPanel = ({ state }: { state: ReviewState }) => {
  const { language } = useGameLanguage();
  const t = getBanditStrings(language);

  const labelFor = (id: 'player' | StrategyName) => {
    if (id === 'player') return t.reviewYou;
    if (id === 'eps-greedy') return `${t.strategyLabels[id]} (ε=${REVIEW_EPSILON})`;
    return t.strategyLabels[id] ?? id;
  };
  const colorFor = (id: 'player' | StrategyName) => (id === 'player' ? PLAYER_COLOR : STRATEGY_COLORS[id] ?? '#94a3b8');

  return (
    <section
      aria-label={t.reviewTitle}
      style={{ gridColumn: '1 / -1', minWidth: 0, background: '#020617', border: '1px solid #1e293b', borderRadius: 12, padding: '0.9rem 1rem' }}
    >
      <h3 style={{ margin: '0 0 0.5rem', color: '#fbbf24' }}>{t.reviewTitle}</h3>

      {state.status === 'computing' && (
        <p role="status" style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem' }}>{t.reviewComputing(REVIEW_TRIALS)}</p>
      )}
      {state.status === 'failed' && (
        <p role="status" style={{ margin: 0, color: '#fca5a5', fontSize: '0.9rem' }}>{t.reviewFailed}</p>
      )}
      {state.status === 'ready' && (
        <ReviewBody review={state.review} labelFor={labelFor} colorFor={colorFor} />
      )}
    </section>
  );
};

interface ReviewBodyProps {
  review: GameReview;
  labelFor: (id: 'player' | StrategyName) => string;
  colorFor: (id: 'player' | StrategyName) => string;
}

const ReviewBody = ({ review, labelFor, colorFor }: ReviewBodyProps) => {
  const { language } = useGameLanguage();
  const t = getBanditStrings(language);

  const series = [
    { label: t.reviewYou, color: PLAYER_COLOR, values: review.playerRegret },
    ...review.strategies.map((s) => ({ label: labelFor(s.strategy), color: colorFor(s.strategy), values: s.avgCumRegret })),
  ];
  const bestArmNames = review.bestArms.map((i) => t.armLabel(i + 1)).join(' / ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      <div role="status" style={{ color: '#e2e8f0', fontSize: '0.95rem', lineHeight: 1.55 }}>
        <strong>{t.reviewVerdict(review.beaten, review.strategies.length)}</strong>{' '}
        {t.reviewBestArm(bestArmNames, review.bestArmPulls, review.horizon)}
      </div>

      <div tabIndex={0} role="group" aria-label={t.reviewTableLabel} style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
              <th scope="col" style={cell}>{t.reviewColWho}</th>
              <th scope="col" style={{ ...cell, textAlign: 'right' }}>{t.reviewColReward}</th>
              <th scope="col" style={{ ...cell, textAlign: 'right' }}>{t.reviewColRegret}</th>
            </tr>
          </thead>
          <tbody>
            {review.rows.map((row) => {
              const isPlayer = row.id === 'player';
              return (
                <tr key={row.id} style={{ borderTop: '1px solid #1e293b', background: isPlayer ? '#1e293b' : 'transparent' }}>
                  <th scope="row" style={{ ...cell, textAlign: 'left', color: colorFor(row.id), fontWeight: 700 }}>
                    {isPlayer ? '▶ ' : ''}{labelFor(row.id)}
                  </th>
                  <td style={numCell}>{isPlayer ? row.reward : row.reward.toFixed(1)}</td>
                  <td style={numCell}>{formatRegret(row.regret)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div role="img" aria-label={t.reviewChartLabel}>
        <MultiLineChart series={series} yLabel={t.cumRegret} />
      </div>

      <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.8rem', lineHeight: 1.55 }}>
        {t.reviewNote(review.trials, review.horizon)}
      </p>
    </div>
  );
};

const cell: React.CSSProperties = { padding: '0.4rem 0.5rem', whiteSpace: 'nowrap' };
const numCell: React.CSSProperties = { ...cell, textAlign: 'right', fontFamily: 'ui-monospace, monospace', color: '#e2e8f0' };
