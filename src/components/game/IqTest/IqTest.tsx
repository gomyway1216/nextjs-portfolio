'use client';

import { useEffect, useState } from 'react';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';

import { Question, generateQuestion } from './questions';

const TOTAL_QUESTIONS = 10;

type Phase = 'menu' | 'question' | 'feedback' | 'gameover';

interface HistoryEntry {
  correct: boolean;
  question: Question;
  selected: number;
}

interface GameState {
  phase: Phase;
  questionIndex: number;
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

export const IqTest = () => {
  useFeatureLifecycle('game.iq-test');
  const [state, setState] = useState<GameState>(initialState);

  const start = () => {
    setState({
      phase: 'question',
      questionIndex: 1,
      question: generateQuestion(),
      score: 0,
      selected: null,
      history: [],
    });
  };

  const choose = (idx: number) => {
    setState((prev) => {
      if (prev.phase !== 'question' || !prev.question) return prev;
      const correct = idx === prev.question.answerIndex;
      return {
        ...prev,
        phase: 'feedback',
        selected: idx,
        score: prev.score + (correct ? 10 : 0),
        history: [...prev.history, { correct, question: prev.question, selected: idx }],
      };
    });
  };

  const next = () => {
    setState((prev) => {
      if (prev.questionIndex >= TOTAL_QUESTIONS) {
        return { ...prev, phase: 'gameover' };
      }
      return {
        ...prev,
        phase: 'question',
        questionIndex: prev.questionIndex + 1,
        question: generateQuestion(),
        selected: null,
      };
    });
  };

  const reset = () => setState(initialState);

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
  }, [state.phase, state.questionIndex]);

  const q = state.question;
  const correctCount = state.history.filter((h) => h.correct).length;

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #020617, #111827)', color: '#e2e8f0', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800 }}>IQ Test</h1>
        <p style={{ marginTop: '0.5rem', color: '#94a3b8' }}>
          数列・仲間外れ・類比などの問題をランダムに生成。{TOTAL_QUESTIONS}問解いて高得点を狙おう。
        </p>

        {state.phase !== 'menu' && (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <span style={{ borderRadius: '999px', border: '1px solid #334155', background: '#0f172a', padding: '0.35rem 0.8rem' }}>
              Q {Math.min(state.questionIndex, TOTAL_QUESTIONS)} / {TOTAL_QUESTIONS}
            </span>
            <span style={{ borderRadius: '999px', border: '1px solid #334155', background: '#0f172a', padding: '0.35rem 0.8rem' }}>
              Score: {state.score}
            </span>
            <span style={{ borderRadius: '999px', border: '1px solid #334155', background: '#0f172a', padding: '0.35rem 0.8rem' }}>
              ◯ {correctCount}
            </span>
          </div>
        )}

        <div style={{ border: '1px solid #334155', borderRadius: '16px', background: '#020617', padding: '1.4rem' }}>
          {state.phase === 'menu' && (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🧩</div>
              <div style={{ color: '#cbd5e1', marginBottom: '1.2rem', lineHeight: 1.7 }}>
                毎回ランダムな問題が出題されます。<br />
                数列の続きを当てる、仲間外れを探す、類比を解くなど。<br />
                全 {TOTAL_QUESTIONS} 問で正解1つにつき +10 点。
              </div>
              <button
                onClick={start}
                style={{ background: '#22c55e', color: '#022c1f', border: 'none', borderRadius: '12px', padding: '0.8rem 1.6rem', fontWeight: 800, fontSize: '1.05rem', cursor: 'pointer' }}
              >
                Start
              </button>
            </div>
          )}

          {(state.phase === 'question' || state.phase === 'feedback') && q && (
            <>
              <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '0.3rem' }}>{q.prompt}</div>
              <div
                style={{
                  textAlign: 'center',
                  fontSize: '1.8rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  background: '#0b1224',
                  border: '1px solid #1e293b',
                  borderRadius: '12px',
                  padding: '1.2rem 1rem',
                  margin: '0.6rem 0 1.2rem',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  color: '#f1f5f9',
                }}
              >
                {q.display}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem' }}>
                {q.options.map((opt, i) => {
                  const isAnswer = i === q.answerIndex;
                  const isPicked = i === state.selected;
                  const showFeedback = state.phase === 'feedback';
                  const bg = showFeedback
                    ? isAnswer
                      ? 'linear-gradient(160deg, #16a34a, #22c55e)'
                      : isPicked
                        ? 'linear-gradient(160deg, #b91c1c, #ef4444)'
                        : 'linear-gradient(160deg, #1e293b, #0f172a)'
                    : 'linear-gradient(160deg, #1e3a8a, #3b82f6)';
                  const border = showFeedback && isAnswer ? '2px solid #4ade80' : showFeedback && isPicked ? '2px solid #fca5a5' : '2px solid #334155';
                  return (
                    <button
                      key={`${state.questionIndex}-${i}-${opt}`}
                      onClick={() => state.phase === 'question' && choose(i)}
                      disabled={showFeedback}
                      style={{
                        background: bg,
                        border,
                        borderRadius: '12px',
                        color: '#fff',
                        padding: '1rem 0.8rem',
                        fontSize: '1.25rem',
                        fontWeight: 800,
                        cursor: showFeedback ? 'default' : 'pointer',
                        textAlign: 'center',
                        transition: 'transform 0.12s',
                      }}
                      onMouseEnter={(e) => { if (!showFeedback) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                    >
                      <span style={{ color: '#cbd5e1', fontSize: '0.8rem', marginRight: '0.5rem' }}>{i + 1}.</span>
                      {opt}
                    </button>
                  );
                })}
              </div>

              {state.phase === 'feedback' && (
                <div style={{ marginTop: '1.1rem' }}>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: '1.05rem',
                      color: state.selected === q.answerIndex ? '#4ade80' : '#fca5a5',
                      marginBottom: '0.35rem',
                    }}
                  >
                    {state.selected === q.answerIndex ? '◯ 正解！ +10' : '✗ 不正解'}
                  </div>
                  <div style={{ color: '#cbd5e1', lineHeight: 1.6, fontSize: '0.95rem' }}>{q.explanation}</div>
                  <button
                    onClick={next}
                    style={{
                      marginTop: '0.9rem',
                      background: '#0ea5e9',
                      color: '#022c4a',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '0.62rem 1.1rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {state.questionIndex >= TOTAL_QUESTIONS ? '結果を見る' : '次の問題 →'}
                  </button>
                </div>
              )}

              <div style={{ marginTop: '0.9rem', color: '#64748b', fontSize: '0.8rem', textAlign: 'center' }}>
                {state.phase === 'question' ? 'キー 1〜4 でも選べます' : 'Enter / Space で次へ'}
              </div>
            </>
          )}

          {state.phase === 'gameover' && (
            <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.6rem' }}>
                {correctCount >= 9 ? '🏆' : correctCount >= 7 ? '🥇' : correctCount >= 5 ? '🥈' : '🧠'}
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#facc15' }}>{state.score} / {TOTAL_QUESTIONS * 10}</div>
              <div style={{ color: '#cbd5e1', marginTop: '0.3rem' }}>
                正解 {correctCount} / {TOTAL_QUESTIONS}
              </div>

              <div style={{ marginTop: '1rem', textAlign: 'left', maxHeight: '240px', overflowY: 'auto', border: '1px solid #1e293b', borderRadius: '10px', padding: '0.6rem 0.8rem', background: '#0b1224' }}>
                {state.history.map((h, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline', padding: '0.25rem 0', borderBottom: '1px solid #1e293b' }}>
                    <span style={{ color: h.correct ? '#4ade80' : '#fca5a5', fontWeight: 700, minWidth: '1.4rem' }}>{h.correct ? '◯' : '✗'}</span>
                    <span style={{ color: '#cbd5e1', fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem', flex: 1 }}>
                      {h.question.display.replace('?', h.question.options[h.question.answerIndex])}
                    </span>
                    <span style={{ color: '#64748b', fontSize: '0.78rem' }}>{h.question.type}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={reset}
                style={{
                  marginTop: '1rem',
                  background: '#22c55e',
                  color: '#022c1f',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '0.7rem 1.4rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                もう一度
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default IqTest;
