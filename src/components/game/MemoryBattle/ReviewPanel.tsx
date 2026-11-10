import type { MemoryBattleStrings } from './i18n';
import type { GameReview } from './review';
import styles from './MemoryBattle.module.css';

interface ReviewPanelProps {
  review: GameReview;
  strings: MemoryBattleStrings;
  symbolFor: (value: number) => string | number;
}

export const ReviewPanel = ({ review, strings: t, symbolFor }: ReviewPanelProps) => {
  const rows = [
    ['turns', t.reviewTurns],
    ['recalled', t.reviewRecalled],
    ['lucky', t.reviewLucky],
    ['missed', t.reviewMissed],
    ['longestStreak', t.reviewStreak],
  ] as const;

  return (
    <section className={styles.review} aria-labelledby="memory-battle-review-title">
      <h3 id="memory-battle-review-title" className={styles.reviewTitle}>
        {t.reviewTitle}
      </h3>
      <table className={styles.reviewTable}>
        <thead>
          <tr>
            <td />
            <th scope="col" className={styles.scorePlayer}>
              {t.youScore}
            </th>
            <th scope="col" className={styles.scoreAi}>
              {t.aiScore}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, label]) => (
            <tr key={key}>
              <th scope="row">{label}</th>
              <td>{review.player[key]}</td>
              <td>{review.ai[key]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.reviewNote}>{t.reviewNote}</p>
      <ol className={styles.turnList} tabIndex={0} aria-label={t.turnLogLabel}>
        {review.turns.map((entry, i) => (
          <li key={i} className={styles.turnItem} data-kind={entry.kind}>
            <span className={styles.turnNo}>{i + 1}</span>
            <span className={entry.mover === 'player' ? styles.scorePlayer : styles.scoreAi}>
              {entry.mover === 'player' ? t.you : t.ai}
            </span>
            <span className={styles.turnCards}>
              {symbolFor(entry.firstValue)} {symbolFor(entry.secondValue)}
            </span>
            <span className={styles.turnKind}>{t.turnKinds[entry.kind]}</span>
          </li>
        ))}
      </ol>
    </section>
  );
};
