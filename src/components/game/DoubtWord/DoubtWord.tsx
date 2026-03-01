'use client';

import { useMemo, useState } from 'react';

type Turn = 'ai' | 'player';
type GamePhase = 'menu' | 'aiDecision' | 'playerClaim' | 'roundResult' | 'gameover';
type AIReaction = 'believe' | 'doubt';

interface Claim {
  speaker: Turn;
  actualWord: string;
  claimedFirst: string;
  claimedLength: number;
  isBluff: boolean;
}

interface GameState {
  phase: GamePhase;
  playerLives: number;
  aiLives: number;
  playerScore: number;
  aiScore: number;
  currentClaim: Claim | null;
  playerOptions: string[];
  selectedWord: string;
  playerBluff: boolean;
  nextTurn: Turn;
  roundResult: string;
  aiReaction: AIReaction | null;
}

const WORD_POOL = [
  'galaxy', 'forest', 'signal', 'rocket', 'shadow', 'ember', 'comet', 'mirror', 'rhythm', 'spiral',
  'harbor', 'planet', 'blossom', 'prism', 'binary', 'aurora', 'matrix', 'safari', 'cipher', 'legend',
  'trance', 'breeze', 'neon', 'vertex', 'canvas', 'socket', 'delta', 'fusion', 'tempo', 'summit',
  'magnet', 'jungle', 'stream', 'impact', 'rocket', 'zenith', 'pixel', 'thunder', 'violet', 'whisper',
  'riddle', 'syntax', 'vector', 'mocha', 'horizon', 'tunnel', 'orbit', 'quartz', 'dynamic', 'silver',
];

const randomFrom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const randomWrongLetter = (current: string): string => {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('').filter((char) => char !== current.toLowerCase());
  return randomFrom(alphabet).toUpperCase();
};

const makeClaim = (speaker: Turn, word: string, bluff: boolean): Claim => {
  const first = word[0].toUpperCase();
  const length = word.length;

  if (!bluff) {
    return {
      speaker,
      actualWord: word,
      claimedFirst: first,
      claimedLength: length,
      isBluff: false,
    };
  }

  const distortLength = Math.random() < 0.5;
  const claimedLength = distortLength
    ? Math.max(3, length + (Math.random() < 0.5 ? -1 : 1))
    : length;
  const claimedFirst = distortLength ? first : randomWrongLetter(first);

  return {
    speaker,
    actualWord: word,
    claimedFirst,
    claimedLength,
    isBluff: claimedLength !== length || claimedFirst !== first,
  };
};

const sampleWords = (count: number): string[] => {
  const copied = [...WORD_POOL];
  const picked: string[] = [];
  while (picked.length < count && copied.length > 0) {
    const index = Math.floor(Math.random() * copied.length);
    picked.push(copied[index]);
    copied.splice(index, 1);
  }
  return picked;
};

const createInitialState = (): GameState => ({
  phase: 'menu',
  playerLives: 3,
  aiLives: 3,
  playerScore: 0,
  aiScore: 0,
  currentClaim: null,
  playerOptions: [],
  selectedWord: '',
  playerBluff: false,
  nextTurn: 'ai',
  roundResult: '',
  aiReaction: null,
});

export const DoubtWord = () => {
  const [game, setGame] = useState<GameState>(createInitialState);

  const startGame = () => {
    const word = randomFrom(WORD_POOL);
    const claim = makeClaim('ai', word, Math.random() < 0.38);
    setGame({
      ...createInitialState(),
      phase: 'aiDecision',
      currentClaim: claim,
      nextTurn: 'player',
    });
  };

  const goToGameOverIfNeeded = (state: GameState): GameState => {
    if (state.playerLives <= 0 || state.aiLives <= 0) {
      return {
        ...state,
        phase: 'gameover',
      };
    }
    return state;
  };

  const resolveAIClaim = (judgement: AIReaction) => {
    setGame((prev) => {
      if (!prev.currentClaim || prev.phase !== 'aiDecision') return prev;
      const claim = prev.currentClaim;
      let playerLives = prev.playerLives;
      let aiLives = prev.aiLives;
      let playerScore = prev.playerScore;
      let aiScore = prev.aiScore;
      let result = '';

      if (judgement === 'doubt') {
        if (claim.isBluff) {
          aiLives -= 1;
          playerScore += 1;
          result = `正解。AIのブラフを見破った。実際の単語は "${claim.actualWord}"。`;
        } else {
          playerLives -= 1;
          aiScore += 1;
          result = `失敗。AIは本当を言っていた。実際の単語は "${claim.actualWord}"。`;
        }
      } else {
        if (claim.isBluff) {
          playerLives -= 1;
          aiScore += 1;
          result = `騙された。実際の単語は "${claim.actualWord}"。`;
        } else {
          result = `セーフ。実際の単語は "${claim.actualWord}"。`;
        }
      }

      return goToGameOverIfNeeded({
        ...prev,
        phase: 'roundResult',
        playerLives,
        aiLives,
        playerScore,
        aiScore,
        roundResult: result,
        nextTurn: 'player',
        aiReaction: judgement,
      });
    });
  };

  const sendPlayerClaim = () => {
    setGame((prev) => {
      if (prev.phase !== 'playerClaim' || !prev.selectedWord) {
        return prev;
      }

      const claim = makeClaim('player', prev.selectedWord, prev.playerBluff);
      const doubtProbability = claim.isBluff ? 0.62 : 0.22;
      const aiReaction: AIReaction = Math.random() < doubtProbability ? 'doubt' : 'believe';

      let playerLives = prev.playerLives;
      let aiLives = prev.aiLives;
      let playerScore = prev.playerScore;
      let aiScore = prev.aiScore;
      let result = `あなたの実単語: "${claim.actualWord}"。AI判断: ${aiReaction === 'doubt' ? 'Doubt' : 'Believe'}。`;

      if (aiReaction === 'doubt') {
        if (claim.isBluff) {
          playerLives -= 1;
          aiScore += 1;
          result += ' AIが見破った。';
        } else {
          aiLives -= 1;
          playerScore += 1;
          result += ' AIの誤読。';
        }
      } else if (claim.isBluff) {
        aiLives -= 1;
        playerScore += 1;
        result += ' ブラフ成功。';
      } else {
        result += ' 平和に通過。';
      }

      return goToGameOverIfNeeded({
        ...prev,
        currentClaim: claim,
        roundResult: result,
        aiReaction,
        phase: 'roundResult',
        nextTurn: 'ai',
        playerLives,
        aiLives,
        playerScore,
        aiScore,
      });
    });
  };

  const nextTurn = () => {
    setGame((prev) => {
      if (prev.phase !== 'roundResult') return prev;

      if (prev.nextTurn === 'ai') {
        const word = randomFrom(WORD_POOL);
        return {
          ...prev,
          phase: 'aiDecision',
          currentClaim: makeClaim('ai', word, Math.random() < 0.4),
          aiReaction: null,
        };
      }

      const options = sampleWords(3);
      return {
        ...prev,
        phase: 'playerClaim',
        playerOptions: options,
        selectedWord: options[0],
        playerBluff: false,
        aiReaction: null,
      };
    });
  };

  const winnerText = useMemo(() => {
    if (game.playerLives <= 0 && game.aiLives <= 0) {
      return 'Draw';
    }
    if (game.playerLives <= 0) {
      return 'AI Wins';
    }
    if (game.aiLives <= 0) {
      return 'You Win';
    }
    return game.playerScore >= game.aiScore ? 'You Win' : 'AI Wins';
  }, [game.aiLives, game.aiScore, game.playerLives, game.playerScore]);

  return (
    <div style={{ minHeight: '100vh', padding: '2rem 1rem', background: 'linear-gradient(180deg, #111827, #020617)', color: '#e5e7eb' }}>
      <div style={{ maxWidth: '840px', margin: '0 auto' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800 }}>Doubt Word</h1>
        <p style={{ marginTop: '0.5rem', color: '#94a3b8' }}>「頭文字」と「文字数」の宣言でブラフ合戦。AIとの読み合いで3ライフ先取。</p>

        <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <span style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '999px', padding: '0.35rem 0.8rem' }}>You: {game.playerLives} lives / {game.playerScore} pts</span>
          <span style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '999px', padding: '0.35rem 0.8rem' }}>AI: {game.aiLives} lives / {game.aiScore} pts</span>
        </div>

        {game.phase === 'menu' && (
          <div style={{ border: '1px solid #334155', borderRadius: '12px', padding: '1rem', background: '#020617' }}>
            <p style={{ marginTop: 0, color: '#cbd5e1' }}>AIの宣言を「Believe」か「Doubt」で判定し、自分のターンでは真実かブラフを選んで宣言します。</p>
            <button onClick={startGame} style={{ background: '#22c55e', border: 'none', borderRadius: '10px', padding: '0.65rem 1rem', fontWeight: 700, cursor: 'pointer' }}>Start</button>
          </div>
        )}

        {game.phase === 'aiDecision' && game.currentClaim && (
          <div style={{ border: '1px solid #334155', borderRadius: '12px', padding: '1rem', background: '#020617' }}>
            <h2 style={{ marginTop: 0, marginBottom: '0.7rem' }}>AI Claim</h2>
            <p style={{ color: '#cbd5e1' }}>&quot;I have a word starting with <strong>{game.currentClaim.claimedFirst}</strong> and length <strong>{game.currentClaim.claimedLength}</strong>.&quot;</p>
            <div style={{ display: 'flex', gap: '0.7rem' }}>
              <button onClick={() => resolveAIClaim('believe')} style={{ background: '#14b8a6', color: '#052e2b', border: 'none', borderRadius: '10px', padding: '0.6rem 1rem', fontWeight: 700, cursor: 'pointer' }}>Believe</button>
              <button onClick={() => resolveAIClaim('doubt')} style={{ background: '#f97316', color: '#431407', border: 'none', borderRadius: '10px', padding: '0.6rem 1rem', fontWeight: 700, cursor: 'pointer' }}>Doubt</button>
            </div>
          </div>
        )}

        {game.phase === 'playerClaim' && (
          <div style={{ border: '1px solid #334155', borderRadius: '12px', padding: '1rem', background: '#020617' }}>
            <h2 style={{ marginTop: 0, marginBottom: '0.6rem' }}>Your Turn</h2>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              {game.playerOptions.map((word) => (
                <button
                  key={word}
                  onClick={() => setGame((prev) => ({ ...prev, selectedWord: word }))}
                  style={{
                    border: game.selectedWord === word ? '1px solid #22d3ee' : '1px solid #334155',
                    background: game.selectedWord === word ? 'rgba(34, 211, 238, 0.14)' : '#0f172a',
                    color: '#e2e8f0',
                    borderRadius: '999px',
                    padding: '0.35rem 0.8rem',
                    cursor: 'pointer',
                  }}
                >
                  {word}
                </button>
              ))}
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.8rem', color: '#cbd5e1' }}>
              <input
                type="checkbox"
                checked={game.playerBluff}
                onChange={(event) => setGame((prev) => ({ ...prev, playerBluff: event.target.checked }))}
              />
              Bluff mode
            </label>

            {game.selectedWord && (
              <p style={{ marginTop: '0.7rem', color: '#94a3b8' }}>
                宣言予定: first = <strong>{game.playerBluff ? '?' : game.selectedWord[0].toUpperCase()}</strong>, length = <strong>{game.playerBluff ? '?' : game.selectedWord.length}</strong>
              </p>
            )}

            <button onClick={sendPlayerClaim} style={{ marginTop: '0.8rem', background: '#22c55e', border: 'none', borderRadius: '10px', padding: '0.6rem 1rem', fontWeight: 700, cursor: 'pointer' }}>Send Claim</button>
          </div>
        )}

        {game.phase === 'roundResult' && (
          <div style={{ border: '1px solid #334155', borderRadius: '12px', padding: '1rem', background: '#020617' }}>
            <h2 style={{ marginTop: 0, marginBottom: '0.6rem' }}>Round Result</h2>
            <p style={{ color: '#cbd5e1' }}>{game.roundResult}</p>
            <button onClick={nextTurn} style={{ background: '#38bdf8', border: 'none', borderRadius: '10px', padding: '0.6rem 1rem', fontWeight: 700, color: '#082f49', cursor: 'pointer' }}>Next Turn</button>
          </div>
        )}

        {game.phase === 'gameover' && (
          <div style={{ border: '1px solid #334155', borderRadius: '12px', padding: '1rem', background: '#020617' }}>
            <h2 style={{ marginTop: 0, marginBottom: '0.4rem' }}>{winnerText}</h2>
            <p style={{ color: '#cbd5e1' }}>You {game.playerScore} - {game.aiScore} AI</p>
            <button onClick={startGame} style={{ background: '#22c55e', border: 'none', borderRadius: '10px', padding: '0.6rem 1rem', fontWeight: 700, cursor: 'pointer' }}>Play Again</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DoubtWord;
