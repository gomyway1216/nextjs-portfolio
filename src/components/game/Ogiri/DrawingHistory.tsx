import type { DrawingHistoryChain } from '@/lib/ogiri/types';
import { drawingInput } from '@/lib/ogiri/drawing-data';
import { DrawingPicture } from './DrawingPicture';
import { Character } from './Character';
import styles from './DrawingGamePanel.module.css';

export function DrawingHistory({ chains }: { chains: DrawingHistoryChain[] }) {
  return <section aria-label="絵の伝言の記録">
    <h2>絵とことばの伝言 · {chains.length}チェーン</h2>
    <p>公開した伝言だけを保存しています。ダウンロードすると、絵もオフラインで見返せます。</p>
    {chains.map((chain, i) => <article key={i} className={styles.panel}>
      <h3>最初のお題「{chain.prompt}」</h3>
      <div className={styles.chainGrid}>{chain.steps.map((step, j) => <section className={styles.chainStep} key={j}>
        <b>{j + 1}. {step.kind === 'draw' ? '絵にしたら' : '言葉にしたら'}</b>
        {step.drawing ? <DrawingPicture data={drawingInput(JSON.parse(step.drawing))} label={`${step.name}の絵`} /> : <p className={styles.guess}>{step.text ?? '今回はパス！'}</p>}
        <p><Character avatar={step.avatar} /> {step.name}</p>
        {step.kind === 'draw' && <small>{step.votes}票 · +{step.points} 点</small>}
      </section>)}</div>
    </article>)}
  </section>;
}
