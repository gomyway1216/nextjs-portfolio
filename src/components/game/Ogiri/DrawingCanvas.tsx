'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { DRAWING_COLORS, DRAWING_HEIGHT, DRAWING_WIDTH, DRAWING_WIDTHS, drawingInput, drawingUsage, emptyDrawing, simplifyStroke } from '@/lib/ogiri/drawing-data';
import type { DrawingData } from '@/lib/ogiri/types';
import styles from './DrawingGamePanel.module.css';

const FULL = '絵がいっぱいです。「戻す」で線を減らすか、このまま送ってね。';

export function DrawingCanvas({ value, disabled, onChange }: {
  value: DrawingData;
  disabled: boolean;
  onChange: (value: DrawingData) => void;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  /** The finger drawing this stroke. A second finger must not pull it into a zigzag. */
  const pointer = useRef<number | null>(null);
  /** Moves can arrive faster than React renders, so each one builds on the last, not on `value`. */
  const latest = useRef(value);
  const sent = useRef(new WeakSet<DrawingData>());
  const [color, setColor] = useState(DRAWING_COLORS[0]), [width, setWidth] = useState(7);
  const [notice, setNotice] = useState('');
  const [cleared, setCleared] = useState<DrawingData | null>(null);
  useEffect(() => {
    // A picture this canvas did not make (a restored draft) replaces the one being built.
    if (!sent.current.has(value)) latest.current = value;
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
    try {
      const next = drawingInput(drawing, true);
      latest.current = next; sent.current.add(next);
      onChange(next); setNotice('');
    } catch { pointer.current = null; setNotice(FULL); }
  };
  const withLast = (drawing: DrawingData, p: number[]): DrawingData =>
    ({ v: 1, strokes: [...drawing.strokes.slice(0, -1), { ...drawing.strokes.at(-1)!, p }] });
  /** A finished line keeps only the points it bends at, which leaves ink for the rest of the picture. */
  const release = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerId !== pointer.current) return;
    pointer.current = null;
    const drawing = latest.current, last = drawing.strokes.at(-1);
    const p = last && simplifyStroke(last.p);
    if (p && p.length < last.p.length) update(withLast(drawing, p));
  };
  const left = Math.round((1 - drawingUsage(value)) * 100);
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
        else update({ v: 1, strokes: latest.current.strokes.slice(0, -1) });
      }}>戻す</button>
      <button type="button" disabled={disabled || !value.strokes.length} onClick={() => {
        setCleared(latest.current); update(emptyDrawing());
      }}>クリア</button>
      <span className={`${styles.ink} ${left <= 15 ? styles.inkLow : ''}`} role="meter" aria-label="残りのインク"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={left} aria-valuetext={`残り${left}%`}>
        <span style={{ width: `${left}%` }} />
      </span>
    </div>
    {notice && <p className={styles.full} role="status">{notice}</p>}
    <canvas ref={canvas} width={DRAWING_WIDTH} height={DRAWING_HEIGHT} className={styles.canvas}
      aria-label="絵を描くキャンバス" aria-disabled={disabled} tabIndex={0}
      onPointerDown={event => {
        if (disabled || event.button > 0 || pointer.current !== null) return;
        const drawing = latest.current;
        if (drawingUsage(drawing) >= 1) { setNotice(FULL); return; }
        event.currentTarget.setPointerCapture(event.pointerId); pointer.current = event.pointerId;
        update({ v: 1, strokes: [...drawing.strokes, { c: color, w: width, p: point(event) }] });
      }}
      onPointerMove={event => {
        const drawing = latest.current, last = drawing.strokes.at(-1);
        if (disabled || event.pointerId !== pointer.current || !last) return;
        const p = point(event);
        if (Math.hypot(p[0] - last.p.at(-2)!, p[1] - last.p.at(-1)!) < 3) return;
        let next = withLast(drawing, [...last.p, ...p]);
        // Out of ink mid-line: tidy this line first, and stop only if that still does not make room.
        if (drawingUsage(next) >= 1) next = withLast(drawing, simplifyStroke([...last.p, ...p]));
        if (drawingUsage(next) >= 1) {
          const tidy = simplifyStroke(last.p);
          if (tidy.length < last.p.length) update(withLast(drawing, tidy));
          pointer.current = null; setNotice(FULL);
          return;
        }
        update(next);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    />
    <small>指でもマウスでも描けます。絵の途中は、ほかの人には見えません。</small>
  </div>;
}
