'use client';

import { useEffect, useRef, useState } from 'react';
import { Headphones, Play, Pause, FastForward, FileText } from 'lucide-react';
import type { ArticleAudio } from '@/types/study';

interface AudioPlayerProps {
  audio: ArticleAudio;
}

const PLAYBACK_RATES = [1, 1.25, 1.5, 1.75, 2];

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AudioPlayer({ audio }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(audio.duration || 0);
  const [rate, setRate] = useState(1);
  const [showScript, setShowScript] = useState(false);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setCurrentTime(el.currentTime);
    const onLoaded = () => {
      if (Number.isFinite(el.duration)) setDuration(el.duration);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onLoaded);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onLoaded);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate]);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  const cycleRate = () => {
    const i = PLAYBACK_RATES.indexOf(rate);
    setRate(PLAYBACK_RATES[(i + 1) % PLAYBACK_RATES.length]);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = audioRef.current;
    if (!el) return;
    const next = Number(e.target.value);
    el.currentTime = next;
    setCurrentTime(next);
  };

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '16px 18px',
        backgroundColor: '#f9fafb',
        margin: '16px 0 24px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#374151', fontWeight: 600, fontSize: '13px' }}>
          <Headphones size={16} style={{ color: '#10a37f' }} />
          この記事を音声で聴く
        </div>
        <span style={{ color: '#6b7280', fontSize: '12px' }}>
          対話 · {formatTime(duration)}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
        <button
          onClick={togglePlay}
          aria-label={playing ? 'Pause' : 'Play'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            border: 'none',
            backgroundColor: '#10a37f',
            color: '#ffffff',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {playing ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: '2px' }} />}
        </button>

        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(currentTime, duration || 0)}
          onChange={handleSeek}
          style={{ flex: 1, accentColor: '#10a37f' }}
          aria-label="再生位置"
        />

        <span style={{ color: '#6b7280', fontSize: '12px', minWidth: '80px', textAlign: 'right' }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <button
          onClick={cycleRate}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            backgroundColor: '#ffffff',
            color: '#374151',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 500,
          }}
          aria-label="再生速度"
        >
          <FastForward size={14} />
          {rate}x
        </button>
      </div>

      <audio ref={audioRef} src={audio.storageUrl} preload="metadata" />

      {audio.script && (
        <div style={{ marginTop: '12px' }}>
          <button
            onClick={() => setShowScript((v) => !v)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 8px',
              borderRadius: '6px',
              border: '1px solid #e5e7eb',
              backgroundColor: '#ffffff',
              color: '#6b7280',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            <FileText size={12} />
            {showScript ? 'スクリプトを隠す' : 'スクリプトを表示'}
          </button>
          {showScript && (
            <pre
              style={{
                marginTop: '8px',
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: '13px',
                lineHeight: 1.6,
                color: '#374151',
                maxHeight: '320px',
                overflowY: 'auto',
              }}
            >
              {audio.script}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
