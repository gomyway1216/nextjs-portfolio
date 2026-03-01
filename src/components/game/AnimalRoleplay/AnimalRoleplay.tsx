/**
 * Animal Roleplay - turn based survival game
 */

'use client';

import Link from 'next/link';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GameTopBar, InfoModal, GameStats } from '../common';
import { ACTION_DEFINITIONS, ANIMAL_PROFILES, createInitialState, resolveTurn, startGameWithAnimal } from './gameLogic';
import { ActionId, AnimalId, TurnLogEntry, MAX_HP, MAX_HUNGER, MAX_TURNS } from './types';

const statColors: Record<'hp' | 'hunger' | 'score', string> = {
  hp: '#ef4444',
  hunger: '#f59e0b',
  score: '#22c55e',
};

function formatDelta(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function getMeterColor(value: number): string {
  if (value >= 70) return '#22c55e';
  if (value >= 35) return '#f59e0b';
  return '#ef4444';
}

export function AnimalRoleplay() {
  const { t } = useTranslation();
  const [showInfo, setShowInfo] = useState(false);
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });
  const [state, setState] = useState(() => createInitialState());

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

  const startWithAnimal = (animalId: AnimalId) => {
    setState(startGameWithAnimal(animalId));
  };

  const handleAction = (actionId: ActionId) => {
    setState((prev) => {
      if (!prev.selectedAnimalId || prev.outcome) return prev;
      const next = resolveTurn(prev, actionId);
      if (!prev.outcome && next.outcome) {
        setStats((prevStats) =>
          next.outcome === 'win'
            ? { ...prevStats, wins: prevStats.wins + 1 }
            : { ...prevStats, losses: prevStats.losses + 1 }
        );
      }
      return next;
    });
  };

  const handleReplay = () => {
    if (!state.selectedAnimalId) return;
    setState(startGameWithAnimal(state.selectedAnimalId));
  };

  const handleChangeAnimal = () => {
    setState(createInitialState());
  };

  const turnDisplay = state.outcome ? state.turn : Math.min(state.turn + 1, MAX_TURNS);

  const renderStatusCard = (label: string, value: number, max: number, kind: 'hp' | 'hunger' | 'score') => (
    <div style={{
      background: 'rgba(17, 24, 39, 0.88)',
      border: '1px solid rgba(75, 85, 99, 0.8)',
      borderRadius: '0.75rem',
      padding: '0.75rem',
    }}>
      <div style={{ color: '#cbd5e1', fontSize: '0.8rem', marginBottom: '0.35rem' }}>{label}</div>
      <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.2rem' }}>{value}</div>
      <div style={{
        marginTop: '0.4rem',
        height: '0.4rem',
        background: 'rgba(148, 163, 184, 0.2)',
        borderRadius: '9999px',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`,
          height: '100%',
          borderRadius: '9999px',
          background: kind === 'score' ? statColors.score : getMeterColor((value / max) * 100),
          transition: 'width 0.2s ease',
        }} />
      </div>
    </div>
  );

  const renderAnimalStat = (label: string, value: number) => (
    <div style={{ display: 'grid', gridTemplateColumns: '84px 1fr auto', alignItems: 'center', gap: '0.5rem' }}>
      <span style={{ color: '#cbd5e1', fontSize: '0.75rem' }}>{label}</span>
      <div style={{
        height: '0.35rem',
        borderRadius: '9999px',
        background: 'rgba(148, 163, 184, 0.25)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${(value / 5) * 100}%`,
          background: '#38bdf8',
        }} />
      </div>
      <span style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 700 }}>{value}</span>
    </div>
  );

  const renderLogItem = (log: TurnLogEntry) => {
    const actionLabel = t(`games.animal-roleplay.ui.actions.${log.actionId}.label`);
    const eventLabel = t(`games.animal-roleplay.ui.events.${log.eventId}.title`);
    return (
      <div
        key={`${log.turn}-${log.actionId}`}
        style={{
          border: '1px solid rgba(75, 85, 99, 0.6)',
          borderRadius: '0.6rem',
          padding: '0.65rem',
          background: 'rgba(2, 6, 23, 0.45)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ color: '#e2e8f0', fontSize: '0.85rem' }}>
            {t('games.animal-roleplay.ui.turnLabel', { current: log.turn, total: MAX_TURNS })}
          </div>
          <span style={{
            borderRadius: '9999px',
            padding: '0.1rem 0.5rem',
            fontSize: '0.7rem',
            fontWeight: 700,
            color: '#fff',
            background: log.success ? '#16a34a' : '#b91c1c',
          }}>
            {log.success ? t('games.animal-roleplay.ui.resultTag.success') : t('games.animal-roleplay.ui.resultTag.fail')}
          </span>
        </div>
        <div style={{ marginTop: '0.4rem', color: '#cbd5e1', fontSize: '0.85rem' }}>
          {eventLabel} / {actionLabel}
        </div>
        <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.65rem', flexWrap: 'wrap', fontSize: '0.75rem' }}>
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
    <div style={{
      position: 'fixed',
      inset: 0,
      overflowY: 'auto',
      background: 'radial-gradient(circle at top, #164e63 0%, #0f172a 50%, #020617 100%)',
      padding: '1rem',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{ maxWidth: '980px', margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem', gap: '0.75rem' }}>
          <Link
            href="/games"
            style={{
              color: '#cbd5e1',
              textDecoration: 'none',
              fontSize: '0.9rem',
              fontWeight: 700,
            }}
          >
            ← {t('navigation.backToGames')}
          </Link>
          <h1 style={{ margin: 0, color: '#fff', fontSize: '1.5rem' }}>{t('games.animal-roleplay.title')}</h1>
        </div>

        <GameTopBar
          stats={stats}
          onInfoClick={() => setShowInfo(true)}
          additionalContent={
            <div style={{
              color: '#93c5fd',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              borderRadius: '9999px',
              padding: '0.2rem 0.7rem',
              fontSize: '0.75rem',
              fontWeight: 700,
              background: 'rgba(59, 130, 246, 0.15)',
            }}>
              {t('games.animal-roleplay.ui.turnLabel', { current: turnDisplay, total: MAX_TURNS })}
            </div>
          }
        />

        {!state.selectedAnimalId ? (
          <div style={{
            marginTop: '1rem',
            background: 'rgba(2, 6, 23, 0.7)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            borderRadius: '1rem',
            padding: '1.2rem',
          }}>
            <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>
              {t('games.animal-roleplay.ui.selectAnimalDescription')}
            </p>

            <div style={{
              marginTop: '1rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '0.9rem',
            }}>
              {(Object.keys(ANIMAL_PROFILES) as AnimalId[]).map((animalId) => {
                const animal = ANIMAL_PROFILES[animalId];
                return (
                  <div
                    key={animalId}
                    style={{
                      borderRadius: '0.9rem',
                      border: '1px solid rgba(100, 116, 139, 0.6)',
                      padding: '0.9rem',
                      background: 'rgba(15, 23, 42, 0.85)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '1.8rem' }}>{animal.emoji}</span>
                      <div>
                        <div style={{ color: '#fff', fontSize: '1rem', fontWeight: 800 }}>
                          {t(`games.animal-roleplay.ui.animals.${animalId}.name`)}
                        </div>
                        <div style={{ color: '#93c5fd', fontSize: '0.75rem' }}>
                          {t(`games.animal-roleplay.ui.animals.${animalId}.passive`)}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: '0.35rem' }}>
                      {renderAnimalStat(t('games.animal-roleplay.ui.stats.speed'), animal.speed)}
                      {renderAnimalStat(t('games.animal-roleplay.ui.stats.strength'), animal.strength)}
                      {renderAnimalStat(t('games.animal-roleplay.ui.stats.stealth'), animal.stealth)}
                      {renderAnimalStat(t('games.animal-roleplay.ui.stats.intelligence'), animal.intelligence)}
                    </div>

                    <button
                      onClick={() => startWithAnimal(animalId)}
                      style={{
                        marginTop: '0.8rem',
                        width: '100%',
                        border: 'none',
                        borderRadius: '0.6rem',
                        cursor: 'pointer',
                        background: '#0284c7',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '0.9rem',
                        padding: '0.6rem 0.8rem',
                      }}
                    >
                      {t('games.animal-roleplay.ui.startAs', { animal: t(`games.animal-roleplay.ui.animals.${animalId}.name`) })}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: '1rem', display: 'grid', gap: '0.9rem' }}>
            <div style={{
              border: '1px solid rgba(56, 189, 248, 0.35)',
              borderRadius: '0.9rem',
              padding: '0.9rem',
              background: 'rgba(2, 6, 23, 0.7)',
            }}>
              <div style={{ color: '#bfdbfe', fontSize: '0.85rem' }}>{t('games.animal-roleplay.ui.currentAnimal')}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.2rem' }}>
                <span style={{ fontSize: '1.7rem' }}>{currentAnimal?.emoji}</span>
                <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800 }}>
                  {currentAnimal ? t(`games.animal-roleplay.ui.animals.${currentAnimal.id}.name`) : ''}
                </div>
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '0.7rem',
            }}>
              {renderStatusCard(t('games.animal-roleplay.ui.hpLabel'), state.hp, MAX_HP, 'hp')}
              {renderStatusCard(t('games.animal-roleplay.ui.hungerLabel'), state.hunger, MAX_HUNGER, 'hunger')}
              {renderStatusCard(t('games.animal-roleplay.ui.scoreLabel'), state.score, 120, 'score')}
            </div>

            {isPlaying && state.currentEvent ? (
              <div style={{
                border: '1px solid rgba(14, 165, 233, 0.45)',
                borderRadius: '0.9rem',
                padding: '1rem',
                background: 'rgba(15, 23, 42, 0.82)',
              }}>
                <div style={{ color: '#7dd3fc', fontSize: '0.82rem', marginBottom: '0.3rem' }}>
                  {t('games.animal-roleplay.ui.eventNow')}
                </div>
                <div style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 800 }}>
                  {t(`games.animal-roleplay.ui.events.${state.currentEvent.id}.title`)}
                </div>
                <p style={{ margin: '0.35rem 0 0', color: '#cbd5e1', lineHeight: 1.5 }}>
                  {t(`games.animal-roleplay.ui.events.${state.currentEvent.id}.description`)}
                </p>
              </div>
            ) : null}

            <div style={{
              border: '1px solid rgba(71, 85, 105, 0.65)',
              borderRadius: '0.9rem',
              padding: '1rem',
              background: 'rgba(2, 6, 23, 0.65)',
            }}>
              <div style={{ color: '#e2e8f0', fontWeight: 700, marginBottom: '0.55rem' }}>
                {t('games.animal-roleplay.ui.chooseAction')}
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '0.6rem',
              }}>
                {ACTION_DEFINITIONS.map((action) => (
                  <button
                    key={action.id}
                    onClick={() => handleAction(action.id)}
                    disabled={!isPlaying}
                    style={{
                      border: '1px solid rgba(56, 189, 248, 0.4)',
                      borderRadius: '0.7rem',
                      background: isPlaying ? 'rgba(14, 116, 144, 0.4)' : 'rgba(51, 65, 85, 0.45)',
                      color: isPlaying ? '#fff' : '#94a3b8',
                      cursor: isPlaying ? 'pointer' : 'not-allowed',
                      textAlign: 'left',
                      padding: '0.65rem 0.7rem',
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>
                      {t(`games.animal-roleplay.ui.actions.${action.id}.label`)}
                    </div>
                    <div style={{ marginTop: '0.2rem', fontSize: '0.75rem', lineHeight: 1.4 }}>
                      {t(`games.animal-roleplay.ui.actions.${action.id}.description`)}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{
              border: '1px solid rgba(71, 85, 105, 0.65)',
              borderRadius: '0.9rem',
              padding: '0.9rem',
              background: 'rgba(15, 23, 42, 0.82)',
            }}>
              <div style={{ color: '#e2e8f0', fontWeight: 700 }}>
                {t('games.animal-roleplay.ui.latestResult')}
              </div>
              <p style={{ margin: '0.35rem 0 0', color: '#cbd5e1', lineHeight: 1.5 }}>
                {latestResultText}
              </p>
            </div>

            <div style={{
              border: '1px solid rgba(71, 85, 105, 0.65)',
              borderRadius: '0.9rem',
              padding: '0.9rem',
              background: 'rgba(2, 6, 23, 0.65)',
            }}>
              <div style={{ color: '#e2e8f0', fontWeight: 700, marginBottom: '0.55rem' }}>
                {t('games.animal-roleplay.ui.logTitle')}
              </div>
              <div style={{ display: 'grid', gap: '0.55rem' }}>
                {recentLogs.length === 0 ? (
                  <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>
                    {t('games.animal-roleplay.ui.logEmpty')}
                  </p>
                ) : (
                  recentLogs.map(renderLogItem)
                )}
              </div>
            </div>

            {state.outcome ? (
              <div style={{
                border: '1px solid rgba(14, 165, 233, 0.45)',
                borderRadius: '1rem',
                padding: '1rem',
                background: 'rgba(8, 47, 73, 0.45)',
              }}>
                <h2 style={{ margin: 0, color: '#fff', fontSize: '1.25rem' }}>{outcomeTitle}</h2>
                <p style={{ margin: '0.45rem 0 0', color: '#cbd5e1', lineHeight: 1.5 }}>
                  {outcomeMessage}
                </p>
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
                  <button
                    onClick={handleReplay}
                    style={{
                      border: 'none',
                      borderRadius: '0.6rem',
                      background: '#0284c7',
                      color: '#fff',
                      cursor: 'pointer',
                      fontWeight: 800,
                      padding: '0.55rem 0.9rem',
                    }}
                  >
                    {t('games.animal-roleplay.ui.playAgain')}
                  </button>
                  <button
                    onClick={handleChangeAnimal}
                    style={{
                      border: '1px solid rgba(148, 163, 184, 0.8)',
                      borderRadius: '0.6rem',
                      background: 'transparent',
                      color: '#e2e8f0',
                      cursor: 'pointer',
                      fontWeight: 700,
                      padding: '0.55rem 0.9rem',
                    }}
                  >
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
              <li key={index} style={{ marginBottom: '0.35rem' }}>{step}</li>
            ))}
          </ul>

          <h3 style={{ color: '#fff', marginBottom: '0.5rem' }}>{t('games.features')}</h3>
          <ul style={{ marginTop: 0, paddingLeft: '1.25rem' }}>
            {features.map((feature, index) => (
              <li key={index} style={{ marginBottom: '0.35rem' }}>{feature}</li>
            ))}
          </ul>
        </div>
      </InfoModal>
    </div>
  );
}

export default AnimalRoleplay;
