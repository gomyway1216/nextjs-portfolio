'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';

type Phase = 'menu' | 'memorize' | 'guess' | 'reveal' | 'gameover';

interface Card {
  value: number;
  revealed: boolean;
  correct?: boolean;
  wrong?: boolean;
}

interface GameState {
  phase: Phase;
  round: number;
  score: number;
  lives: number;
  cards: Card[];
  target: number;
  timerMs: number;
  message: string;
}

const CARD_COUNT = 5;
const MEMORIZE_MS = 3000;
const GUESS_MS = 6000;
const REVEAL_MS = 1200;
const START_LIVES = 3;
const VALUE_POOL = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const sample = <T,>(arr: T[], n: number): T[] => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
};

const createRound = (): { cards: Card[]; target: number } => {
  const values = sample(VALUE_POOL, CARD_COUNT);
  const cards: Card[] = values.map((value) => ({ value, revealed: true }));
  const target = values[Math.floor(Math.random() * values.length)];
  return { cards, target };
};

const createInitialState = (): GameState => ({
  phase: 'menu',
  round: 0,
  score: 0,
  lives: START_LIVES,
  cards: [],
  target: 0,
  timerMs: 0,
  message: 'Press Start to begin',
});

export const MemoryBattle = () => {
  useFeatureLifecycle('game.memory-battle');
  const [game, setGame] = useState<GameState>(createInitialState);
  const phaseRef = useRef<Phase>(game.phase);
  phaseRef.current = game.phase;

  const startMemorize = useCallback(() => {
    const round = createRound();
    setGame((prev) => ({
      phase: 'memorize',
      round: prev.round + 1,
      score: prev.score,
      lives: prev.lives,
      cards: round.cards,
      target: round.target,
      timerMs: MEMORIZE_MS,
      message: '5枚の数字を覚えて！',
    }));
  }, []);

  const start = useCallback(() => {
    setGame({
      phase: 'menu',
      round: 0,
      score: 0,
      lives: START_LIVES,
      cards: [],
      target: 0,
      timerMs: 0,
      message: '',
    });
    requestAnimationFrame(() => startMemorize());
  }, [startMemorize]);

  useEffect(() => {
    if (game.phase !== 'memorize' && game.phase !== 'guess' && game.phase !== 'reveal') return;

    const timer = window.setInterval(() => {
      setGame((prev) => {
        if (prev.phase !== 'memorize' && prev.phase !== 'guess' && prev.phase !== 'reveal') return prev;
        const next = { ...prev, timerMs: Math.max(0, prev.timerMs - 100) };

        if (next.timerMs > 0) return next;

        if (next.phase === 'memorize') {
          return {
            ...next,
            phase: 'guess',
            cards: next.cards.map((c) => ({ ...c, revealed: false })),
            timerMs: GUESS_MS,
            message: `「${next.target}」はどこ？`,
          };
        }

        if (next.phase === 'guess') {
          const lives = next.lives - 1;
          return {
            ...next,
            phase: lives <= 0 ? 'gameover' : 'reveal',
            cards: next.cards.map((c) => ({ ...c, revealed: true, wrong: c.value !== next.target, correct: c.value === next.target })),
            lives,
            timerMs: REVEAL_MS,
            message: lives <= 0 ? 'ゲームオーバー' : '時間切れ…',
          };
        }

        return { ...next, phase: 'menu' };
      });
    }, 100);

    return () => window.clearInterval(timer);
  }, [game.phase]);

  useEffect(() => {
    if (game.phase !== 'reveal') return;
    if (game.timerMs > 0) return;
    const id = window.setTimeout(() => {
      if (phaseRef.current === 'reveal') startMemorize();
    }, 50);
    return () => window.clearTimeout(id);
  }, [game.phase, game.timerMs, startMemorize]);

  const pickCard = (index: number) => {
    setGame((prev) => {
      if (prev.phase !== 'guess') return prev;
      const picked = prev.cards[index];
      const isCorrect = picked.value === prev.target;
      const cards = prev.cards.map((c, i) => {
        if (i === index) return { ...c, revealed: true, correct: isCorrect, wrong: !isCorrect };
        if (isCorrect) return c;
        return c.value === prev.target ? { ...c, revealed: true, correct: true } : c;
      });

      if (isCorrect) {
        const timeBonus = Math.ceil(prev.timerMs / 1000);
        return {
          ...prev,
          phase: 'reveal',
          cards,
          score: prev.score + 10 + timeBonus,
          timerMs: REVEAL_MS,
          message: `正解！ +${10 + timeBonus}点`,
        };
      }

      const lives = prev.lives - 1;
      return {
        ...prev,
        phase: lives <= 0 ? 'gameover' : 'reveal',
        cards: cards.map((c) => (c.value === prev.target ? { ...c, revealed: true, correct: true } : c)),
        lives,
        timerMs: REVEAL_MS,
        message: lives <= 0 ? 'ゲームオーバー' : 'はずれ…',
      };
    });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (game.phase !== 'guess') return;
      const num = Number(event.key);
      if (Number.isInteger(num) && num >= 1 && num <= CARD_COUNT) {
        event.preventDefault();
        pickCard(num - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game.phase]);

  const timerSeconds = useMemo(() => (game.timerMs / 1000).toFixed(1), [game.timerMs]);
  const timerColor = game.phase === 'memorize' ? '#fbbf24' : game.timerMs < 2000 ? '#f87171' : '#67e8f9';

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #020617, #111827)', color: '#e2e8f0', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800 }}>Memory Battle</h1>
        <p style={{ marginTop: '0.5rem', color: '#94a3b8' }}>
          5枚のカードを3秒だけ見せて裏返します。指定された数字の位置を当てよう。
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <span style={{ borderRadius: '999px', border: '1px solid #334155', background: '#0f172a', padding: '0.35rem 0.8rem' }}>
            Score: {game.score}
          </span>
          <span style={{ borderRadius: '999px', border: '1px solid #334155', background: '#0f172a', padding: '0.35rem 0.8rem' }}>
            Round: {game.round}
          </span>
          <span style={{ borderRadius: '999px', border: '1px solid #334155', background: '#0f172a', padding: '0.35rem 0.8rem' }}>
            Lives: {'♥'.repeat(Math.max(0, game.lives))}
            <span style={{ color: '#475569' }}>{'♡'.repeat(Math.max(0, START_LIVES - game.lives))}</span>
          </span>
        </div>

        <div style={{ border: '1px solid #334155', borderRadius: '16px', background: '#020617', padding: '1.4rem', textAlign: 'center' }}>
          {game.phase === 'menu' && (
            <div style={{ padding: '2rem 0' }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🧠</div>
              <div style={{ color: '#cbd5e1', marginBottom: '1.2rem', lineHeight: 1.6 }}>
                5枚のカード(1〜9のうち5枚)が3秒だけ表示されます。<br />
                裏返ったあと、指定された数字のカードを当ててください。<br />
                速く当てるほど高得点。ミス3回でゲームオーバー。
              </div>
              <button
                onClick={start}
                style={{ background: '#22c55e', color: '#022c1f', border: 'none', borderRadius: '12px', padding: '0.8rem 1.6rem', fontWeight: 800, fontSize: '1.05rem', cursor: 'pointer' }}
              >
                Start
              </button>
            </div>
          )}

          {game.phase !== 'menu' && (
            <>
              <div style={{ fontSize: '2.4rem', fontWeight: 800, color: timerColor, lineHeight: 1.1 }}>{timerSeconds}s</div>
              <div style={{ marginTop: '0.4rem', minHeight: '1.5rem', color: '#cbd5e1' }}>
                {game.phase === 'guess' ? (
                  <span>
                    「<span style={{ color: '#fde047', fontWeight: 800, fontSize: '1.3em' }}>{game.target}</span>」はどこ？
                  </span>
                ) : (
                  game.message
                )}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${CARD_COUNT}, 1fr)`,
                  gap: '0.6rem',
                  marginTop: '1.2rem',
                }}
              >
                {game.cards.map((card, index) => {
                  const clickable = game.phase === 'guess';
                  const bg = card.revealed
                    ? card.correct
                      ? 'linear-gradient(160deg, #16a34a, #22c55e)'
                      : card.wrong
                        ? 'linear-gradient(160deg, #b91c1c, #ef4444)'
                        : 'linear-gradient(160deg, #1e3a8a, #3b82f6)'
                    : 'linear-gradient(160deg, #475569, #1e293b)';
                  const textColor = card.revealed ? '#fff' : 'transparent';
                  return (
                    <button
                      key={index}
                      onClick={() => clickable && pickCard(index)}
                      disabled={!clickable}
                      style={{
                        aspectRatio: '2 / 3',
                        background: bg,
                        border: card.revealed ? '2px solid rgba(255,255,255,0.25)' : '2px solid #334155',
                        borderRadius: '12px',
                        color: textColor,
                        fontSize: '2.2rem',
                        fontWeight: 800,
                        cursor: clickable ? 'pointer' : 'default',
                        transition: 'transform 0.15s, box-shadow 0.15s',
                        boxShadow: card.correct ? '0 0 0 3px rgba(34,197,94,0.45)' : card.wrong ? '0 0 0 3px rgba(239,68,68,0.45)' : 'none',
                      }}
                      onMouseEnter={(e) => { if (clickable) e.currentTarget.style.transform = 'translateY(-3px)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                      aria-label={`Card ${index + 1}`}
                    >
                      {card.revealed ? card.value : '?'}
                    </button>
                  );
                })}
              </div>

              <div style={{ marginTop: '0.8rem', color: '#64748b', fontSize: '0.85rem' }}>
                キーボードの 1〜5 でも選べます
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {game.phase !== 'menu' && (
            <button
              onClick={start}
              style={{ background: '#0ea5e9', color: '#022c4a', border: 'none', borderRadius: '10px', padding: '0.62rem 1rem', fontWeight: 700, cursor: 'pointer' }}
            >
              {game.phase === 'gameover' ? 'Play Again' : 'Restart'}
            </button>
          )}
          {game.phase === 'gameover' && (
            <div style={{ color: '#facc15', fontWeight: 700 }}>
              Final Score: {game.score} (Round {game.round})
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MemoryBattle;
