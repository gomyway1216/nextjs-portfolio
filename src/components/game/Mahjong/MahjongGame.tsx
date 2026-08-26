/**
 * Riichi Mahjong — playable table (M6).
 *
 * Owns presentation and orchestration only. Every rule decision is delegated:
 * `legalActions` says what the human may do, `applyAction` performs it, and
 * `currentActors` says whose answer the engine is waiting for. Nothing in this
 * file reasons about mahjong.
 *
 * ## The AI seam
 *
 * The three opponent seats act through an injected {@link AiDriver}. M5 owns
 * `ai/heuristicAI.ts` and `mahjongAiWorkerClient.ts`; until that lands this
 * component ships {@link fallbackAiDriver}, a deliberately trivial driver that
 * plays the first legal discard (or passes). Wiring the real AI in is a single
 * line at the call site — pass `createAiDriver` — with no change to anything
 * below.
 *
 * ## Staleness
 *
 * An AI answer arrives asynchronously, so by the time it comes back the round
 * may have moved on (another seat claimed the discard, the hand ended, the
 * player started a new game). Every scheduled turn carries the round id it was
 * scheduled for, and a late answer is dropped unless that id still matches
 * *and* the action is still legal in the live round.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';

import {
  DifficultySelector,
  GameTopBar,
  InfoModal,
  type Difficulty,
  type DifficultyOption,
  type GameStats,
} from '../common';
import startShellStyles from '../common/GameStartShell.module.css';
import { useGameLanguage } from '../contexts/GameLanguageContext';

import { isLegalAction, legalActions } from './engine/actions';
import {
  advanceHand,
  applyAction,
  cloneRoundState,
  currentActors,
  startGame as startEngineGame,
} from './engine/gameState';
import { createRng, type Rng } from './engine/random';
import { DEFAULT_RULES } from './engine/rules';
import { tileToString } from './engine/tiles';
import type {
  Action,
  DiscardAction,
  DrawReason,
  GameState,
  RoundState,
  Seat,
  TileId,
} from './engine/types';
import { getMahjongCopy, MAHJONG_DIFFICULTIES, type MahjongDifficulty } from './i18n';
import { CallPrompt } from './CallPrompt';
import { HandView } from './HandView';
import styles from './MahjongGame.module.css';
import { ResultModal, seatLabel } from './ResultModal';
import { TableView } from './TableView';

// ---------------------------------------------------------------------------
// AI seam
// ---------------------------------------------------------------------------

/**
 * How an opponent seat decides. The state handed in is a private copy, so a
 * driver may read it freely; it must return an action that was legal for
 * `seat` at that moment.
 */
export type AiDriver = (state: RoundState, seat: Seat) => Action | Promise<Action>;

/** Builds the driver for one game. M5 replaces the default at the call site. */
export type AiDriverFactory = (difficulty: MahjongDifficulty) => AiDriver;

/**
 * Placeholder opponent: the first legal non-riichi discard, else pass.
 *
 * It never wins and never calls, which is exactly what a placeholder should
 * do — the point is that the table is playable and testable before M5 lands,
 * not that it plays well.
 */
export function fallbackAiDriver(state: RoundState, seat: Seat): Action {
  const legal = legalActions(state, seat);
  const discard = legal.find(
    (action): action is DiscardAction =>
      action.type === 'discard' && action.riichi !== true,
  );
  if (discard !== undefined) return discard;
  const pass = legal.find((action) => action.type === 'pass');
  if (pass !== undefined) return pass;
  if (legal.length === 0) {
    throw new Error(`Seat ${seat} has no legal action in phase ${state.phase}`);
  }
  return legal[0];
}

const defaultDriverFactory: AiDriverFactory = () => fallbackAiDriver;

// ---------------------------------------------------------------------------
// Constants and small helpers
// ---------------------------------------------------------------------------

/** The human always sits at seat 0 (and therefore deals East 1). */
export const HERO_SEAT: Seat = 0;

/** Pause before an AI seat's action lands, so the table is watchable. */
export const AI_DELAY_MS = 320;

/** Log entries kept on screen. */
const LOG_LIMIT = 6;

/**
 * Identity of "seat X's decision, right now".
 *
 * Used to make sure a re-render never asks the same seat the same question
 * twice. `pendingResponses` is deliberately *not* part of the key: another
 * seat answering must not re-schedule the seats still thinking.
 */
export function decisionKey(state: RoundState, roundId: number, seat: Seat): string {
  return [
    roundId,
    seat,
    state.phase,
    state.turnCount,
    state.kanCount,
    state.pendingDiscard?.tile ?? -1,
  ].join(':');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// ---------------------------------------------------------------------------
// Event log
// ---------------------------------------------------------------------------

/**
 * Structured so the visible text can be re-rendered in the other language
 * without replaying the hand. Draws are deliberately not logged: they happen
 * every single turn and say nothing.
 */
export type LogEntry =
  | { kind: 'discard'; seat: Seat; tile: TileId; riichi: boolean }
  | { kind: 'call'; seat: Seat; call: 'chi' | 'pon' | 'minkan'; from: Seat }
  | { kind: 'kan'; seat: Seat; call: 'ankan' | 'kakan' }
  | { kind: 'win'; seat: Seat; how: 'ron' | 'tsumo' }
  | { kind: 'draw'; reason: DrawReason };

/** Calls and kans, as the log names them. */
export type LoggedCall = 'chi' | 'pon' | 'minkan' | 'ankan' | 'kakan';

/**
 * Log lines one action produces.
 *
 * Both sides of the transition are needed: the discarder a call took its tile
 * from only exists in `before` (resolving the claim clears the response
 * window), while the result of the hand only exists in `after`.
 */
export function logEntriesFor(
  action: Action,
  before: RoundState,
  after: RoundState,
): LogEntry[] {
  const entries: LogEntry[] = [];
  switch (action.type) {
    case 'discard':
      entries.push({
        kind: 'discard',
        seat: action.seat,
        tile: action.tile,
        riichi: action.riichi === true,
      });
      break;
    case 'chi':
    case 'pon':
    case 'minkan':
      entries.push({
        kind: 'call',
        seat: action.seat,
        call: action.type,
        from: before.pendingDiscard?.seat ?? action.seat,
      });
      break;
    case 'ankan':
    case 'kakan':
      entries.push({ kind: 'kan', seat: action.seat, call: action.type });
      break;
    default:
      break;
  }

  const result = after.result;
  if (result !== null) {
    for (const win of result.agari) {
      entries.push({ kind: 'win', seat: win.winner, how: win.type });
    }
    if (result.draw !== null) {
      entries.push({ kind: 'draw', reason: result.draw.reason });
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface MahjongGameProps {
  /**
   * Supplies the opponent driver for a game. Defaults to
   * {@link fallbackAiDriver}; M5 passes its worker-backed factory here.
   */
  createAiDriver?: AiDriverFactory;
  /** Override the AI pause, mostly so tests do not have to wait. */
  aiDelayMs?: number;
}

type Screen = 'setup' | 'playing';

export function MahjongGame({
  createAiDriver = defaultDriverFactory,
  aiDelayMs = AI_DELAY_MS,
}: MahjongGameProps = {}): JSX.Element {
  useFeatureLifecycle('game.mahjong');
  const { language } = useGameLanguage();
  const copy = useMemo(() => getMahjongCopy(language), [language]);

  const [screen, setScreen] = useState<Screen>('setup');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [game, setGame] = useState<GameState | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [riichiArmed, setRiichiArmed] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [roundId, setRoundId] = useState(0);
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });

  const gameRef = useRef<GameState | null>(null);
  const rngRef = useRef<Rng | null>(null);
  const driverRef = useRef<AiDriver>(fallbackAiDriver);
  /** Bumped whenever a hand is dealt; late AI answers from older ids are dropped. */
  const roundIdRef = useRef(0);
  const scheduledRef = useRef<Set<string>>(new Set());

  const publish = useCallback((next: GameState | null) => {
    gameRef.current = next;
    setGame(next);
  }, []);

  /**
   * Open a new hand: bump the id every in-flight AI answer is checked against,
   * forget which decisions have been scheduled, and mirror the id into state
   * so render can key on it without reading the ref.
   */
  const openRound = useCallback(() => {
    roundIdRef.current += 1;
    scheduledRef.current.clear();
    setRoundId(roundIdRef.current);
    setLog([]);
    setRiichiArmed(false);
  }, []);

  // ---- applying actions -------------------------------------------------

  const commit = useCallback(
    (action: Action) => {
      const current = gameRef.current;
      if (current === null || current.round === null) return;
      const next = cloneRoundState(current.round);
      try {
        applyAction(next, action);
      } catch (error) {
        // An action can only be refused if it went stale between the click and
        // the dispatch; dropping it leaves the round exactly as it was.
        console.error('[mahjong] refused action', action, error);
        return;
      }
      const entries = logEntriesFor(action, current.round, next);
      if (entries.length > 0) {
        setLog((previous) => [...previous, ...entries].slice(-LOG_LIMIT));
      }
      setRiichiArmed(false);
      publish({ ...current, round: next });
    },
    [publish],
  );

  // ---- AI seats ---------------------------------------------------------

  const runAiSeat = useCallback(
    async (round: RoundState, seat: Seat, roundId: number): Promise<void> => {
      let action: Action;
      try {
        const [decided] = await Promise.all([
          Promise.resolve(driverRef.current(cloneRoundState(round), seat)),
          sleep(aiDelayMs),
        ]);
        action = decided;
      } catch (error) {
        console.error('[mahjong] AI driver failed, falling back', error);
        action = fallbackAiDriver(round, seat);
      }

      // Staleness guards: the hand may have been replaced while we waited, and
      // even inside the same hand another seat's claim may have moved the
      // position past the point this answer was computed for.
      if (roundIdRef.current !== roundId) return;
      const live = gameRef.current?.round ?? null;
      if (live === null || live.phase === 'ended') return;
      if (!isLegalAction(live, action)) return;
      commit(action);
    },
    [aiDelayMs, commit],
  );

  useEffect(() => {
    if (game === null || game.round === null) return;
    const round = game.round;
    if (round.phase === 'ended') return;

    const actors = currentActors(round).filter((seat) => seat !== HERO_SEAT);
    const roundId = roundIdRef.current;
    for (const seat of actors) {
      const key = decisionKey(round, roundId, seat);
      if (scheduledRef.current.has(key)) continue;
      scheduledRef.current.add(key);
      void runAiSeat(round, seat, roundId);
    }
  }, [game, runAiSeat]);

  // ---- game lifecycle ---------------------------------------------------

  const beginGame = useCallback(() => {
    const chosen = (MAHJONG_DIFFICULTIES as readonly Difficulty[]).includes(difficulty)
      ? (difficulty as MahjongDifficulty)
      : 'medium';
    driverRef.current = createAiDriver(chosen);
    const rng = createRng(`mahjong-${Date.now()}-${Math.random()}`);
    rngRef.current = rng;
    openRound();
    publish(startEngineGame({ rules: DEFAULT_RULES, rng }));
    setScreen('playing');
  }, [createAiDriver, difficulty, openRound, publish]);

  const nextHand = useCallback(() => {
    const current = gameRef.current;
    const rng = rngRef.current;
    if (current === null || current.round === null || rng === null) return;
    // `advanceHand` mutates, so it gets a shallow draft rather than the object
    // React is currently rendering.
    const draft: GameState = { ...current };
    advanceHand(draft, rng);
    openRound();
    publish(draft);
    if (draft.finished) {
      const won = (draft.placements ?? [])[0] === HERO_SEAT;
      setStats((previous) => ({
        ...previous,
        wins: previous.wins + (won ? 1 : 0),
        losses: previous.losses + (won ? 0 : 1),
      }));
    }
  }, [openRound, publish]);

  const playAgain = useCallback(() => {
    beginGame();
  }, [beginGame]);

  // ---- derived ----------------------------------------------------------

  const round = game?.round ?? null;
  const heroActions = useMemo(
    () => (round === null || round.phase === 'ended' ? [] : legalActions(round, HERO_SEAT)),
    [round],
  );
  const actors = useMemo(
    () => (round === null || round.phase === 'ended' ? [] : currentActors(round)),
    [round],
  );
  const claims = heroActions.filter((action) => action.type !== 'discard');
  const hasRealClaim = claims.some((action) => action.type !== 'pass');
  const heroToDiscard =
    round !== null && round.phase === 'discard' && round.turn === HERO_SEAT;

  const statusText = (() => {
    if (round === null) return '';
    if (round.phase === 'ended') return '';
    if (heroToDiscard || hasRealClaim) return copy.yourTurn;
    const waiting = actors.find((seat) => seat !== HERO_SEAT);
    if (waiting === undefined) return copy.waitingForOthers;
    return copy.thinking(seatLabel(round, waiting, HERO_SEAT, copy));
  })();

  const logLines = useMemo(() => {
    if (round === null) return [];
    const name = (seat: Seat) => seatLabel(round, seat, HERO_SEAT, copy);
    const callName = (call: LoggedCall): string => {
      switch (call) {
        case 'chi':
          return copy.actionChi;
        case 'pon':
          return copy.actionPon;
        case 'minkan':
          return copy.actionKan;
        case 'ankan':
          return copy.actionAnkan;
        default:
          return copy.actionKakan;
      }
    };
    return log.map((entry): string => {
      switch (entry.kind) {
        case 'discard':
          return entry.riichi
            ? copy.logRiichi(name(entry.seat), tileToString(entry.tile))
            : copy.logDiscard(name(entry.seat), tileToString(entry.tile));
        case 'call':
          return copy.logCall(name(entry.seat), callName(entry.call), name(entry.from));
        case 'kan':
          return copy.logKan(name(entry.seat), callName(entry.call));
        case 'win':
          return copy.logWin(
            name(entry.seat),
            entry.how === 'tsumo' ? copy.actionTsumo : copy.actionRon,
          );
        default:
          return copy.logDraw(copy.drawReason[entry.reason]);
      }
    });
  }, [copy, log, round]);

  const difficultyOptions: DifficultyOption[] = useMemo(
    () =>
      MAHJONG_DIFFICULTIES.map((value) => ({
        value,
        label: copy.difficulties[value].label,
        description: copy.difficulties[value].description,
      })),
    [copy],
  );

  const openInfo = useCallback(() => setShowInfo(true), []);
  const closeInfo = useCallback(() => setShowInfo(false), []);

  // ---- setup screen -----------------------------------------------------

  if (screen === 'setup' || game === null) {
    return (
      <div className={startShellStyles.shell}>
        <DifficultySelector
          title={copy.title}
          subtitle={copy.subtitle}
          icon="🀄"
          selectedDifficulty={difficulty}
          onSelectDifficulty={setDifficulty}
          options={difficultyOptions}
          difficultyTitle={copy.chooseStrength}
          startLabel={copy.start}
          kickerLabel={copy.gameSetup}
          onStart={beginGame}
          summaryContent={<p className={styles.rulesSummary}>{copy.rulesSummary}</p>}
        />
      </div>
    );
  }

  // ---- table ------------------------------------------------------------

  const promptKey =
    round === null ? 'none' : decisionKey(round, roundId, HERO_SEAT);

  return (
    <div className={styles.page}>
      <GameTopBar
        stats={stats}
        onInfoClick={openInfo}
        additionalContent={
          round !== null ? (
            <span className={styles.topPill}>
              {copy.roundLabel(copy.winds[round.roundWind], (game.handIndex % 4) + 1)}
            </span>
          ) : null
        }
      />

      <div className={styles.board}>
        {round !== null && (
          <>
            <p className={styles.status} aria-live="polite">
              {statusText}
            </p>

            <TableView
              state={round}
              hero={HERO_SEAT}
              copy={copy}
              handIndex={game.handIndex}
              activeSeats={actors}
            />

            {hasRealClaim && (
              <CallPrompt
                key={promptKey}
                actions={claims}
                copy={copy}
                onAct={commit}
                disabled={false}
              />
            )}

            <HandView
              state={round}
              seat={HERO_SEAT}
              copy={copy}
              actions={heroActions}
              riichiArmed={riichiArmed}
              onToggleRiichi={setRiichiArmed}
              onDiscard={commit}
              interactive={heroToDiscard}
            />
          </>
        )}

        <section className={styles.logPanel} aria-label={copy.logTitle}>
          <span className={styles.logTitle}>{copy.logTitle}</span>
          {logLines.length === 0 ? (
            <p className={styles.logEmpty}>{copy.logEmpty}</p>
          ) : (
            <ol className={styles.logList}>
              {logLines.map((line, index) => (
                <li className={styles.logLine} key={`${index}-${line}`}>
                  {line}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <ResultModal
        open={game.finished || (round !== null && round.phase === 'ended')}
        round={round}
        game={game}
        hero={HERO_SEAT}
        copy={copy}
        onNext={nextHand}
        onPlayAgain={playAgain}
      />

      <InfoModal isOpen={showInfo} onClose={closeInfo} title={copy.howToPlayTitle}>
        <div className={styles.infoBody}>
          <h3 className={styles.infoHeading}>{copy.objectiveLabel}</h3>
          <p className={styles.infoText}>{copy.objectiveBody}</p>
          <h3 className={styles.infoHeading}>{copy.basicRulesLabel}</h3>
          <ul className={styles.infoList}>
            {copy.basicRules.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <h3 className={styles.infoHeading}>{copy.controlsLabel}</h3>
          <ul className={styles.infoList}>
            {copy.controls.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </InfoModal>
    </div>
  );
}

export default MahjongGame;
