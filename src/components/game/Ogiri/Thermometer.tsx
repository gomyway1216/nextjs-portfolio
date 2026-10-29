'use client';

import { useState } from 'react';
import type { Action, PartyGameView } from '@/lib/ogiri/types';
import common from './Ogiri.module.css';
import styles from './Thermometer.module.css';

/** Phone input for みんなの温度計. The rating stays on this device until it is sent. */
export function ThermometerVote({ side, disabled, send }: {
  side: PartyGameView;
  disabled: boolean;
  send: (action: Action) => Promise<boolean>;
}) {
  const [value, setValue] = useState(50);
  return (
    <div className={styles.vote}>
      <output className={styles.reading} htmlFor="thermometer-rating" aria-live="polite">{value}<small>度</small></output>
      <input id="thermometer-rating" className={styles.slider} type="range" min={0} max={100} step={1} value={value}
        aria-label="温度（0〜100）" aria-valuetext={`${value}度`} disabled={disabled}
        onChange={event => setValue(Number(event.target.value))} />
      <div className={styles.ends} aria-hidden="true"><span>0 · {side.scale?.low}</span><span>100 · {side.scale?.high}</span></div>
      <div className={styles.nudges}>
        {[-10, -1, 1, 10].map(step => <button key={step} type="button" className={common.secondary} disabled={disabled}
          aria-label={`${step > 0 ? '+' : ''}${step}度`}
          onClick={() => setValue(current => Math.min(100, Math.max(0, current + step)))}>{step > 0 ? '+' : ''}{step}</button>)}
      </div>
      <button type="button" className={common.primary} disabled={disabled}
        onClick={() => void send({ type: 'partyVote', choice: String(value) })}>{value}度で送る</button>
    </div>
  );
}

/** Anonymous distribution: how many people chose each value, plus the room average. Never who chose what. */
export function ThermometerScale({ side }: { side: PartyGameView }) {
  const counts = Object.entries(side.result?.counts ?? {}).map(([value, count]) => [Number(value), count] as const);
  const average = side.result?.average;
  return (
    <figure className={styles.scale} aria-label="みんなの温度の分布">
      <div className={styles.track}>
        {counts.map(([value, count]) => <span key={value} className={styles.stack} style={{ left: `${value}%` }}
          title={`${value}度 · ${count}人`}>
          {Array.from({ length: count }, (_, i) => <i key={i} className={styles.dot} style={{ animationDelay: `${i * 0.08}s` }} />)}
          <b>{value}</b>
        </span>)}
        {average !== undefined && <span className={styles.average} style={{ left: `${average}%` }}>
          <b>平均 {average}</b>
        </span>}
      </div>
      <div className={styles.ends}><span>0 · {side.scale?.low}</span><span>100 · {side.scale?.high}</span></div>
      <figcaption className={styles.caption}>
        {average === undefined ? '回答が2人未満のため、今回は得点なし。' : `みんなの平均は ${average} 度。近い人ほど高得点！`}
      </figcaption>
    </figure>
  );
}

export function ThermometerEnds({ side }: { side: PartyGameView }) {
  return <div className={`${styles.ends} ${styles.preview}`}><span>0 · {side.scale?.low}</span><span>100 · {side.scale?.high}</span></div>;
}
