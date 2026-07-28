# 将棋capacity objective-only v2：失敗原因を1変数だけで再検証する

> v1は大型モデルでも固定sentinelを通らなかった。しかし入力衝突は0、teacher-score oracleは100%で、学習objectiveと合否指標には具体的な不一致があった。v2はモデルやデータを増やさず、objectiveだけを合否へ合わせる。[English](./blog-shogi-capacity-objective-v2-plan.en.md)

## この実験で答えること

問いは1つだけである。

**v1と同じモデル・同じ1,280親・同じ40 epochでも、objectiveをTop-1とdomain-micro pairへ直接合わせれば固定ゲートを通るか。**

これは棋力試験ではなく、教師順位を訓練内で再現できるかのcapacity診断である。通過しても高段、ライブ改善、対局勝率の向上は主張しない。

## v1から変えるもの

| objective | v1の問題 | v2 |
|---|---|---:|
| listwise policy | 維持する | 1.0 |
| pair | 親内平均後に親を等重み。合否のdomain-micro pairと不一致 | 各domain batchの全eligible pairをpoolするmicro logistic、1.0 |
| Top-1 margin | 同率教師首位から1手だけを `argmax` で選択 | 同率首位を集合として扱い、hardest negativeに対するmargin、1.0 |
| move-value | 合否に直接入らない回帰の比重が大きい | 0.20 |
| state-value | 合否に直接入らない | 0 |

eligible pairの教師差50cpとscore temperatureなど、ここに書いていない尺度はv1のままにする。

## 変えないもの

- 5,953,522-parameterモデルと43-plane入力
- Browser/V9のデータ、除外、fit/tune分割
- parent ID順で固定したBrowser 256親、V9 1,024親
- sentinel seed
- AdamW、learning rate、weight decay、gradient clip
- batch、bucket、domain pairing、epoch順
- MPS、40 epoch
- Browser/V9それぞれTop-1 85%以上、pair 98%以上という4条件

これらを固定することで、v1との差をobjective変更へ限定する。

## 実行前の整合性チェック

v1のsentinelでは、重複position ID、正規化43-plane入力衝突、同一モデル入力への矛盾labelはいずれも0だった。teacher-score oracleはBrowser/V9のTop-1とpairで100%だった。

教師最善手の同点はBrowser 3/256親、V9 13/1,024親にある。v2のhardest-negative marginは同率首位の集合内で互いにmarginを要求せず、首位集合と最も強い非首位だけを分離する。

## 停止条件

40 epoch後に4条件をすべて通れば、v1で予定していた正式candidate工程へ進む資格ができる。まだライブ変更の資格ではない。

1条件でも落ちればobjective-only v2は棄却する。追加epoch、追加seed、閾値緩和、同じobjectiveの細かな追試はしない。次は各合法手の「指した後の盤面」を直接encodeするchild-board encoderの小規模capacity診断へ進み、表現不足かを分離する。

## 現在の主張範囲

- v1の失敗は確認済み
- v2はobjectiveだけを変える固定診断
- v2の強化効果はまだ未測定
- 本学習、sealed教師、蒸留、WASM、対局A/B、ライブ重み変更はv2 sentinelの外側

v1の実測値は [capacity v1結果記事](./blog-shogi-capacity-policy-value-plan.md) と [機械可読結果](./data/shogi-capacity-policy-value-v1-result-2026-07-27.json) に記録した。
