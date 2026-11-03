import type { DrawingHistoryChain, GameType } from '@/lib/ogiri/types';
import { drawingInput } from '@/lib/ogiri/drawing-data';
import { DrawingPicture } from './DrawingPicture';
import { Character } from './Character';
import styles from './DrawingGamePanel.module.css';

export function DrawingHistory({ chains, type = 'drawing' }: { chains: DrawingHistoryChain[]; type?: GameType }) {
  const shiritori = type === 'shiritori', quiz = type === 'quiz';
  return <section aria-label={shiritori ? '絵しりとりの記録' : quiz ? 'おえかきクイズの記録' : '絵の伝言の記録'}>
    <h2>{shiritori ? '絵しりとり' : quiz ? 'おえかきクイズ' : '絵とことばの伝言'} · {chains.length}{quiz ? '問' : 'チェーン'}</h2>
    <p>公開した{shiritori ? 'しりとり' : quiz ? '問題' : '伝言'}だけを保存しています。ダウンロードすると、絵もオフラインで見返せます。</p>
    {chains.map((chain, i) => <article key={i} className={styles.panel}>
      <h3>{shiritori ? 'はじまりの言葉' : quiz ? '正解' : '最初のお題'}「{chain.prompt}」</h3>
      <div className={`${styles.chainGrid} ${chain.steps.length === 3 ? styles.threeSteps : ''}`}>{chain.steps.map((step, j) => <section className={styles.chainStep} key={j}>
        <b>{j + 1}. {shiritori ? step.text ?? 'パス' : quiz ? step.kind === 'draw' ? '出題の絵' : 'みんなの予想' : step.kind === 'draw' ? '絵にしたら' : '言葉にしたら'}</b>
        {step.drawing ? <DrawingPicture data={drawingInput(JSON.parse(step.drawing))} label={`${step.name}の絵`} /> : <p className={styles.guess}>{step.text ?? '今回はパス！'}</p>}
        <p><Character avatar={step.avatar} /> {step.name}</p>
        {step.kind === 'draw' && <small>{quiz ? `+${step.points} 点` : `${step.votes}票 · +${step.points} 点`}{step.link != null && ` · ${step.link ? 'つながった' : '切れた'}`}</small>}
      </section>)}</div>
    </article>)}
  </section>;
}
