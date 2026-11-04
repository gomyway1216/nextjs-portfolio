'use client';

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { GAME_TITLES, MATCH_MAX_LENGTH, type Action, type GameType, type RoomView } from '@/lib/ogiri/types';
import { clearDraft, loadDraft, saveDraft } from '@/lib/ogiri/drafts';
import { normalizePlayerText } from '@/lib/ogiri/text';
import { AnimatedScore } from './AnimatedScore';
import { Character } from './Character';
import { MysteryCharacter } from './MysteryCharacter';
import common from './Ogiri.module.css';
import styles from './PartyGamePanel.module.css';
import { ThermometerEnds, ThermometerScale, ThermometerVote } from './Thermometer';

export const GAME_RULES: Record<GameType, string> = {
  ogiri: '2つのお題にボケて、作者以外が投票。1票100点、勝ったら追加で200点。',
  majority: '全員が同じ選択肢から1つ選びます。最多票の側に入れば100点。同率最多でも得点！',
  identity: '同じお題に1人1回答。匿名のひとことを見て作者を当てます。正解100点、作者は外された票1つにつき50点。',
  match: 'お題に全員がせーので答えを1つ。同じ答えの人が1人いるごとに100点、全員一致なら全員にボーナス100点！',
  drawing: '絵→言葉→絵と、みんなで同時に伝言。最後に答え合わせして、好きな絵に1票100点！',
  shiritori: '前の人の絵だけを見て、続きの言葉を絵に描きます。つながったら描いた2人に100点ずつ、最後に好きな絵へ1票100点！',
  quiz: 'みんなが同時にお題を絵に描き、1枚ずつ4択で当てっこ。当てたら100点、描いた人は1人当たるごとに50点！',
  gesture: '演じる人だけがお題を見て、60秒で声と文字なしに伝えます。当てた人に100点、演じた人に1つ50点。全員1回ずつ演じます！',
  minority: '全員が同じ選択肢から1つ選びます。選ばれた中で一番少ない側なら100点。全部同数なら全員0点。',
  thermometer: 'お題に0〜100度でこっそり回答。みんなの平均に一番近い人100点、2番目50点、3番目25点！',
  wordwolf: 'ひとりだけ少しちがうお題の「ウルフ」を、話し合いで探します。見つけたら市民に100点、逃げ切ればウルフに300点。見つかったウルフは市民のお題を当てれば逆転！',
  bluff: '本当の答えがある問題に、全員がもっともらしいうそを書きます。本物を見抜けば100点、自分のうそに1人だまされるごとに50点。',
};
const VOTE_HELP: Partial<Record<GameType, string>> = {
  identity: 'これを書いたのは？ 名前とキャラから選んでね。',
  minority: 'どれにする？ みんなが選ばなそうな方へ！',
  thermometer: 'みんなの平均は何度？ 平均に近づけて送ってね。',
};
const AWARD_HEADING: Partial<Record<GameType, string>> = {
  match: 'ハモった人、得点です。',
  majority: '多数派のみなさん、得点です。',
  minority: '少数派のみなさん、得点です。',
  thermometer: '平均に近かった人、得点です。',
};

export function PartyGamePicker({ value, onChange }: { value: GameType; onChange: (value: GameType) => void }) {
  return (
    <label className={styles.picker}>
      遊ぶゲーム
      <select aria-label="遊ぶゲーム" value={value} onChange={e => onChange(e.target.value as GameType)}>
        {Object.entries(GAME_TITLES).map(([type, title]) => <option key={type} value={type}>{title}</option>)}
      </select>
      <small>{GAME_RULES[value]}</small>
    </label>
  );
}

function IdentityAnswer({ view, disabled, offline, send }: {
  view: RoomView;
  disabled: boolean;
  offline: boolean;
  send: (action: Action) => Promise<boolean>;
}) {
  const side = view.sideGame!;
  const match = side.type === 'match';
  const max = match ? MATCH_MAX_LENGTH : 100;
  const mine = view.players.find(p => p.id === view.me);
  const key = `ogiri:party-draft:${view.code}:${view.game}:${view.round}`;
  const [text, setText] = useState(side.answer);
  const [saving, setSaving] = useState(false);
  const normalized = normalizePlayerText(text);
  const count = [...normalized].length;
  const dirty = normalized !== side.answer;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore unsent local Japanese input.
    setText(loadDraft(key) ?? side.answer);
  }, [key, side.answer]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    if (await send({ type: 'partyAnswer', text })) {
      setText(normalized);
      clearDraft(key);
    }
    setSaving(false);
  }
  return (
    <div className={styles.singleAnswer}>
      <form className={common.answerForm} onSubmit={submit} data-testid="party-answer-form">
        <label>
          {match ? 'あなたの答え' : 'あなたのひとこと'}
          <textarea
            aria-label={match ? 'あなたの答え' : 'あなたのひとこと'}
            rows={match ? 1 : 3}
            maxLength={max * 2}
            placeholder={match ? 'ひらがなで書くとハモりやすいよ。' : '名前は書かずに、ひとことどうぞ。'}
            value={text}
            disabled={disabled || saving || Boolean(mine?.answerReady)}
            onChange={event => {
              setText(event.target.value);
              saveDraft(key, event.target.value);
            }}
          />
        </label>
        <div className={common.row}>
          <small>{count} / {max}文字</small>
          <button className={common.primary} disabled={disabled || offline || saving || Boolean(mine?.answerReady) || count < 1 || count > max}>
            {saving ? '送信中…' : side.answer && !dirty ? '送信済み ✓' : side.answer ? '回答を更新' : 'この回答を送る'}
          </button>
        </div>
        <small>送ったあとも「これでOK！」を押すまで直せます。下書きはこの端末に保存します。</small>
      </form>
      {dirty && side.answer && <p>未送信の変更があります。先に「回答を更新」を押してね。</p>}
      {mine?.answerReady ? (
        <button className={common.secondary} disabled={disabled || offline || saving} onClick={() => void send({ type: 'answerReady', ready: false })}>回答を直す</button>
      ) : (
        <button className={common.primary} disabled={disabled || offline || saving || !side.answer || dirty} onClick={() => void send({ type: 'answerReady', ready: true })}>これでOK！</button>
      )}
    </div>
  );
}

export function PartyGamePanel({ view, tv, busy, connected, reduced, remaining, send }: {
  view: RoomView;
  tv: boolean;
  busy: boolean;
  connected: boolean;
  reduced: boolean;
  remaining: number;
  send: (action: Action) => Promise<boolean>;
}) {
  const side = view.sideGame;
  if (!side || !['answering', 'voting', 'reveal'].includes(view.phase)) return null;
  const held = busy || view.paused;
  const disabled = held || !connected;
  const answerers = view.players.filter(p => p.answeringThisRound);
  const author = side.result?.correctOption ? view.players.find(p => p.id === side.result?.correctOption) : null;
  const maxVotes = Math.max(0, ...Object.values(side.result?.counts ?? {}));
  const picked = Object.values(side.result?.counts ?? {}).filter(count => count > 0);
  const fewest = picked.length && Math.min(...picked) < maxVotes ? Math.min(...picked) : 0;
  const awards = side.result?.awards.filter(award => award.points > 0) ?? [];
  return (
    <section className={`${styles.panel} ${tv ? styles.tv : ''}`} aria-label={GAME_TITLES[side.type]}>
      <p className={common.eyebrow}>{GAME_TITLES[side.type]} · {side.type === 'identity' && view.phase !== 'answering' ? `ひとこと ${side.index} / ${side.total}` : `お題 ${view.round} / ${view.settings.rounds}`}</p>
      <h2 className={styles.prompt}>{side.prompt}</h2>
      {side.type === 'thermometer' && view.phase === 'voting' && (tv || !side.canVote || side.voted) && <ThermometerEnds side={side} />}
      {side.type === 'thermometer' && view.phase === 'voting' && !tv && side.canVote && !side.voted &&
        <ThermometerVote key={`${view.game}:${view.round}`} side={side} disabled={disabled || remaining === 0} send={send} />}
      {side.type === 'thermometer' && view.phase === 'reveal' && <ThermometerScale side={side} />}
      {view.phase === 'answering' ? <>
        {!tv && side.answerRequired ? (
          <IdentityAnswer key={`${view.game}:${view.round}`} view={view} disabled={held} offline={!connected} send={send} />
        ) : (
          <div className={styles.answerWait}>
            <p>{side.type === 'match' ? 'スマホで答えを送ったら「これでOK！」。みんなとハモるかな？' : 'スマホで1つ送ったら「これでOK！」。名前はまだ内緒。'}</p>
            <div className={common.playerGrid}>
              {answerers.map(player => <article className={common.player} key={player.id}>
                <Character avatar={player.avatar} size="large" />
                <b>{player.name}</b>
                <small>{!player.active ? 'お休み中' : player.answerReady ? 'OK！ ✓' : player.answered ? '送信済み' : '考え中…'}</small>
              </article>)}
            </div>
          </div>
        )}
        <div className={common.readyBar} aria-label="回答の確定状況">
          <p role="status"><b>{side.readyCount} / {side.answererCount}人がOK！</b> 全員の回答確定を待っています。</p>
          <small>目安時間を過ぎても回答できます。{view.settings.autoAdvance ? side.type === 'match' ? '全員OKで答え合わせへ。' : '全員OKで作者当てへ。' : '全員OKのあと、主催者が進めます。'}</small>
          {!tv && view.isHost && side.answererCount > 0 && side.readyCount === side.answererCount && !view.settings.autoAdvance && (
            <button className={common.primary} disabled={disabled} onClick={() => void send({ type: 'next' })}>{side.type === 'match' ? '答え合わせへ →' : '作者当てへ進む →'}</button>
          )}
        </div>
      </> : <>
        {side.type === 'identity' && <div className={styles.speech} key={`${view.game}:${view.round}:${side.index}`}>
          <blockquote className={`${styles.quote} ${side.revealText && [...side.revealText].length > 60 ? styles.longQuote : ''}`} data-testid="party-anonymous-answer">{side.revealText ?? '今回はパス！'}</blockquote>
          <div className={styles.speaker} key={side.result ? 'revealed' : 'masked'} data-testid="party-speaker">
            {side.result && author ? <Character avatar={author.avatar} size="large" /> : <MysteryCharacter size="large" />}
            <b>{side.result ? author?.name ?? '退出したプレイヤー' : '？？？'}</b>
          </div>
        </div>}
        {view.phase === 'voting' && <p className={styles.voteHelp} role="status">
          {side.voted ? '投票済み。みんなの予想を待っています。' : side.isAuthor ? 'あなたが書いたひとことです。今回はみんなの予想を待とう。' : view.resting ? '休憩中なので、今回の投票はお休みです。' : !side.canVote ? '投票は参加者のスマホからどうぞ。' : VOTE_HELP[side.type] ?? 'どれにする？ みんなが選びそうな方へ！'}
        </p>}
        {side.type === 'identity' && view.phase === 'reveal' && <p className={styles.identityAccuracy}>
          正解 {side.result?.counts[side.result.correctOption ?? ''] ?? 0} / {side.votesReceived}票
        </p>}
        {side.type === 'match' && view.phase === 'reveal' && <div className={styles.matchGroups} aria-label="みんなの答え">
          {(side.result?.groups ?? []).filter(group => group.ids.length).map((group, i) => <article key={`${i}:${group.label}`}
            className={`${styles.matchGroup} ${group.ids.length > 1 ? styles.matched : ''}`} style={{ '--i': i } as CSSProperties}>
            <b>{group.label}</b>
            <span>{group.ids.length > 1 ? `${group.ids.length}人がハモった！` : 'ひとりだけ'}</span>
            <ul>{group.ids.map(id => {
              const player = view.players.find(p => p.id === id);
              return player && <li key={id}><Character avatar={player.avatar} /> {player.name}</li>;
            })}</ul>
          </article>)}
        </div>}
        {side.type !== 'thermometer' && side.type !== 'match' && (view.phase === 'voting' || side.type !== 'identity') && <div className={`${styles.options} ${side.type === 'identity' ? styles.peopleOptions : ''}`}>
          {side.options.map((option, index) => {
            const count = side.result?.counts[option.id] ?? 0;
            const winner = Boolean(side.result) && (side.type === 'majority' ? maxVotes > 0 && count === maxVotes
              : side.type === 'minority' && fewest > 0 && count === fewest);
            const content = <>
              {option.avatar ? <Character avatar={option.avatar} size="medium" /> : <span className={styles.optionLetter}>{String.fromCharCode(65 + index)}</span>}
              <b>{option.label}</b>
              {side.result && <small>{count}票{winner && (side.type === 'minority' ? ' · 少数派！' : ' · 多数派！')}</small>}
            </>;
            return !tv && side.canVote && view.phase === 'voting' ? (
              <button key={option.id} className={styles.optionCard} disabled={disabled || side.voted || remaining === 0}
                aria-label={side.type === 'identity' ? `${option.label}だと思う` : `${option.label}に投票`}
                onClick={() => void send({ type: 'partyVote', choice: option.id })}>{content}</button>
            ) : <article key={option.id} className={`${styles.optionCard} ${winner ? styles.winner : ''}`}>{content}</article>;
          })}
        </div>}
        {view.phase === 'reveal' ? <>
          <h3 className={styles.awardHeading}>{AWARD_HEADING[side.type] ?? '当てた人も、だました人も。'}</h3>
          <div className={styles.awards} aria-label="今回の獲得ポイント">
            {awards.length ? awards.map(award => {
              const player = view.players.find(p => p.id === award.id);
              return <article key={award.id}>
                {player && <Character avatar={player.avatar} />}
                <b>{player?.name ?? '退出したプレイヤー'}</b>
                <strong>+<AnimatedScore value={award.points} animate={!reduced} /> 点</strong>
              </article>;
            }) : <p>{side.type === 'minority' && side.result && picked.length ? '全部同じ人数で、少数派なし！ 次のお題でどうぞ。' : side.type === 'match' ? 'だれともハモらず…。次のお題でどうぞ。' : '今回は得点なし。次のお題でどうぞ。'}</p>}
          </div>
        </> : <p className={styles.voteStatus} aria-live="polite">{side.votesReceived} / {side.eligible} 人が投票済み</p>}
      </>}
    </section>
  );
}
