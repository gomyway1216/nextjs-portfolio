'use client';

import { useState } from 'react';
import { Headphones, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { generateArticleAudio, deleteArticleAudio } from '@/services/audioService';
import type { ArticleAudio, AudioTemplate } from '@/types/study';

interface GenerateAudioButtonProps {
  articleId: string;
  audio?: ArticleAudio;
  audioStatus?: 'generating' | 'ready' | 'failed';
  audioError?: string;
  onUpdated: (audio: ArticleAudio | null) => void;
  onError?: (message: string) => void;
}

const TEMPLATES: { value: AudioTemplate; label: string }[] = [
  { value: 'tech', label: '技術 (コード省略・概念で説明)' },
  { value: 'concept', label: '概念 (アナロジー多め)' },
  { value: 'book', label: '読書ノート (主張→解釈→反論)' },
];

export default function GenerateAudioButton({
  articleId,
  audio,
  audioStatus,
  audioError,
  onUpdated,
  onError,
}: GenerateAudioButtonProps) {
  const [template, setTemplate] = useState<AudioTemplate>(audio?.template ?? 'tech');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleGenerate = async (force: boolean) => {
    setBusy(true);
    try {
      const result = await generateArticleAudio(articleId, { template, force });
      onUpdated(result.audio);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (onError) onError(message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('生成済みの音声を削除しますか？')) return;
    setDeleting(true);
    try {
      await deleteArticleAudio(articleId);
      onUpdated(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (onError) onError(message);
    } finally {
      setDeleting(false);
    }
  };

  const inProgress = busy || audioStatus === 'generating';
  const buttonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500,
    border: '1px solid transparent',
    cursor: inProgress ? 'not-allowed' : 'pointer',
    opacity: inProgress ? 0.7 : 1,
  };

  return (
    <div
      style={{
        border: '1px solid rgba(148, 163, 184, 0.2)',
        borderRadius: '8px',
        padding: '14px',
        backgroundColor: 'rgba(15, 23, 42, 0.4)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#cbd5e1', fontSize: '13px', fontWeight: 600 }}>
        <Headphones size={14} style={{ color: '#10a37f' }} />
        音声 (対話ポッドキャスト)
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
        <label style={{ color: '#94a3b8', fontSize: '12px' }}>テンプレート</label>
        <select
          value={template}
          onChange={(e) => setTemplate(e.target.value as AudioTemplate)}
          disabled={inProgress}
          style={{
            padding: '6px 10px',
            borderRadius: '6px',
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            color: '#e2e8f0',
            border: '1px solid rgba(148, 163, 184, 0.3)',
            fontSize: '13px',
          }}
        >
          {TEMPLATES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {!audio && (
          <button
            onClick={() => handleGenerate(false)}
            disabled={inProgress}
            style={{ ...buttonStyle, backgroundColor: '#10a37f', color: '#ffffff' }}
          >
            {inProgress ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Headphones size={14} />}
            {inProgress ? '生成中...' : '音声を生成'}
          </button>
        )}
        {audio && (
          <>
            <button
              onClick={() => handleGenerate(true)}
              disabled={inProgress}
              style={{ ...buttonStyle, backgroundColor: '#10a37f', color: '#ffffff' }}
            >
              {inProgress ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />}
              {inProgress ? '再生成中...' : '再生成'}
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting || inProgress}
              style={{ ...buttonStyle, backgroundColor: 'transparent', color: '#f87171', border: '1px solid rgba(248, 113, 113, 0.4)' }}
            >
              {deleting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />}
              {deleting ? '削除中...' : '削除'}
            </button>
          </>
        )}
      </div>

      {audio && (
        <div style={{ color: '#94a3b8', fontSize: '12px', lineHeight: 1.5 }}>
          長さ約 {Math.round(audio.duration / 60)} 分 ({audio.duration}秒) ・
          モデル {audio.model} ・
          テンプレ {audio.template} ・
          {Math.round(audio.bytes / 1024)} KB
          <br />
          生成: {new Date(audio.generatedAt).toLocaleString()}
        </div>
      )}

      {audioStatus === 'failed' && audioError && (
        <div style={{ color: '#f87171', fontSize: '12px' }}>
          失敗: {audioError}
        </div>
      )}
    </div>
  );
}
