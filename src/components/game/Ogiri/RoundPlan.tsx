import { roundMultiplier, roundPlan, SHUTOUT_BONUS } from '@/lib/ogiri/plan';
import styles from './Ogiri.module.css';

export function RoundPlan({ players, rounds }: { players: number; rounds: number }) {
  const plan = roundPlan(players, rounds);
  return (
    <section className={styles.roundPlan} aria-label="人数に合わせたお題と配点">
      <h3>この人数の遊び方・配点</h3>
      {plan ? <>
        <p>回答者{players}人 × {rounds}ラウンドなら、全{plan.totalQuestions}お題。1人が答えるのは合計{plan.totalAnswersPerPlayer}問です。</p>
        <dl>
          <div><dt>1ラウンドのお題</dt><dd>{plan.questionsPerRound}問</dd></div>
          <div><dt>1人の回答</dt><dd>{plan.answersPerPlayer}問</dd></div>
          <div><dt>1お題の投票者</dt><dd>{plan.votersPerQuestion}人</dd></div>
          <div><dt>1人の投票</dt><dd>{plan.votesPerPlayer}回</dd></div>
        </dl>
        <p>全員が参加した場合、回答・投票の回数は全員同じ。作者2人はそのお題に投票しません。</p>
      </> : <p>回答者3人以上で開始できます。4人以上なら、各お題に2人以上が投票できます。</p>}
      <p><b>ゲーム内得点：</b>1票100点 ＋ 勝利200点。同票は勝利ボーナスなし。2人以上の投票を1人が全部取ったら全票ボーナス＋{SHUTOUT_BONUS}点。</p>
      {rounds > 1 && <p><b>最終ラウンド：</b>ROUND {rounds}は票・勝利・全票ボーナスがすべて{roundMultiplier(rounds, rounds)}倍。最後まで逆転できます。</p>}
      <p><b>パーティー通算：</b>終了順位1位10pt・2位7pt・3位5pt・ほか3pt。同順位は同じptです。</p>
    </section>
  );
}
