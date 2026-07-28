# 将棋child-board capacity v3：表現だけを変える固定診断

> capacity v1とobjective-only v2は、固定した訓練内sentinelの4条件をすべて通れなかった。v3は各合法手を指した後の盤面を直接encodeし、architectureだけを変えて表現不足の仮説を検証する。まだ実行しておらず、棋力向上も合格も主張しない。[English](./blog-shogi-child-board-capacity-v3-plan.en.md)

## なぜv3へ進むのか

v1とv2は同じ5,953,522-parameterモデル、同じデータ、同じ1,280親、同じ40 epochで実行した。v2ではlossを合否指標へ合わせた結果、Top-1は両domainでゲートを通ったが、pairは両方とも届かなかった。

| 指標 | v1 | v2 | 固定ゲート |
|---|---:|---:|---:|
| Browser Top-1 | 179/256（69.92%） | 222/256（86.72%） | 85%以上 |
| Browser pair | 73.85% | 73.08% | 98%以上 |
| V9 Top-1 | 811/1,024（79.20%） | 921/1,024（89.94%） | 85%以上 |
| V9 pair | 87.00% | 84.85% | 98%以上 |

v2のobjective変更はTop-1へは効いたが、pairの不足を解消しなかった。これは「child-board encoderなら通る」という証拠ではない。ただし、同じobjectiveのepoch追加や閾値緩和をせず、次にarchitectureの表現だけを変える理由にはなる。

v1の外部結果は25,048バイト、SHA-256 `d7fd48f709bcd149330c8ff86eb4e878aa1b5156d6dde9fe62c2fd6fd55f6cf2`。v2の外部結果は25,053バイト、SHA-256 `1f16f030d52d2aff1d8009614aaeb2183a68b462e212933924fae594c2136e3a` で、どちらも `complete-sentinel-rejected` で閉じた。

## v3で変えるもの

変更は、各合法手の認証済み `child_sfen` を読む小型child-board encoderだけである。

1. 各合法手後の局面を、既存と同じ43 planesへ変換する。
   - 手番側正規化した駒配置28 planes
   - 物理最大値で正規化した持駒14 planes
   - clipした手数1 plane
2. validな合法手だけを、全手で共有する16-channel CNNへ通す。
   - 43→16の3×3 convolution、GroupNorm 4、GELU
   - 16-channel residual blockを2個
   - 16×9×9をflattenし、Linear 1296→128、LayerNorm 128
3. 128次元のchild-board vectorを既存の721次元move inputへ連結し、849→256へ射影する。

`child_sfen` は新しいデータでも新しい教師labelでもない。既存rowに含まれる決定論的なviewであり、`parent_sfen`へ合法手を適用した結果、`child_sfen`、`child_position_id`が一致しなければoptimizer作成前に停止する。

## パラメータ差分

| 項目 | parameters |
|---|---:|
| v2本体 | 5,953,522 |
| child stem | 6,224 |
| 16-channel residual blocks × 2 | 9,344 |
| child projection + normalization | 166,272 |
| move projectionの721→849拡張 | 32,768 |
| v3追加分 | 214,608 |
| v3合計 | 6,168,130 |

追加はv2比214,608 parameters、約3.60%である。fp32 weight bytesは23,814,088から24,672,520へ増える。

親盤面の64-channel・6 residual block encoder、4-layer Set Transformer、policy/value heads、frozen live CP anchor、出力の意味は変更しない。v1/v2の棄却weightsも使わず、v3は固定seedから一から初期化する。

## v2から固定するもの

architecture以外はv2と同一である。

| 項目 | v3固定値 |
|---|---|
| objective | `gate-aligned-micro-pair-hard-negative-v2` |
| loss | listwise 1、domain-micro pair 1、tie-aware hardest-negative 1、move-value 0.20、state-value 0 |
| sentinel | Browser 256親、V9 1,024親 |
| sentinel parent receipt | Browser `2396e593...d6c4`、V9 `66bc3669...5a3` |
| sentinel seed / epochs | `20260726` / 40 |
| batch | Browser 32、V9 256 |
| optimizer | AdamW、learning rate 0.0003、weight decay 0.0001、gradient clip 5 |
| sentinel gate | 両domainでTop-1 85%以上、pair 98%以上。4条件すべて必須 |
| full training | V9 pretrain 4 epochs + mixed 12 epochs |
| candidate seeds | 42。known-tune全条件通過後だけ314159 |

入力ファイル、bytes/hash、protected-position union、game-semantic split、fit/tune件数、live baseline、known-tune gate、replication、512-parent sealed条件もv2から完全固定する。known-eval、tune、sealedのlabelやcandidate結果はv3設計に使っていない。

## 判定後の分岐

最初に実行するのは40-epoch sentinelだけである。

- 4条件のうち1つでもFAIL：weightsを破棄し、本学習、seed 42、seed 314159、known-tune candidate選択、sealed教師生成、蒸留、WASM、対局、ライブ変更をすべて停止する。epoch追加、seed追加、gate緩和、child encoderの拡幅・追加追試もしない。
- 4条件すべてPASS：同じprotocolのV9 pretrain 4 + mixed 12によるseed 42本学習だけを許可する。これはライブ変更の許可ではない。
- seed 42がknown-tune全条件をPASS：初めてseed 314159を許可する。
- 両seedが独立にPASSしcheckpoint hashが固定：初めて既存512-parent sealed評価を開ける。
- sealedをPASSしても、棋力や高段を名乗るには別登録のruntime・直接対局証拠が必要である。

この順序は「静的指標がよかったからそのままライブへ置く」ことを防ぐための境界である。

## 固定protocol

v3 protocolは [capacity-policy-value-v3-plan.json](../ml/protocols/capacity-policy-value-v3-plan.json) に事前登録した。

- schema：`shogi-capacity-policy-value-plan-v3`
- model variant：`child-board-encoder-v3`
- feature version：`dense-43-plane-resnet-set-policy-child16x2-v3`
- bytes：24,326
- SHA-256：`4cdda7ab438aef16332b545477eb7ac12047ef13c19432d621c03803fb67b2a6`

結果を見た後にarchitecture、objective、40 epoch、gateを変更することはできない。

## 現在地

- v1 sentinel：棄却、閉鎖
- v2 sentinel：Top-1 2条件PASS、pair 2条件FAIL、総合棄却、閉鎖
- v3 protocol：固定済み
- v3 sentinel：未実行
- v3本学習、seed 314159、sealed教師生成：未許可・未開始
- 蒸留、WASM、対局A/B：未開始
- ライブ重み：未変更

v2の実測と失敗理由は [objective-only v2記事](./blog-shogi-capacity-objective-v2-plan.md)、v1からの経緯は [capacity v1記事](./blog-shogi-capacity-policy-value-plan.md) に記録している。
