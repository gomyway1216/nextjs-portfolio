'use client';
import { useEffect, useRef, useState } from 'react';
import { partyPointsForRank, partyStandings } from '@/lib/party/points';
import type { RoomView } from '@/lib/ogiri/types';
import { Character } from './Character';
import styles from './Ogiri.module.css';

export function PartyResults({ view }: { view: RoomView }) {
  const [mode, setMode] = useState<'game' | 'party'>('game');
  const [page, setPage] = useState(0);
  const [spotlight, setSpotlight] = useState<'mvp' | 'climber' | 'answer' | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const finished = view.phase === 'finished';
  const overall = partyStandings(
    (view.partyPlayers ?? view.players).map((p) => {
      const current = view.players.find((player) => player.id === p.id);
      return {
        ...p,
        rank: current?.rank ?? 0,
        score: current?.score ?? 0,
        previousRank: current?.previousRank ?? 0,
        roundScore: current?.roundScore ?? 0,
        playingThisGame: current?.playingThisGame ?? Boolean(current),
        partyPoints: (p.partyPoints ?? 0) + (finished || current?.playingThisGame === false
          ? 0 : partyPointsForRank(current?.rank ?? 0)),
      };
    }),
  );
  const rows = mode === 'party' ? overall : view.players.filter((p) => p.playingThisGame !== false);
  const pages = Math.max(1, Math.ceil(rows.length / 12));
  const currentPage = Math.min(page, pages - 1);
  const visibleRows = rows.slice(currentPage * 12, currentPage * 12 + 12);
  const mvps = view.players.filter((p) => view.highlights?.roundMvps.includes(p.id));
  const best = view.highlights?.bestAnswer;
  const climber = view.highlights?.climbers[0];
  const climberPlayer = view.players.find((p) => p.id === climber?.id);
  useEffect(() => {
    if (spotlight && !dialog.current?.open) dialog.current?.showModal();
  }, [spotlight]);
  return (
    <>
      <div className={styles.resultTabs} role="group" aria-label="順位の切り替え">
        <button
          aria-pressed={mode === 'game'}
          onClick={() => {
            setMode('game');
            setPage(0);
          }}
        >
          このゲーム
        </button>
        <button
          aria-pressed={mode === 'party'}
          onClick={() => {
            setMode('party');
            setPage(0);
          }}
        >
          パーティー総合{!finished && '（暫定）'}
        </button>
        <small>{view.partyGames ?? 0}ゲーム終了 · 1位10 / 2位7 / 3位5 / ほか3pt</small>
        {pages > 1 && (
          <button aria-label="次の順位ページ" onClick={() => setPage((currentPage + 1) % pages)}>
            次の順位へ → {currentPage + 1}/{pages}
          </button>
        )}
      </div>
      <div className={styles.highlights}>
        <button disabled={!mvps.length} onClick={() => setSpotlight('mvp')}>
          <span>ROUND MVP</span>
          <b>
            {mvps[0]?.name ?? '次の一言に期待！'}
            {mvps.length > 1 && ` ほか${mvps.length - 1}人`}
          </b>
          <small>{mvps[0] ? `今回 +${mvps[0].roundScore}点` : '得点が入ると発表します'}</small>
        </button>
        <button disabled={!climberPlayer} onClick={() => setSpotlight('climber')}>
          <span>追い上げスター</span>
          <b>{climberPlayer?.name ?? 'ここからが勝負！'}</b>
          <small>{climber ? `${climber.places}ランクアップ ↑` : '順位の変化をお楽しみに'}</small>
        </button>
        <button disabled={!best} onClick={() => setSpotlight('answer')}>
          <span>ベスト一言</span>
          <b>{best?.author ?? '次のお題に期待！'}</b>
          <small>
            {best ? `${best.votes}票を集めた回答を見る ↗` : '得票した回答がここに登場'}
          </small>
        </button>
      </div>
      <div
        className={styles.rankGrid}
        aria-label={mode === 'party' ? 'パーティー総合順位' : 'このゲームの順位'}
      >
        {visibleRows.map((p) => {
          const rank = mode === 'party' && 'partyRank' in p ? Number(p.partyRank) : p.rank;
          const points = mode === 'party' ? (p.partyPoints ?? 0) : p.score;
          return (
            <article className={`${styles.rankRow} ${rank <= 3 ? styles.topRank : ''}`} key={p.id}>
              <b>{rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}</b>
              <span className={styles.rankName}>
                <Character avatar={p.avatar} /> {p.name}
                <small>
                  {mode === 'party'
                    ? `${finished ? '今回' : '暫定'} +${finished ? (p.partyEarned ?? 0) : p.playingThisGame === false ? 0 : partyPointsForRank(p.rank)}pt`
                    : `${p.previousRank > p.rank ? `↑${p.previousRank - p.rank}` : p.previousRank < p.rank ? `↓${p.rank - p.previousRank}` : '→'} 今回 +${p.roundScore}`}
                </small>
              </span>
              <strong>
                {points}
                <small>{mode === 'party' ? 'pt' : '点'}</small>
              </strong>
            </article>
          );
        })}
      </div>
      <dialog
        ref={dialog}
        aria-label="ゲームのハイライト発表"
        className={styles.spotlightDialog}
        onClose={() => setSpotlight(null)}
      >
        <button
          className={styles.spotlightClose}
          onClick={() => dialog.current?.close()}
          aria-label="発表を閉じる"
        >
          閉じる ×
        </button>
        {spotlight === 'answer' && best && (
          <>
            <p className={styles.eyebrow}>このゲームのベスト一言 · {best.votes}票</p>
            <h2>{best.text}</h2>
            <p className={styles.spotlightAnswer}>{best.answer}</p>
            <Character avatar={best.avatar} size="hero" />
            <h3>{best.author}</h3>
            <strong>+{best.points}点</strong>
          </>
        )}
        {spotlight === 'mvp' && (
          <>
            <p className={styles.eyebrow}>このラウンドで最も得点したのは…</p>
            <h2>ROUND MVP！</h2>
            <div className={styles.spotlightWinners}>
              {mvps.map((p) => (
                <div key={p.id}>
                  <Character avatar={p.avatar} size="hero" crowned />
                  <h3>{p.name}</h3>
                  <strong>+{p.roundScore}点</strong>
                </div>
              ))}
            </div>
          </>
        )}
        {spotlight === 'climber' && climberPlayer && (
          <>
            <p className={styles.eyebrow}>勢いに乗ってきた！</p>
            <h2>{climber?.places}ランクアップ！</h2>
            <Character avatar={climberPlayer.avatar} size="hero" />
            <h3>{climberPlayer.name}</h3>
            <p>
              前回 {climberPlayer.previousRank}位 → 現在 {climberPlayer.rank}位
            </p>
          </>
        )}
      </dialog>
    </>
  );
}
