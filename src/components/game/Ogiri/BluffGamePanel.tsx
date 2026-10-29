'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { BLUFF_MAX_LENGTH, GAME_TITLES, type Action, type RoomView } from '@/lib/ogiri/types';
import { normalizePlayerText } from '@/lib/ogiri/text';
import { AnimatedScore } from './AnimatedScore';
import { Character } from './Character';
import common from './Ogiri.module.css';
import party from './PartyGamePanel.module.css';
import styles from './BluffGamePanel.module.css';

function BluffAnswer({ view, disabled, send }: {
  view: RoomView;
  disabled: boolean;
  send: (action: Action) => Promise<boolean>;
}) {
  const bluff = view.bluffGame!;
  const mine = view.players.find(p => p.id === view.me);
  const key = `ogiri:bluff-draft:${view.code}:${view.game}:${view.round}`;
  const [text, setText] = useState(bluff.answer);
  const [saving, setSaving] = useState(false);
  const normalized = normalizePlayerText(text);
  const count = [...normalized].length;
  const dirty = normalized !== bluff.answer;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore unsent local Japanese input.
    setText(localStorage.getItem(key) ?? bluff.answer);
  }, [key, bluff.answer]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    if (await send({ type: 'partyAnswer', text })) {
      setText(normalized);
      localStorage.removeItem(key);
    }
    setSaving(false);
  }
  return (
    <div className={party.singleAnswer}>
      <form className={common.answerForm} onSubmit={submit} data-testid="bluff-answer-form">
        <label>
          もっともらしい、うその答え
          <textarea
            aria-label="うその答え"
            rows={2}
            maxLength={BLUFF_MAX_LENGTH * 2}
            placeholder="本当っぽい答えで、みんなをだまそう。"
            value={text}
            disabled={disabled || saving || Boolean(mine?.answerReady)}
            onChange={event => {
              setText(event.target.value);
              localStorage.setItem(key, event.target.value);
            }}
          />
        </label>
        <div className={common.row}>
          <small>{count} / {BLUFF_MAX_LENGTH}文字</small>
          <button className={common.primary} disabled={disabled || saving || Boolean(mine?.answerReady) || count < 1 || count > BLUFF_MAX_LENGTH}>
            {saving ? '送信中…' : bluff.answer && !dirty ? '送信済み ✓' : bluff.answer ? 'うそを更新' : 'このうそを送る'}
          </button>
        </div>
        <small>本当の答えを書いてしまったら、別のうそをお願いします。「これでOK！」までは直せます。</small>
      </form>
      {dirty && bluff.answer && <p>未送信の変更があります。先に「うそを更新」を押してね。</p>}
      {mine?.answerReady ? (
        <button className={common.secondary} disabled={disabled || saving} onClick={() => void send({ type: 'answerReady', ready: false })}>うそを直す</button>
      ) : (
        <button className={common.primary} disabled={disabled || saving || !bluff.answer || dirty} onClick={() => void send({ type: 'answerReady', ready: true })}>これでOK！</button>
      )}
    </div>
  );
}

export function BluffGamePanel({ view, tv, busy, connected, reduced, remaining, send }: {
  view: RoomView;
  tv: boolean;
  busy: boolean;
  connected: boolean;
  reduced: boolean;
  remaining: number;
  send: (action: Action) => Promise<boolean>;
}) {
  const bluff = view.bluffGame;
  if (!bluff || !['answering', 'voting', 'reveal'].includes(view.phase)) return null;
  const disabled = busy || view.paused || !connected;
  const answerers = view.players.filter(p => p.answeringThisRound);
  const result = bluff.result;
  const awards = result?.awards.filter(award => award.points > 0) ?? [];
  const player = (id: string) => view.players.find(p => p.id === id);
  return (
    <section className={`${party.panel} ${tv ? party.tv : ''}`} aria-label={GAME_TITLES.bluff}>
      <p className={common.eyebrow}>{GAME_TITLES.bluff} · 問題 {bluff.index} / {bluff.total}</p>
      <h2 className={party.prompt}>{bluff.prompt}</h2>
      {view.phase === 'answering' ? <>
        {!tv && bluff.answerRequired ? (
          <BluffAnswer key={`${view.game}:${view.round}`} view={view} disabled={disabled} send={send} />
        ) : (
          <div className={party.answerWait}>
            <p>スマホで本当っぽい「うその答え」を書いて「これでOK！」。本当の答えは最後に発表します。</p>
            <div className={common.playerGrid}>
              {answerers.map(p => <article className={common.player} key={p.id}>
                <Character avatar={p.avatar} size="large" />
                <b>{p.name}</b>
                <small>{!p.active ? 'お休み中' : p.answerReady ? 'OK！ ✓' : p.answered ? '送信済み' : 'うそ考え中…'}</small>
              </article>)}
            </div>
          </div>
        )}
        <div className={common.readyBar} aria-label="回答の確定状況">
          <p role="status"><b>{bluff.readyCount} / {bluff.answererCount}人がOK！</b> 全員のうそがそろうのを待っています。</p>
          <small>目安時間を過ぎても書けます。{view.settings.autoAdvance ? '全員OKで、本当の答えをまぜて出します。' : '全員OKのあと、主催者が進めます。'}</small>
          {!tv && view.isHost && bluff.answererCount > 0 && bluff.readyCount === bluff.answererCount && !view.settings.autoAdvance && (
            <button className={common.primary} disabled={disabled} onClick={() => void send({ type: 'next' })}>答え選びへ進む →</button>
          )}
        </div>
      </> : <>
        {view.phase === 'voting' && <p className={party.voteHelp} role="status">
          {bluff.voted ? '投票済み。みんなが選ぶのを待っています。' : !bluff.canVote ? '本当の答えは、参加者のスマホから選んでね。' : 'この中に本当の答えがひとつだけ。どれだと思う？'}
        </p>}
        {view.phase === 'reveal' && result && <p className={styles.truthLine} data-testid="bluff-truth">
          本当の答えは <b>{bluff.options.find(option => option.id === result.truth)?.label}</b>
        </p>}
        <div className={party.options} data-testid="bluff-options">
          {bluff.options.map((option, index) => {
            const truth = result?.truth === option.id;
            const own = bluff.mine === option.id;
            const authors = (result?.authors[option.id] ?? []).map(player).filter(p => p !== undefined);
            const content = <>
              <span className={party.optionLetter}>{String.fromCharCode(65 + index)}</span>
              <b>{option.label}</b>
              {own && !result && <small>あなたのうそ</small>}
              {result && <small>
                {result.counts[option.id] ?? 0}票 · {truth ? '本当の答え！' : authors.length ? `うそ: ${authors.map(p => p.name).join('・')}` : 'うそ'}
              </small>}
              {result && authors.length > 0 && <span className={styles.authors}>
                {authors.map(p => <Character key={p.id} avatar={p.avatar} />)}
              </span>}
            </>;
            return !tv && bluff.canVote && view.phase === 'voting' && !own ? (
              <button key={option.id} className={party.optionCard} disabled={disabled || bluff.voted || remaining === 0}
                aria-label={`${option.label}が本当だと思う`}
                onClick={() => void send({ type: 'partyVote', choice: option.id })}>{content}</button>
            ) : <article key={option.id} className={`${party.optionCard} ${truth ? party.winner : ''} ${own && !result ? styles.own : ''}`}>{content}</article>;
          })}
        </div>
        {view.phase === 'reveal' ? <>
          <h3 className={party.awardHeading}>見抜いた人も、だました人も。</h3>
          <div className={party.awards} aria-label="今回の獲得ポイント">
            {awards.length ? awards.map(award => {
              const p = player(award.id);
              return <article key={award.id}>
                {p && <Character avatar={p.avatar} />}
                <b>{p?.name ?? '退出したプレイヤー'}</b>
                <strong>+<AnimatedScore value={award.points} animate={!reduced} /> 点</strong>
              </article>;
            }) : <p>今回は得点なし。次の問題でどうぞ。</p>}
          </div>
          {result && <p className={styles.source}>
            出典: <a href={result.sourceUrl} target="_blank" rel="noopener noreferrer">{decodeURI(result.sourceUrl).replace(/^https:\/\//, '')}</a>
          </p>}
        </> : <p className={party.voteStatus} aria-live="polite">{bluff.votesReceived} / {bluff.eligible} 人が投票済み</p>}
      </>}
    </section>
  );
}
