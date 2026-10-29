'use client';

import { useState, type FormEvent } from 'react';
import { GAME_TITLES, type Action, type RoomView } from '@/lib/ogiri/types';
import { normalizePlayerText } from '@/lib/ogiri/text';
import { WOLF_POINTS } from '@/lib/ogiri/word-wolf';
import { AnimatedScore } from './AnimatedScore';
import { Character } from './Character';
import common from './Ogiri.module.css';
import party from './PartyGamePanel.module.css';
import styles from './WordWolfPanel.module.css';

function LastGuess({ disabled, send }: { disabled: boolean; send: (action: Action) => Promise<boolean> }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const count = [...normalizePlayerText(text)].length;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    await send({ type: 'partyAnswer', text });
    setSaving(false);
  }
  return (
    <form className={common.answerForm} onSubmit={submit} data-testid="wordwolf-guess-form">
      <label>
        市民のお題は？（1回だけ）
        <input aria-label="市民のお題" maxLength={60} autoComplete="off" value={text}
          disabled={disabled || saving} onChange={event => setText(event.target.value)} />
      </label>
      <button className={common.primary} disabled={disabled || saving || count < 1 || count > 30}>
        {saving ? '送信中…' : 'これで逆転をねらう'}
      </button>
    </form>
  );
}

export function WordWolfPanel({ view, tv, busy, connected, reduced, remaining, send }: {
  view: RoomView;
  tv: boolean;
  busy: boolean;
  connected: boolean;
  reduced: boolean;
  remaining: number;
  send: (action: Action) => Promise<boolean>;
}) {
  const game = view.wordWolfGame;
  if (!game || !['answering', 'voting', 'reveal'].includes(view.phase)) return null;
  const disabled = busy || view.paused || !connected;
  const mine = view.players.find(p => p.id === view.me);
  const talkers = view.players.filter(p => p.answeringThisRound);
  const result = game.result;
  const myWord = !tv && game.myWord && (
    <div className={styles.wordCard} data-testid="wordwolf-my-word">
      <small>あなたのお題</small>
      <strong>{game.myWord}</strong>
    </div>
  );
  return (
    <section className={`${party.panel} ${tv ? party.tv : ''}`} aria-label={GAME_TITLES.wordwolf}>
      <p className={common.eyebrow}>{GAME_TITLES.wordwolf} · ラウンド {view.round} / {view.settings.rounds} · ウルフ {game.wolfCount}人</p>
      {view.phase === 'answering' && <>
        {myWord}
        <h2 className={party.prompt}>{tv || !game.myWord ? 'スマホでお題を見て、話し合おう。' : 'お題の名前は言わずに、話し合おう。'}</h2>
        <p className={styles.hint}>ひとりだけ{game.wolfCount > 1 ? '（今回は2人）' : ''}、少しちがうお題の「ウルフ」がいます。自分がウルフかどうかは、だれにも分かりません。</p>
        {!tv && game.myWord && (mine?.answerReady ? (
          <button className={common.secondary} disabled={disabled} onClick={() => void send({ type: 'answerReady', ready: false })}>まだ話したい</button>
        ) : (
          <button className={common.primary} disabled={disabled} onClick={() => void send({ type: 'answerReady', ready: true })}>話し合いOK、投票へ</button>
        ))}
        <div className={common.playerGrid}>
          {talkers.map(player => <article className={common.player} key={player.id}>
            <Character avatar={player.avatar} size="large" />
            <b>{player.name}</b>
            <small>{!player.active ? 'お休み中' : player.answerReady ? 'OK！ ✓' : '話し中…'}</small>
          </article>)}
        </div>
        <div className={common.readyBar} aria-label="話し合いの状況">
          <p role="status"><b>{game.readyCount} / {game.playerCount}人がOK！</b> {view.settings.autoAdvance ? '時間切れか全員OKで投票へ。' : '主催者が投票へ進めます。'}</p>
          {!tv && view.isHost && game.playerCount > 0 && game.readyCount === game.playerCount && !view.settings.autoAdvance && (
            <button className={common.primary} disabled={disabled} onClick={() => void send({ type: 'next' })}>投票へ進む →</button>
          )}
        </div>
      </>}
      {view.phase === 'voting' && <>
        {myWord}
        <h2 className={party.prompt}>ウルフは、だれだ。</h2>
        <p className={party.voteHelp} role="status">
          {game.voted ? '投票済み。みんなの投票を待っています。' : game.canVote ? 'ウルフだと思う人を1人選んでね。自分には投票できません。' : '投票は参加者のスマホからどうぞ。'}
        </p>
        {!tv && game.canVote ? <div className={`${party.options} ${party.peopleOptions}`}>
          {game.options.filter(option => option.id !== view.me).map(option =>
            <button key={option.id} className={party.optionCard} disabled={disabled || remaining === 0}
              aria-label={`${option.name}がウルフだと思う`}
              onClick={() => void send({ type: 'partyVote', choice: option.id })}>
              <Character avatar={option.avatar} size="medium" />
              <b>{option.name}</b>
            </button>)}
        </div> : <div className={`${party.options} ${party.peopleOptions}`}>
          {game.options.map(option => <article key={option.id} className={party.optionCard}>
            <Character avatar={option.avatar} size="medium" />
            <b>{option.name}</b>
          </article>)}
        </div>}
        <p className={party.voteStatus} aria-live="polite">{game.votesReceived} / {game.eligible} 人が投票済み</p>
      </>}
      {view.phase === 'reveal' && game.guessing && <>
        {myWord}
        <div className={styles.accused} key="caught">
          {game.accused && <Character avatar={game.accused.avatar} size="hero" />}
          <h2 className={party.prompt}>{game.accused?.name ?? 'ウルフ'}は… ウルフでした！</h2>
          <p className={styles.hint}>{game.accused?.votes ?? 0}票で発見。でも最後のチャンス。市民のお題を当てたら逆転です。</p>
        </div>
        {!tv && game.canGuess ? <LastGuess disabled={disabled} send={send} />
          : <p className={party.voteHelp} role="status">{game.accused?.name ?? 'ウルフ'}が市民のお題を推理中…</p>}
      </>}
      {view.phase === 'reveal' && result && <>
        <h2 className={party.prompt} key="result">{result.winner === 'citizens' ? '市民の勝ち！' : 'ウルフの勝ち！'}</h2>
        <div className={styles.words}>
          <div className={styles.wordCard}><small>市民のお題</small><strong>{result.citizenWord}</strong></div>
          <div className={`${styles.wordCard} ${styles.wolfCard}`}>
            <small>ウルフのお題</small><strong>{result.wolfWord}</strong>
            <span className={styles.wolves}>{result.wolves.map(wolf => <span key={wolf.id}><Character avatar={wolf.avatar} /> {wolf.name}</span>)}</span>
          </div>
        </div>
        <p className={styles.hint}>
          {game.accused ? `いちばん疑われたのは${game.accused.name}（${game.accused.votes}票）。${game.accused.isWolf ? '' : '市民でした。'}` : '票が割れて、だれも選ばれませんでした。'}
          {result.guess && ` 最後の推理「${result.guess}」は${result.guessCorrect ? '正解で逆転！' : '不正解。'}`}
        </p>
        {!tv && game.canAccept && (
          <button className={common.secondary} disabled={disabled} onClick={() => {
            if (window.confirm(`「${result.guess}」を市民のお題と同じとみなして、ウルフの逆転にしますか？`))
              void send({ type: 'wolfAccept' });
          }}>この推理を正解にする（主催者）</button>
        )}
        {game.counts && <div className={`${party.options} ${party.peopleOptions}`} aria-label="疑われた票">
          {view.players.filter(p => Object.hasOwn(game.counts!, p.id)).map(player =>
            <article key={player.id} className={`${party.optionCard} ${result.wolves.some(wolf => wolf.id === player.id) ? party.winner : ''}`}>
              <Character avatar={player.avatar} size="medium" />
              <b>{player.name}</b>
              <small>{game.counts![player.id]}票{result.wolves.some(wolf => wolf.id === player.id) && ' · ウルフ'}</small>
            </article>)}
        </div>}
        <h3 className={party.awardHeading}>
          {result.winner === 'citizens' ? `市民に各${WOLF_POINTS.caught}点、ウルフに投票した市民に+${WOLF_POINTS.detective}点。` : `ウルフに各${WOLF_POINTS.escape}点。ウルフに投票した市民にも+${WOLF_POINTS.detective}点。`}
        </h3>
        <div className={party.awards} aria-label="今回の獲得ポイント">
          {result.awards.length ? result.awards.map(award => {
            const player = view.players.find(p => p.id === award.id);
            return <article key={award.id}>
              {player && <Character avatar={player.avatar} />}
              <b>{player?.name ?? '退出したプレイヤー'}</b>
              <strong>+<AnimatedScore value={award.points} animate={!reduced} /> 点</strong>
            </article>;
          }) : <p>今回は得点なし。次のラウンドでどうぞ。</p>}
        </div>
      </>}
    </section>
  );
}
