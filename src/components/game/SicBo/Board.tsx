import { FACES, countOf, kindOf, sortedDice, totalOf, type Dice } from './engine';
import { DieFace } from './Dice';
import { HISTORY_LIMIT } from './medalTable';
import type { SicBoStrings } from './i18n';
import styles from './SicBo.module.css';

/**
 * The board of results, as an electronic table shows the last rolls: twenty
 * columns, the latest first, each with its three dice smallest first, their
 * total and a lamp for small (小), big (大) or a triple (★); under them, how
 * many of each, and how often each number came up. The board is the same size
 * with no rolls on it as with twenty, so nothing moves as it fills.
 */
export const Board = ({ history, t }: { history: readonly Dice[]; t: SicBoStrings }) => {
  const kinds = history.map(kindOf);
  const count = (kind: string) => kinds.filter((k) => k === kind).length;
  const faces = FACES.map((face) => history.reduce((sum, dice) => sum + countOf(dice, face), 0));
  const most = Math.max(1, ...faces);
  return (
    <section className={styles.panel} aria-labelledby="sb-board-title">
      <h2 id="sb-board-title" className={styles.panelTitle}>
        {t.boardTitle}
      </h2>
      <div className={styles.boardFrame}>
        <ol className={styles.board} data-testid="sb-history" data-count={history.length}>
          {Array.from({ length: HISTORY_LIMIT }, (_, i) => {
            const dice = history[i];
            if (!dice) return <li key={`empty-${i}`} className={styles.boardCell} data-kind="none" aria-hidden="true" />;
            const shown = sortedDice(dice);
            const kind = kinds[i];
            const total = totalOf(dice);
            return (
              <li key={`${i}-${shown.join('')}`} className={styles.boardCell} data-kind={kind} aria-label={t.boardEntry(shown, total, kind)}>
                <span className={styles.boardDice} aria-hidden="true">
                  {shown.map((face, d) => (
                    <DieFace key={d} face={face} className={styles.boardDie} />
                  ))}
                </span>
                <span className={styles.boardTotal} aria-hidden="true">
                  {total}
                </span>
                <span className={styles.boardLamp} aria-hidden="true" lang="ja">
                  {kind === 'triple' ? '★' : kind === 'big' ? '大' : '小'}
                </span>
              </li>
            );
          })}
        </ol>
        {history.length === 0 && <p className={styles.boardEmpty}>{t.boardEmpty}</p>}
      </div>
      <p className={styles.boardCounts} data-testid="sb-counts">
        {t.boardCounts(count('big'), count('small'), count('triple'))}
      </p>
      <h3 className={styles.panelSub}>{t.facesTitle}</h3>
      <ul className={styles.faceBars}>
        {FACES.map((face, i) => (
          <li key={face} aria-label={t.faceCount(face, faces[i])}>
            <DieFace face={face} className={styles.faceBarDie} />
            <span className={styles.faceBarTrack} aria-hidden="true">
              <span className={styles.faceBarFill} style={{ width: `${(faces[i] / most) * 100}%` }} />
            </span>
            <span className={styles.faceBarCount} aria-hidden="true">
              {faces[i]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
};
