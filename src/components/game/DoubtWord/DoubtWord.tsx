'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Brain, Check, Eye, Heart, Play, RotateCcw, Sparkles, X } from 'lucide-react';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import {
  DifficultySelector,
  GameStats,
  GameTopBar,
  InfoModal,
  getDifficultyColor,
  type Difficulty,
  type DifficultyOption,
} from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import {
  aiMakeClaim,
  aiReactToClaim,
  decideWinner,
  DIFFICULTY_LIVES,
  makeClaim,
  randomFrom,
  resolveRound,
  sampleWords,
  WORD_POOL,
  type Claim,
  type Reaction,
  type RoundDelta,
} from './engine';
import { getStrings } from './i18n';
import styles from './DoubtWord.module.css';

type Phase = 'aiDecision' | 'playerClaim' | 'roundResult' | 'gameover';

interface GameState {
  phase: Phase;
  playerLives: number;
  aiLives: number;
  playerScore: number;
  aiScore: number;
  currentClaim: Claim | null;
  playerOptions: string[];
  selectedWord: string;
  playerBluff: boolean;
  /** Whose claim just resolved (for the result screen). */
  lastReaction: Reaction | null;
  lastDelta: RoundDelta | null;
  /** Whose turn to make the NEXT claim. */
  nextClaimant: 'ai' | 'player';
}

const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'medium', 'hard', 'expert', 'master'];

export const DoubtWord = () => {
  useFeatureLifecycle('game.doubt-word');
  const { language } = useGameLanguage();
  const t = useMemo(() => getStrings(language), [language]);

  const [started, setStarted] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [showInfo, setShowInfo] = useState(false);
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });
  const [game, setGame] = useState<GameState | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const statsRecorded = useRef(false);
  const thinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reveal the AI's claim after a short "thinking" beat, for feel.
  const scheduleReveal = useCallback(() => {
    if (thinkTimer.current) clearTimeout(thinkTimer.current);
    setAiThinking(true);
    thinkTimer.current = setTimeout(() => setAiThinking(false), 550);
  }, []);

  useEffect(() => () => {
    if (thinkTimer.current) clearTimeout(thinkTimer.current);
  }, []);

  const difficultyOptions: DifficultyOption[] = useMemo(
    () =>
      DIFFICULTY_ORDER.map((value) => ({
        value,
        label: t.difficultyOptions[value].label,
        description: t.difficultyOptions[value].description,
      })),
    [t],
  );

  const beginMatch = useCallback(() => {
    const lives = DIFFICULTY_LIVES[difficulty];
    const word = randomFrom(WORD_POOL);
    const claim = aiMakeClaim(word, difficulty);
    statsRecorded.current = false;
    setGame({
      phase: 'aiDecision',
      playerLives: lives,
      aiLives: lives,
      playerScore: 0,
      aiScore: 0,
      currentClaim: claim,
      playerOptions: [],
      selectedWord: '',
      playerBluff: false,
      lastReaction: null,
      lastDelta: null,
      nextClaimant: 'player',
    });
    setStarted(true);
    scheduleReveal();
  }, [difficulty, scheduleReveal]);

  const applyDelta = useCallback(
    (state: GameState, claim: Claim, reaction: Reaction, nextClaimant: 'ai' | 'player'): GameState => {
      const delta = resolveRound(claim, reaction);
      const playerLives = state.playerLives + delta.playerLivesDelta;
      const aiLives = state.aiLives + delta.aiLivesDelta;
      const winner = decideWinner(playerLives, aiLives);
      return {
        ...state,
        currentClaim: claim,
        playerLives,
        aiLives,
        playerScore: state.playerScore + delta.playerScoreDelta,
        aiScore: state.aiScore + delta.aiScoreDelta,
        lastReaction: reaction,
        lastDelta: delta,
        nextClaimant,
        phase: winner ? 'gameover' : 'roundResult',
      };
    },
    [],
  );

  // Player reacts to the AI's claim.
  const reactToAiClaim = useCallback(
    (reaction: Reaction) => {
      setGame((prev) => {
        if (!prev || prev.phase !== 'aiDecision' || !prev.currentClaim) return prev;
        return applyDelta(prev, prev.currentClaim, reaction, 'player');
      });
    },
    [applyDelta],
  );

  // Player declares their own claim; the AI reacts.
  const sendPlayerClaim = useCallback(() => {
    setGame((prev) => {
      if (!prev || prev.phase !== 'playerClaim' || !prev.selectedWord) return prev;
      const claim = makeClaim('player', prev.selectedWord, prev.playerBluff);
      const reaction = aiReactToClaim(
        { claimedFirst: claim.claimedFirst, claimedLength: claim.claimedLength },
        difficulty,
      );
      return applyDelta(prev, claim, reaction, 'ai');
    });
  }, [applyDelta, difficulty]);

  const advance = useCallback(() => {
    setGame((prev) => {
      if (!prev || prev.phase !== 'roundResult') return prev;
      if (prev.nextClaimant === 'ai') {
        const word = randomFrom(WORD_POOL);
        scheduleReveal();
        return {
          ...prev,
          phase: 'aiDecision',
          currentClaim: aiMakeClaim(word, difficulty),
          lastReaction: null,
          lastDelta: null,
        };
      }
      const options = sampleWords(3);
      return {
        ...prev,
        phase: 'playerClaim',
        playerOptions: options,
        selectedWord: options[0],
        playerBluff: false,
        lastReaction: null,
        lastDelta: null,
      };
    });
  }, [difficulty, scheduleReveal]);

  // Record win/loss/draw once when the match ends.
  useEffect(() => {
    if (game?.phase !== 'gameover' || statsRecorded.current) return;
    statsRecorded.current = true;
    const winner = decideWinner(game.playerLives, game.aiLives);
    setStats((prev) => ({
      wins: prev.wins + (winner === 'player' ? 1 : 0),
      losses: prev.losses + (winner === 'ai' ? 1 : 0),
      draws: prev.draws + (winner === 'draw' ? 1 : 0),
    }));
  }, [game?.phase, game?.playerLives, game?.aiLives]);

  const infoModal = (
    <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} title={t.howToPlayTitle}>
      <ol className={styles.howList}>
        {t.howToPlay.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
    </InfoModal>
  );

  // --- Setup screen --------------------------------------------------------
  if (!started || !game) {
    const colors = getDifficultyColor(difficulty);
    return (
      <div className={styles.page}>
        <GameTopBar stats={stats} onInfoClick={() => setShowInfo(true)} />
        <div className={styles.shell}>
          <DifficultySelector
            title={t.title}
            subtitle={t.subtitle}
            icon={<Sparkles size={28} />}
            selectedDifficulty={difficulty}
            onSelectDifficulty={setDifficulty}
            options={difficultyOptions}
            onStart={beginMatch}
            difficultyTitle={t.difficultyTitle}
            startLabel={t.startLabel}
            summaryContent={
              <span
                className={styles.difficultyBadge}
                style={
                  {
                    '--difficulty-bg': colors.bg,
                    '--difficulty-border': colors.border,
                    '--difficulty-text': colors.text,
                  } as React.CSSProperties
                }
              >
                <Heart size={13} /> {DIFFICULTY_LIVES[difficulty]} {t.livesLabel}
              </span>
            }
          />
        </div>
        {infoModal}
      </div>
    );
  }

  const playerActive = game.phase === 'playerClaim';
  const aiActive = game.phase === 'aiDecision';

  return (
    <div className={styles.page}>
      <GameTopBar stats={stats} onInfoClick={() => setShowInfo(true)} />
      <div className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.title}>{t.title}</h1>
          <p className={styles.subtitle}>{t.subtitle}</p>
        </header>

        <Scoreboard t={t} game={game} playerActive={playerActive} aiActive={aiActive} />

        {game.phase === 'aiDecision' && game.currentClaim && (
          <section className={styles.card} aria-live="polite">
            <p className={styles.cardEyebrow}>{t.claimantAi}</p>
            <h2 className={styles.cardTitle}>{t.aiClaimTitle}</h2>
            <ClaimBubble
              first={game.currentClaim.claimedFirst}
              length={game.currentClaim.claimedLength}
              sentence={t.claimSentence(game.currentClaim.claimedFirst, game.currentClaim.claimedLength)}
              t={t}
              hidden={aiThinking}
            />
            <div className={styles.actionRow}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnBelieve}`}
                onClick={() => reactToAiClaim('believe')}
                disabled={aiThinking}
              >
                <Check size={18} /> {t.believe}
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnDoubt}`}
                onClick={() => reactToAiClaim('doubt')}
                disabled={aiThinking}
              >
                <Eye size={18} /> {t.doubt}
              </button>
            </div>
          </section>
        )}

        {game.phase === 'playerClaim' && (
          <section className={styles.card}>
            <p className={styles.cardEyebrow}>{t.claimantYou}</p>
            <h2 className={styles.cardTitle}>{t.yourTurnTitle}</h2>
            <p className={styles.hint}>{t.yourTurnHint}</p>

            <div className={styles.cardEyebrow} aria-hidden="true">{t.pickWord}</div>
            <div className={styles.wordGrid} role="radiogroup" aria-label={t.pickWord}>
              {game.playerOptions.map((word) => {
                const selected = game.selectedWord === word;
                return (
                  <button
                    key={word}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`${styles.wordChip} ${selected ? styles.wordChipSelected : ''}`}
                    onClick={() => setGame((prev) => (prev ? { ...prev, selectedWord: word } : prev))}
                  >
                    {word}
                  </button>
                );
              })}
            </div>

            <label className={styles.bluffToggle}>
              <input
                type="checkbox"
                className={styles.bluffCheckbox}
                checked={game.playerBluff}
                onChange={(e) =>
                  setGame((prev) => (prev ? { ...prev, playerBluff: e.target.checked } : prev))
                }
              />
              <span className={styles.bluffLabelText}>
                <span className={styles.bluffTitle}>{t.bluffMode}</span>
                <span className={styles.bluffSub}>{t.bluffHint}</span>
              </span>
            </label>

            {game.selectedWord && (
              <div className={`${styles.preview} ${game.playerBluff ? styles.previewBluff : ''}`}>
                <span>{t.willAnnounce}:</span>
                <span>
                  {t.first} ={' '}
                  <span className={styles.previewValue}>
                    {game.playerBluff ? t.hidden : game.selectedWord[0].toUpperCase()}
                  </span>
                </span>
                <span>
                  {t.length} ={' '}
                  <span className={styles.previewValue}>
                    {game.playerBluff ? t.hidden : game.selectedWord.length}
                  </span>
                </span>
              </div>
            )}

            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBlock}`}
              onClick={sendPlayerClaim}
              disabled={!game.selectedWord}
            >
              <Play size={18} /> {t.sendClaim}
            </button>
          </section>
        )}

        {game.phase === 'roundResult' && game.currentClaim && game.lastDelta && (
          <RoundResult t={t} game={game} onNext={advance} />
        )}

        {game.phase === 'gameover' && (
          <GameOver
            t={t}
            playerLives={game.playerLives}
            aiLives={game.aiLives}
            playerScore={game.playerScore}
            aiScore={game.aiScore}
            onRestart={beginMatch}
          />
        )}
      </div>
      {infoModal}
    </div>
  );
};

// --- Sub-components ---------------------------------------------------------

const Hearts = ({ lives, max }: { lives: number; max: number }) => (
  <div className={styles.hearts} aria-label={`${Math.max(0, lives)} / ${max}`}>
    {Array.from({ length: max }, (_, i) => (
      <Heart
        key={i}
        className={`${styles.heart} ${i < lives ? styles.heartFull : styles.heartEmpty}`}
      />
    ))}
  </div>
);

const Scoreboard = ({
  t,
  game,
  playerActive,
  aiActive,
}: {
  t: ReturnType<typeof getStrings>;
  game: GameState;
  playerActive: boolean;
  aiActive: boolean;
}) => {
  const maxLives = Math.max(game.playerLives, game.aiLives, DIFFICULTY_LIVES.easy);
  return (
    <div className={styles.scoreboard}>
      <div className={`${styles.scoreCard} ${playerActive ? styles.scoreCardActive : ''}`}>
        <div className={styles.scoreCardHead}>
          <span className={styles.scoreName}>{t.you}</span>
          <span className={styles.scoreValue}>
            {t.scoreLabel}: {game.playerScore}
          </span>
        </div>
        <Hearts lives={game.playerLives} max={maxLives} />
      </div>
      <div className={`${styles.scoreCard} ${aiActive ? styles.scoreCardActive : ''}`}>
        <div className={styles.scoreCardHead}>
          <span className={styles.scoreName}>{t.ai}</span>
          <span className={styles.scoreValue}>
            {t.scoreLabel}: {game.aiScore}
          </span>
        </div>
        <Hearts lives={game.aiLives} max={maxLives} />
      </div>
    </div>
  );
};

const ClaimBubble = ({
  first,
  length,
  sentence,
  t,
  hidden,
}: {
  first: string;
  length: number;
  sentence: string;
  t: ReturnType<typeof getStrings>;
  hidden?: boolean;
}) => (
  <div className={styles.claimBubble}>
    <div className={styles.claimChips}>
      <div className={styles.claimChip}>
        <span className={styles.claimChipLabel}>{t.first}</span>
        <span className={styles.claimChipValue}>{hidden ? '·' : first}</span>
      </div>
      <div className={styles.claimChip}>
        <span className={styles.claimChipLabel}>{t.length}</span>
        <span className={styles.claimChipValue}>{hidden ? '·' : length}</span>
      </div>
    </div>
    <p className={styles.claimSentence}>{hidden ? t.aiThinking : sentence}</p>
  </div>
);

const RoundResult = ({
  t,
  game,
  onNext,
}: {
  t: ReturnType<typeof getStrings>;
  game: GameState;
  onNext: () => void;
}) => {
  const delta = game.lastDelta!;
  const claim = game.currentClaim!;
  const tone =
    delta.outcome === 'doubtCorrect'
      ? styles.outcomeGood
      : delta.outcome === 'safePass'
        ? styles.outcomeNeutral
        : styles.outcomeBad;
  const goodForPlayer = delta.playerScoreDelta > 0;
  return (
    <section className={styles.card} aria-live="polite">
      <p className={styles.cardEyebrow}>{claim.speaker === 'ai' ? t.claimantAi : t.claimantYou}</p>
      <h2 className={styles.cardTitle}>{t.roundResultTitle}</h2>
      <span className={`${styles.outcomeBadge} ${tone}`}>
        {delta.outcome === 'doubtCorrect' || goodForPlayer ? <Check size={15} /> : delta.outcome === 'safePass' ? <Sparkles size={15} /> : <X size={15} />}
        {t.outcomes[delta.outcome]}
      </span>
      <div className={styles.resultReveal}>
        <span className={styles.revealWord}>{claim.actualWord}</span>
        {game.lastReaction && (
          <span className={styles.scoreValue}>
            {claim.speaker === 'player'
              ? t.aiReacted(game.lastReaction)
              : t.youReacted(game.lastReaction)}
          </span>
        )}
      </div>
      <p className={styles.resultLine}>{t.realWordWas(claim.actualWord)}</p>
      <button type="button" className={`${styles.btn} ${styles.btnNeutral} ${styles.btnBlock}`} onClick={onNext}>
        {t.nextTurn}
      </button>
    </section>
  );
};

const GameOver = ({
  t,
  playerLives,
  aiLives,
  playerScore,
  aiScore,
  onRestart,
}: {
  t: ReturnType<typeof getStrings>;
  playerLives: number;
  aiLives: number;
  playerScore: number;
  aiScore: number;
  onRestart: () => void;
}) => {
  const winner = decideWinner(playerLives, aiLives);
  const title = winner === 'player' ? t.youWin : winner === 'ai' ? t.aiWins : t.draw;
  return (
    <section className={`${styles.card} ${styles.gameOver}`}>
      {winner === 'player' ? <Sparkles size={34} color="#22c55e" /> : <Brain size={34} color="#94a3b8" />}
      <h2 className={styles.gameOverTitle}>{title}</h2>
      <p className={styles.gameOverScore}>{t.finalScore(playerScore, aiScore)}</p>
      <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onRestart}>
        <RotateCcw size={18} /> {t.playAgain}
      </button>
    </section>
  );
};

export default DoubtWord;
