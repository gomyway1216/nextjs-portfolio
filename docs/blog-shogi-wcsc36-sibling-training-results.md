# 6 runを完走しても「強くなった」とは言わない — WCSC36 sibling学習のselection不合格記録

> [前編](./blog-shogi-wcsc36-sibling-training.md)では、強豪棋譜の実戦手を正解としてコピーせず、同じ親局面の候補を1手ずつ独立探索するv6教師を作った。本稿はその次の実験日誌である。depth 18 full attemptsはheavy tailで停止したため、別のLane A比較で最終policyをdepth 16へ固定し、fresh full run、sealed partition、warm/scratch各3 seedのexact 6 runまで完了した。結果を見る前に固定した規則ではwarm seed 42がprovisional candidateになったが、selection top-1とfloat→int16 pair差の2 gateに落ちた。そのためcandidate receiptを発行せず、final holdoutも開かず、productionはrunOp1のままにした。policy選択は全28局へ触れていたため、ここで保証するのはgame-levelの未見性ではなく、Lane A全workの102 parent / 1,392 semantic ID exposureを除いた**PR4A以降のexact-row seal**である。**これは棋力向上の発表ではなく、不採用判断の記録である。** English version: [blog-shogi-wcsc36-sibling-training-results.en.md](./blog-shogi-wcsc36-sibling-training-results.en.md)

---

## TL;DR

- Lane Aはfixed depth 16、MultiPV 12、12 engines、Hash 64 MiB、1探索600秒を最終teacher policyに選んだ。fresh full runはclean revisionから完了し、3,112 selected = 3,106 completed + 6 skippedをmanifestで確定した。36,365 candidate records、train 23,813行、val 8,761行である。partitionerはraw SHA-256、全entry accounting、teacher revision、strict search map、engine/eval/completionとbase manifest SHA-256を検証し、n=100 pilotをfull teacherとして受理しない
- clean n=100 pilotだけでなくLane Aのhard-case/repeat/node-policy workも含め、tracked receiptは102 parent IDs / 1,392 semantic IDsへ拡張した。parentまたはsemantic接触groupを全roleから先に除外する
- 元のvalidation 7局はfixed depth-16 domain・seedによるSHA-256順位でmodel selection 4局とfinal holdout 3局へ分ける。同じ実装による非公開auditは、Lane A exposure除外をtraining 307親 / 3,642行、selection 64親 / 762行、holdout 49親 / 588行、unmatched parent IDs 7件と確定した。旧416 / 339親は現行値として使わない
- semantic identityは`position_id ∪ child_position_id`。Lane A exposure除外後、holdoutとselectionが衝突すればholdoutが勝ち、evaluation全体とtrainingが衝突すればevaluationが勝つ。常に**親グループ全体**を落とす
- sealed 6-run seriesのdeviceは`cpu`に固定した。旧PyTorch 2.3.0のnative MPSは`aten::_embedding_bag`で即失敗した。予定runtimeのPyTorch 2.12.1ではnative MPSが動き単processは約1.9倍速かったが、決定論modeでも同一2 runのloss/weight hashが再現しなかった。CPUはbyte-exactで、6 process並列も使える
- 学習プロセスはfinal-holdout JSONLを引数に取らない。warm-startとscratchをseed 42 / 43 / 44でexact 6 run完走し、全result/checkpoint/int16 export/report hashを監査した。6 run以外のseedや設定は追加していない
- series内median代表はwarm seed 42とscratch seed 42、両者の比較でprovisional candidateはwarm seed 42になった。checkpoint SHA-256は`96863352…e51`、int16 exportは`8b82fd1a…0565`、selection reportは`031991dc…88c`である
- provisional candidateのint16 pair accuracyは`0.6072284474`でstableの`0.6048966902`を上回ったが、top-1は`0.2639296188`でstableの`0.2668621701`を下回った。さらにfloat→int16 pair差の絶対値`0.0027203834`が上限`0.002`を超えた。事前登録した4 gate中2 gate失敗である
- selection auditは`passed: false`、candidate receiptは`not_emitted_selection_gate_failed`、final holdoutは`labels_read: false` / `sealed_not_opened`である。採用後段のretention、`P*8f`、384局A/B、browserへは進まず、productionはrunOp1のままにした
- 次の実験はpost-hocにseedを入れ替えず、int16で使う形を学習中に意識するint16-aware training / QATを別planとして事前登録する

---

## 0. この記事で「結果」と呼ぶもの

途中の期待を完成結果へすり替えないため、状態を4つに分ける。

- **確認済み**：保存済みbytes、hash、checkpoint行、または再現テストで確認した事実
- **進行中**：固定した入力と契約でprocessが動いているが、commit markerであるmanifestがまだない
- **事前登録済み**：結果を見る前に固定した選択規則・合格条件
- **未実施**：holdout開封、A/B、browser採用確認など、まだ数字がない工程

この区別では、「600秒depth-18 runは393親で停止した」「Lane Aでdepth 16を選んだ」「fresh depth-16 full teacherが3,112 entryをaccountした」「sealed 6 runを完走した」「warm seed 42が規則上のprovisional candidateになった」「selection 4 gate中2 gateに落ちた」は確認済みである。final holdout、retention、`P*8f`、384局A/B、browser採用確認は、selection不合格のため未実施のままである。

---

## 1. なぜ結果より先に判定規則を書くのか

前回の失敗は、評価関数を`runOp1`から`deep16`へ上書きしたあとに実戦回帰が見つかったことだった。全体MAEが良くても、作者の実戦局面で`P*8f`を押し上げれば弱くなる。さらに、同じvalidationをepoch選択、warm/scratch比較、hyperparameter調整へ何度も使えば、最後にはそのvalidationへ最適化しただけのモデルを「未見に強い」と誤読できる。

そこでPR4A以降の役割を、強いweightの導入ではなく次の境界の固定に限定した。

1. full teacher bytesを完成させる（完了）
2. training / model selection / final holdoutを再現可能に分離する
3. final holdoutのラベルを学習processから物理的に外す
4. warm/scratchの試行数と代表選択を固定する
5. selection全gate合格時だけcandidate receiptとhashを凍結し、final holdoutを1回だけ開く
6. 棋力を名乗る条件を、量子化・回帰・対局・browserまで先に書く

数字を見たあとで閾値を動かせば、どんなモデルにも都合のよい物語を作れる。ここでは、その自由を先に捨てた。実際には手順4まで進み、selection不合格によって手順5のreceipt発行前で停止した。

---

## 2. depth 18の停止、Lane A比較、depth 16 full run

### 2.1 固定済みの入力

最初のfull attemptsは[前編のclean depth 16/18 gate](./blog-shogi-wcsc36-sibling-training.md)を通過したdepth 18で始めた。ただし後述するheavy tailが判明したため、そのattemptは採用せず、難局を含む別のLane A比較を行った。比較の結果、**最終teacherの探索limitをfixed depth 16へ固定した**。次の入力identityは変えず、最終search contractだけを新しいfingerprintにした。

| 対象                             | 固定値                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| teacher pipeline source revision | `8e376e887fac19fb31c07f147e17e84b1d5fc4b2`                         |
| WCSC36 raw parent JSONL SHA-256  | `827e912032feac9fd539af58a0e35c1131a1228abedcb1bca9c5f51f214bdfaa` |
| YaneuraOu engine SHA-256         | `1e4971493f049f1c7d72a7e12555c3c2a3c2233f65a506eecb8ed7136bcdc5d1` |
| eval tree SHA-256                | `639397609565fc2f113242503483addaf812b39c43a4d813d51b9c68ca51d568` |
| stable runOp1 checkpoint SHA-256 | `571ca3090cd0f41772514547ea5ac1d5bcd32f3f79820511645e298dbaa65ff8` |
| legacy replay source SHA-256     | `2207eba555fc0109fe2842ff8f92cb08d42e47893d9aabd863b3f552371a56cb` |

停止した2つのfull attemptsはdepth 18、proposal MultiPV 12、12 engine processes、1 engineあたりHash 64 MiBだった。候補ごとの独立探索、候補順、`isready` reset、engine/eval snapshotというv6安全契約は維持し、最終policyだけをfixed depth 16、MultiPV 12、12 engine processes、Hash 64 MiB、1探索`timeout=600s`へ変更した。

### 2.2 attempt 1 — 120秒は「失敗ラベル」ではなく運用上の上限だった

最初のfull attemptは、1探索あたり`timeout=120s`で開始した。215親をdurable checkpointへ保存したあと、難しい親でtimeoutになり停止した。途中checkpointは壊れていなかったが、探索条件を変えて同じrunの続きを名乗ることはできない。

問題親は次である。

```text
sha256:0e8d5252898368e57b9d330688d3c33ff94518609b8430a8403971134b60ed6c
```

この親には12 sibling候補があり、広い時間枠でruntimeだけを再現すると親全体の処理に188.52秒かかった。ここで見たのは候補数、経過時間、processの完了可否だけであり、cp、rank-1、実戦手順位をtimeout変更の判断には使っていない。

重要なのは、timeoutがラベルの品質閾値ではないことだ。120秒で終わらない局面を「悪いデータ」として落とせば、難局だけを選択的に消す。逆に、不完全探索を受理することもできない。この時点では上限だけを広げたが、次のattemptでもheavy tailが再現したため、その後は別runとしてpolicyを比較し直した。

### 2.3 attempt 2 — 600秒でも393親後に停止した

attempt 2は`timeout=600s`、別fingerprint、別work/outputで3,112親を先頭からfresh restartした。しかし393親をdurable workへ保存した時点で、別のheavy parentが上限へ到達して停止した。attempt 1の215親とattempt 2の393親は、どちらもfinal teacherへ混ぜない。

このheavy parentだけを`timeout=3,600s`の隔離diagnosticで実行すると、8 siblingsが完了するまで**1,693.48秒（約28分13秒）**かかった。これは3,600秒でfull runを再開したという意味ではない。diagnosticはruntime tailを測っただけで、final train/val/manifestを公開していない。

### 2.4 final teacher policy — Lane Aはfixed depth 16を選択

Lane Aではclean n=100をdepth 16でfresh生成し、既存のclean depth-18 n=100と同じ事前指標で比較した。rank-1候補集合overlapは67%、exact top-1一致は65%、候補集合overlapは68%、Jaccardは84.926%だった。通常cp差はmedian 29 cp、p90 125.3 cp、5% trimmed mean 41.688 cp。200 cp閾値の関係一致は5,050 / 5,473 = 92.271%、全pair反転は8 / 5,473 = 0.1462%、両方decisiveなpairの向き一致は1,288 / 1,296 = 99.3827%だった。

depth 16は1,331,739,463 nodes、depth 18は3,291,077,196 nodesで、後者は2.4713倍だった。depth-16 n=100のwall timeは254.15秒。問題親`0e8d…`はdepth 16で43.02秒 / 40,444,364 nodes、depth 18で188.52秒 / 181,227,281 nodesとなり、rank 1の`B*6g`も維持した。さらに別の問題親`1279…`はdepth 16で36.46秒 / 35,711,825 nodesで完了した一方、depth 18は667.01秒後に1探索600秒timeoutとなり、ラベルを公開できなかった。2つの問題親をdepth 16で再実行するとwork / train / val / manifestはbyte-for-byte一致した。

fixed nodesも代替にならなかった。1,000,000 nodesではbestmove / PV1不足、2,000,000 nodesではn=100のduplicate PVが発生し、問題親も2つのうち1つしか完了しなかった。したがってnode上限を品質保証と誤認せず、fixed depth 16を採用した。

最終contractはfixed depth 16、proposal MultiPV 12、12 engines、Hash 64 MiB、1探索600秒である。2026-07-10 16:37:45 UTC、clean revision `8e376e887fac19fb31c07f147e17e84b1d5fc4b2`から、専用directory `ml/data/wcsc36/full-depth16-v6-8e376e8/`へ0親でfresh full runを開始し、5,354.31秒でexit 0になった。manifestは3,112 selected entryを3,106 completed / 6 skippedへ完全accountし、36,365 candidate records、21 train games / 7 val games、全overlap 0を記録した。trainは23,813行・20,286,990 bytes・SHA-256 `909f12a503c240b5bf73bc3f7552d1df525531fc7b2b1b6e1dce2fdef70ad70a`、valは8,761行・7,422,900 bytes・SHA-256 `5a2435df0c995a325ed3b4584355aa716dd1c91af7e3099413bb34f99e9ac401`、workは43,197,235 bytes・SHA-256 `f183d40326192813070b17a963b489776c62c3bad4c9223f840ecb371b21fec5`、manifestは4,895 bytes・SHA-256 `3381e238d722751a73f50e3e89c332ce7344e443e588ea061946cec4e2d4cecc`である。その後、role audit、partition公開、学習6 runまで完了したが、selection gateで不採用となりproduction weightは変更していない。

---

## 3. 7局のvalidationを、選択4局とPR4A以降exact-row封印の3局へ分ける

### 3.1 game assignmentは固定だが、3局をgame-level未見とは呼べない

元のgame splitはtrain 21局 / validation 7局である。validation 7局を次の固定protocolで並べる。

```text
SHA256(
  UTF8("shogi-sibling-eval-partition-v1") || 0x00 ||
  UTF8("wcsc36-d16-v6-eval-v1")          || 0x00 ||
  UTF8(game_id)
)
```

digest bytesの昇順、同じdigestなら`game_id`のUTF-8 bytes昇順とし、先頭3局をfinal holdout、残り4局をmodel selectionにする。quotaはexact 3 / 4であり、結果を見て比率を変えない。

Lane A exposureとrole間semantic conflictを除いた公開partitionは次の割当になった。

| role             | games | parents / records | 用途                              |
| ---------------- | ----: | ----------------: | --------------------------------- |
| model training   |    21 |    1,725 / 20,123 | warm/scratchへ渡す                |
| model selection  |     4 |       341 / 3,912 | epoch/checkpoint/series選択に使用 |
| final holdout    |     3 |       290 / 3,391 | candidate receipt後だけ評価       |
| validation total |     7 |       631 / 7,303 | 4局 + 3局                         |

game assignmentはcpやrankを見ず、game IDとdepth-16用の固定hashだけで決める。depth-18由来seedで得た旧416 / 339親や、以前の100親だけを70 / 15 / 15親、830 / 180 / 180行へ割り振った表は診断履歴であり、現行のrole accountingではない。depth選択pilotだけでなくhard-case、repeat、node-policy診断を含むLane A workが全28局へ触れているため、「3局を初めて開く」「game-level untouched」とも記載しない。

現行tracked receiptは、Lane Aで実際にcommitされた全workから102 parent IDsと`position_id ∪ child_position_id`の1,392 semantic IDsを導出する。2つのsorted/unique/LF-terminated ID fileとreceipt自体をそれぞれSHA-256で固定する。partitionはparent IDが一致するか、兄弟group内のposition/childがsemantic receiptへ1つでも触れた場合、group全体をtraining、selection、holdoutの全roleから先に除外する。clean HEADでの`--audit-policy-exposure`はartifactを公開せずexit 2となり、training 307親 / 3,642行、selection 64親 / 762行、holdout 49親 / 588行、unmatched parent IDs 7件を返した。この値をreceipt（4,111 bytes、SHA-256 `083a86e48f1af134b854cdf0e505f0f39cc55ef75d5cbbc0df47c3e1c5013a6f`）とTS/Python contractへ固定した。保証できるのは、この除外後のholdout行とcandidate選択の間に設ける**PR4A以降のexact-row seal**だけであり、teacher constructionから独立したholdoutではない。

同じclean revision `6d541f1108a22f18751ee009417c3e57e27f8205`でpreflightを通し、出力不存在を再確認してから公開した。manifestを最後のcommit markerにし、Python consumerでも全source/output bytesと全isolation=0を再検証した。

| partition artifact     | records / parents |      bytes | SHA-256                                                            |
| ---------------------- | ----------------: | ---------: | ------------------------------------------------------------------ |
| model training         |    20,123 / 1,725 | 17,154,270 | `f6dcfd6a7ca0b42e730ba0aff46394bf61e772a9b01270c5bfe126daf81c6e26` |
| model selection        |       3,912 / 341 |  3,319,397 | `97b15ba1ee780009986b5e8210cbfdbfc181f93555b7c1a87f4a6a585b7bb5ba` |
| final holdout          |       3,391 / 290 |  2,870,874 | `89b3e2ca1e637a507b4b6559326ada420d205c3967ac33063a9084ee5290e8c8` |
| protected semantic IDs |         3,372 / — |    242,784 | `762b95b52f50223fd484573d7d3823f3d2d7622ea3817f4300ae9fcc95935d26` |
| partition manifest     |                 — |      5,357 | `d95e66239dbf2dcf3979f4cf52a5ed666922f808f82b35aff4ccefc95c0d8ee1` |

### 3.2 auditで見つかった、同種比較だけでは足りない漏洩

元のsplitは`train.position_id`対`val.position_id`と、`train.child_position_id`対`val.child_position_id`を0にしていた。しかし、modelの意味上は次のcross directionも同じ局面の再出現である。

- `train.position_id` ↔ `evaluation.child_position_id`
- `train.child_position_id` ↔ `evaluation.position_id`

PR4Aの相互監査で、この2方向が独立に検査されていないことが分かった。そこでsemantic setを一律に

```text
position_id ∪ child_position_id
```

と定義し直した。

まずLane Aのparent/semantic exposure unionへ触れるgroupを全roleから落とす。その後、final holdoutとmodel selectionが重なれば、**final holdout wins**としてselection親を候補行ごとではなく親グループ全体で落とす。次に、surviving selectionとholdoutのsemantic unionをevaluation setとし、そこへ触れるsource-training親を親グループ全体で落とす。**evaluation wins**である。

結果として学習器が読むのはbase manifestの元trainではなく、partition manifestが結ぶ`model_training`である。21 training gamesのどれかが丸ごと消える場合、または4 selection / 3 holdoutのquotaが崩れる場合は、manifestを公開せずfail-closedする。training、selection、holdoutの元JSONLは再serializeせず、採用行のoriginal bytesをそのままfilterする。

### 3.3 holdoutのラベルを学習processへ渡さない

partitionは次の5 artifactsをfsync付きatomic renameで書き、最後にmanifestをcommit markerとして書く。

1. semantic-isolated `model_training` JSONL
2. `model_selection` JSONL
3. `final_holdout` JSONL
4. holdoutのprotected semantic position IDs
5. 以上のbytes/hash/countと全overlap=0を結ぶpartition manifest

protected ID fileは`sha256:...`をUTF-8 bytes昇順、unique、LF終端で保存する。ここにcp、move、rank、SFENはない。

学習CLIは`model_training`、`model_selection`、partition manifest、policy exposure receipt/IDs、protected IDsを受け取るが、`final_holdout` pathを受け取らない。replayでは**policy semantic union ∪ selection semantic union ∪ holdout protected IDs**を先に除外し、そのeligible集合からexact 500,000行をsampleする。不足時は停止する。checkpointには各集合と合併集合のcount/hash、holdoutの`sealed_not_opened`を記録する。

```bash
node -r tsx/cjs ml/partition-sibling-validation.ts \
  --source-train ml/data/wcsc36/siblings.train.jsonl \
  --source-val ml/data/wcsc36/siblings.val.jsonl \
  --base-manifest ml/data/wcsc36/sibling-manifest.json \
  --policy-exposure-receipt ml/protocols/wcsc36-policy-exposure-receipt.json \
  --policy-exposed-parent-ids ml/protocols/wcsc36-policy-exposed-parent-ids.txt \
  --policy-exposed-semantic-position-ids ml/protocols/wcsc36-policy-exposed-semantic-position-ids.txt \
  --pipeline-revision "$(git rev-parse HEAD)" \
  --out-train ml/data/wcsc36/siblings.model-training.jsonl \
  --out-model-selection ml/data/wcsc36/siblings.model-selection.jsonl \
  --out-final-holdout ml/data/wcsc36/siblings.final-holdout.jsonl \
  --out-protected-position-ids ml/data/wcsc36/final-holdout-position-ids.txt \
  --manifest ml/data/wcsc36/sibling-eval-partition-manifest.json \
  --preflight
```

receiptの`role_accounting`が`null`の間は`--audit-policy-exposure`だけが同じpartition logicを最後まで走らせ、observed JSONを表示して非公開・exit 2になる。その値をreceiptとコードへ固定した後もaudit flagは常に非公開で、accounting確認後に`Audited (no publish)`と表示してexit 0になる。公開前は別に`--preflight`を成功させ、そこからflagを外したときだけ公開する。base manifestはraw SHA、selected parent IDs、fixed depth 16 / MultiPV 12 / engines 12 / FV scale 20 / Hash 64 MiB / timeout 600,000 ms、split game IDs、engine receiptをexact一致で検査する。

---

## 4. warm-startを「正統な続き」とは呼ばない

runOp1は現在のproduction baselineであり、hashも固定している。しかし、現行sibling manifest、sealed partition、train/selection bytesを記録する前のlegacy checkpointである。

warm-startで許すのは次だけだ。

- `--allow-legacy-init`を明示する
- network weightsだけを読む
- optimizerとschedulerは新規作成する
- checkpoint metadataへlegacy initializationであることを残す

したがってwarmは「runOp1の知識を忘れにくい」という仮説を試す系列であって、「同じ実験の厳密なresume」ではない。runOp1にないprovenanceを後付けしてverifiedとは呼ばない。

scratchは初期重みを共有しない。一方、warmとscratchの両方で同じlegacy replay sourceを使い、500,000行、ratio 1.0へ固定する。replay source SHA-256は`2207eba555fc0109fe2842ff8f92cb08d42e47893d9aabd863b3f552371a56cb`であり、semantic exclusion後にseed固定でsampleする。

---

## 5. 学習matrixと代表candidateの選び方

探索する系列は次の6 runだけである。

| series  | initialization    | seeds      | learning rate | epochs | replay limit / ratio |
| ------- | ----------------- | ---------- | ------------: | -----: | -------------------: |
| warm    | runOp1 model-only | 42, 43, 44 |        `1e-4` |     20 |        500,000 / 1.0 |
| scratch | fresh             | 42, 43, 44 |        `1e-3` |     40 |        500,000 / 1.0 |

各checkpointは`shogi-sibling-training-experiment-v1` receiptを持ち、次を完全一致で検査する。暗黙defaultへ任せず、`--select-metric sibling-pair`を明示する（`auto`はこの実験では拒否する）。deviceも`--device cpu`へ固定する。

この決定前に、同じ42行、batch 256、seed 42、1 epochのsmokeを各2回測った。CPUはreal
`0.94s` / `1.06s`（平均`1.00s`）でwarningなし。native MPSはDistillNetの
`aten::_embedding_bag`がPyTorch `2.3.0`で未実装のため即`NotImplementedError`になった。
`PYTORCH_ENABLE_MPS_FALLBACK=1`では完走し、表示metricsはCPUと一致したが、real
`1.65s` / `1.19s`（平均`1.42s`、CPU比`+42%`）で毎回fallback warningが出た。したがって
fallback環境変数は使わない。

plan runtimeを埋める前に実際のPython `3.13.0` / PyTorch `2.12.1`でも再監査した。この版ではnative MPSのEmbeddingBag forward/backwardは動作した。fixed seed・同一初期state・batch 256・40 sparse indices・AdamW・10 warmup + 200 measured stepsを各2回走らせると、CPU 2 threadsは`0.3476s` / `0.3619s`（575.4 / 552.6 steps/s）で最終lossとweight SHA-256が2回完全一致した。MPSは`0.1932s` / `0.1796s`（1,035.0 / 1,113.6 steps/s）と単processでは約1.9倍速かったが、`torch.use_deterministic_algorithms(True)`とdebug mode `error`でも最終lossが`0.0441174` / `0.0441200`、weight hashも別になった。これは棋力結果ではなくruntime選択のmicrobenchmarkである。6つの比較runを同時に2 CPU threadsずつ動かせ、seed差以外の再現性を維持できるため、sealed比較はCPUだけで行う。trackedな`shogi-sibling-six-run-plan-v1`は
platform / system / machine / processor / CPU model / logical CPU数 / Python / PyTorch / `cpu`を6 run共通runtimeとして固定した。各processはintra-op 2 threads、inter-op 1 thread、deterministic algorithms有効、debug mode `error`である。全input/runtime identityをcommitしたplanは3,057 bytes、SHA-256 `0e34262f77555897d92b01a3737c71057d8b90cc98cdcb2fe63ad24ec4dde070`で、次の別commitにあるコード定数がそのbytesを固定する。dirty/untracked planやhash不一致では学習を開始しない。

plan自身には`training_pipeline_revision`を入れない。planをcommitした後でそのbytesのSHA-256を別commitの定数へ固定するため、plan内へ将来commitのhashを入れると自己参照になり実現不能だからである。実行時はplan hashとtracked/unmodified状態を検証したうえで、worktree全体がcleanかつ`HEAD == --pipeline-revision`であることを別に検査し、そのexecution HEADをcheckpointと完走時のresult markerへ記録する。plan sealと実行code receiptを分離しても、どちらも省略できない。

| 共通argument / identity                       | 固定値                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| loss / features / batch                       | `sibling-ranking` / `board` / `256`                                                                                |
| sigmoid K / cp clamp                          | `600.0` / `3000`                                                                                                   |
| rank weight / pair min / pair max / margin    | `1.0` / `50.0` / `600.0` / `50.0cp`                                                                                |
| policy weight / temperature                   | `0.25` / `200.0cp`                                                                                                 |
| selection                                     | CLI・resolvedとも`"sibling-pair"`                                                                                  |
| primary limit / device                        | `0`（全行） / `cpu`                                                                                                |
| common runtime                                | hardware/OS/Python/PyTorch/`cpu`を完全一致。各process `torch_threads=2`、inter-op `1`、deterministic debug `error` |
| replay                                        | 必須、limit `500000`、ratio `1.0`                                                                                  |
| replay source SHA-256                         | `2207eba555fc0109fe2842ff8f92cb08d42e47893d9aabd863b3f552371a56cb`                                                 |
| warm initializer SHA-256                      | `571ca3090cd0f41772514547ea5ac1d5bcd32f3f79820511645e298dbaa65ff8`                                                 |
| warm legacy flag                              | `true`。model weightだけを安全loadし、optimizer/schedulerはfresh                                                   |
| scratch initializer / legacy flag             | なし / `false`                                                                                                     |
| teacher / partition / filtered dataset hashes | teacher `3381e238…`、partition `d95e6623…`、training `f6dcfd6a…`、selection `97b15ba1…`、protected IDs `762b95b5…` |

warmはseed 42/43/44、`lr=1e-4`、20 epochs、scratchは同じ3 seeds、`lr=1e-3`、40 epochs以外を受理しない。6 processを並行実行しても各processのintra-opは2、inter-opは1なので、学習側のintra-op枠は合計12に固定する。planは6つのrepo-relative output slotも固定し、既存directoryへの再実行を拒否する。完走時だけ`shogi-sibling-training-result-v1`を最後にatomic writeし、全checkpointと`curve.csv`のbytes/hash、pipeline、deterministic runtime receiptを結ぶ。途中停止したdirectoryにはresult markerがないため選抜対象にならない。

結果を見て4つ目のseed、別learning rate、別epoch数を追加しない。新しい設定を試すなら、このfinal holdoutを使い回さず別experimentとして事前登録する。

代表選択はint16量子化後のmodel-selection指標だけで行う。各seriesの3 seedsを次のlexicographic tupleで並べ、median-ranked seedをそのseriesの代表checkpointとする。

1. within-parent pair accuracy：高い方
2. teacher top-1 accuracy：高い方
3. value MAE：低い方

warm代表とscratch代表も同じ順序で比較し、candidateを1つにする。平均値から架空のcheckpointを作らず、実在するmedian seedを選ぶ。
上の3指標まで完全同値なら、追加の暗黙規則は使わず、**series（warm→scratch）、seed（42→43→44）、checkpoint SHA-256（bytewise昇順）**の順で決める。

### 5.1 exact 6 runのselection実測値

6つの出力slotはすべて`shogi-sibling-training-result-v1`まで完走し、その後に同じ3,912 records / 341 parentsのmodel-selection bytes（SHA-256 `97b15ba1…bb5ba`）をint16 exportで評価した。実測値は次のとおりである。丸めた表示から順位を再計算しないよう、audit JSONに保存した値をそのまま記す。

| series / seed |  int16 pair accuracy |   int16 teacher top-1 | int16 value MAE (cp) | series内順位 | `result.json` SHA-256 |
| ------------- | -------------------: | --------------------: | -------------------: | ------------ | --------------------- |
| warm 42       | `0.6072284474383056` | `0.26392961876832843` | `491.98977505112475` | median代表   | `374393b6…f375a`      |
| warm 43       | `0.6063216529567977` | `0.26392961876832843` | `486.31595092024537` | 下位         | `f04e440a…2733c`      |
| warm 44       | `0.6072284474383056` |  `0.2697947214076246` |  `484.6850715746421` | 上位         | `b9aa88c7…c2e5`       |
| scratch 42    | `0.6018524515836517` | `0.24633431085043989` |  `581.5306748466257` | median代表   | `8ea8531e…956c`       |
| scratch 43    | `0.5988729840015545` | `0.20821114369501467` |  `557.2701942740287` | 下位         | `83d5ade4…b349`       |
| scratch 44    | `0.6024353908931925` | `0.25513196480938416` |  `623.1807259713702` | 上位         | `0bf6f448…9e41`       |

warmではseed 43 < 42 < 44、scratchではseed 43 < 42 < 44となったため、事前登録したmedian-ranked ruleの代表はそれぞれwarm seed 42とscratch seed 42である。代表同士を同じlexicographic tupleで比較するとwarm seed 42が上なので、これを**provisional candidate**と呼ぶ。ただし、これはgate通過candidateという意味ではない。

| provisional warm 42 artifact |     bytes | SHA-256                                                            |
| ---------------------------- | --------: | ------------------------------------------------------------------ |
| checkpoint `best-sibling.pt` | 2,389,009 | `968633526e0ebd4a9ef0044626ff3e824fc68fee9225850f2b13d01f655d4e51` |
| int16 export `weights.bin`   | 1,185,988 | `8b82fd1a46c2ff5511ff4f4401261f01406d48e87c07810c2211db3e8a9e0565` |
| int16 selection report       |    12,790 | `031991dcfedf9bf3a70bce55df376de3bdcd088361aea5b8f311c42cac39c88c` |

scratch代表seed 42のcheckpoint SHA-256は`c43b8c88ff08b18ea2d40972774729699e4e9a53870887caa0fbb63ba25dcf55`である。warmの知識を残した系列が今回のselectionでは上だったが、seed 44へ入れ替えればgateを通りやすいと分かったあとで代表を交換することはしていない。

---

## 6. candidate receiptを発行せず、holdoutも開かなかった

model selectionを通った時点で、少なくとも次を保存する規則を先に固定した。

- checkpoint bytes / SHA-256
- int16 export bytes / SHA-256
- series、seed、epoch、全training arguments
- teacher manifestとpartition manifestのSHA-256
- model-selection report bytes / SHA-256
- 比較した設定数はwarm 3 + scratch 3のexact 6 result identitiesとrun-plan SHA-256

しかしprovisional warm 42は後述するselection gateを4つ中2つ失敗した。strict auditの状態は`passed: false`、candidate-selection receiptは`not_emitted_selection_gate_failed`である。したがって上のartifact hashは追跡可能なprovisional identityではあるが、`shogi-sibling-candidate-selection-receipt-v1`は発行していない。失敗後にwarm seed 44へ交換したり、別seedを追加したりもしなかった。

selection auditは6 result marker、checkpoint、int16 export、selection report、stable比較を読み、provisional candidateとgate結果まで生成した。clean revision `9613d267c8f95879d7a2b6b701ecd8647f461d37`を記録した最終strict audit JSONは10,584 bytes、SHA-256 `8dd4c5e55fadb7f174716bcb2935f92c0ed3bc41127e89695ed6da560b3fc19d`である。状態は`not_emitted_selection_gate_failed`であり、成功candidate receiptではない。

final holdoutについてauditが記録したのは`labels_read: false`と`status: sealed_not_opened`だけである。3,391行のholdout labelを読んでいないので、selection失敗をholdoutの良し悪しで言い換えることも、次の設定選びへ流用することもできない。

将来、別の事前登録実験がselectionを通った場合の`shogi-sibling-candidate-selection-receipt-v1`は、6 runそれぞれのresult marker、checkpoint、int16 export（bytes/SHA/bucket数）、int16 selection report identityに加え、median-ranked seed strategy、selection metric/tie-break、selected series/seed/checkpoint、run-plan SHAをexact列挙する。match gateはselected exportと渡されたcandidateが同一で、candidateとstableが別identityであることを検証する。今回の不合格artifactをreceipt発行可能なcandidateへ格上げはしない。

---

## 7. 採用ゲート — 結果を見る前に固定した数値

### 7.1 model selectionと量子化

| gate                          | 事前登録した条件   | candidate / reference                                 | 結果     |
| ----------------------------- | ------------------ | ----------------------------------------------------- | -------- |
| selection int16 pair accuracy | **stableより高い** | `0.6072284474383056` / `0.6048966902001425`           | **pass** |
| selection int16 top-1         | **stable以上**     | `0.26392961876832843` / `0.2668621700879765`          | **fail** |
| float → int16 pair差          | 絶対値`0.002`以下  | `-0.002720383444523633`、絶対値`0.002720383444523633` | **fail** |
| float → int16 top-1差         | 絶対値`0.005`以下  | `+0.0029325513196480912`                              | **pass** |

provisional candidateのfloat metricsはpair `0.6099488308828293`、top-1 `0.26099706744868034`、MAE `486.6910572304545 cp`。int16ではpair `0.6072284474383056`、top-1 `0.26392961876832843`、MAE `491.98977505112475 cp`だった。stableのint16 metricsはpair `0.6048966902001425`、top-1 `0.2668621700879765`、MAE `496.8903374233129 cp`である。

candidateはpairでstableを約0.233 percentage point上回り、MAEも約4.90 cp小さかったが、top-1で約0.293 percentage point下回った。またint16化でpairが約0.272 percentage point動き、許容した0.2 pointを超えた。value MAEは代表candidateのtie-breakに使うが、pair/top-1の失敗をMAE改善で帳消しにはしない。この2 failによりselection全体は不合格である。

### 7.2 PR4A以降exact-row sealed final holdout（不合格のため未開封）

candidate-selection receiptを発行できたcandidateに限り、int16 candidateがstableに対して次を**両方**満たすことを要求していた。

- within-parent pair accuracyがstable以上
- teacher top-1 accuracyがstable以上

どちらか片方でも落ちれば不合格である。今回はその入口であるselectionに落ちたため評価器へholdoutを渡していない。holdoutはseries選択やepoch選択へ逆流させない。

### 7.3 general / opening retention

既存のgeneral holdoutとopening holdoutをそれぞれstableと同じ条件で測る。各datasetで次をすべて満たす。

| metric                 | retention floor              |
| ---------------------- | ---------------------------- |
| value MAE              | `candidate ≤ stable × 1.05`  |
| pair accuracy          | `candidate ≥ stable - 0.005` |
| decisive-pair accuracy | `candidate ≥ stable - 0.005` |

sibling評価だけ良くても、広い局面や序盤を5%超壊せば採用しない。

### 7.4 既知の`P*8f`回帰

[実戦回帰を再現した記事](./blog-shogi-eval-recovery.md)の固定局面で次を全部要求する。

- static評価で`P*8f`を`3a4b`より下に置く
- fixed depth 11と12のどちらでも`P*8f`を選ばない
- 800 / 2,000 / 4,000 msを各3回、合計9回実行し、すべて`P*8f`以外を選ぶ

全体平均が勝っても、この既知悪手を1回でも再発させれば採用しない。

### 7.5 384局paired A/B

A/Bはcandidate対stableを384局、つまり192のcolor-swapped opening pairsで行う。openingと先後を対にし、片側だけに有利な抽選を減らす。

区間はgameを独立標本にせず、2局のcolor-swapped opening pairを1 blockとして扱う。各blockのcandidate得点率（勝ち1、引分0.5、負け0の2局平均）を、Python `random.Random(20260710)`で192 blockから復元抽出するpaired percentile bootstrap 100,000回で再標本化する。昇順replicate平均の5,000番目（1始まり）をone-sided 95% lower bound、2,500番目をtwo-sided 95% intervalのlower boundとする。

- **安全性**：score rateのone-sided 95% lower boundが45%を上回る
- **「強くなった」と呼ぶ条件**：two-sided 95% intervalのlower boundが50%を上回る

点推定が50%を少し超えただけでは「強くなった」と書かない。安全性だけ通って50%を統計的に超えられなければ、結論は「非劣性は確認、棋力向上は未証明」である。

### 7.6 production browser

最後に、凍結したcandidate SHA-256と完全一致するweightを実ブラウザへ読み込む。次をすべて確認する。

- exact candidate hashがloadされた
- production Worker / WASM pathを通った
- 返した着手が合法だった
- consoleまたはruntime errorがなかった
- 規定した各time budgetで完走した

ここでは新しい数値閾値を作らない。candidate identity、production経路、合法性、errorなし、time-budget完走のすべてがpass条件である。

### 7.7 「安定して高段」の外部校正は別ゲート

内部384局A/Bが証明するのは、固定条件でcandidateがstableより強いかどうかだけで、人間の段位ではない。外部校正には2026-07-10確認の[81Dojo現行対応表](https://system.81dojo.com/pages/ranks)を参照する。5段は2050–2199、6段は2200–2399、7段は2400以上である。ただしこれは外部尺度であり、内部A/Bから換算して主張しない。

[81Dojo利用規約](https://81dojo.com/en/terms.html)はsoftware-assisted対局に`COM_*` special accountを要求し、公式app以外のtoolでserverへaccessすることを禁止している。したがって、全内部gateを通ったcandidateについても、candidate SHA-256、time control、相手を選ばないpairing、minimum games、rating安定判定を先に固定し、ユーザーと運用を調整して明示許可を得た後にだけ公式appで実施する。このPRではそれらの数値も対局も開始せず、外部ladder計画だけを記録する。[将棋倶楽部24](https://www.shogidojo.net/)は2025-12-31にサービス終了しているため校正先に使わない。

---

## 8. 現在の結果台帳

| stage                                             | 状態                            | 現在の証拠 / 未確定出力                                                                                                                     |
| ------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| full attempt 1、timeout 120s                      | **確認済み・不採用**            | 215親後に停止。別条件へresumeしない                                                                                                         |
| 問題親runtime診断 1                               | **確認済み**                    | 12 siblings、188.52秒。label scoreは選択に未使用                                                                                            |
| full attempt 2、timeout 600s                      | **確認済み・不採用**            | 393親後に別heavy parentで停止                                                                                                               |
| heavy-parent隔離diagnostic                        | **確認済み**                    | timeout 3,600s枠で8 siblingsが1,693.48秒。full runではない                                                                                  |
| training device smoke                             | **確認済み**                    | Torch 2.12.1でMPSは単process約1.9倍速いが同一2 runのloss/hashが不一致。CPUはexact再現・6並列。sealed deviceは`cpu`                          |
| Lane A teacher-policy比較                         | **確認済み**                    | fixed depth 16を採用。n=100は通常cp差median 29 / p90 125.3、全pair反転0.1462%、depth-18 node比2.4713×                                       |
| final-policy fresh full teacher                   | **確認済み・完了**              | exit 0、5,354.31秒。3,112 selected = 3,106 completed + 6 skipped、36,365 candidates、21/7 games、overlap 0                                  |
| full teacher manifest / train / val / work hashes | **確認済み**                    | manifest `3381e238…` / train `909f12a5…` / val `5a2435df…` / work `f183d403…`。bytesと行数は本文に記録                                      |
| sealed partition manifest / 5 artifacts hashes    | **確認済み・公開**              | training `f6dcfd6a…` / selection `97b15ba1…` / holdout `89b3e2ca…` / protected `762b95b5…` / manifest `d95e6623…`。Python再検証・overlap全0 |
| policy exposure receipt                           | **audit・固定済み**             | 102 parent / 1,392 semantic IDs。除外はtraining 307親/3,642行、selection 64/762、holdout 49/588、unmatched 7                                |
| model-training cross-semantic isolation           | **実装・テスト済み**            | Lane A exposure除外後にevaluation union優先、親単位drop、21局必須                                                                           |
| six-run plan                                      | **固定・実行完了**              | 3,057 bytes / `0e34262f…e070`。全10 input hashes、Python 3.13.0 / Torch 2.12.1 / Apple M4 Pro / CPU 2 threadsを固定                         |
| 外部高段校正                                      | **計画のみ・未許可**            | 81DojoのCOM account / 公式app制約を確認。candidate/time control/pairing/min games/stability ruleは実施前に別途固定                          |
| warm seeds 42/43/44                               | **3/3完了・監査済み**           | int16 pair `0.60722845 / 0.60632165 / 0.60722845`。median代表seed 42                                                                        |
| scratch seeds 42/43/44                            | **3/3完了・監査済み**           | int16 pair `0.60185245 / 0.59887298 / 0.60243539`。median代表seed 42                                                                        |
| provisional candidate                             | **選択済み・gate不合格**        | warm 42。checkpoint `96863352…e51` / export `8b82fd1a…0565` / report `031991dc…88c`                                                         |
| selection audit                                   | **fail・固定済み**              | 10,584 bytes / `8dd4c5e5…fc19d`。4 gate中pair対stableとtop-1量子化差だけpass。top-1対stableとpair量子化差がfail。candidate receiptは未発行  |
| exact-row sealed final holdout                    | **未開封**                      | `labels_read: false` / `sealed_not_opened`。selection不合格後は読まない                                                                     |
| general / opening retention                       | **selection不合格のため未実施** | 後段へ進めない                                                                                                                              |
| `P*8f` regression suite                           | **selection不合格のため未実施** | 後段へ進めない                                                                                                                              |
| paired A/B                                        | **selection不合格のため未実施** | 384局 / 192 color-swapped pairsは開始していない                                                                                             |
| production browser                                | **selection不合格のため未実施** | candidateをproduction経路へ載せていない                                                                                                     |
| production promotion                              | **不採用**                      | productionはrunOp1を継続                                                                                                                    |

後段の空欄は0でも秘密でもない。selectionで止めたため測定自体を行っていないという意味である。失敗candidateのholdoutやA/Bだけを見て次の設定を選ぶことはしない。

---

## 9. 今わかったことと、次に試すこと

今回の成果は新しいproduction weightではなく、6 runを最後まで測って不合格を不合格のまま止めたことだった。

- 120秒full runは215親、600秒full runも393親で止まり、別heavy parentは隔離diagnosticで8 siblingsに1,693.48秒かかった
- Lane Aはdepth 16を選んだ。n=100の全pair反転0.1462%を維持しつつdepth 18のnodeコストは2.4713倍で、2つ目のheavy parentはdepth 18だけが600秒timeoutになった
- final-policy fresh full runはclean revisionからexit 0で完了し、3,112 selected entry、3,106 completed、6 skippedとtrain/val/work/manifest bytes・hashをcommit markerへ固定した
- holdout 3局のassignmentは固定したが、pilotが全28局へ触れていた事実を発見し、game-level未見という主張を撤回した
- Lane A全workの102 parent / 1,392 semantic ID exposureを全roleから除き、PR4A以降のexact-row sealへ限定した
- 非公開auditでrole別の露出除外を307親/3,642行、64/762、49/588、unmatched 7件に固定した
- parent↔childのcross-semantic漏洩を見つけ、base trainを直接使わないようにした
- training processからholdout labelsを外し、selection全gateを通ったcandidate receiptがない限りfinal-holdout評価も禁止した
- warm/scratchの試行数、median candidate、数値gateを先に固定した
- exact 6 runを完走し、warm 42 / scratch 42を各seriesのmedian代表、warm 42をprovisional candidateと機械的に選んだ
- provisional candidateはint16 pairではstableを上回ったが、int16 top-1では下回り、float→int16 pair差も上限を超えた
- selection 4 gate中2 failの時点でcandidate receiptを発行せず、final holdout、retention、既知回帰、384局A/B、browserを開かなかった

これらは「強くなった」証拠ではない。しかし、pairだけを取り出せば改善しているcandidateを、top-1と量子化の失敗を隠してproductionへ上書きしなかった証拠ではある。

次の方向は、今回の6 seedから都合のよいseed 44だけを選び直すことではない。int16 export後にpair順位が動いた事実を目的変数として扱い、fake quantizationを学習loopへ入れるint16-aware trainingまたはQATを、別の入力hash、試行数、selection gateで先に事前登録する。float checkpointを作って最後に丸めるだけでなく、実際に配布するint16表現でpair/top-1を同時に保つことを狙う。

その新実験でも、series内代表は結果を見る前の規則で決め、post-hocなseed swappingはしない。selectionを全通過したcandidateが初めてreceiptを得て、sealed holdout、retention、`P*8f`、384局A/B、browserへ進む。そこまで揃うまでproductionはrunOp1のままである。
