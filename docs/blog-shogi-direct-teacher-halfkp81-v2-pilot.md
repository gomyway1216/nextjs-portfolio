# direct-teacher HalfKP81 v2：次の56局だけを先に固定する

> 2026-07-29時点で、immutable pilot datasetは **223,834行**（train 200,944、validation 22,890）まで生成済みである。optimizer作成、学習、静的評価、対局はまだ **0**。protocol、create-only dataset生成器、paired56 controllerの実装とテストを順に進めているが、まだAIは強くなっておらず、live weightも1 byteも変更していない。[English](./blog-shogi-direct-teacher-halfkp81-v2-pilot.en.md)

## なぜ別の実験へ移るのか

直前のroot-policy student系統はone-shot tuneで終了した。V9 tuneでは、studentのTop-1が **855 / 4,411（19.38%）**、基準が **1,078 / 4,411（24.44%）**、pair精度はstudent **57.61%**、基準 **59.85%** だった。Browser tuneでもstudentのTop-1は **16 / 196**、pair精度は **56.47%** で、基準の **19 / 196、66.55%** を下回った。同じ学習をepochやseed違いで繰り返す根拠はないため、このlaneは再開しない。

HalfKP81のalpha 0.50候補には、別の限定的な根拠がある。56局screenは **31勝20敗5分**、独立96局は **53勝37敗6分** だった。しかし正式768局は **376勝357敗35分、51.237%** に収束し、pair bootstrapの両側95%下限は **47.721%** だった。つまり「弱い」と確定した候補ではないが、「現行より強い」とも証明できなかった。この候補へ何となく追加学習するのではなく、まだ分離して試していない仮説を1本だけ検査する。

その仮説は、**固定したalpha 0.50を初期値とし、既存V9 fit roleにあるやねうら王depth-16の子局面CPだけを直接学習すれば、順位損失や勝敗混合で崩した値の形を保ちながら、現行より有望な候補を作れるかもしれない**、というものだ。保証ではない。56局で早く棄却できる、検証可能な仮説である。

## 実行前に固定したもの

| 項目 | 固定値 |
|---|---|
| 初期値 | `alpha-050.pt`、191,656,679 bytes、SHA-256 `ea36d0b9f0ecdf9543daf8f77fed42577ccc38deb6a964e8df78dc8549b6a8c4` |
| immutable live基準 | `public/shogi-nnue-weights.bin`、1,185,988 bytes、SHA-256 `e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc` |
| 教師source | V9 278,736行、23,980親、1,000局。fit roleだけを使用 |
| target | 子局面側視点のやねうら王depth-16 CP。勝敗、policy、rank、neural teacherは混ぜない |
| split | `game_id`をSHA-256で90% train / 10% validationへ丸ごと割当 |
| model | HalfKP factor、全parameter更新、candidate 1本 |
| objective | direct scalar sigmoid BCE、K=600、CP clamp=3000、WDL=0、rank=0、policy=0 |
| train | seed 42、batch 2048、learning rate `3e-6`、AdamW、1 epoch、最終checkpointだけ |
| play | 未使用opening 28組を先後交換、1手1.5秒、56局、12並列 |
| 合格線 | 62 / 112 half-points以上、fault 0、全着手合法 |

train/validationの単位は行ではなく**局全体**である。さらに、すでに結果を見たBrowser tune 196親、V9 tune 4,411親、known-eval union、fresh selection、fresh final、過去のprotected unionとの親・局面・子局面・semantic overlapをすべて0にしなければ、datasetを公開できない。trainとvalidationの間も、game、parent、position、child-position、semantic positionの重複を0にする。

生成器は入力元のbytes/SHA-256を照合してからV9 fit membershipを再構成し、`teacher_child_cp`だけを子局面側視点の整数CPとして出力する。同じ`child_position_id`が複数回現れた場合、SFENとCPが同一なら1行へ一意化し、どちらかが異なれば平均や多数決をせずSTOPする。train/validationごとにgame、parent、position、child、semantic ID集合のSHA-256をmanifestへ記録し、出力ファイル、manifest、実行コード、phase-1 receipt、spent-tune receiptを完了receiptで結ぶ。既存directoryは上書きせず、receiptを最後に作る。

最初の実データ実行は171行目で安全に停止した。V9には通常keysetが276,209行、`teacher_mate`と`teacher_mate_sign`を加えた正規mate keysetが2,527行あり、初版は後者を未登録fieldとして拒否したためである。出力directoryは作成されず、one-shot実験も消費していない。修正版はこの2 keysetだけを許可し、mate値が非0整数、signが±1でmate値の符号と一致し、`teacher_score_kind == "mate"`、子側CPが`-sign × (1,000,000 - |mate|)`と一致することを検証する。それ以外のfieldや不整合は引き続きSTOPする。

修正版のmerge後、実データ生成は成功した。重複除去と永久除外を通過した出力は **223,834行**（train **200,944**、validation **22,890**）で、完了receiptのSHA-256は `67dc301590999aad2f1b4fe1dc8e847f21535bb01a160d764f650d3cb64057da` である。この成功は学習や棋力向上を意味せず、固定した1 epochへ進める入力が初めて揃ったことだけを意味する。

## 二段階の停止条件

学習後すぐ長い対局へ進めない。validationで次をすべて満たす必要がある。

- 非有限値、technical fault、export round-trip不一致、WASM parity不一致が0
- teacher MAEが初期値から最低5cp改善
- pair精度の低下が0.2ポイント以内
- 量子化後の平均・最大CP誤差が初期値比1.05倍以内
- research runtime探索の速度低下が5%以内

これは棋力証明ではなく、明らかな破損を止める静的screenである。全条件を通った1本だけが、固定した56局へ進める。56局の合格線は62 / 112 half-points、すなわち55.36%。途中停止は、残りをすべて勝っても62へ届かない場合だけ許す。

どこか一つでも失敗したら、このobjectiveとpilot familyを閉じる。後からdata、epoch、seed、checkpoint、retryを足したり、閾値を変えたりしない。合格しても許可されるのは、別途事前登録するexpanded-data stageだけであり、formal A/B、外部高段校正、live反映ではない。

## paired56 controllerが固定する境界

対局openingは学習結果を見る前に別manifestへ固定した。既存のcomplete prior-opening inventory **3,198 fingerprints**をfile SHA-256とcanonical-list SHA-256で認証し、seed `1200001`から同じ固定時間harnessのgeneratorを走らせた。最初の28 seedはすべて過去inventoryとの交差0、選択内重複0だったため、`1200001`〜`1200028`をそのまま採用した。これはdatasetのprotected-position集合とは別の検査である。screen plan作成時には、dataset manifestがtune/protected集合との重複0を証明したことと、opening manifestが過去対局openingとの重複0を証明したことを両方再検証する。

controllerはtrainer resultを直接「強い証拠」と扱わない。次のidentity chainがすべて一致した場合だけ、candidate/liveのhashを固定したcreate-only screen planを作る。

- protocol → dataset manifest → execution plan
- final-epoch trainer result → candidate weights（81 buckets）
- runtime sanity → initializer/candidate weightsとHalfKP81 research WASM
- static sanity → 9条件すべてPASS、technical fault 0
- opening manifest → 28組、1手1.5秒、先後交換、12 workers

従来harnessの最大手数defaultは256のまま維持し、v2 planだけが `--max-plies 512` を明示する。opening book、外部mate solver、fallbackは使わない。各pair log、pair receipt、journal内のattempt、fault、resultはcreate-onlyで、既存証拠を上書きしない。

結果の分類も分ける。62 / 112未満の完了または数学的futilityは**棋力不合格**であり、pilot familyを閉じて再開できない。subprocess、asset、receiptなどの**technical fault**は棋力結論を出さず、同じscreen-plan SHA-256、同じcandidate/live hash、同じopeningと閾値を保つ場合だけ、明示したtechnical-fault resumeで未完pairを続行できる。どちらもlive writeを許可しない。

openingだけをread-only検証するcommandは次である。

```bash
PYTHONPATH=ml python3 ml/direct_teacher_halfkp81_v2_screen.py \
  validate-openings --repo-root .
```

学習とstatic sanityが全PASSした後に限り、`prepare`でscreen planをcreate-only生成し、そのSHA-256を明示して`run`する。`run`を先に実行して権限を迂回する経路はない。このPRのテストでは合否・fault・resumeを合成receiptで検査しており、実対局は走らせていない。

## 現在値

| 工程 | 実数 | 状態 |
|---|---:|---|
| protocol / validator | 1式 | 実装・テスト済み |
| create-only dataset生成器 | 1式 | mate keyset修正版をmerge・実行済み |
| fresh opening manifest | 28組 | 3,198件と交差0、学習前に固定 |
| paired56 controller | 1式 | 実装・合成テスト済み、実対局0 |
| pilot dataset | 223,834行 | train 200,944、validation 22,890、receipt認証済み |
| optimizer / epoch | 0 / 0 | 未開始 |
| static sanity | 0件 | 未実行 |
| paired screen | 0 / 56局 | 未開始 |
| expanded stage | 0 | 未許可 |
| formal 768局 / 外部200局 | 0 / 0 | 未許可 |
| live weight変更 | 0 bytes | 禁止 |

tracked protocolだけをread-only検証するには次を実行する。

```bash
PYTHONPATH=ml python3 ml/build_direct_teacher_halfkp81_v2_plan.py --validate-only
```

このcommandは外部datasetを開かず、optimizer、checkpoint、対局、live writeの権限を一つも発行しない。次の進捗は「PRを作った」ではなく、永久除外を満たしたpilot datasetを作り、固定した1 epoch、static sanity、56局が実測でどうなったかで報告する。
