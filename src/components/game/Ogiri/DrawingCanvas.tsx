'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { DRAWING_COLORS, DRAWING_HEIGHT, DRAWING_MAX_POINTS, DRAWING_MAX_STROKES, DRAWING_WIDTH, DRAWING_WIDTHS, drawingInput, emptyDrawing } from '@/lib/ogiri/drawing-data';
import type { DrawingData } from '@/lib/ogiri/types';
import styles from './DrawingGamePanel.module.css';

export function DrawingCanvas({ value, disabled, onChange }: {
  value: DrawingData;
  disabled: boolean;
  onChange: (value: DrawingData) => void;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const down = useRef(false);
  const [color, setColor] = useState(DRAWING_COLORS[0]), [width, setWidth] = useState(7);
  const [notice, setNotice] = useState('');
  const [cleared, setCleared] = useState<DrawingData | null>(null);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);
    for (const stroke of value.strokes) {
      context.strokeStyle = stroke.c;
      context.fillStyle = stroke.c;
      context.lineWidth = stroke.w;
      context.lineCap = 'round'; context.lineJoin = 'round';
      if (stroke.p.length === 2) {
        context.beginPath(); context.arc(stroke.p[0], stroke.p[1], stroke.w / 2, 0, 2 * Math.PI); context.fill();
      } else {
        context.beginPath(); context.moveTo(stroke.p[0], stroke.p[1]);
        for (let i = 2; i < stroke.p.length; i += 2) context.lineTo(stroke.p[i], stroke.p[i + 1]);
        context.stroke();
      }
    }
  }, [value]);
  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [Math.max(0, Math.min(511, Math.round((event.clientX - rect.left) / rect.width * 512))),
      Math.max(0, Math.min(383, Math.round((event.clientY - rect.top) / rect.height * 384)))];
  };
  const update = (drawing: DrawingData) => {
    try { onChange(drawingInput(drawing, true)); setNotice(''); }
    catch { down.current = false; setNotice('絵がいっぱいです。「戻す」か「クリア」で整えてね。'); }
  };
  return <div className={styles.editor}>
    <div className={styles.palette} aria-label="描く道具">
      {DRAWING_COLORS.filter(c => c !== '#ffffff').map((c, i) => <button type="button" key={c} disabled={disabled}
        aria-label={['黒いペン', 'ピンクのペン', '青いペン', '緑のペン', '黄色のペン'][i]}
        aria-pressed={color === c} style={{ background: c }} onClick={() => setColor(c)} />)}
      <button type="button" disabled={disabled} aria-pressed={color === '#ffffff'} onClick={() => setColor('#ffffff')}>消しゴム</button>
      <label>太さ <select aria-label="ペンの太さ" disabled={disabled} value={width} onChange={e => setWidth(Number(e.target.value))}>
        {DRAWING_WIDTHS.map((n, i) => <option key={n} value={n}>{['細い', 'ふつう', '太い'][i]}</option>)}
      </select></label>
      <button type="button" disabled={disabled || (!value.strokes.length && !cleared)} onClick={() => {
        if (!value.strokes.length && cleared) { update(cleared); setCleared(null); }
        else update({ v: 1, strokes: value.strokes.slice(0, -1) });
      }}>戻す</button>
      <button type="button" disabled={disabled || !value.strokes.length} onClick={() => {
        setCleared(value); update(emptyDrawing());
      }}>クリア</button>
    </div>
    <canvas ref={canvas} width={DRAWING_WIDTH} height={DRAWING_HEIGHT} className={styles.canvas}
      aria-label="絵を描くキャンバス" aria-disabled={disabled} tabIndex={0}
      onPointerDown={event => {
        if (disabled || event.button > 0) return;
        if (value.strokes.length >= DRAWING_MAX_STROKES) { setNotice('線がいっぱいです。「戻す」で線を減らしてね。'); return; }
        event.currentTarget.setPointerCapture(event.pointerId); down.current = true;
        update({ v: 1, strokes: [...value.strokes, { c: color, w: width, p: point(event) }] });
      }}
      onPointerMove={event => {
        if (disabled || !down.current || !value.strokes.length) return;
        const p = point(event), last = value.strokes.at(-1)!;
        if (Math.hypot(p[0] - last.p.at(-2)!, p[1] - last.p.at(-1)!) < 3) return;
        if (value.strokes.reduce((sum, stroke) => sum + stroke.p.length / 2, 0) >= DRAWING_MAX_POINTS) {
          down.current = false; setNotice('絵がいっぱいです。いったん送るか、線を減らしてね。'); return;
        }
        update({ v: 1, strokes: [...value.strokes.slice(0, -1), { ...last, p: [...last.p, ...p] }] });
      }}
      onPointerUp={() => { down.current = false; }}
      onPointerCancel={() => { down.current = false; }}
      onLostPointerCapture={() => { down.current = false; }}
    />
    <small>指でもマウスでも描けます。絵の途中は、ほかの人には見えません。</small>
    {notice && <p role="status">{notice}</p>}
  </div>;
}
