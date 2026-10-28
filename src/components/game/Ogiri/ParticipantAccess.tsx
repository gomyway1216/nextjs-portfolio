'use client';

import { useEffect, useState } from 'react';
import type { Action, RoomView } from '@/lib/ogiri/types';
import { recallRecovery } from '@/lib/ogiri/recovery-local';
import styles from './Ogiri.module.css';

export function ParticipantAccess({ view, busy, connected, send, regenerate }: {
  view: RoomView;
  busy: boolean;
  connected: boolean;
  send: (action: Action) => Promise<boolean>;
  regenerate: () => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
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
