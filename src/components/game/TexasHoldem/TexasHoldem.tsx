'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { BrainCircuit, CircleHelp, RotateCcw, ShieldCheck, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { InfoModal } from '../common';
import { GameLanguageProvider, useGameLanguage } from '../contexts/GameLanguageContext';
import { decideCpuAction } from './ai';
import {
  advanceRunout,
  applyPlayerAction,
  createGame,
  getLegalActions,
  startNextHand,
  totalPot,
  type GameState,
  type LogEntry,
  type PlayerState,
  type PokerAction,
} from './engine';
import { getHoldemStrings, type HoldemStrings } from './i18n';
import { PlayingCard } from './PlayingCard';
import { playPokerSound, unlockPokerAudio } from './sounds';
import styles from './texas-holdem.module.css';

type SeatStyle = CSSProperties & { '--seat-x': string; '--seat-y': string };

const RUNOUT_CARD_DELAY_MS = 1400;
const RUNOUT_SHOWDOWN_DELAY_MS = 1700;

const chips = (amount: number): string => amount.toLocaleString('en-US');

function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((result, [key, value]) => result.replace(`{{${key}}}`, String(value)), template);
}

function playerName(player: PlayerState, strings: HoldemStrings): string {
  return player.isHuman ? strings.table.you : player.name;
}

function formatLog(entry: LogEntry, state: GameState, strings: HoldemStrings): string {
  const name = entry.seatIndex === undefined ? '' : playerName(state.players[entry.seatIndex], strings);
  if (entry.type === 'hand') return fill(strings.log.hand, { amount: entry.amount ?? 0 });
  if (entry.type === 'blind') {
    return fill(strings.log.posts, {
      player: name,
      blind: entry.detail === 'small' ? 'SB' : 'BB',
      amount: chips(entry.amount ?? 0),
    });
  }
  if (entry.type === 'street') return fill(strings.log.street, { street: strings.streets[entry.street ?? 'flop'] });
  if (entry.type === 'result') return fill(strings.log.collects, { player: name, amount: chips(entry.amount ?? 0) });
  if (entry.action === 'fold') return fill(strings.log.folds, { player: name });
  if (entry.action === 'check') return fill(strings.log.checks, { player: name });
  if (entry.action === 'call') return fill(strings.log.calls, { player: name, amount: chips(entry.amount ?? 0) });
  if (entry.detail === 'bet') return fill(strings.log.bets, { player: name, amount: chips(entry.amount ?? 0) });
  return fill(strings.log.raises, { player: name, amount: chips(entry.amount ?? 0) });
}

function seatStyle(index: number, count: number): SeatStyle {
  const angle = (90 + (index * 360) / count) * (Math.PI / 180);
  return {
    '--seat-x': `${50 + Math.cos(angle) * 43}%`,
    '--seat-y': `${50 + Math.sin(angle) * 40}%`,
  };
}

function actionLabel(player: PlayerState, strings: HoldemStrings): string | null {
  if (player.folded) return strings.table.folded;
  if (player.allIn) return strings.table.allIn;
  if (player.lastAction === 'fold') return strings.actions.fold;
  if (player.lastAction === 'check') return strings.actions.check;
  if (player.lastAction === 'call') return strings.actions.call;
  if (player.lastAction === 'bet') return strings.actions.bet;
  if (player.lastAction === 'raise') return strings.actions.raise;
  return null;
}

function Setup({ strings, onStart }: { strings: HoldemStrings; onStart: (count: number) => void }) {
  const [count, setCount] = useState(6);
  return (
    <section className={styles.setupCard} aria-labelledby="holdem-setup-title">
      <div className={styles.setupIcon} aria-hidden="true"><BrainCircuit size={30} /></div>
      <p className={styles.setupKicker}>2–8 MAX</p>
      <h2 id="holdem-setup-title">{strings.setup.title}</h2>
      <p className={styles.setupCopy}>{strings.setup.copy}</p>
      <div className={styles.seatPreview} aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <span key={index} className={index === 0 ? styles.previewHuman : ''}>{index === 0 ? 'Y' : 'AI'}</span>
        ))}
      </div>
      <div className={styles.countControl}>
        <span>{strings.setup.players}</span>
        <span className={styles.seatStepper}>
          <button
            type="button"
            onClick={() => setCount((value) => Math.max(2, value - 1))}
            disabled={count === 2}
            aria-label={strings.setup.decreasePlayers}
          >−</button>
          <strong>{count} <small>{strings.setup.totalSeats}</small></strong>
          <button
            type="button"
            onClick={() => setCount((value) => Math.min(8, value + 1))}
            disabled={count === 8}
            aria-label={strings.setup.increasePlayers}
          >+</button>
        </span>
        <input
          type="range"
          min={2}
          max={8}
          value={count}
          onChange={(event) => setCount(Number(event.target.value))}
          aria-label={strings.setup.players}
        />
        <span className={styles.rangeLabels}><small>2</small><small>8 MAX</small></span>
      </div>
      <div className={styles.setupFacts}>
        <span><small>{strings.setup.stack}</small><strong>200 · 100BB</strong></span>
        <span><small>{strings.setup.blinds}</small><strong>1 / 2</strong></span>
      </div>
      <button type="button" className={styles.startButton} onClick={() => onStart(count)}>
        <Sparkles size={18} aria-hidden="true" />{strings.setup.start}
      </button>
    </section>
  );
}

function Seat({ state, player, index, strings }: {
  state: GameState;
  player: PlayerState;
  index: number;
  strings: HoldemStrings;
}) {
  const isActing = state.currentActor === index;
  const atShowdown = state.street === 'complete' && !!state.result && !state.result.uncontested && !player.folded;
  const reveal = player.isHuman || atShowdown;
  const label = actionLabel(player, strings);
  return (
    <div
      className={`${styles.seat} ${player.isHuman ? styles.humanSeat : ''} ${isActing ? styles.actingSeat : ''} ${player.folded ? styles.foldedSeat : ''}`}
      style={seatStyle(index, state.players.length)}
    >
      <div className={styles.seatCards}>
        {player.hole.map((card, cardIndex) => <PlayingCard key={cardIndex} card={card} hidden={!reveal} compact />)}
      </div>
      <div className={styles.seatPanel}>
        <div className={styles.seatNameRow}>
          <strong>{playerName(player, strings)}</strong>
          {index === state.dealerIndex && <span title={strings.table.dealer}>D</span>}
          {index === state.smallBlindIndex && <span title={strings.table.smallBlind}>SB</span>}
          {index === state.bigBlindIndex && <span title={strings.table.bigBlind}>BB</span>}
        </div>
        <div className={styles.stack}><i aria-hidden="true" />{chips(player.stack)}</div>
        {label && <span className={styles.lastAction}>{label}</span>}
      </div>
      {player.streetBet > 0 && <span className={styles.tableBet}><i aria-hidden="true" />{chips(player.streetBet)}</span>}
    </div>
  );
}

function ActionPanel({ state, strings, onAction }: {
  state: GameState;
  strings: HoldemStrings;
  onAction: (action: PokerAction) => void;
}) {
  const legal = getLegalActions(state, 0);
  const sliderMinimum = Math.min(legal.minRaiseTo, legal.maxRaiseTo);
  const raiseKey = `${state.handNumber}-${state.street}-${state.currentActor}-${state.currentBet}-${legal.maxRaiseTo}`;
  const [raiseSelection, setRaiseSelection] = useState({ key: '', amount: sliderMinimum });
  const raiseTo = raiseSelection.key === raiseKey
    ? Math.max(sliderMinimum, Math.min(legal.maxRaiseTo, raiseSelection.amount))
    : sliderMinimum;

  if (state.currentActor !== 0 || state.street === 'complete') return null;
  const potAfterCall = totalPot(state) + legal.callAmount;
  const potOdds = legal.callAmount > 0 ? (legal.callAmount / Math.max(1, potAfterCall)) * 100 : 0;
  const spr = state.players[0].stack / Math.max(1, totalPot(state));
  const raiseLabel = raiseTo === legal.maxRaiseTo
    ? strings.actions.allIn
    : state.currentBet === 0 ? strings.actions.bet : strings.actions.raise;

  return (
    <section className={styles.actionDock} aria-label="Poker actions">
      <div className={styles.decisionHud}>
        <span><small>{strings.table.toCall}</small><strong>{legal.callAmount ? chips(legal.callAmount) : strings.table.noBet}</strong></span>
        <span><small>{strings.table.potOdds}</small><strong>{potOdds.toFixed(1)}%</strong></span>
        <span><small>{strings.table.stackToPot}</small><strong>{spr.toFixed(1)}</strong></span>
      </div>
      {legal.canRaise && (
        <label className={styles.raiseControl}>
          <span>{strings.actions.raiseTo}</span>
          <input
            type="range"
            min={sliderMinimum}
            max={legal.maxRaiseTo}
            step={1}
            value={raiseTo}
            onChange={(event) => setRaiseSelection({ key: raiseKey, amount: Number(event.target.value) })}
          />
          <output>{chips(raiseTo)}</output>
        </label>
      )}
      <div className={styles.actionButtons}>
        {legal.canFold && <button type="button" className={styles.foldButton} onClick={() => onAction({ type: 'fold' })}>{strings.actions.fold}</button>}
        {legal.canCheck && <button type="button" className={styles.checkButton} onClick={() => onAction({ type: 'check' })}>{strings.actions.check}</button>}
        {legal.canCall && <button type="button" className={styles.callButton} onClick={() => onAction({ type: 'call' })}>{strings.actions.call} <span>{chips(legal.callAmount)}</span></button>}
        {legal.canRaise && <button type="button" className={styles.raiseButton} onClick={() => onAction({ type: 'raise', raiseTo })}>{raiseLabel} <span>{chips(raiseTo)}</span></button>}
      </div>
    </section>
  );
}

function ResultPanel({ state, strings, onNext }: { state: GameState; strings: HoldemStrings; onNext: () => void }) {
  if (!state.result) return null;
  return (
    <section className={styles.resultPanel} aria-live="polite">
      <div>
        <p>{strings.result.title}</p>
        {state.result.winnerIndices.map((winner) => {
          const rank = state.result?.handRanks[winner];
          return (
            <h2 key={winner}>
              {playerName(state.players[winner], strings)} · {chips(state.result?.payouts[winner] ?? 0)}
              <small>{state.result?.uncontested ? strings.result.uncontested : rank ? strings.hands[rank.name] : ''}</small>
            </h2>
          );
        })}
        {state.result.pots.length > 1 && (
          <div className={styles.potBreakdown}>
            {state.result.pots.map((pot, index) => (
              <span key={index}>{index === 0 ? strings.result.mainPot : `${strings.result.sidePot} ${index}`}: {chips(pot.amount)}</span>
            ))}
          </div>
        )}
      </div>
      <button type="button" onClick={onNext}>{strings.actions.nextHand}</button>
    </section>
  );
}

function GameTable({ state, strings, onAction, onNext }: {
  state: GameState;
  strings: HoldemStrings;
  onAction: (action: PokerAction) => void;
  onNext: () => void;
}) {
  const cpuThinking = state.currentActor !== null && !state.players[state.currentActor].isHuman && state.street !== 'complete';
  return (
    <div className={styles.gameLayout}>
      <div className={styles.tableColumn}>
        <div className={styles.tableFrame}>
          <div className={styles.rail} aria-hidden="true" />
          <div className={styles.felt}>
            <div className={styles.centerMark} aria-hidden="true">RANGE LAB</div>
            <div className={styles.boardArea}>
              <span className={styles.streetPill}>{strings.streets[state.street]}</span>
              <div className={styles.communityCards}>
                {Array.from({ length: 5 }, (_, index) => (
                  state.board[index]
                    ? <PlayingCard key={index} card={state.board[index]} />
                    : <span key={index} className={styles.cardSlot} aria-hidden="true" />
                ))}
              </div>
              <div className={styles.potLabel}><small>{strings.table.pot}</small><strong><i aria-hidden="true" />{chips(totalPot(state))}</strong></div>
              {cpuThinking && <span className={styles.thinking}><BrainCircuit size={14} aria-hidden="true" />{strings.table.thinking}</span>}
              {state.runout && <span className={styles.thinking}><Sparkles size={14} aria-hidden="true" />{strings.table.runout}</span>}
            </div>
          </div>
          {state.players.map((player, index) => <Seat key={player.id} state={state} player={player} index={index} strings={strings} />)}
        </div>
      </div>
      <aside className={styles.sideRail}>
        <ResultPanel state={state} strings={strings} onNext={onNext} />
        <ActionPanel state={state} strings={strings} onAction={onAction} />
        <div className={styles.logPanel}>
          <div className={styles.logHeading}><span><ShieldCheck size={16} aria-hidden="true" />{strings.table.actionLog}</span><small>{strings.table.hand} #{state.handNumber}</small></div>
          <ol>
            {[...state.log].reverse().map((entry) => <li key={entry.id}>{formatLog(entry, state, strings)}</li>)}
          </ol>
        </div>
      </aside>
    </div>
  );
}

function TexasHoldemInner() {
  const { language } = useGameLanguage();
  const strings = useMemo(() => getHoldemStrings(language), [language]);
  const [game, setGame] = useState<GameState | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const previousSoundState = useRef<{ board: number; hand: number; logId: number; street: GameState['street'] } | null>(null);

  useEffect(() => {
    if (!game) {
      previousSoundState.current = null;
      return;
    }
    const previous = previousSoundState.current;
    const latestLog = game.log.at(-1);
    if (previous?.hand === game.handNumber) {
      if (game.board.length > previous.board) playPokerSound('card', soundEnabled);
      else if (game.street === 'complete' && previous.street !== 'complete') playPokerSound('showdown', soundEnabled);
      else if (latestLog && latestLog.id > previous.logId && latestLog.type === 'action') {
        playPokerSound(latestLog.action === 'fold' ? 'fold' : 'chip', soundEnabled);
      }
    }
    previousSoundState.current = {
      board: game.board.length,
      hand: game.handNumber,
      logId: latestLog?.id ?? 0,
      street: game.street,
    };
  }, [game, soundEnabled]);

  useEffect(() => {
    if (!game || game.street === 'complete') return;
    if (game.runout) {
      const timer = window.setTimeout(() => {
        setGame((current) => current?.runout ? advanceRunout(current) : current);
      }, game.board.length === 5 ? RUNOUT_SHOWDOWN_DELAY_MS : RUNOUT_CARD_DELAY_MS);
      return () => window.clearTimeout(timer);
    }
    if (game.currentActor === null) return;
    const actor = game.currentActor;
    if (game.players[actor].isHuman) return;
    const timer = window.setTimeout(() => {
      setGame((current) => {
        if (!current || current.currentActor !== actor || current.street === 'complete') return current;
        return applyPlayerAction(current, actor, decideCpuAction(current, actor));
      });
    }, 420 + Math.floor(Math.random() * 380));
    return () => window.clearTimeout(timer);
  }, [game]);

  const act = (action: PokerAction) => setGame((current) => current ? applyPlayerAction(current, 0, action) : current);

  return (
    <main className={styles.root}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>{strings.eyebrow}</p>
            <h1>{strings.title}</h1>
            <p className={styles.subtitle}>{strings.subtitle}</p>
          </div>
          <div className={styles.headerActions}>
            <span className={styles.gtoBadge}><ShieldCheck size={15} aria-hidden="true" />{strings.gtoBadge}</span>
            <button
              type="button"
              onClick={() => {
                setSoundEnabled((enabled) => {
                  if (!enabled) void unlockPokerAudio().then(() => playPokerSound('chip', true));
                  return !enabled;
                });
              }}
              aria-label={soundEnabled ? strings.actions.soundOff : strings.actions.soundOn}
              title={soundEnabled ? strings.actions.soundOff : strings.actions.soundOn}
            >
              {soundEnabled ? <Volume2 size={17} aria-hidden="true" /> : <VolumeX size={17} aria-hidden="true" />}
              {soundEnabled ? strings.actions.soundOn : strings.actions.soundOff}
            </button>
            <button type="button" onClick={() => setInfoOpen(true)}><CircleHelp size={17} aria-hidden="true" />{strings.actions.rules}</button>
            {game && <button type="button" onClick={() => setGame(null)}><RotateCcw size={16} aria-hidden="true" />{strings.actions.newTable}</button>}
          </div>
        </header>

        {game
          ? <GameTable state={game} strings={strings} onAction={act} onNext={() => {
            void unlockPokerAudio().then(() => playPokerSound('deal', soundEnabled));
            setGame((current) => current ? startNextHand(current) : current);
          }} />
          : <Setup strings={strings} onStart={(count) => {
            void unlockPokerAudio().then(() => playPokerSound('deal', soundEnabled));
            setGame(createGame(count));
          }} />}
      </div>

      <InfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} title={strings.info.title}>
        <div className={styles.infoContent}>
          <p>{strings.info.intro}</p>
          <ul>{strings.info.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
          <h3>{strings.info.honestyTitle}</h3>
          <p>{strings.info.honesty}</p>
        </div>
      </InfoModal>
    </main>
  );
}

export function TexasHoldem() {
  return <GameLanguageProvider><TexasHoldemInner /></GameLanguageProvider>;
}

export default TexasHoldem;
