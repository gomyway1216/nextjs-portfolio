'use client';

import { useEffect, useState } from 'react';
import type { Action, RoomView } from '@/lib/ogiri/types';
import { recallRecovery } from '@/lib/ogiri/recovery-local';
import styles from './Ogiri.module.css';

export function ParticipantAccess({ view, busy, connected, send, regenerate, savePassphrase }: {
  view: RoomView;
  busy: boolean;
  connected: boolean;
  send: (action: Action) => Promise<boolean>;
  regenerate: () => Promise<void>;
  savePassphrase: (value: string) => Promise<boolean>;
}) {
  const [code, setCode] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [passphraseStatus, setPassphraseStatus] = useState('');
  const passphraseLength = [...passphrase.normalize('NFC')].length;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- private, browser-only tab storage
    setCode(view.me ? view.recoveryCode ?? recallRecovery(view.code, view.me) : '');
    setCopyStatus('');
  }, [view.code, view.me, view.recoveryCode]);
  if (!view.me) return null;
  return <section className={styles.participantAccess} aria-label="休憩と復帰">
    <div className={styles.row}>
      <b>{view.resting ? 'いまは休憩中です' : 'このルームの参加者として接続中'}</b>
      <button className={styles.secondary} disabled={busy || !connected}
        onClick={() => void send({ type: view.resting ? 'return' : 'leave' })}>
        {view.resting ? '参加に戻る' : '休憩する'}
      </button>
    </div>
    <p>休憩しても名前・キャラ・得点・パーティー通算は残ります。割り当て済みの回答は戻って続けられます。新しい割り当ては次のラウンド・ゲームからです。</p>
    {view.isHost && <p>休憩中も主催者の進行操作を使えます。</p>}
    <details>
      <summary>自分で決めた合言葉で戻る</summary>
      <p>復帰するときのニックネーム：<b>{view.participantName ?? view.players.find(player => player.id === view.me)?.name}</b></p>
      <p>{view.hasPassphrase ? '合言葉は設定済みです。下のフォームで変更できます。' : '先に合言葉を設定すると、復帰コードを控えなくても別端末から戻れます。'}</p>
      <form className={styles.form} onSubmit={async event => {
        event.preventDefault();
        if (passphrase.normalize('NFC') !== confirmation.normalize('NFC')) {
          setPassphraseStatus('確認用の合言葉が一致していません。');
          return;
        }
        setPassphraseStatus('');
        if (await savePassphrase(passphrase)) {
          setPassphrase(''); setConfirmation('');
          setPassphraseStatus('合言葉を設定しました。別端末では「同じ参加者で戻る」→「合言葉」を選んでください。');
        }
      }}>
        <label>合言葉（6〜64文字・日本語もOK）
          <input aria-label="設定する合言葉" type="password" autoComplete="new-password" required
            minLength={6} maxLength={128} disabled={busy} value={passphrase} onChange={event => setPassphrase(event.target.value)} />
          <small>{passphraseLength} / 64文字</small>
        </label>
        <label>合言葉（確認）
          <input aria-label="合言葉の確認" type="password" autoComplete="new-password" required
            minLength={6} maxLength={128} disabled={busy} value={confirmation} onChange={event => setConfirmation(event.target.value)} />
        </label>
        <button className={styles.secondary} disabled={busy || !connected || passphraseLength < 6 || passphraseLength > 64}>
          {busy ? '設定中…' : view.hasPassphrase ? '合言葉を変更' : '合言葉を設定'}
        </button>
      </form>
      {passphraseLength > 64 && <p role="alert">合言葉は64文字以内で設定してください。</p>}
      {passphraseStatus && <p role="status">{passphraseStatus}</p>}
      <small>このルームの4ゲームで共通です。メール登録は不要。合言葉は他のサイトと使い回さず、本人だけで覚えておいてください。</small>
    </details>
    <details>
      <summary>別の端末で戻るための復帰コード</summary>
      {code ? <>
        <output aria-label="あなたの復帰コード">{code.slice(0, 4)}-{code.slice(4)}</output>
        <button className={styles.secondary} disabled={busy} onClick={async () => {
          try {
            if (!navigator.clipboard?.writeText) throw new Error();
            await navigator.clipboard.writeText(code);
            setCopyStatus('コピーしました。');
          } catch { setCopyStatus('コピーできませんでした。コードを控えてください。'); }
        }}>復帰コードをコピー</button>
      </> : <p>このタブにはコードがありません。下のボタンで発行できます。</p>}
      <p>このコードを知る人はあなたとして戻れます。主催者のコードは進行権限も戻すため、他の人には見せず控えてください。別端末で使うと以前の端末はログアウトします。</p>
      <button className={styles.textButton} disabled={busy || !connected} onClick={() => void regenerate()}>
        {code ? '復帰コードを再発行' : '復帰コードを発行'}
      </button>
      <small>再発行すると以前のコードは使えません。</small>
      {copyStatus && <p role="status">{copyStatus}</p>}
    </details>
    <small>ページを閉じても同じブラウザのCookieで戻れます（最大24時間）。部屋は最後のゲーム操作から8時間で失効します。復帰は同じ部屋の有効期間内のみ。終了したゲームの履歴は90日間保存します。</small>
  </section>;
}
