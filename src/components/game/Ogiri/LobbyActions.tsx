'use client';

import { useState } from 'react';
import styles from './Ogiri.module.css';

export function LobbyActions({ code, game, missing, disconnected, disabled, start, openSettings }: {
  code: string;
  game: string;
  missing: number;
  disconnected: number;
  disabled: boolean;
  start: () => void;
  openSettings: () => void;
}) {
  const [invite, setInvite] = useState<{ url: string; copied: boolean } | null>(null);
  async function copyInvite() {
    const url = new URL(`/games/ogiri/${code}`, window.location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      setInvite({ url, copied: true });
    } catch {
      setInvite({ url, copied: false });
    }
  }

  return <section className={styles.lobbyActions} aria-label="受付の操作">
    <p>
      <b>次は「{game}」</b>
      <span>{missing > 0 ? `あと${missing}人で始められます。` : disconnected > 0
        ? `接続待ちの人が${disconnected}人います。始める前に確認してね。` : '準備ができたら、始めよう。'}</span>
    </p>
    <div className={styles.controls}>
      <button className={styles.primary} type="button" disabled={disabled || missing > 0} onClick={start}>ゲーム開始 →</button>
      <button className={styles.secondary} type="button" onClick={() => void copyInvite()}>招待リンクをコピー</button>
      <button className={styles.textButton} type="button" onClick={openSettings}>ゲーム設定へ ↓</button>
    </div>
    {invite && <p role="status">{invite.copied ? '招待リンクをコピーしました。' : 'コピーできませんでした。下のURLを選んで共有してください。'}</p>}
    {invite && !invite.copied && <input aria-label="招待リンク" readOnly value={invite.url}
      onFocus={event => event.target.select()} />}
  </section>;
}
