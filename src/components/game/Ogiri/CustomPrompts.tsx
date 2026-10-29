'use client';

import { useState, type FormEvent } from 'react';
import type { Action, RoomView } from '@/lib/ogiri/types';
import { normalizePlayerText } from '@/lib/ogiri/text';
import styles from './Ogiri.module.css';

const LIMIT = 30;

/** Host: write, approve and remove room prompts. Participant: submit and withdraw their own. */
export function CustomPrompts({ view, busy, send }: {
  view: RoomView;
  busy: boolean;
  send: (action: Action) => Promise<boolean>;
}) {
  const [text, setText] = useState('');
  const prompts = view.customPrompts ?? [];
  const pending = prompts.filter((p) => !p.approved);
  const approved = prompts.filter((p) => p.approved);
  const length = [...normalizePlayerText(text)].length;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await send({ type: 'customPromptAdd', text })) setText('');
  }
  const remove = (id: string, label: string) => {
    if (window.confirm(`このお題を${label}しますか？`)) void send({ type: 'customPromptRemove', id });
  };
  return (
    <section className={styles.form} aria-label="自作お題">
      <h3>✍️ 自作お題 {view.isHost && <small>{prompts.length} / {LIMIT}問</small>}</h3>
      <p>
        {view.isHost
          ? '書いたお題はすぐ採用。参加者から届いたお題は、採用するまで誰にも表示されません。採用済みのお題もテレビや参加者には出題まで見えません。'
          : '主催者が採用したお題がゲームに出題されます。送ったお題は出題まで自分と主催者だけに表示されます。'}
      </p>
      <form onSubmit={submit}>
        <input
          aria-label={view.isHost ? '自作お題を追加' : '主催者にお題を送る'}
          value={text}
          maxLength={100}
          placeholder="例：社員旅行で部長が言いがちなこと"
          onChange={(e) => setText(e.target.value)}
        />
        <small>{length} / 100文字</small>
        <button className={styles.secondary} disabled={busy || length === 0 || length > 100 || prompts.length >= LIMIT}>
          {view.isHost ? 'お題を追加' : 'お題を送る'}
        </button>
      </form>
      {view.isHost && pending.length > 0 && (
        <div>
          <b>届いたお題（審査待ち {pending.length}問）</b>
          {pending.map((p) => (
            <div className={styles.row} key={p.id}>
              <span>{p.text} <small>— {p.author}</small></span>
              <span>
                <button className={styles.secondary} disabled={busy}
                  onClick={() => void send({ type: 'customPromptApprove', id: p.id })}>採用</button>
                <button className={styles.textButton} disabled={busy} onClick={() => remove(p.id, '却下')}>却下</button>
              </span>
            </div>
          ))}
        </div>
      )}
      {(view.isHost ? approved : prompts).length > 0 && (
        <div>
          <b>{view.isHost ? `採用済み ${approved.length}問` : '送ったお題'}</b>
          {(view.isHost ? approved : prompts).map((p) => (
            <div className={styles.row} key={p.id}>
              <span>{p.text}{view.isHost && !p.mine && <small> — {p.author}</small>}</span>
              {view.isHost ? (
                <button className={styles.textButton} disabled={busy} onClick={() => remove(p.id, '削除')}>削除</button>
              ) : p.approved ? (
                <small>採用 ✓</small>
              ) : (
                <span>
                  <small>審査待ち</small>
                  <button className={styles.textButton} disabled={busy} onClick={() => remove(p.id, '取り下げ')}>取り下げ</button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
