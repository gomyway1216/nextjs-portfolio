'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Brain, Clock, Info, Target } from 'lucide-react';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import { useGameToolbar } from '@/contexts/GameToolbarContext';

import { InfoModal } from '../common';
import { getDifficultyColor } from '../common/utils';
import { useGameLanguage } from '../contexts/GameLanguageContext';

import {
  CellSpec,
  Question,
  QuizDifficulty,
  generateQuestion,
} from './questions';
import { estimateIq, getIqStrings } from './i18n';
import styles from './IqTest.module.css';

const TOTAL_QUESTIONS = 10;
const TIME_PER_QUESTION = 25; // seconds, when timer enabled

// --------------------------------------------------------------------------
// Shape renderer (matrix cells)
// --------------------------------------------------------------------------

const CellShapeSvg = ({ cell, size = 70 }: { cell: CellSpec; size?: number }) => {
  const cy = size / 2;
  const gap = size * 0.06;
  const usable = size - gap * 2;
  const shapeSize = Math.min(usable / cell.count - gap, size * 0.55);
  const r = shapeSize / 2;
  const startX = (size - (shapeSize * cell.count + gap * (cell.count - 1))) / 2 + r;

  const shapes = Array.from({ length: cell.count }, (_, i) => {
    const cx = startX + i * (shapeSize + gap);
    if (cell.shape === 'circle') {
      return <circle key={i} cx={cx} cy={cy} r={r} fill={cell.color} />;
    }
    if (cell.shape === 'square') {
      return (
        <rect key={i} x={cx - r} y={cy - r} width={2 * r} height={2 * r} fill={cell.color} rx={r * 0.12} />
      );
    }
    if (cell.shape === 'triangle') {
      const pts = `${cx},${cy - r} ${cx - r},${cy + r * 0.85} ${cx + r},${cy + r * 0.85}`;
      return <polygon key={i} points={pts} fill={cell.color} />;
    }
    const star: string[] = [];
    for (let k = 0; k < 10; k += 1) {
      const angle = (Math.PI / 5) * k - Math.PI / 2;
      const radius = k % 2 === 0 ? r : r * 0.45;
      star.push(`${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`);
    }
    return <polygon key={i} points={star.join(' ')} fill={cell.color} />;
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="matrix cell">
      {shapes}
    </svg>
  );
};

const MatrixGridView = ({ grid }: { grid: (CellSpec | null)[][] }) => (
  <div className={styles.matrixGrid} aria-label="3 by 3 pattern matrix">
    {grid.flatMap((row, r) =>
      row.map((cell, c) => (
        <div key={`${r}-${c}`} className={styles.matrixCell}>
          {cell ? (
            <CellShapeSvg cell={cell} size={80} />
          ) : (
            <span className={styles.matrixCellQ}>?</span>
          )}
        </div>
      )),
    )}
  </div>
);

// --------------------------------------------------------------------------
// State
// --------------------------------------------------------------------------

type Phase = 'menu' | 'question' | 'feedback' | 'gameover';

interface HistoryEntry {
  correct: boolean;
  question: Question;
  selected: number | null; // null = timed out
}

interface GameState {
  phase: Phase;
  questionIndex: number; // 1-based
  question: Question | null;
  score: number;
  selected: number | null;
  history: HistoryEntry[];
}

const initialState: GameState = {
  phase: 'menu',
  questionIndex: 0,
  question: null,
  score: 0,
  selected: null,
  history: [],
};

const DIFFICULTIES: QuizDifficulty[] = ['easy', 'medium', 'hard', 'mixed'];

// --------------------------------------------------------------------------
// Component
// --------------------------------------------------------------------------

export const IqTest = () => {
  useFeatureLifecycle('game.iq-test');
  const { language } = useGameLanguage();
  const { setContent } = useGameToolbar();
  const t = getIqStrings(language);

  const [state, setState] = useState<GameState>(initialState);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('mixed');
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_QUESTION);
  const [showInfo, setShowInfo] = useState(false);

  // Fingerprints used this session to prevent repeats.
  const usedRef = useRef<Set<string>>(new Set());

  const makeQuestion = useCallback(
    (index: number): Question =>
      generateQuestion(difficulty, index, TOTAL_QUESTIONS, usedRef.current),
    [difficulty],
  );

  const start = useCallback(() => {
    usedRef.current = new Set();
    setState({
      phase: 'question',
      questionIndex: 1,
      question: makeQuestion(0),
      score: 0,
      selected: null,
      history: [],
    });
    setTimeLeft(TIME_PER_QUESTION);
  }, [makeQuestion]);

  const choose = useCallback((idx: number | null) => {
    setState((prev) => {
      if (prev.phase !== 'question' || !prev.question) return prev;
      const correct = idx !== null && idx === prev.question.answerIndex;
      return {
        ...prev,
        phase: 'feedback',
        selected: idx,
        score: prev.score + (correct ? 10 : 0),
        history: [...prev.history, { correct, question: prev.question, selected: idx }],
      };
    });
  }, []);

  const next = useCallback(() => {
    setState((prev) => {
      if (prev.questionIndex >= TOTAL_QUESTIONS) {
        return { ...prev, phase: 'gameover' };
      }
      return {
        ...prev,
        phase: 'question',
        questionIndex: prev.questionIndex + 1,
        question: makeQuestion(prev.questionIndex),
        selected: null,
      };
    });
    setTimeLeft(TIME_PER_QUESTION);
  }, [makeQuestion]);

  const reset = useCallback(() => {
    usedRef.current = new Set();
    setState(initialState);
    setTimeLeft(TIME_PER_QUESTION);
  }, []);

  // Countdown timer. The tick and the time-out both happen inside the timeout
  // callback (never synchronously in the effect body) to avoid cascading renders.
  useEffect(() => {
    if (!timerEnabled || state.phase !== 'question' || timeLeft <= 0) return;
    const id = window.setTimeout(() => {
      if (timeLeft <= 1) {
        choose(null); // time out -> incorrect
      } else {
        setTimeLeft((s) => s - 1);
      }
    }, 1000);
    return () => window.clearTimeout(id);
  }, [timerEnabled, state.phase, state.questionIndex, timeLeft, choose]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (state.phase === 'question') {
        const num = Number(e.key);
        if (Number.isInteger(num) && num >= 1 && num <= 4) {
          e.preventDefault();
          choose(num - 1);
        }
      } else if (state.phase === 'feedback') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          next();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.phase, choose, next]);

  const q = state.question;
  const correctCount = state.history.filter((h) => h.correct).length;
  const answered = state.history.length;

  // Register the Info button in the global toolbar.
  useEffect(() => {
    setContent({
      right: (
        <button
          type="button"
          onClick={() => setShowInfo(true)}
          aria-label={t.howToPlay}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            background: 'rgba(14, 165, 233, 0.12)',
            border: '1px solid rgba(14, 165, 233, 0.35)',
            borderRadius: '999px',
            color: '#38bdf8',
            padding: '0.4rem 0.85rem',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          <Info style={{ width: '1rem', height: '1rem' }} />
          <span>{t.howToPlay}</span>
        </button>
      ),
    });
    return () => setContent(null);
  }, [setContent, t.howToPlay]);

  const progressPct = useMemo(() => {
    if (state.phase === 'menu') return 0;
    const done = state.phase === 'gameover' ? TOTAL_QUESTIONS : state.questionIndex - 1 + (state.phase === 'feedback' ? 1 : 0);
    return Math.round((done / TOTAL_QUESTIONS) * 100);
  }, [state.phase, state.questionIndex]);

  const estimatedIq = estimateIq(correctCount, TOTAL_QUESTIONS);
  const resultEmoji =
    correctCount >= 9 ? '🏆' : correctCount >= 7 ? '🥇' : correctCount >= 5 ? '🥈' : correctCount >= 3 ? '🧠' : '🌱';

  return (
    <div className={styles.root} style={{ paddingTop: '5rem' }}>
      <div className={styles.shell}>
        <h1 style={{ margin: 0, fontSize: 'clamp(1.6rem, 6vw, 2rem)', fontWeight: 800 }}>{t.title}</h1>
        <p style={{ marginTop: '0.5rem', color: 'var(--games-route-muted, #94a3b8)', lineHeight: 1.6 }}>
          {t.subtitle}
        </p>

        {state.phase !== 'menu' && (
          <div className={styles.statusBar}>
            <span className={styles.pill}>
              {t.question} {Math.min(state.questionIndex, TOTAL_QUESTIONS)} / {TOTAL_QUESTIONS}
            </span>
            <span className={styles.pill}>
              <Target style={{ width: '0.9rem', height: '0.9rem' }} aria-hidden /> {correctCount}
              <span style={{ opacity: 0.6 }}>/ {answered}</span>
            </span>
            <span className={styles.pill}>{t.score}: {state.score}</span>
            {timerEnabled && state.phase === 'question' && (
              <span className={styles.pillTimer + ' ' + styles.pill} data-low={timeLeft <= 5 ? 'true' : 'false'}>
                <Clock style={{ width: '0.9rem', height: '0.9rem' }} aria-hidden /> {timeLeft}s
              </span>
            )}
            <span className={styles.progressTrack} role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
              <span className={styles.progressFill} style={{ width: `${progressPct}%` }} />
            </span>
          </div>
        )}

        <div className={styles.card}>
          {/* ---------------- MENU ---------------- */}
          {state.phase === 'menu' && (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{ fontSize: '3.5rem', marginBottom: '0.75rem' }}>🧩</div>

              <fieldset style={{ border: 'none', padding: 0, margin: '0 0 1.2rem' }}>
                <legend style={{ fontWeight: 700, marginBottom: '0.6rem', color: 'var(--games-route-fg, #e2e8f0)' }}>
                  {t.difficultyTitle}
                </legend>
                <div
                  role="radiogroup"
                  aria-label={t.difficultyTitle}
                  style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}
                >
                  {DIFFICULTIES.map((d) => {
                    const opt = t.difficultyOptions.find((o) => o.value === d)!;
                    const isSel = difficulty === d;
                    const colors = getDifficultyColor(d === 'mixed' ? 'expert' : d);
                    return (
                      <button
                        key={d}
                        type="button"
                        role="radio"
                        aria-checked={isSel}
                        onClick={() => setDifficulty(d)}
                        title={opt.description}
                        style={{
                          flex: '1 1 130px',
                          minWidth: '120px',
                          maxWidth: '180px',
                          textAlign: 'left',
                          borderRadius: '12px',
                          border: isSel ? `2px solid ${colors.border}` : '2px solid var(--games-route-border, #334155)',
                          background: isSel ? colors.bg : 'color-mix(in srgb, var(--games-route-surface-raised, #0f172a) 85%, transparent)',
                          color: 'var(--games-route-fg, #e2e8f0)',
                          padding: '0.7rem 0.85rem',
                          cursor: 'pointer',
                          transition: 'border-color 0.15s, background 0.15s',
                        }}
                      >
                        <div style={{ fontWeight: 800, color: isSel ? colors.text : undefined }}>{opt.label}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--games-route-muted, #94a3b8)', marginTop: '0.15rem', lineHeight: 1.3 }}>
                          {opt.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '1.3rem',
                  cursor: 'pointer',
                  color: 'var(--games-route-muted, #cbd5e1)',
                  fontWeight: 600,
                }}
              >
                <input
                  type="checkbox"
                  checked={timerEnabled}
                  onChange={(e) => setTimerEnabled(e.target.checked)}
                  style={{ width: '1.1rem', height: '1.1rem', accentColor: '#0ea5e9' }}
                />
                <Clock style={{ width: '1rem', height: '1rem' }} aria-hidden />
                {t.timerLabel}: {timerEnabled ? t.timerOn : t.timerOff} ({TIME_PER_QUESTION}s)
              </label>

              <div>
                <button type="button" onClick={start} className={styles.primaryBtn}>
                  {t.startLabel}
                </button>
              </div>
            </div>
          )}

          {/* ---------------- QUESTION / FEEDBACK ---------------- */}
          {(state.phase === 'question' || state.phase === 'feedback') && q && (
            <>
              <p className={styles.prompt}>{q.prompt[language]}</p>

              {q.matrix ? (
                <MatrixGridView grid={q.matrix.grid} />
              ) : (
                <div className={styles.puzzleBox}>{q.display}</div>
              )}

              <div className={styles.optionGrid} role="group" aria-label={q.prompt[language]}>
                {q.options.map((opt, i) => {
                  const isAnswer = i === q.answerIndex;
                  const isPicked = i === state.selected;
                  const showFeedback = state.phase === 'feedback';
                  const cls = [styles.option];
                  if (showFeedback && isAnswer) cls.push(styles.optionCorrect);
                  else if (showFeedback && isPicked) cls.push(styles.optionWrong);
                  else if (showFeedback) cls.push(styles.optionDim);
                  return (
                    <button
                      key={`${state.questionIndex}-${i}-${opt}`}
                      type="button"
                      onClick={() => state.phase === 'question' && choose(i)}
                      disabled={showFeedback}
                      className={cls.join(' ')}
                      aria-label={`${i + 1}. ${q.matrix ? `option ${opt}` : opt}${showFeedback && isAnswer ? ` (${t.correctLabel})` : ''}`}
                    >
                      <span className={styles.optionKey}>{i + 1}.</span>
                      {q.matrix ? (
                        <span style={{ display: 'inline-flex' }}>
                          <CellShapeSvg cell={q.matrix.cellOptions[i]} size={64} />
                        </span>
                      ) : (
                        <span>{opt}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {state.phase === 'feedback' && (
                <div className={styles.feedback}>
                  <div
                    className={
                      styles.feedbackHead +
                      ' ' +
                      (state.selected === q.answerIndex ? styles.feedbackCorrect : styles.feedbackWrong)
                    }
                  >
                    {state.selected === null
                      ? `⏱ ${t.timeUp}`
                      : state.selected === q.answerIndex
                        ? `◯ ${t.correctFeedback} +10`
                        : `✗ ${t.wrongFeedback}`}
                  </div>
                  <div className={styles.explanation}>{q.explanation[language]}</div>
                  <button type="button" onClick={next} className={styles.nextBtn}>
                    {state.questionIndex >= TOTAL_QUESTIONS ? t.seeResults : `${t.nextQuestion} →`}
                  </button>
                </div>
              )}

              <div className={styles.hint}>
                {state.phase === 'question' ? t.keyHint : t.nextHint}
              </div>
            </>
          )}

          {/* ---------------- RESULT ---------------- */}
          {state.phase === 'gameover' && (
            <div className={styles.result}>
              <div className={styles.resultEmoji}>{resultEmoji}</div>
              <div className={styles.resultTitle}>{t.resultTitle}</div>

              <div className={styles.iqBadge}>
                <span className={styles.iqValue}>{estimatedIq}</span>
                <span className={styles.iqLabel}>{t.estimatedIq}</span>
              </div>
              <div className={styles.rating}>{t.ratingFor(correctCount, TOTAL_QUESTIONS)}</div>
              <div className={styles.subScore}>
                {t.outOf(correctCount, TOTAL_QUESTIONS)} · {t.score}: {state.score} / {TOTAL_QUESTIONS * 10}
              </div>

              <div className={styles.reviewSectionTitle}>{t.reviewTitle}</div>
              <div className={styles.reviewList}>
                {state.history.map((h, i) => (
                  <div key={i} className={styles.reviewRow}>
                    <span className={styles.reviewMark + ' ' + (h.correct ? styles.reviewMarkOk : styles.reviewMarkNo)}>
                      {h.correct ? '◯' : '✗'}
                    </span>
                    <span className={styles.reviewBody}>
                      {h.question.matrix ? (
                        <>
                          <span>{language === 'ja' ? 'マトリックス →' : 'Matrix →'}</span>
                          <CellShapeSvg cell={h.question.matrix.cellOptions[h.question.answerIndex]} size={30} />
                        </>
                      ) : (
                        <span>{h.question.display.replace('?', h.question.options[h.question.answerIndex])}</span>
                      )}
                    </span>
                    <span className={styles.reviewType}>{h.question.type}</span>
                  </div>
                ))}
              </div>

              <button type="button" onClick={reset} className={styles.primaryBtn}>
                {t.playAgain}
              </button>
            </div>
          )}
        </div>
      </div>

      <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} title={t.howToPlay}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', color: 'var(--games-route-fg, #e2e8f0)', lineHeight: 1.65 }}>
          {(language === 'ja'
            ? [
                { icon: <Brain />, text: `全 ${TOTAL_QUESTIONS} 問。数列・仲間外れ・類比・アルファベット・図形マトリックスから出題されます。` },
                { icon: <Target />, text: '各問4択のうち正解は1つ。正解ごとに +10 点。キー 1〜4 でも解答できます。' },
                { icon: <Clock />, text: `タイマーをオンにすると1問 ${TIME_PER_QUESTION} 秒。時間切れは不正解になります。` },
                { icon: <Info />, text: '「ミックス」は序盤やさしく、後半に向けて難しくなります。同じ問題は1セッション内で繰り返されません。' },
              ]
            : [
                { icon: <Brain />, text: `${TOTAL_QUESTIONS} questions drawn from sequences, odd-one-out, analogies, letters and figure matrices.` },
                { icon: <Target />, text: 'Each question has exactly one correct answer out of four. +10 per correct answer. Keys 1–4 also work.' },
                { icon: <Clock />, text: `Enable the timer for ${TIME_PER_QUESTION}s per question. Running out counts as incorrect.` },
                { icon: <Info />, text: '"Mixed" starts easy and ramps up. No question repeats within a session.' },
              ]
          ).map((row, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.7rem', alignItems: 'flex-start' }}>
              <span style={{ color: '#38bdf8', flexShrink: 0, marginTop: '0.15rem' }}>{row.icon}</span>
              <span>{row.text}</span>
            </div>
          ))}
        </div>
      </InfoModal>
    </div>
  );
};

export default IqTest;
