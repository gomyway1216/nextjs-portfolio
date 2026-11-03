/**
 * A finished game, move by move: the board at any point, each of your moves
 * reviewed by the AI against the best of the others, and the record as text.
 * Also the list of past games kept on this device.
 */

import { ArrowLeft, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, ClipboardCopy, Lightbulb, Sparkles, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MoveReview } from './ai';
import type { ReviewRequest } from './blokusAiWorkerClient';
import { Board } from './Board';
import { PASS, PIECES, applyMove, cloneState, moveCells, movePiece } from './engine';
import type { BlokusStrings } from './i18n';
import { colorName, seatName } from './names';
import { positions, recordText, reviewedSeatOf, verdictOf, type GameRecord, type StoredReview, type Verdict } from './record';
import { seatScores, seatWinners, sideOf, viewsOf } from './seating';
import styles from './Blokus.module.css';

const SLIPS: readonly Verdict[] = ['inaccuracy', 'mistake', 'blunder'];
/** How many of the costliest moves are listed. */
const WORST_SHOWN = 3;

const noop = () => undefined;

const lostOf = (review: StoredReview) => Math.max(0, review.bestMargin - review.playedMargin);

const formatPoints = (points: number) => (Math.round(points * 10) / 10).toFixed(1);

/** On screen a move is its piece: the board shows where it went, and has no letters and numbers to read cells by. */
const describe = (t: BlokusStrings, move: number): string => (move === PASS ? t.record.pass : PIECES[movePiece(move)].name);

/** The headline for a finished game: who won, as the results put it. */
const outcome = (t: BlokusStrings, record: GameRecord, finalScores: number[], winners: number[]): string => {
  if (record.me === null) return winners.length === 1 ? t.winnerIs(seatName(t, record.seating, winners[0])) : t.tie;
  if (!winners.includes(record.me)) return t.lose;
  return winners.length === 1 ? t.win : t.tie;
};

interface RecordViewProps {
  record: GameRecord;
  t: BlokusStrings;
  language: string;
  requestReview: (request: ReviewRequest) => Promise<MoveReview>;
  /** False when this device would not keep it. */
  saved: boolean;
  onChange: (record: GameRecord) => void;
  onDelete: () => void;
  onBack: () => void;
}

export const RecordView = ({ record, t, language, requestReview, saved, onChange, onDelete, onBack }: RecordViewProps) => {
  const { seating } = record;
  const states = useMemo(() => positions(record), [record]);
  const total = states.length - 1;
  const moves = record.moves.slice(0, total);
  const [step, setStep] = useState(total);
  const [showBest, setShowBest] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const stopped = useRef(false);
  useEffect(() => {
    stopped.current = false;
    return () => {
      stopped.current = true;
    };
  }, []);

  const names = useMemo(() => Array.from({ length: states[0].rules.colors }, (_, color) => colorName(t, seating, color)), [seating, states, t]);
  const final = states[total];
  const finalScores = seatScores(seating, final);
  const winners = seatWinners(seating, final);

  const reviewable = useMemo(() => moves.flatMap((move, index) => (reviewedSeatOf(record, states[index], move) >= 0 ? [index] : [])), [moves, record, states]);
  const reviews = record.review ?? [];
  const reviewed = reviewable.filter((index) => reviews[index]);
  const complete = reviewable.length > 0 && reviewed.length === reviewable.length;

  const index = step - 1;
  const move = index >= 0 ? moves[index] : null;
  const before = index >= 0 ? states[index] : null;
  const review = index >= 0 ? (reviews[index] ?? null) : null;
  const verdict = review && move !== null ? verdictOf(review, move) : null;
  const better = review && move !== null && review.best !== move && verdict !== 'best' ? review.best : null;
  const showing = showBest && better !== null ? better : move;

  const shown = useMemo(() => {
    if (!before || showing === null || showing === move) return states[step];
    const next = cloneState(before);
    applyMove(next, showing);
    return next;
  }, [before, move, showing, states, step]);
  // Only the move on screen is ringed.
  const latest = useMemo(() => (showing !== null && showing !== PASS ? [moveCells(showing)] : []), [showing]);

  const goTo = useCallback(
    (next: number) => {
      setStep(Math.max(0, Math.min(total, next)));
      setShowBest(false);
    },
    [total],
  );

  // The arrows step through the game wherever the focus is: a button that steps to the end disables itself and drops it.
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.altKey || event.ctrlKey || event.metaKey || target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      const by = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
      const to = by !== undefined ? step + by : event.key === 'Home' ? 0 : event.key === 'End' ? total : undefined;
      if (to === undefined) return;
      event.preventDefault();
      goTo(to);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [goTo, step, total]);

  const runReview = async () => {
    if (progress) return;
    setFailed(false);
    const working = Array.from({ length: total }, (_, at) => reviews[at] ?? null);
    const views = viewsOf(seating);
    let done = reviewable.filter((at) => working[at]).length;
    setProgress({ done, total: reviewable.length });
    try {
      for (const at of reviewable) {
        if (working[at]) continue;
        const seat = reviewedSeatOf(record, states[at], moves[at]);
        const { best, bestMargin, playedMargin } = await requestReview({
          state: states[at],
          played: moves[at],
          seed: 1 + at * 7919,
          view: sideOf(seating, seat),
          views,
        });
        if (stopped.current) return;
        working[at] = { best, bestMargin, playedMargin };
        done += 1;
        setProgress({ done, total: reviewable.length });
        onChange({ ...record, review: [...working] });
      }
    } catch {
      if (!stopped.current) setFailed(true);
    } finally {
      if (!stopped.current) setProgress(null);
    }
  };

  const copyText = async () => {
    const text = recordText(record, { colors: t.colors[seating.mode], seat: (seat) => seatName(t, seating, seat) });
    try {
      await navigator.clipboard.writeText(text);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  };

  // The graph: your expected final lead after each move reviewed, one line a reviewed seat.
  const points = reviewed.map((at) => ({ at, seat: reviewedSeatOf(record, states[at], moves[at]), review: reviews[at]!, verdict: verdictOf(reviews[at]!, moves[at]) }));
  const reach = Math.max(10, ...points.map(({ review: entry }) => Math.ceil(Math.abs(entry.playedMargin))));
  const graphWidth = 300;
  const graphHeight = 120;
  const xOf = (at: number) => (total <= 1 ? graphWidth / 2 : (at / (total - 1)) * graphWidth);
  const yOf = (margin: number) => graphHeight / 2 - (margin / reach) * (graphHeight / 2 - 6);
  const lines = [...new Set(points.map(({ seat }) => seat))].map((seat) => ({
    seat,
    path: points
      .filter((point) => point.seat === seat)
      .map((point, n) => `${n === 0 ? 'M' : 'L'}${xOf(point.at).toFixed(1)} ${yOf(point.review.playedMargin).toFixed(1)}`)
      .join(''),
  }));
  const worst = points
    .filter(({ verdict: word }) => SLIPS.includes(word))
    .sort((a, b) => lostOf(b.review) - lostOf(a.review))
    .slice(0, WORST_SHOWN);

  const playedAt = new Intl.DateTimeFormat(language === 'ja' ? 'ja-JP' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(record.playedAt);

  return (
    <div className={styles.layout} data-mode={seating.mode} data-record="true" data-testid="blokus-record">
      <div className={styles.boardColumn}>
        <div className={styles.recordHeader}>
          <button type="button" className={`${styles.btn} ${styles.btnSecondary} ${styles.recordBack}`} onClick={onBack} data-testid="blokus-record-back">
            <ArrowLeft className={styles.btnIcon} aria-hidden="true" />
            {t.record.back}
          </button>
          <div className={styles.recordHeading}>
            <h2 className={styles.recordTitle}>
              {t.record.title}: {outcome(t, record, finalScores, winners)}
            </h2>
            <p className={styles.recordMeta}>
              {[playedAt, t.modes[seating.mode].label, t.record.players(seating.seats.length), record.online ? t.record.online : null].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div className={styles.boardFrame}>
          <Board
            game={shown}
            latest={latest}
            corners={[]}
            ghost={null}
            color={before?.toMove ?? 0}
            holding={false}
            label={t.boardLabel(shown.rules.size)}
            onCursor={noop}
            onLeave={noop}
            onTouchDone={noop}
            onClick={noop}
            onKeyDown={noop}
          />
        </div>
        <div className={styles.recordNav}>
          <button type="button" className={styles.tool} aria-label={t.record.first} onClick={() => goTo(0)} disabled={step === 0}>
            <ChevronFirst className={styles.btnIcon} aria-hidden="true" />
          </button>
          <button type="button" className={styles.tool} aria-label={t.record.previous} onClick={() => goTo(step - 1)} disabled={step === 0} data-testid="blokus-record-prev">
            <ChevronLeft className={styles.btnIcon} aria-hidden="true" />
          </button>
          <input
            type="range"
            className={styles.recordSlider}
            min={0}
            max={total}
            value={step}
            aria-label={t.record.slider}
            aria-valuetext={step === 0 ? t.record.startPosition : t.record.position(step, total)}
            onChange={(event) => goTo(Number(event.target.value))}
            data-testid="blokus-record-slider"
          />
          <button type="button" className={styles.tool} aria-label={t.record.next} onClick={() => goTo(step + 1)} disabled={step === total} data-testid="blokus-record-next">
            <ChevronRight className={styles.btnIcon} aria-hidden="true" />
          </button>
          <button type="button" className={styles.tool} aria-label={t.record.last} onClick={() => goTo(total)} disabled={step === total}>
            <ChevronLast className={styles.btnIcon} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.recordMove} role="status" aria-live="polite" data-testid="blokus-record-move">
          <span className={styles.recordStep}>{step === 0 ? t.record.startPosition : t.record.position(step, total)}</span>
          {before && move !== null && (
            <span className={`${styles.recordMoveLine} ${styles[`color${before.toMove}`]}`}>
              <span className={styles.swatch} aria-hidden="true" />
              {t.record.moveLine(step, names[before.toMove], describe(t, move))}
            </span>
          )}
          {verdict && review && (
            <span className={styles.recordVerdictLine}>
              <span className={styles.verdict} data-verdict={verdict} data-testid="blokus-record-verdict">
                {t.record.verdicts[verdict]}
              </span>
              {SLIPS.includes(verdict) && <span>{t.record.lost(formatPoints(lostOf(review)))}</span>}
            </span>
          )}
          {better !== null && (
            <span className={styles.recordBetter}>
              <span>{showBest ? t.record.showingBest : t.record.bestWas(describe(t, better))}</span>
              <button type="button" className={`${styles.btn} ${styles.btnSecondary} ${styles.recordToggle}`} onClick={() => setShowBest((value) => !value)} aria-pressed={showBest} data-testid="blokus-record-best">
                <Lightbulb className={styles.btnIcon} aria-hidden="true" />
                {showBest ? t.record.showPlayed : t.record.showBest}
              </button>
            </span>
          )}
        </div>
      </div>

      <div className={styles.sideColumn}>
        <section className={styles.recordPanel} aria-label={t.finalScores}>
          <ol className={styles.resultList}>
            {seating.seats.map((seat, seatIndex) => (
              <li key={seatIndex} className={`${styles.resultRow} ${styles[`color${seat.colors[0]}`]}`}>
                <span className={styles.swatches} aria-hidden="true">
                  {seat.colors.map((color) => (
                    <span key={color} className={`${styles.swatch} ${styles[`color${color}`]}`} />
                  ))}
                </span>
                <span className={styles.resultName}>{seatName(t, seating, seatIndex)}</span>
                <span className={styles.resultScore}>{t.points(finalScores[seatIndex])}</span>
              </li>
            ))}
          </ol>
        </section>

        {reviewable.length > 0 && (
          <section className={styles.recordPanel} aria-label={t.record.graphTitle} data-testid="blokus-record-review">
            {!complete && (
              <>
                <p className={styles.recordNote}>{t.record.reviewNote}</p>
                <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => void runReview()} disabled={progress !== null} data-testid="blokus-record-run">
                  <Sparkles className={styles.btnIcon} aria-hidden="true" />
                  {progress ? t.record.reviewing(progress.done, progress.total) : t.record.review}
                </button>
                {progress && <progress className={styles.recordProgress} max={progress.total} value={progress.done} />}
                {failed && <p className={styles.recordNote} role="alert">{t.record.reviewFailed}</p>}
              </>
            )}
            {points.length > 0 && (
              <>
                <h3 className={styles.recordSubtitle}>{t.record.graphTitle}</h3>
                <svg className={styles.recordGraph} viewBox={`-6 0 ${graphWidth + 12} ${graphHeight}`} role="img" aria-label={t.record.graphNote} data-testid="blokus-record-graph">
                  <line className={styles.graphZero} x1={0} x2={graphWidth} y1={graphHeight / 2} y2={graphHeight / 2} />
                  {step > 0 && <line className={styles.graphNow} x1={xOf(index)} x2={xOf(index)} y1={0} y2={graphHeight} />}
                  {lines.map(({ seat, path }) => (
                    <path key={seat} className={`${styles.graphLine} ${styles[`color${seating.seats[seat].colors[0]}`]}`} d={path} />
                  ))}
                  {points.map((point) => (
                    <circle
                      key={point.at}
                      className={styles.graphPoint}
                      data-verdict={point.verdict}
                      cx={xOf(point.at)}
                      cy={yOf(point.review.playedMargin)}
                      r={point.at === index ? 5 : SLIPS.includes(point.verdict) ? 4 : 2.5}
                      onClick={() => goTo(point.at + 1)}
                    >
                      <title>{t.record.graphPoint(point.at + 1, formatPoints(point.review.playedMargin), t.record.verdicts[point.verdict])}</title>
                    </circle>
                  ))}
                </svg>
                <p className={styles.recordNote}>{t.record.graphNote}</p>
                <h3 className={styles.recordSubtitle}>{t.record.worstTitle}</h3>
                {worst.length === 0 ? (
                  <p className={styles.recordNote}>{complete ? t.record.noSlips : ''}</p>
                ) : (
                  <ol className={styles.recordWorst} data-testid="blokus-record-worst">
                    {worst.map((point) => (
                      <li key={point.at}>
                        <button type="button" className={styles.recordJump} onClick={() => goTo(point.at + 1)} aria-current={point.at === index ? 'step' : undefined}>
                          <span className={styles.verdict} data-verdict={point.verdict}>
                            {t.record.verdicts[point.verdict]}
                          </span>
                          <span>{t.record.moveLine(point.at + 1, names[states[point.at].toMove], describe(t, moves[point.at]))}</span>
                          <span className={styles.recordLost}>−{formatPoints(lostOf(point.review))}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )}
          </section>
        )}

        <section className={styles.recordPanel} aria-label={t.record.movesTitle}>
          <h3 className={styles.recordSubtitle}>{t.record.movesTitle}</h3>
          <ol className={styles.recordMoves} data-testid="blokus-record-moves">
            {moves.map((played, at) => {
              const entry = reviews[at];
              const word = entry ? verdictOf(entry, played) : null;
              return (
                <li key={at}>
                  <button type="button" className={`${styles.recordJump} ${styles[`color${states[at].toMove}`]}`} onClick={() => goTo(at + 1)} aria-current={at === index ? 'step' : undefined}>
                    <span className={styles.recordNumber}>{at + 1}</span>
                    <span className={styles.swatch} aria-hidden="true" />
                    <span className={styles.recordPiece}>{played === PASS ? t.record.pass : PIECES[movePiece(played)].name}</span>
                    {word && (
                      <span className={styles.verdict} data-verdict={word}>
                        {t.record.verdicts[word]}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        <div className={styles.actions}>
          <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => void copyText()} data-testid="blokus-record-copy">
            <ClipboardCopy className={styles.btnIcon} aria-hidden="true" />
            {copy === 'copied' ? t.record.copied : t.record.copy}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={() => {
              if (window.confirm(t.record.removeConfirm)) onDelete();
            }}
          >
            <Trash2 className={styles.btnIcon} aria-hidden="true" />
            {t.record.remove}
          </button>
        </div>
        {copy === 'failed' && (
          <>
            <p className={styles.recordNote} role="alert">{t.record.copyFailed}</p>
            <textarea className={styles.recordText} readOnly value={recordText(record, { colors: t.colors[seating.mode], seat: (seat) => seatName(t, seating, seat) })} rows={8} />
          </>
        )}
        {!saved && <p className={styles.recordNote}>{t.record.notSaved}</p>}
      </div>
    </div>
  );
};

interface RecordListProps {
  records: readonly GameRecord[];
  t: BlokusStrings;
  language: string;
  onOpen: (record: GameRecord) => void;
  onBack: () => void;
}

export const RecordList = ({ records, t, language, onOpen, onBack }: RecordListProps) => {
  const format = new Intl.DateTimeFormat(language === 'ja' ? 'ja-JP' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <section className={`${styles.result} ${styles.recordList}`} aria-label={t.record.historyTitle} data-testid="blokus-record-list">
      <h2 className={styles.resultTitle}>{t.record.historyTitle}</h2>
      {records.length === 0 ? (
        <p className={styles.recordNote}>{t.record.historyEmpty}</p>
      ) : (
        <ol className={styles.recordMoves}>
          {records.map((record) => {
            const final = positions(record).at(-1)!;
            return (
              <li key={record.id}>
                <button type="button" className={styles.recordEntry} onClick={() => onOpen(record)}>
                  <span className={styles.recordEntryTitle}>{outcome(t, record, seatScores(record.seating, final), seatWinners(record.seating, final))}</span>
                  <span className={styles.recordMeta}>
                    {[format.format(record.playedAt), t.modes[record.seating.mode].label, t.record.players(record.seating.seats.length), record.online ? t.record.online : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <div className={styles.actions}>
        <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={onBack}>
          <ArrowLeft className={styles.btnIcon} aria-hidden="true" />
          {t.record.back}
        </button>
      </div>
    </section>
  );
};
