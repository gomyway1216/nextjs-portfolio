/**
 * Animal Roleplay - turn based survival game
 */

'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GameTopBar, InfoModal, GameStats } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import {
  ACTION_DEFINITIONS,
  ANIMAL_PROFILES,
  createInitialState,
  effectiveThreat,
  predictSuccessChance,
  resolveTurn,
  startGameWithAnimal,
} from './gameLogic';
import { getLocalStrings } from './i18n';
import {
  ActionId,
  AnimalId,
  Difficulty,
  MAX_HP,
  MAX_HUNGER,
  MAX_TURNS,
  SCORE_METER_MAX,
  TurnLogEntry,
} from './types';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import styles from './AnimalRoleplay.module.css';

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

function formatDelta(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function getMeterColor(pct: number): string {
  if (pct >= 70) return '#22c55e';
  if (pct >= 35) return '#f59e0b';
  return '#ef4444';
}

function getChanceStyle(chance: number): React.CSSProperties {
  if (chance >= 65) return { background: 'rgba(34,197,94,0.25)', color: '#86efac' };
  if (chance >= 40) return { background: 'rgba(245,158,11,0.25)', color: '#fde68a' };
  return { background: 'rgba(239,68,68,0.25)', color: '#fca5a5' };
}

export function AnimalRoleplay() {
  useFeatureLifecycle('game.animal-roleplay');
  const { t } = useTranslation();
  const { language } = useGameLanguage();
  const local = useMemo(() => getLocalStrings(language), [language]);

  const [showInfo, setShowInfo] = useState(false);
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [bestScore, setBestScore] = useState(0);
  const [isNewBest, setIsNewBest] = useState(false);
  const [state, setState] = useState(() => createInitialState('normal'));
  // Guards against double-fire (rapid clicks / key-repeat) mutating the same turn.
  const resolvingRef = useRef(false);
  // Ensures win/loss + best-score is recorded exactly once per finished run
  // (survives React Strict Mode's double-invoked effects in development).
  const hasRecordedRef = useRef(false);

  const currentAnimal = state.selectedAnimalId ? ANIMAL_PROFILES[state.selectedAnimalId] : null;
  const isPlaying = !!state.selectedAnimalId && !state.outcome;
  const recentLogs = useMemo(() => state.logs.slice(-5).reverse(), [state.logs]);

  const longDescription = t('games.animal-roleplay.longDescription');
  const howToPlay = t('games.animal-roleplay.howToPlay', { returnObjects: true }) as string[];
  const features = t('games.animal-roleplay.features', { returnObjects: true }) as string[];

  const outcomeTitle = useMemo(() => {
    if (!state.outcome) return null;
    if (state.outcome === 'win') return t('games.animal-roleplay.ui.outcomes.winTitle');
    return t('games.animal-roleplay.ui.outcomes.loseTitle');
  }, [state.outcome, t]);

  const outcomeMessage = useMemo(() => {
    if (!state.outcome) return null;
    if (state.outcome === 'win') {
      return t('games.animal-roleplay.ui.outcomes.winMessage', {
        score: state.score,
        hp: state.hp,
        hunger: state.hunger,
      });
    }
    if (state.outcome === 'lose-hunger') {
      return t('games.animal-roleplay.ui.outcomes.loseHungerMessage');
    }
    return t('games.animal-roleplay.ui.outcomes.loseHpMessage');
  }, [state.hunger, state.hp, state.outcome, state.score, t]);

  const latestResultText = useMemo(() => {
    const log = state.lastLog;
    if (!log) return t('games.animal-roleplay.ui.result.waiting');
    const actionLabel = t(`games.animal-roleplay.ui.actions.${log.actionId}.label`);
    const eventLabel = t(`games.animal-roleplay.ui.events.${log.eventId}.title`);
    return log.success
      ? t('games.animal-roleplay.ui.result.success', { action: actionLabel, event: eventLabel })
      : t('games.animal-roleplay.ui.result.fail', { action: actionLabel, event: eventLabel });
  }, [state.lastLog, t]);

  // Record win/loss + best score as a side effect of the run finishing, not
  // inside a state updater (updaters must stay pure; Strict Mode runs them twice).
  // hasRecordedRef keeps this idempotent so the double-invoked effect in dev
  // can't double-count wins/losses or the best score.
  useEffect(() => {
    if (!state.outcome) {
      hasRecordedRef.current = false;
      return;
    }
    if (hasRecordedRef.current) return;
    hasRecordedRef.current = true;

    setStats((prevStats) =>
      state.outcome === 'win'
        ? { ...prevStats, wins: prevStats.wins + 1 }
        : { ...prevStats, losses: prevStats.losses + 1 },
    );
    setBestScore((prevBest) => {
      if (state.score > prevBest) {
        setIsNewBest(true);
        return state.score;
      }
      return prevBest;
    });
  }, [state.outcome, state.score]);

  const startWithAnimal = (animalId: AnimalId) => {
    resolvingRef.current = false;
    setIsNewBest(false);
    setState(startGameWithAnimal(animalId, difficulty));
  };

  const handleAction = useCallback((actionId: ActionId) => {
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    setState((prev) => {
      if (!prev.selectedAnimalId || prev.outcome) {
        resolvingRef.current = false;
        return prev;
      }
      const next = resolveTurn(prev, actionId);
      resolvingRef.current = false;
      return next;
    });
  }, []);

  const handleReplay = () => {
    if (!state.selectedAnimalId) return;
    resolvingRef.current = false;
    setIsNewBest(false);
    setState(startGameWithAnimal(state.selectedAnimalId, difficulty));
  };

  const handleChangeAnimal = () => {
    resolvingRef.current = false;
    setIsNewBest(false);
    setState(createInitialState(difficulty));
  };

  const turnDisplay = state.outcome ? state.turn : Math.min(state.turn + 1, MAX_TURNS);
  const progressPct = Math.min(100, (state.turn / MAX_TURNS) * 100);

  const renderAnimalStat = (label: string, value: number) => (
    <div className={styles.statRow}>
      <span className={styles.statName}>{label}</span>
      <div className={styles.statTrack}>
        <div className={styles.statFill} style={{ width: `${(value / 5) * 100}%` }} />
      </div>
      <span className={styles.statValue}>{value}</span>
    </div>
  );

  const renderStatusCard = (
    label: string,
    value: number,
    max: number,
    kind: 'hp' | 'hunger' | 'score',
    delta: number | null,
  ) => {
    const pct = Math.max(0, Math.min(100, (value / max) * 100));
    const color = kind === 'score' ? '#22c55e' : getMeterColor(pct);
    return (
      <div className={styles.statusCard}>
        <div className={styles.statusLabel}>
          <span>{label}</span>
          {delta != null && delta !== 0 ? (
            <span
              className={styles.statusDelta}
              style={{ color: delta > 0 ? '#86efac' : '#fca5a5' }}
            >
              {formatDelta(delta)}
            </span>
          ) : null}
        </div>
        <div className={styles.statusValue}>{value}</div>
        <div className={styles.meterTrack}>
          <div className={styles.meterFill} style={{ width: `${pct}%`, background: color }} />
        </div>
      </div>
    );
  };

  const renderLogItem = (log: TurnLogEntry) => {
    const actionLabel = t(`games.animal-roleplay.ui.actions.${log.actionId}.label`);
    const eventLabel = t(`games.animal-roleplay.ui.events.${log.eventId}.title`);
    return (
      <div key={`${log.turn}-${log.actionId}`} className={styles.logItem}>
        <div className={styles.logHead}>
          <div className={styles.logTurn}>
            {t('games.animal-roleplay.ui.turnLabel', { current: log.turn, total: MAX_TURNS })}
          </div>
          <span
            className={`${styles.logTag} ${log.success ? styles.logTagSuccess : styles.logTagFail}`}
          >
            {log.success
              ? t('games.animal-roleplay.ui.resultTag.success')
              : t('games.animal-roleplay.ui.resultTag.fail')}
          </span>
        </div>
        <div className={styles.logBody}>
          {eventLabel} / {actionLabel}
        </div>
        <div className={styles.logDeltas}>
          <span style={{ color: log.hpDelta >= 0 ? '#86efac' : '#fca5a5' }}>
            {t('games.animal-roleplay.ui.hpLabel')} {formatDelta(log.hpDelta)}
          </span>
          <span style={{ color: log.hungerDelta >= 0 ? '#fde68a' : '#fca5a5' }}>
            {t('games.animal-roleplay.ui.hungerLabel')} {formatDelta(log.hungerDelta)}
          </span>
          <span style={{ color: log.scoreDelta >= 0 ? '#86efac' : '#fca5a5' }}>
            {t('games.animal-roleplay.ui.scoreLabel')} {formatDelta(log.scoreDelta)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <div className={styles.header}>
          <Link href="/games" className={styles.backLink}>
            ← {t('navigation.backToGames')}
          </Link>
          <h1 className={styles.title}>{t('games.animal-roleplay.title')}</h1>
        </div>

        <GameTopBar
          stats={stats}
          onInfoClick={() => setShowInfo(true)}
          additionalContent={
            <div className={styles.turnPill}>
              {t('games.animal-roleplay.ui.turnLabel', { current: turnDisplay, total: MAX_TURNS })}
            </div>
          }
        />

        {!state.selectedAnimalId ? (
          <div className={styles.setup}>
            <div className={`${styles.card} ${styles.cardAccent}`}>
              <p className={styles.lede}>{t('games.animal-roleplay.ui.selectAnimalDescription')}</p>
            </div>

            <div className={styles.card}>
              <div className={styles.sectionLabel}>{local.difficulty.heading}</div>
              <div className={styles.diffRow}>
                {/* Native radios (visually hidden) give real radiogroup keyboard
                    navigation — arrow keys move + select — for free. */}
                {DIFFICULTIES.map((diff) => (
                  <label
                    key={diff}
                    className={styles.diffButton}
                    data-selected={difficulty === diff ? 'true' : 'false'}
                  >
                    <input
                      type="radio"
                      name="animal-roleplay-difficulty"
                      value={diff}
                      checked={difficulty === diff}
                      onChange={() => setDifficulty(diff)}
                      className={styles.srOnly}
                    />
                    <div className={styles.diffLabel}>{local.difficulty.labels[diff]}</div>
                    <div className={styles.diffDesc}>{local.difficulty.descriptions[diff]}</div>
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.sectionLabel}>{local.chooseAnimalHeading}</div>
              <div className={styles.animalGrid}>
                {(Object.keys(ANIMAL_PROFILES) as AnimalId[]).map((animalId) => {
                  const animal = ANIMAL_PROFILES[animalId];
                  const animalName = t(`games.animal-roleplay.ui.animals.${animalId}.name`);
                  return (
                    <div key={animalId} className={styles.animalCard}>
                      <div className={styles.animalHead}>
                        <span className={styles.animalEmoji} aria-hidden="true">
                          {animal.emoji}
                        </span>
                        <div>
                          <div className={styles.animalName}>{animalName}</div>
                          <div className={styles.animalPassive}>
                            {t(`games.animal-roleplay.ui.animals.${animalId}.passive`)}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gap: '0.35rem' }}>
                        {renderAnimalStat(t('games.animal-roleplay.ui.stats.speed'), animal.speed)}
                        {renderAnimalStat(t('games.animal-roleplay.ui.stats.strength'), animal.strength)}
                        {renderAnimalStat(t('games.animal-roleplay.ui.stats.stealth'), animal.stealth)}
                        {renderAnimalStat(
                          t('games.animal-roleplay.ui.stats.intelligence'),
                          animal.intelligence,
                        )}
                      </div>

                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => startWithAnimal(animalId)}
                      >
                        {t('games.animal-roleplay.ui.startAs', { animal: animalName })}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.play}>
            <div className={`${styles.card} ${styles.cardAccent}`}>
              <div className={styles.headerBar}>
                <div className={styles.animalChip}>
                  <span className={styles.chipEmoji} aria-hidden="true">
                    {currentAnimal?.emoji}
                  </span>
                  <div>
                    <div className={styles.chipName}>
                      {currentAnimal
                        ? t(`games.animal-roleplay.ui.animals.${currentAnimal.id}.name`)
                        : ''}
                    </div>
                    <div className={styles.chipMeta}>
                      {local.difficulty.labels[state.difficulty]} · {local.bestScore} {bestScore}
                    </div>
                  </div>
                </div>
                <div className={styles.progressWrap} aria-hidden="true">
                  <span className={styles.progressText}>{local.progress}</span>
                  <div className={styles.progressTrack}>
                    <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
                  </div>
                  <span className={styles.progressText}>
                    {state.turn}/{MAX_TURNS}
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.statusGrid}>
              {renderStatusCard(
                t('games.animal-roleplay.ui.hpLabel'),
                state.hp,
                MAX_HP,
                'hp',
                state.lastLog?.hpDelta ?? null,
              )}
              {renderStatusCard(
                t('games.animal-roleplay.ui.hungerLabel'),
                state.hunger,
                MAX_HUNGER,
                'hunger',
                state.lastLog?.hungerDelta ?? null,
              )}
              {renderStatusCard(
                t('games.animal-roleplay.ui.scoreLabel'),
                state.score,
                SCORE_METER_MAX,
                'score',
                state.lastLog?.scoreDelta ?? null,
              )}
            </div>

            {isPlaying && state.currentEvent ? (
              <div className={styles.eventCard} aria-live="polite">
                <div className={styles.eventKicker}>{t('games.animal-roleplay.ui.eventNow')}</div>
                <div className={styles.eventTitle}>
                  {t(`games.animal-roleplay.ui.events.${state.currentEvent.id}.title`)}
                </div>
                <p className={styles.eventDesc}>
                  {t(`games.animal-roleplay.ui.events.${state.currentEvent.id}.description`)}
                </p>
                <div className={styles.eventMeters}>
                  <span className={styles.eventMeter} style={{ color: '#fca5a5' }}>
                    <span
                      className={styles.eventDot}
                      style={{ background: '#ef4444' }}
                      aria-hidden="true"
                    />
                    {local.threat} {effectiveThreat(state.currentEvent, state.difficulty)}
                  </span>
                  <span className={styles.eventMeter} style={{ color: '#86efac' }}>
                    <span
                      className={styles.eventDot}
                      style={{ background: '#22c55e' }}
                      aria-hidden="true"
                    />
                    {local.food} {state.currentEvent.foodRichness}
                  </span>
                </div>
              </div>
            ) : null}

            <div className={styles.card}>
              <div className={styles.sectionLabel}>
                {t('games.animal-roleplay.ui.chooseAction')}
              </div>
              <div className={styles.actionGrid}>
                {ACTION_DEFINITIONS.map((action) => {
                  const chance =
                    isPlaying && currentAnimal && state.currentEvent
                      ? predictSuccessChance(
                          currentAnimal,
                          state.currentEvent,
                          action.id,
                          state.difficulty,
                          state.hp,
                          state.hunger,
                        )
                      : null;
                  const actionLabel = t(`games.animal-roleplay.ui.actions.${action.id}.label`);
                  return (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => handleAction(action.id)}
                      disabled={!isPlaying}
                      className={styles.actionButton}
                      aria-label={
                        chance != null
                          ? `${actionLabel} — ${local.successChance} ${chance}%`
                          : actionLabel
                      }
                    >
                      <div className={styles.actionTop}>
                        <span className={styles.actionLabel}>{actionLabel}</span>
                        {chance != null ? (
                          <span className={styles.actionChance} style={getChanceStyle(chance)}>
                            {chance}%
                          </span>
                        ) : null}
                      </div>
                      <div className={styles.actionDesc}>
                        {t(`games.animal-roleplay.ui.actions.${action.id}.description`)}
                      </div>
                    </button>
                  );
                })}
              </div>
              {isPlaying ? <p className={styles.actionHint}>{local.actionHint}</p> : null}
            </div>

            <div className={styles.card}>
              <div className={styles.sectionLabel}>
                {t('games.animal-roleplay.ui.latestResult')}
              </div>
              <p className={styles.lede}>{latestResultText}</p>
            </div>

            <div className={styles.card}>
              <div className={styles.sectionLabel}>{t('games.animal-roleplay.ui.logTitle')}</div>
              <div className={styles.logList}>
                {recentLogs.length === 0 ? (
                  <p className={styles.logEmpty}>{t('games.animal-roleplay.ui.logEmpty')}</p>
                ) : (
                  recentLogs.map(renderLogItem)
                )}
              </div>
            </div>

            {state.outcome ? (
              <div className={styles.outcomeCard} role="status" aria-live="polite">
                <h2 className={styles.outcomeTitle}>
                  {outcomeTitle}
                  {isNewBest ? (
                    <span className={styles.bestPill} style={{ marginLeft: '0.6rem' }}>
                      {local.bestBadge}
                    </span>
                  ) : null}
                </h2>
                <p className={styles.outcomeMsg}>{outcomeMessage}</p>
                <div className={styles.outcomeActions}>
                  <button type="button" className={styles.primaryButton} onClick={handleReplay}>
                    {t('games.animal-roleplay.ui.playAgain')}
                  </button>
                  <button type="button" className={styles.ghostButton} onClick={handleChangeAnimal}>
                    {t('games.animal-roleplay.ui.changeAnimal')}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <InfoModal
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        title={t('games.animal-roleplay.title')}
      >
        <div style={{ color: '#d1d5db', lineHeight: 1.7, fontSize: '0.95rem' }}>
          <p style={{ marginTop: 0 }}>{longDescription}</p>

          <h3 style={{ color: '#fff', marginBottom: '0.5rem' }}>{t('games.howToPlay')}</h3>
          <ul style={{ marginTop: 0, paddingLeft: '1.25rem' }}>
            {howToPlay.map((step, index) => (
              <li key={index} style={{ marginBottom: '0.35rem' }}>
                {step}
              </li>
            ))}
          </ul>

          <h3 style={{ color: '#fff', marginBottom: '0.5rem' }}>{t('games.features')}</h3>
          <ul style={{ marginTop: 0, paddingLeft: '1.25rem' }}>
            {features.map((feature, index) => (
              <li key={index} style={{ marginBottom: '0.35rem' }}>
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </InfoModal>
    </div>
  );
}

export default AnimalRoleplay;
