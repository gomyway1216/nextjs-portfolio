'use client';

import { useEffect, useState } from 'react';
import { drawingInput, DRAWING_HEIGHT, DRAWING_WIDTH } from '@/lib/ogiri/drawing-data';
import type { DrawingData } from '@/lib/ogiri/types';
import styles from './DrawingGamePanel.module.css';

const cache = new Map<string, Promise<DrawingData>>();
export function loadDrawing(code: string, id: string) {
  const key = `${code}/${id}`;
  let promise = cache.get(key);
  if (!promise) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    promise = fetch(`/api/ogiri/${code}/drawings/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('絵を読み込めませんでした。');
        return drawingInput(await response.json());
      }).catch(error => { cache.delete(key); throw error; }).finally(() => clearTimeout(timeout));
    cache.set(key, promise);
    if (cache.size > 128) cache.delete(cache.keys().next().value!);
  }
  return promise;
}
export function DrawingPicture({ data, label = '伝言の絵' }: { data: DrawingData; label?: string }) {
  return <svg className={styles.picture} viewBox={`0 0 ${DRAWING_WIDTH} ${DRAWING_HEIGHT}`} role="img" aria-label={label}>
    <rect width={DRAWING_WIDTH} height={DRAWING_HEIGHT} fill="#ffffff" />
    {data.strokes.map((stroke, i) => stroke.p.length === 2
      ? <circle key={i} cx={stroke.p[0]} cy={stroke.p[1]} r={stroke.w / 2} fill={stroke.c} />
      : <polyline key={i} points={stroke.p.map((n, index) => `${n}${index % 2 ? ' ' : ','}`).join('')}
        fill="none" stroke={stroke.c} strokeWidth={stroke.w} strokeLinecap="round" strokeLinejoin="round" />)}
  </svg>;
}
export function DrawingImage({ code, id, label }: { code: string; id: string; label?: string }) {
  const [data, setData] = useState<DrawingData | null>(null);
  const [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    loadDrawing(code, id).then(value => { if (active) { setData(value); setError(false); } })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [code, id, attempt]);
  return data ? <DrawingPicture data={data} label={label} />
    : error ? <button type="button" onClick={() => setAttempt(attempt + 1)}>絵を再読み込み</button>
      : <p className={styles.picturePlaceholder}>絵を読み込み中…</p>;
}
