'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { GameHistory, HistoryRef } from '@/lib/ogiri/types';
import { historyText, validHistoryId } from '@/lib/ogiri/history';
import { readLocalHistory, rememberHistory } from '@/lib/ogiri/history-local';
import styles from './Ogiri.module.css';

const date = (value: number) => new Date(value).toLocaleString('ja-JP');
export function OgiriHistory({ id }: { id?: string }) {
  const [entries, setEntries] = useState<HistoryRef[]>([]);
  const [history, setHistory] = useState<GameHistory | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!id) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEntries(readLocalHistory(localStorage));
      } catch {
        setEntries([]);
      }
      return;
    }
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 15000);
    async function load() {
      try {
        if (!validHistoryId(id!)) throw new Error('履歴のリンクを確認してください。');
        const response = await fetch(`/api/ogiri/history/${id}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? '履歴を取得できませんでした。');
        if (!active) return;
        setHistory(data);
        const { id: key, code, game, finishedAt, expiresAt } = data as GameHistory;
        rememberHistory([{ id: key, code, game, finishedAt, expiresAt }]);
      } catch (e) {
        if (active)
          setError(
            e instanceof Error && e.name !== 'AbortError'
              ? e.message
              : '接続を確認して、もう一度お試しください。',
          );
      } finally {
        clearTimeout(timeout);
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [id, attempt]);
  function download() {
    if (!history) return;
    const url = URL.createObjectURL(
      new Blob(['\uFEFF', historyText(history)], { type: 'text/plain;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `ogiri-${history.code}-${history.game}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('テキストファイルを保存しました。90日後も手元で読めます。');
  }
  return (
    <main className={styles.app} lang="ja">
      <div className={`${styles.shell} ${styles.historyShell}`}>
        <nav className={styles.nav}>
          <Link href="/games/ogiri">← 大喜利王</Link>
          {id && <Link href="/games/ogiri/history">この端末の履歴</Link>}
          <span className={styles.badge}>思い出の一言</span>
        </nav>
        <header className={styles.historyHeader}>
          <p className={styles.eyebrow}>あの笑いを、もう一度。</p>
          <h1>{id ? 'ゲームの記録' : '過去のゲーム'}</h1>
          <p>結果は終了から90日間保存されます。ダウンロードすると、期限後も手元で見返せます。</p>
        </header>
        {!id && (
          <>
            <p className={styles.historyNote}>
              このブラウザで受け取った履歴を新しい順に表示します（最大100件）。別の端末では履歴リンクを開いてください。ブラウザのデータを消すと、この一覧も消えます。
            </p>
            {entries.length === 0 && (
              <p className={styles.historyEmpty}>
                まだ履歴がありません。ゲーム終了後、ここから結果を見返せます。
              </p>
            )}
            <div className={styles.historyList}>
              {entries.map((entry) => (
                <Link
                  prefetch={false}
                  className={styles.historyCard}
                  href={`/games/ogiri/history/${entry.id}`}
                  key={entry.id}
                >
                  <span className={styles.eyebrow}>{date(entry.finishedAt)}</span>
                  <h2>
                    {entry.code} · 第{entry.game}ゲーム <span aria-hidden="true">↗</span>
                  </h2>
                  <p>お題・回答・票数・最終順位を見る</p>
                  <small>閲覧期限: {date(entry.expiresAt)}</small>
                </Link>
              ))}
            </div>
          </>
        )}
        {id && !history && !error && <p role="status">履歴を読み込んでいます…</p>}
        {error && (
          <div className={styles.historyEmpty}>
            <p role="alert">{error}</p>
            <button
              className={styles.secondary}
              onClick={() => {
                setError('');
                setAttempt(attempt + 1);
              }}
            >
              再読み込み
            </button>
          </div>
        )}
        {history && (
          <>
            <section className={styles.historyCard}>
              <p>
                {date(history.finishedAt)} · {history.code} · 第{history.game}ゲーム
              </p>
              <div className={styles.controls}>
                <button className={styles.primary} onClick={download}>
                  結果をダウンロード
                </button>
                <button
                  className={styles.secondary}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(window.location.href);
                      setNotice('履歴リンクをコピーしました。');
                    } catch {
                      setNotice('ブラウザのアドレス欄から履歴リンクをコピーしてください。');
                    }
                  }}
                >
                  履歴リンクをコピー
                </button>
              </div>
              <p className={styles.historyNote}>
                このリンクを知っている人は、名前・回答・結果を閲覧できます。参加者だけに共有してください。
              </p>
              <small>閲覧期限: {date(history.expiresAt)}</small>
              {notice && <p role="status">{notice}</p>}
            </section>
            <section className={styles.historySection}>
              <h2>👑 最終順位</h2>
              <ol className={styles.historyRanks}>
                {history.rankings.map((p, i) => (
                  <li key={i}>
                    <b>{p.rank}位</b>
                    <span>
                      {p.avatar} {p.name}
                    </span>
                    <strong>{p.score} pt</strong>
                  </li>
                ))}
              </ol>
            </section>
            <section className={styles.historySection}>
              <h2>
                お題と回答 <small>{history.matches.length}対戦</small>
              </h2>
              <p className={styles.historyNote}>
                結果発表まで進んだ対戦を記録しています。途中終了した未発表の回答や、非表示にした回答は公開されません。
              </p>
              {history.matches.length === 0 && <p>結果発表済みの対戦はありません。</p>}
              <div className={styles.historyList}>
                {history.matches.map((match, i) => (
                  <article className={styles.historyCard} key={i}>
                    <p className={styles.eyebrow}>
                      ROUND {match.round} · お題 {i + 1}
                    </p>
                    <h3>{match.text}</h3>
                    <div className={styles.historyAnswers}>
                      {match.answers.map((answer, j) => (
                        <div key={j}>
                          <p className={styles.historyAnswer}>{answer.text ?? '未回答・非表示'}</p>
                          <small>
                            {answer.avatar} {answer.name}
                          </small>
                          <p>
                            <strong>{answer.votes}票</strong> · +{answer.points} pt
                          </p>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
