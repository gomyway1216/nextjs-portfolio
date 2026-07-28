# 将棋child-board strength candidate v1：未見評価と実戦を権威にする

> child-board capacity v3は訓練内Top-1とregretを大きく改善したが、事前固定したall-pairs 98% sentinelを通らず閉じた。次はv3を救済・再開せず、同じchild-board形状を新しい2 seedで一から学習し、fit-only production student、未見tune、sealed 512、正式768局、外部200局を順番に通す独立laneを使う。まだoptimizerも対局も実行しておらず、ライブ重みも変更していない。[English](./blog-shogi-child-board-strength-candidate-v1-plan.en.md)

## v3から分かったこと

v3の外部 `result.json` は25,096 bytes、SHA-256 `e9db86a37320345cc8418eb1f405dd5ef4e0c4187fcc8a1afff2f0e8fe4dd6d3` で、`complete-sentinel-rejected` になった。

| v3 sentinel | Browser | V9 |
|---|---:|---:|
| Top-1 | 244/256（95.31%） | 995/1,024（97.17%） |
| mean regret | 4.25cp | 2.00cp |
| pair | 75.45% | 88.84% |
| 固定pair gate | 98% | 98% |

「最善手はほぼ選べ、regretも小さいが、50cp以上離れた全pairの98%までは並べられない」という結果だった。これはv3を後から合格に変える理由にはならない。一方、訓練内all-pairs暗記率だけを実戦候補の入口にし続けるより、未見局面と直接対局へ判定権限を移す根拠にはなる。

v3のweights、optimizer、RNG state、sentinel curveはすべてspent evidenceである。新laneでは読込、resume、平均化、蒸留、量子化を禁止し、v3 sentinelも再実行しない。

## 新laneはv3の続きではない

新しい機械識別子は次である。

- schema：`shogi-child-board-strength-candidate-plan-v1`
- status：`prospective-scratch-strength-candidate-lane-only`
- model variant：`child-board-strength-candidate-v1`
- result schema：`shogi-child-board-strength-candidate-result-v1`

modelのtensor形状はv3と同じ6,168,130 parametersだが、lane identityとweightsは別物である。各seedで全parameterをscratch初期化し、large modelの役割もproduction leaf評価ではなくoffline root-policy teacherに限定する。

## Phase 1：2 seedを最後まで学習して閉じる

phase 1は単一runner・単一MPS processで、次の順番を必ず完走する。

1. seed 42をscratch初期化する。
2. V9 fitを4 epochs pretrainする。
3. Browser/V9 fitを12 mixed epochs学習する。
4. mixed epoch 12のfinal checkpointだけを固定する。
5. seed 42のscoreを見ず、seed 314159をscratch初期化して同じ工程を実行する。
6. 2 checkpointのbytes/SHAを1つのterminal phase-1 resultへ束縛する。

AdamW、learning rate `0.0003`、weight decay `0.0001`、gradient clip `5`、Browser batch `32`、V9 batch `256`、move bucket、3:1 mixed比、v2 objectiveは既存recipeと同じである。

outputは `/Users/yudaiyaguchi/.codex/shogi-runs/child-board-strength-candidate-v1-phase1` だけを許し、最初のoptimizer作成・protected data読込より前にcreate-onlyで作る。fileまたはsymlinkとして既に存在すれば停止する。directoryが存在する場合も原則停止し、同じ未完runの「最新の完了epoch」を示す唯一のatomic checkpointを厳密検証できるtechnical-crash recoveryだけを例外とする。

各pretrain/mixed epoch完了時に、model、optimizer、CPU/MPS RNG、seed、phase、完了epoch、protocol bytes/SHA、fit-only data receiptを含むlast checkpointをatomicに置換する。ChatGPT、Mac、runner、MPS processが落ちた場合は、固定path上のその1個だけを検証し、記録済みの次epochから同じrunを続けてよい。これはtune未開封の技術復旧であり、候補選抜ではない。

atomic checkpointの公開をepoch完了と定義する。seed 42のfinal公開直後に落ちた場合はseed 42を再実行せず、固定seed 314159のscratch初期化から進む。seed 314159のfinal公開直後に落ちた場合はoptimizerもdataもmodel forwardも使わず、2つのfinal receiptを検証してterminal resultをatomicに書く `terminalize-only` 復旧だけを許す。

best epoch選抜、early stop、seed 42によるseed 314159の中止、tune監視はない。別output、同じseedのscratch再実行、複数checkpointからの選択、古いepochへの巻戻し、完了epochの再実行、検証不能checkpointの利用、terminal complete後のretryはすべて禁止する。成功statusは `complete-phase1-two-scratch-checkpoints-frozen-tune-locked`。phase 1はtuneもsealedも開かずに終了する。

## Phase 1b：tuneを開く前にstudent/runtimeを固定する

2 checkpointが固定されても、まだtuneは読めない。先に別の `child-board-root-policy-student-runtime-v1` protocol coreをpublic `main`へmergeし、次を固定する。

- 2 teacher checkpoint hash
- fit-onlyの蒸留・量子化recipe
- student architecture、seed、final checkpoint規則
- production runtime、parity、latency、fail-closed gate
- root move orderingだけへ使い、leaf valueとTT valueへ混入しない境界

そのcoreに従ってfit-only studentを学習し、student artifact hashも固定する。tune/sealedのlabelやscoreはstudent学習へ使えない。

この順番により、teacherのtune結果を見てstudentを作り直すことも、studentの結果を見てarchitectureを差し替えることもできない。

authorityも分ける。phase 1の2 teacher固定はcoreのhash bindとmergeだけを許す。merge済みcoreだけが1回のfit-only student学習・final checkpoint・runtime artifact固定を許す。それらが全部固定されたphase 1b完了だけがtuneを許す。

## one-shot held-out tune

teacher 2本とproduction studentの3 artifactsがすべて固定された後、Browser 196親とV9 4,411親を1回だけ同じ evaluator invocationで開く。

既存gateを変更せず使う。

| domain | Top-1 | pair | mean regret |
|---|---:|---:|---:|
| Browser 196 | 26 correct以上（liveは16） | `0.673703888923293`以上 | `15924.158163265307cp`以下 |
| V9既存gate | `0.23938902743142144`以上 | `0.5964640986597398`以上 | — |

V9既存gateはliveよりわずかな低下を許していたため、新laneではexact live non-regressionを上乗せする。

| V9 overlay | 固定値 |
|---|---:|
| Top-1 correct | 1,078/4,411以上 |
| Top-1 accuracy | `0.24438902743142144`以上 |
| pair | `0.5984640986597398`以上 |
| mean regret | `4863.386080253911cp`以下 |

seed 42、seed 314159、studentの3 artifactsがすべて全条件を独立にPASSしなければ終了する。scoreを見た後の再学習、seed選抜、checkpoint選抜、閾値変更、採用目的のtune再実行は禁止する。seed 42は結果によらずdistillation teacher、seed 314159はreplication専用である。

6組（3 artifacts × 2 domains）のmetricと判定を、途中表示なしで1つのresultへatomicに公開する。partialまたはincompleteになった時点でlaneを閉じ、resume、rerun、後からresultを完成させることはできない。

## sealed 512

3 artifactsがone-shot tuneを通った場合だけ、既存のlabel-blind clean derivativeから512親を固定規則で選び、全合法手をdepth-12 teacherで初めてlabelする。

label生成はcandidate scoreを一切開く前に限り、parent集合、teacher、depth、protocolでcontent addressした独立shardのexact resumeを許す。検証済みshardは不変で、欠けたshardだけを生成し、512親が揃った時にordered shard hashを束縛するfinal label receiptを1回だけatomicに公開する。その後の3-artifact scoringは途中表示なしのatomic resultだけを許し、partial/incomplete scoringはlane closeである。

各artifactに対し、live比で次をすべて要求する。

- Top-1 correct gain：26以上
- pair accuracy gain：0.01以上
- NDCG@5 gain：0.01以上
- one-sided McNemar p：0.05以下

teacher 2本とstudentの全員が全条件を通る必要がある。補助metric、一方のseedだけの成功、partial resultで救済しない。

## large teacherとproduction studentの役割

6.17M child-board modelはparent、move、legal-move setに依存するpolicy teacherであり、通常の局面value NNUEではない。productionの探索葉とTT valueには、引き続きSHA-256 `e4e738f9…28dc` のlive NNUEを使う。

studentはrootで合法手を並べるためだけに使う。student protocolが固定したparity、latency、決定性、legal-move一致、leaf-value非混入を通れなければ、静的指標がよくても対局へ進まない。

## 正式768局

studentの全static/runtime gate通過後だけ、student対応の新candidate adapter/registryへ登録する。既設formal v2から継承するのは対局数、探索条件、opening pair、bootstrapだけで、単一weights hash前提の旧adapterは使わない。

新registryは、student tensor/manifest hash、凍結live NNUE hash、student対応worker JavaScript/WASM hash、parity/latency receipt、stable/candidate commitをgame 1前に束縛する。

- 384 unique opening pairs、candidate先手・後手を1局ずつ、合計768局
- fixed depth 11、quiescence 10、`K=600`
- 毎手TT clear、bookなし、fallbackなし、512 ply上限
- technical fault 0
- bootstrap seed `20260710`、pair単位100,000回

片側95%下限が45%を超えるsafety gateだけでは外部校正へ進めない。現行より強いという条件は、両側95%下限が50%を厳密に超えること。exact 384 pair / 768局が揃わないrunやfaulted runから結論を作らない。

## 外部200局

正式A/Bのstronger gate通過後だけ、既設81Dojo protocolへexact student/runtimeをbindする。外部200局にもstudent tensor/manifest、live NNUE、worker/WASM、formal registry/adapter、formal resultの全provenanceを持ち越す。

- 公式 `COM_` accountと公式client
- 人によるmanual relay、server/UI automationなし
- rating戦、平手、10分 + 30秒
- auto-match、相手選択なし
- exact 200局

primary判定は171局目から200局目まで、各局後ratingがすべて2050以上であること。これはこのcandidate、account、hardware、client、持時間、matching条件での限定claimであり、一般的な段位保証ではない。

## 固定protocolと現在地

機械可読planは [child-board-strength-candidate-v1-plan.json](../ml/protocols/child-board-strength-candidate-v1-plan.json) に固定した。

- bytes：42,427
- SHA-256：`b9b8256433cec77da8d32a6d05018b9a5e405e5b57fdabe299490a5f9f90cfe2`

現在はphase 1未開始、checkpoint 0/2、phase 1b未開始、tune未開封、student protocol未merge、sealed label 0、formal 0/768、external 0/200、ライブ変更0である。どの静的gateも単独ではライブ変更を許可しない。

v3の実測は [child-board capacity v3記事](./blog-shogi-child-board-capacity-v3-plan.md)、外部校正の境界は [81Dojo readiness記事](./blog-shogi-external-81dojo-calibration-readiness.md) に記録している。
