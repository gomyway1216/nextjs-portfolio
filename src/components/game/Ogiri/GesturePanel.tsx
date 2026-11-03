'use client';

import { useState, type CSSProperties } from 'react';
import { GESTURE_POINTS, GESTURE_SECONDS } from '@/lib/ogiri/gesture';
import { GAME_TITLES, type Action, type GestureView, type RoomView } from '@/lib/ogiri/types';
import { AnimatedScore } from './AnimatedScore';
import { Character } from './Character';
import common from './Ogiri.module.css';
import party from './PartyGamePanel.module.css';
import styles from './GesturePanel.module.css';

/** The actor's phone: the word, and two big buttons that work without looking. */
function Acting({ game, disabled, send }: { game: GestureView; disabled: boolean; send: (action: Action) => Promise<boolean> }) {
  const [picking, setPicking] = useState(false);
  if (picking) return <div className={styles.picker}>
    <h2>だれが当てた？</h2>
    <div className={styles.guessers}>
      {game.guessers.map(player => <button type="button" key={player.id} className={styles.guesser} disabled={disabled} aria-label={`${player.name}が当てた`}
        onClick={async () => { if (await send({ type: 'gestureCorrect', by: player.id, word: game.dealt })) setPicking(false); }}>
        <Character avatar={player.avatar} size="large" /><b>{player.name}</b>
      </button>)}
    </div>
    <button type="button" className={common.secondary} onClick={() => setPicking(false)}>やめる</button>
  </div>;
  return <div className={styles.acting}>
    <div className={styles.wordCard} data-testid="gesture-word">
      <small>お題（声と文字は禁止！）</small>
      <strong key={game.word}>{game.word}</strong>
    </div>
    <div className={styles.actions}>
      <button type="button" className={`${common.primary} ${styles.correct}`} disabled={disabled || !game.guessers.length}
        onClick={() => setPicking(true)}>当たった！</button>
      <button type="button" className={`${common.secondary} ${styles.pass}`} disabled={disabled}
        onClick={() => void send({ type: 'gesturePass', word: game.dealt })}>パス</button>
    </div>
  </div>;
}

function Solved({ game }: { game: GestureView }) {
  if (!game.solved.length) return <p className={styles.empty}>まだ正解なし。どんどん声に出して！</p>;
  return <ol className={styles.solved} aria-label="当たったお題">
    {game.solved.map((entry, i) => <li key={`${i}:${entry.word}`}>
      <b>{entry.word}</b><span><Character avatar={entry.avatar} /> {entry.name}</span>
    </li>)}
  </ol>;
}

export function GesturePanel({ view, tv, busy, connected, reduced, send }: {
  view: RoomView; tv: boolean; busy: boolean; connected: boolean; reduced: boolean; send: (action: Action) => Promise<boolean>;
}) {
  const game = view.gestureGame;
  if (!game || !['answering', 'reveal'].includes(view.phase)) return null;
  const disabled = busy || view.paused || !connected;
  const { actor, result } = game;
  return <section className={`${party.panel} ${styles.panel} ${tv ? styles.tv : ''} ${reduced ? '' : styles.motion}`} aria-label={GAME_TITLES.gesture}>
    <p className={common.eyebrow}>{GAME_TITLES.gesture} · {game.index} / {game.total}人目</p>
    {result ? <>
      <h2>{actor.name}さんの番、おしまい！</h2>
      <p className={styles.score}><b>正解 {game.solved.length}</b> · パス {game.passes}</p>
      <ol className={styles.results} aria-label="このターンのお題">
        {result.words.map((entry, i) => <li key={`${i}:${entry.word}`} className={entry.name ? undefined : styles.missed} style={{ '--i': i } as CSSProperties}>
          <b>{entry.word}</b>
          <span>{entry.name ? <><Character avatar={entry.avatar} /> {entry.name}が正解</> : 'パス'}</span>
        </li>)}
        {result.last && <li className={styles.missed} style={{ '--i': result.words.length } as CSSProperties}><b>{result.last}</b><span>時間切れ</span></li>}
      </ol>
      {result.awards.length > 0 && <p className={styles.awards}>{result.awards.map(entry => {
        const player = view.players.find(p => p.id === entry.id);
        return player && <span key={entry.id}><Character avatar={player.avatar} /> {player.name} +<AnimatedScore value={entry.points} animate={!reduced} /></span>;
      })}</p>}
    </> : !game.started ? <div className={tv ? common.wait : styles.ready}>
      <div className={styles.actor}><Character avatar={actor.avatar} size="large" /></div>
      <h2>{game.mine ? 'あなたの番！' : `次は${actor.name}さんの番！`}</h2>
      {game.mine ? <>
        <p>テレビの前に立って、準備ができたら押してね。お題はこのスマホにだけ出ます。</p>
        <button type="button" className={`${common.primary} ${styles.start}`} disabled={disabled || !game.canStart}
          onClick={() => void send({ type: 'gestureStart' })}>スタート！（{GESTURE_SECONDS}秒）</button>
      </> : <p>{actor.name}さんがスマホのスタートを押すと、{GESTURE_SECONDS}秒の早当てが始まります。</p>}
    </div> : game.mine && !tv ? <>
      {/* A new word closes an open picker, even when the tap that dealt it got no reply. */}
      <Acting key={game.dealt} game={game} disabled={disabled} send={send} />
      <p className={styles.score}><b>正解 {game.solved.length}</b> · パス {game.passes}</p>
    </> : <>
      <div className={styles.stage}>
        <div className={styles.actor}><Character avatar={actor.avatar} size="large" /></div>
        <div>
          <h2>{actor.name}さんのジェスチャー、なーんだ？</h2>
          <p>わかったら大きな声で！ 当てた人に{GESTURE_POINTS.guesser}点、演じた人に{GESTURE_POINTS.actor}点。</p>
        </div>
      </div>
      <p className={styles.score}><b>正解 {game.solved.length}</b> · パス {game.passes}</p>
      <Solved game={game} />
    </>}
  </section>;
}
