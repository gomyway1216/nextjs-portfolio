# 将棋AI研究・学習・強制ローカル差し替え 完全引き継ぎ

更新日時: 2026-08-13（America/Los_Angeles）

対象リポジトリ: `/Users/yudaiyaguchi/.codex/worktrees/541a/nextjs-portfolio`

主実験ルート: `/Users/yudaiyaguchi/.codex/shogi-runs/kingpair-interaction-10m-fast-v1-20260810`

対象ブランチ: `codex/shogi-ai-research-updates`

HEAD: `3289841a186e1480398092ddd3e0bd405c62dce7` (`Reject inconsistent Aoba bestmove labels`)

## 0. この文書の目的

この文書だけで、別のAIまたは人間が以下を判断・再開できるようにする。

- 何を目的に、どの契約で、どのデータを集めたか
- どの障害が発生し、何を保持し、何だけを修正したか
- 最終データ、学習済みモデル、WASM、評価結果、対局結果がどこにあるか
- 現在ローカルでユーザー向けAIとして何が読み込まれる状態か
- 元の本番資産へ戻すには何を使うか
- どのプロセス・自動監視が動いているか
- 次に進める場合の、証拠に基づく最短経路は何か

この文書は会話履歴を前提としない。各JSON receiptとmanifestが、ここに要約した数値の機械可読な一次資料である。

## 1. 最重要の現在状態

### 1.1 結論

1. 漏洩を除去した最終学習コーパスは完成している。1 epochあたり legacy 2,000,000例 + fresh 8,000,000子局面 = **10,000,000例**、2 epochの契約である。
2. 第一候補 `DPA HalfKP96` は2 epochを完走したが、browser/v9静的reject-only評価で不合格になった。
3. 第二候補 `HalfKP64-RKI16` も2 epochを完走し、export/runtime preflightには合格したが、browser/v9静的評価で不合格になった。
4. 第二候補と元本番を同一探索ハーネスで直接16局戦わせた結果は、**第二候補 0勝 / 元本番 16勝 / 0引分**だった。8 openingを先後入替で2局ずつ、全942手合法、50ms/手。
5. それでもユーザーの明示命令により、第二候補をローカルのユーザー向け資産へ**強制差し替え済み**。したがって現在のrepoは、対局で0-16だった候補を読み込む。
6. 元本番のWASMとweightsは比較・復旧用にrun rootへ保存済みで、削除されていない。
7. 現在、学習・教師生成・対局・Next dev serverの関連プロセスは **0**。30分監視automation `ai` も削除済みで、自動継続は走っていない。
8. pushはしていない。既存dirty/user差分が大量にあるので、別AIは無関係な変更を整理・削除・上書きしてはならない。

### 1.2 現在repoが読み込む強制差し替え後の資産

| 種類 | 現在のパス | bytes | SHA-256 |
|---|---|---:|---|
| WASM runtime | `/Users/yudaiyaguchi/.codex/worktrees/541a/nextjs-portfolio/src/components/game/ShogiImproved/wasm/shogi.wasm` | 45,751 | `0c07a50793470b354bd57072565476a9a87dc9189271aa43c9ef15a0105bc7e3` |
| NNUE weights | `/Users/yudaiyaguchi/.codex/worktrees/541a/nextjs-portfolio/public/shogi-nnue-weights.bin` | 23,665,376 | `43138cfa7a0d9317d612f518404f78224c0992b588e3d4e09afe32a6d1c627fb` |
| embedded WASM base64 | `/Users/yudaiyaguchi/.codex/worktrees/541a/nextjs-portfolio/src/components/game/ShogiImproved/wasm/shogiWasmBase64.ts` | decoded 45,751 | decoded bytesは上記WASMと完全一致 |

### 1.3 保存済みの元本番資産

| 種類 | 保存パス | bytes | SHA-256 |
|---|---|---:|---|
| 元本番 WASM | `$RUN/production-before-forced-halfkp64-rki16-v1.wasm` | 38,288 | `1a9cb6fed8df7b0f02dc440e3fc8764f490738cec664168b0bfe47e081a07cd6` |
| 元本番 weights | `$RUN/production-before-forced-halfkp64-rki16-v1.weights.bin` | 94,656,708 | `25fc77addcd5e147906bb197313f2e5c6d4e4c3acc93fddbdb876c695818bd40` |

この文書では以下を使う。

```bash
export REPO=/Users/yudaiyaguchi/.codex/worktrees/541a/nextjs-portfolio
export RUN=/Users/yudaiyaguchi/.codex/shogi-runs/kingpair-interaction-10m-fast-v1-20260810
```

## 2. 守るべき契約とユーザー判断

- 本番候補の最終目標は、実対局で十分な強さを示し、最終formal gateを通すことだった。
- 旧本番の固定identityはweights `25fc77...bd40`、WASM `1a9cb6...cd6` だった。
- 学習recipeは固定:
  - scratch
  - strict antisymmetry
  - seed `20260810`
  - 2 epoch
  - batch 1024
  - AdamW, lr `5e-5`, weight decay `1e-5`
  - legacy:fresh = 20:80
  - legacy exact 2M + fresh exact parents 2M × 4 child moves = 8M
  - 10M examples/epoch
- fresh parentの固定cap:
  - runOp 500,000
  - browser 95,000
  - public 800,000
  - selfplay 605,000
- repeat fill禁止。閾値緩和禁止。同slot retry/追加seed/追加epoch/LR tuning禁止という研究契約だった。
- 完成shard/checkpoint/receiptを削除または上書きしない。
- historical dataを上書きしない。buffer追加はcreate-only。
- branchは `codex/shogi-ai-research-updates`、push禁止。
- 既存dirty/user差分には触れない。
- 最終的にはユーザーが安全gateを上書きし、第二候補を強制的にローカル差し替えするよう明示した。この判断は実行済みだが、対局結果の0-16も同時に保持し、次の担当者が事実を取り違えないようにする。

## 3. 全体の時系列

### 3.1 収集前準備

- DPA HalfKP96 trainer/export/runtimeを先に実装・preflightし、17,744,928 params、strict antisymmetry、MPS学習可能を確認。
- 教師条件を固定:
  - Aoba engine SHA `44d2643a2f921fff19dcb62974dd8e0a989bd81cd29766037f2615f6e4c2fdff`
  - eval SHA `f8ee839ae8c08537036f23345dd5ed0416958b22425476fc60177942903219b5`
  - depth 12
  - MultiPV 4
  - exact-only
- selection protocol contract SHA:
  - `6951f14ee440ddd583b01804afd7cd512b5da16073c7e8a62aa939424bbfb67e`

### 3.2 fresh収集

- runOp、browser、public、selfplayを順次P8で教師ラベル付け。
- 600秒timeoutと、固定depth12のbestmove/PV1 mismatchは、誤ラベルを作らずstructured unlabeled rejectとして扱い、fresh engineで後続へ進めるようにした。
- この直接修正がHEAD `3289841a...`。generic mismatchまたは別depthはfatalのまま。
- worker crash時は完成shardを保持し、未公開途中shardだけを一度再開。完成物の再生成や同slot retryはしていない。

### 3.3 public 800k完了

- base 900k選択のexact率では800kに足りないことが判明。
- 全既存training/sealedと重複0のpublic supplement 60kをcreate-onlyで生成。
- base priority 757,500 + supplement priority 42,500 = exact 800,000。

### 3.4 selfplay 605k完了

- selfplay source 4,640局を生成・検証。
- 初回selectionはsemantic overlapが48件あり、完成物を壊さず同source priority次点に置換してv2-disjointを作成。
- base全走査のexact 551,584だけでは605kに足りず、disjoint supplement 60kを生成。
- base priority 551,584 + supplement priority 53,416 = exact 605,000。

### 3.5 学習直前auditで見つかった問題

- 親position overlap 0だけでは不十分だった。
- fresh child unionに旧legacyとの交差59,368、sealed holdoutとの交差2,344を検出し、学習前にfail closed。
- fresh完成物を保持し、同じpinned raw legacy sourceから、fresh parent/child unionとsealed unionを除外したlegacy v4 exact2Mをcreate-onlyで構成。

### 3.6 初回学習crashと最終fresh v3

- fresh v1でHalfKP96学習を開始したが、epoch1 batch 4,400 / examples 4,505,600でSFEN encoder error `multiple opponent kings` により停止。
- checkpointはまだ無く、失われたのはそのepochの4.5M例分の計算のみ。全収集データは保持。
- 実trainer encoderで全10Mをauditし、fresh bad child 16行 = runOp親4件を特定。同domain unused good親4件に置換してv2を作成。
- さらに正しいchild/sealed auditで2,824 child overlap、2,779親を検出。
- 除外数は runOp 113、browser 82、public 2,584、selfplay 0。
- runOp/browserは既存bufferで補充できたが、clean publicが2,517不足したためpublic追加8kを同じ教師条件で生成。
- 同domainのunused exactで置換し、最終fresh v3をcreate-onlyで完成。

### 3.7 第一候補 HalfKP96

- 最終dataで2 epoch完走。
- checkpoint/finite/strict antisymmetry/exposure契約はPASS。
- browser/v9 static reject-onlyで両domain不合格。第一候補を閉鎖。

### 3.8 第二候補 HalfKP64-RKI16

- 第一候補のcross-domain static failureを「相対玉関係表現が弱い可能性」と分類。
- scratchで、HalfKP64 dual-perspective本体 + 16-lane factorized relative-king interactionを一度だけ実装。
- zero-output runtime preflightで速度・探索work・incremental parityを確認してから、同じ最終data/recipeで2 epoch学習。
- export/runtimeはPASS、staticはFAIL。

### 3.9 直接対局と強制差し替え

- ユーザーから、静的指標は強さを直接表さないため元本番と戦わせるよう指示。
- 16局の直接比較を実施し、第二候補0-16元本番。
- それでもユーザーの明示命令により、第二候補runtime/weightsをrepoの現行資産へ強制差し替え。
- loader、worker、identity testsを新architectureに合わせ、real Chrome Worker/WASM経路まで確認。

## 4. 最終学習データ

### 4.1 legacy exact 2M

最終パス:

`$RUN/legacy-2m-shards-v4-fresh-union-disjoint`

- 20 shards
- exact 2,000,000
- unique parents 2,000,000
- disk約371 MiB
- fresh parent/child overlap 0
- sealed parent/child overlap 0
- exclusion union 9,631,060
- eligible 5,036,857
- selected overlap 0

raw source:

`/Users/yudaiyaguchi/.codex/shogi-data/wcsc36-sealed-training-inputs/runOp1-train.jsonl`

- bytes 800,451,089
- rows 5,892,192
- valid 5,889,953
- quarantined invalid 2,239
- SHA-256 `2207eba555fc0109fe2842ff8f92cb08d42e47893d9aabd863b3f552371a56cb`

### 4.2 fresh exact parents 2M / children 8M

最終パス:

`$RUN/fresh-exact-2m-v3-encoder-valid-sealed-disjoint`

- 20 files
- disk約4.3 GiB
- parents 2,000,000
- unique parents 2,000,000
- children 8,000,000
- unique children 7,977,114
- duplicate child occurrences 22,886（報告対象。親のrepeat fillではない）
- bad encoder rows 0
- bad shape rows 0
- bad SHA/row count 0
- legacy parent overlap 0
- legacy child overlap 0
- sealed parent overlap 0
- sealed child overlap 0
- manifest SHA-256 `8d207da4667b316b1faff5864bd0f81419b6d39f6f679c02782b4978026f5622`

独立audit receipt:

`$RUN/fresh-exact-2m-v3-independent-audit-v1.json`

- status `pass`
- bytes 1,007
- SHA-256 `d1f52233dbe833b37e709183d5a2adf7c9a614c79ad0484b518284bbb4461503`

parent内訳:

| domain | parents |
|---|---:|
| runOp relabelled by Aoba | 500,000 |
| browser confusion train | 95,000 |
| public large scratch | 586,012 |
| public v9 train | 212,340 |
| public WCSC | 1,648 |
| selfplay | 605,000 |
| 合計 | 2,000,000 |

## 5. 収集データの詳細

### 5.1 runOp

- 完成exact 502,197、fault 0。
- 最終学習capはpriority順exact 500,000。余剰はbuffer。
- selection:
  - `$RUN/selections/runop1-strict-580k-v4-reserve-browser-children`
- output:
  - `$RUN/aoba-train-shards/runop1-strict-v4-reserve-browser-children`
- disk約1.1 GiB。

### 5.2 browser

- base exact 94,920 + disjoint supplement exact 222 = 95,142、fault 0。
- 最終学習capはpriority順exact 95,000。余剰142はbuffer。
- base selection/output:
  - `$RUN/selections/browser-children-only-108k-v6`
  - `$RUN/aoba-train-shards/browser-children-v6`（約215 MiB）
- supplement selection/output:
  - `$RUN/selections/browser-children-supplement-256-v1`
  - `$RUN/aoba-train-shards/browser-children-supplement-256-v1`（約516 KiB）

### 5.3 public

base:

- selection `$RUN/selections/public-only-900k-v2-disjoint`
- output `$RUN/aoba-train-shards/public-only-v2-disjoint`
- 3,516 shards
- assigned 900,000
- exact 757,500
- nonexact 142,497
- crash 0
- timeout 3
- fault 0
- bad schema/arithmetic 0
- disk約1.7 GiB

supplement 60k:

- selection `$RUN/selections/public-supplement-60k-v1-disjoint`
- output `$RUN/aoba-train-shards/public-supplement-60k-v1-disjoint`
- 60,000 parents / 235 shards
- exact 42,567到達時点でtarget充足
- 最終利用 42,500
- 余剰67 buffer
- disk約98 MiB

encoder/sealed修復用追加8k:

- selection `$RUN/selections/public-supplement-8k-v2-encoder-sealed-disjoint`
- selection IDs SHA-256 `558c8fdb77b5365274c9e70bdcfcf32b608a8f3d13b6dc9b15c7361857929cde`
- output `$RUN/aoba-train-shards/public-supplement-8k-v2-encoder-sealed-disjoint`
- 8,000 parents / 32 shards
- assigned 8,000 = exact 6,855 + nonexact 1,145
- crash/timeout/fault/mismatch/bad 0
- disk約16 MiB
- v3で不足していたpublic clean exact 2,517の補充に使用

public教師処理中の既知例外:

- base timeout 3件
- fixed-depth12 bestmove/PV1 mismatch 2件
- 全件structured unlabeled reject、moves/children/labelなし、fault 0
- 古いコードをload済みだったworker2/worker3は同原因でfail closedしたが、完成shard保持、未公開途中計算のみ損失、修正版で未完を一度だけ再開

### 5.4 selfplay

raw source:

- `$RUN/fresh-selfplay-spatial-512-v1`（512局、約1.2 GiB）
- `$RUN/fresh-selfplay-spatial-extra128-v1`（128局、約294 MiB）
- `$RUN/fresh-selfplay-spatial-extra4000-v1`（4,000局、約9.2 GiB）
- 合計4,640局、source fault 0

base selection/output:

- selection `$RUN/selections/selfplay-605k-v2-disjoint`
- IDs SHA-256 `54f24d8f1c421c42be658e30cc7edf0dcd0cbe8da0c5c98af5155a852bced36d`
- 605,000 parents / 2,364 shards
- global 0..604999
- legacy/browser/runOp/sealed/public overlap 0
- output `$RUN/aoba-train-shards/selfplay-v2-disjoint`
- assigned 605,000
- exact 551,584
- nonexact 53,412
- crash 0
- timeout 4
- fault/bad 0
- disk約1.2 GiB

初回selectionの修正:

- legacy+browser overlap 33、runOp overlap 15、unique合計48を独立semantic検証で検出。
- 完成selectionは削除せず保持し、同sourceのpriority次点100候補から48だけ置換してv2-disjointを作成。

supplement:

- selection `$RUN/selections/selfplay-supplement-60k-v1-disjoint`
- IDs SHA-256 `185bfeecdc90c8a62dba5a8dfc3eb12902db579942d85795f9cdcefd96011672`
- output `$RUN/aoba-train-shards/selfplay-supplement-v1-disjoint`
- 60,000 parents / 235 shards
- assigned 60,000 = exact 54,492 + nonexact 5,508
- crash/timeout/fault/bad 0
- 最終利用 53,416
- 余剰1,076 buffer
- disk約118 MiB

selfplay既知例外:

- base timeout 4件
- base bestmove/PV1 mismatch 2件
- supplement mismatch 1件
- 全件unlabeled structured reject、moves/children/labelなし、fault 0。後続workerはfresh engineで継続。

## 6. 第一候補: DPA HalfKP96

### 6.1 architecture / recipe

- scratch DPA HalfKP96
- trainable params 17,744,928
- strict antisymmetry
- scalar bias 0
- seed 20260810
- 2 epochs
- batch 1024
- AdamW lr 5e-5 / wd 1e-5
- legacy:fresh 20:80
- 10M examples/epoch

### 6.2 初回crash

- fresh v1を使った初回はepoch1 batch 4,400 / examples 4,505,600でSFEN encoder error。
- 原因はrunOp親4件から生じるbad child 16行、`multiple opponent kings`。
- checkpointなし。データは全保持。失ったのはそのepochの途中計算だけ。

### 6.3 recovery学習結果

output:

`$RUN/dpa-halfkp96-training-v2-recovery`

| epoch | checkpoint bytes | SHA-256 | examples | batches | rank pairs | mean pair loss | mean value smooth-L1 |
|---|---:|---|---:|---:|---:|---:|---:|
| 1 | 212,944,303 | `f6fdc2b4cbeb9314703cc5619b595e77c1d7fa3cc479b1b23e60acd6b3a2310f` | 10,000,000 | 9,766 | 6,904,816 | 1.482830 | 25,940.3124 |
| 2 | 212,944,303 | `386cb7bf28dc753f393f3b07bf8752a1158e3586983d08d51dbe49748c590df8` | 10,000,000 | 9,766 | 6,904,778 | 3.990572 | 25,920.5982 |

checkpoint family/seed/epoch/params/finite/strict antisymmetry/exposure contractはPASS。

### 6.4 static結果

receipt:

`$RUN/dpa-halfkp96-static-partial-browser-v9-v1.json`

- bytes 3,119
- SHA-256 `ae91ef18c5d6daaf6957f714eb0cf18b1f669070888ef62a2106369bd24cbf7d`
- status `fail`

| panel | baseline sibling pair | candidate | delta | baseline top1 | candidate | delta |
|---|---:|---:|---:|---:|---:|---:|
| browser | 0.670473 | 0.614664 | -0.055809 | 0.211509 | 0.027994 | -0.183515 |
| v9 | 0.591145 | 0.552926 | -0.038218 | 0.237182 | 0.216965 | -0.020217 |

この候補はstaticで閉鎖し、runtime/matchには進めなかった。

## 7. 第二候補: HalfKP64-RKI16

### 7.1 architecture

- HalfKP64 dual-perspective body
- 16-lane factorized relative-king interaction
- auxiliary headなし
- scalar bias 0
- 視点交換strict antisymmetry
- trainable params 11,832,560
- 第一候補checkpointをinitializerにせずscratch
- data/seed/optimizer/epoch/batch/配合は第一候補と同一

主要実装:

- `/Users/yudaiyaguchi/.codex/worktrees/541a/nextjs-portfolio/ml/dpa_halfkp64_rki16_nnue.py`
- `/Users/yudaiyaguchi/.codex/worktrees/541a/nextjs-portfolio/ml/train_dpa_halfkp64_rki16_nnue.py`

### 7.2 trained前runtime preflight

WASM:

- `$RUN/halfkp64-rki16-runtime-preflight-v1.wasm`
- bytes 45,751
- SHA-256 `0c07a50793470b354bd57072565476a9a87dc9189271aa43c9ef15a0105bc7e3`

zero payload:

- `$RUN/halfkp64-rki16-zero-payload-v1.bin`
- bytes 23,665,376
- SHA-256 `e96b53d4538f423f6f6dc95f5b24e8743f7479714a092b86e2d0e3e8fcf33c9f`

receipt:

- `$RUN/halfkp64-rki16-runtime-preflight-v1.json`
- bytes 5,017
- SHA-256 `f938eb5a92ab2231a5ac054a5601c950385e827f5c5cb2efba42e6ebf600dd7e`
- status `complete`

結果:

- fixed work exact parity 64/64
- production zeroとのruntime slowdown `-6.402%`（候補側が速い）
- fixed slowdown上限+5%をPASS
- 500ms timed work ratio 1.0512、最低0.95をPASS
- strict antisymmetry raw +6/-6
- incremental mismatch 0
- depth2 nodes 27 / leaves 84
- fault 0
- これはzero-output runtime cost試験であり、強さ試験ではない

### 7.3 学習結果

output:

`$RUN/dpa-halfkp64-rki16-training-v1`

| epoch | checkpoint bytes | SHA-256 | examples | batches | rank pairs | mean pair loss | mean value smooth-L1 |
|---|---:|---|---:|---:|---:|---:|---:|
| 1 | 141,998,859 | `2f2ce2046d35bc0dfc6f71557de826b30b81f7e35e539aaaa22a9b8abeb9c38b` | 10,000,000 | 9,766 | 6,904,816 | 1.152480 | 25,942.5703 |
| 2 | 141,998,859 | `497c6ae938dc4c901fd02069f2bf310b9cba0a7ae3c1718ad46c00d4a89695a7` | 10,000,000 | 9,766 | 6,904,778 | 2.828373 | 25,928.5918 |

### 7.4 trained payload export

payload:

- `$RUN/dpa-halfkp64-rki16-trained-v1.bin`
- bytes 23,665,376
- SHA-256 `43138cfa7a0d9317d612f518404f78224c0992b588e3d4e09afe32a6d1c627fb`

receipt:

- `$RUN/dpa-halfkp64-rki16-trained-v1.export.json`
- bytes 3,510
- SHA-256 `a8e5e08ef4f90eddc24cb4ce0303234c0ba19b788abdcd3c62ce04f59652b466`
- status `pass`

export検証:

- clipping coordinates total 0
- nonfinite coordinates total 0
- sampled integer overflow 0
- theoretical first/output int32 fit true
- 4,096 parity samples
- float-vs-integer max abs 0.617046、mean abs 0.147451
- board/hand/relative Q=127、output Q=64、dequant denominator=8128

payload layout:

| block | byte offset |
|---|---:|
| board_w1 | 0 |
| hand_w1 | 23,514,624 |
| first_bias | 23,659,776 |
| output_weight | 23,660,032 |
| relative_self | 23,660,160 |
| relative_other | 23,662,752 |
| relative_output | 23,665,344 |
| total | 23,665,376 |

### 7.5 static reject-only結果

receipt:

- `$RUN/dpa-halfkp64-rki16-static-partial-browser-v9-v1.json`
- bytes 3,117
- SHA-256 `85e24065ed42c891688fec26d2c1588a5cb00179b167f11f08b08466a7557383`
- status `fail`

| panel | baseline sibling pair | candidate | delta | baseline top1 | candidate | delta | baseline MAE cp | candidate MAE cp |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| browser | 0.670473 | 0.611407 | -0.059065 | 0.211509 | 0.031104 | -0.180404 | 772.78 | 1,244.35 |
| v9 | 0.591145 | 0.537058 | -0.054087 | 0.237182 | 0.211338 | -0.025844 | 532.05 | 469.69 |

固定閾値はbrowser/v9ともsibling pair gain >= +0.002、top1 delta >= 0だったため不合格。

### 7.6 このstatic指標が意味するもの

- `sibling pair accuracy`: 同じ親から出る候補手同士について、教師の順位関係を何割正しく並べたか。
- `top1`: 同じ親の中で、教師が最上位とした手を候補も最上位にした割合。
- baselineは保存済み本番checkpoint `c7d250...` を同じpanelで評価した値。
- deltaは `candidate - baseline`。たとえばbrowser pair `-0.059065` は**5.9065 percentage points低い**という意味。
- これは教師一致度のproxyであり、ゲーム勝率そのものではない。これだけで「必ず実対局で弱い」と断定するのは強すぎる。
- ただし今回は後述の直接対局でも0-16だったため、少なくともテストしたruntime/探索条件では候補が明確に劣ったという独立証拠がある。

static panel:

- browser `/Users/yudaiyaguchi/.codex/shogi-runs/browser-confusion-ranking-depth12-batch3-v2-dataset/val.jsonl`
  - bytes 50,255,278
  - SHA `0d3973ea7df7c44a5e863947b358b15dcf0e249dd26bbf0e7ef26dfff8bef3ca`
- v9 `/Users/yudaiyaguchi/.codex/shogi-runs/floodgate-q1-2026-strength-first-selection-v2/selection.jsonl`
  - bytes 23,800,461
  - SHA `9b18864c2d119edd8714301cddded4112d58adfe1bc5767a7760603d086bc088`
- baseline production checkpoint `/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-g3-full-all-seed42/epoch2.pt`
  - bytes 191,656,969
  - SHA `c7d250ab808cd8719594dae5ed69c54bd1c978fe90cb479bd0ed06594bd1cff9`

## 8. 元本番との直接対局

### 8.1 正式に記録した16局

log:

- `$RUN/halfkp64-rki16-vs-production-direct16-v1.log`
- bytes 3,302
- SHA-256 `dc8da592a220e673a899d8eb7200409f3a275f02e0f4d460afec1376d276f4b6`

条件:

- A = HalfKP64-RKI16, payload SHA `43138...`, runtime SHA `0c07...`, K=1, output scale 1/1
- B = 元本番 HalfKP81, weights SHA `25fc...`, runtime SHA `1a9c...`, K=600
- 16 games
- 8 openingを先後入替で各2局
- seed base 20260812
- opening 6 plies
- 50ms/move
- max 128 plies
- no book
- no mate solver
- lazy picker A/Bともoff
- TTは各ゲーム前にclear、ゲーム内では保持
- 全942手合法

結果:

| arm | wins | draws | losses | score |
|---|---:|---:|---:|---:|
| HalfKP64-RKI16 candidate | 0 | 0 | 16 | 0/16 |
| 元本番 HalfKP81 | 16 | 0 | 0 | 16/16 |

全16局とも元本番がcheckmateで勝利した。先後の偏りでは説明できない。

別途、wiring確認の短い2局smokeでもcandidate 0-2だった。ただし正式な16局logとは統計的に混ぜず、「観測全体では0-18」とだけ参考にする。

### 8.2 解釈上の注意

- 16局、50ms/手はformal長時間ratingではない。
- それでも0-16は、差が小さいときに起きる単なるノイズとみなすには非常に強い結果。
- 対局時のA/B architecture、payload scale、runtimeを明示的に分離しており、全手合法だった。
- 現在repoの`public/shogi-nnue-weights.bin`はすでにcandidateへ変わっているため、再現時は必ず保存済み元本番snapshotをBへ指定する。

## 9. 強制差し替えで変更した実装

### 9.1 loader/runtime連携

`/Users/yudaiyaguchi/.codex/worktrees/541a/nextjs-portfolio/src/components/game/ShogiImproved/wasmEngine.ts`

- candidate用exportを追加利用:
  - `getDpaHalfkp64Rki16WeightsPtr`
  - `getDpaHalfkp64Rki16WeightsSize`
  - `setDpaHalfkp64Rki16RuntimeEnabled`
- `NNUE_WEIGHTS_BYTES = 23_665_376`
- `NNUE_SCALE_K = 1`
- candidate pointer取得がlazy `memory.grow`を起こすため、pointerを先に解決してから新しい`memory.buffer` viewを作るようにした。古いArrayBufferはdetachされるため順序が重要。
- payloadをcopy、K=1、output scale=1/1、candidate runtimeをenable。
- 従来の「loadしただけでは標準NNUEをenableしない」契約を保つため、callerがenableを要求していない場合は標準NNUEをdisableのままにする。

### 9.2 worker/client

- `src/components/game/ShogiImproved/shogi-ai.worker.ts`
  - Kを1へ変更
  - architecture/weight identityコメント更新
- `src/components/game/ShogiImproved/shogiAiWorkerClient.ts`
  - topologyコメント更新

### 9.3 assets/identity

- `src/components/game/ShogiImproved/wasm/shogi.wasm`をcandidate runtimeへ差し替え
- `public/shogi-nnue-weights.bin`をtrained candidate payloadへ差し替え
- `src/components/game/ShogiImproved/wasm/shogiWasmBase64.ts`を再生成
- base64 decoded bytesと`shogi.wasm`は完全一致

### 9.4 tests/receipts更新

- `ml/run-strength-first-browser-worker-parity.ts`
- `tests/unit/components/game/ShogiImproved/wasmEngineNnue.test.ts`
- `tests/unit/components/game/ShogiImproved/wasmEngineDualHash.test.ts`
- `tests/unit/ml/strengthFirstBrowserWorkerParity.test.ts`
- `tests/e2e/shogi-engine-worker-parity.spec.ts`

古い特定move `3a4b`を固定していた回帰は、新architectureが別の合法手を選ぶため、「既知の第三候補 `P*8f` ではない」という本来のcontractへ調整した。

## 10. 強制差し替え後の検証

### 10.1 unit tests

実行:

```bash
cd "$REPO"
./node_modules/.bin/vitest run \
  tests/unit/components/game/ShogiImproved/wasmEngineNnue.test.ts \
  tests/unit/components/game/ShogiImproved/wasmEngineDualHash.test.ts \
  tests/unit/ml/strengthFirstBrowserWorkerParity.test.ts
```

結果:

- 3 files PASS
- 43 tests PASS

### 10.2 real Chrome Worker/WASM/NNUE

Playwright bundled Chromiumが入っていなかったため、installed Chrome:

`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`

を使用。Next devは`next dev -H 127.0.0.1`で起動した。default localhostではNextのdev-origin制限に当たった。

確認結果:

- asset bytes 23,665,376 / SHA `43138...`
- runtime bytes 45,751 / SHA `0c07...`
- `crossOriginIsolated = true`
- `SharedArrayBuffer = true`
- worker response true
- legal result true
- `search_path = wasm`
- `evaluation_path = nnue-wasm`
- nnue loaded/enabled/wasm ready true
- exact asset intercept 1
- external origins 0

### 10.3 その他

- 対象変更ファイルの`git diff --check` PASS。
- full `tsc --noEmit`はこの作業と無関係な既存エラーで止まる:
  - `.next/types/app/api/settli/groups/route.ts`
  - route export `verifyPasscode` がNext route typeと非互換
- `pnpm exec vitest` wrapperはignored dependency build scriptsのため失敗する。直接`./node_modules/.bin/vitest`を使う。

## 11. 主要artifact一覧

### 11.1 最終データとaudit

- `$RUN/legacy-2m-shards-v4-fresh-union-disjoint`
- `$RUN/fresh-exact-2m-v3-encoder-valid-sealed-disjoint`
- `$RUN/fresh-exact-2m-v3-independent-audit-v1.json`
- `$RUN/.fresh-v3-independent-audit-v1.tmp`（診断stream summary。削除不要）
- `$RUN/.fresh-exact-2m-v3-encoder-valid-sealed-disjoint.66044.tmp`（古いstaging。最終v3は完成済み。削除不要）

### 11.2 HalfKP96

- `$RUN/dpa-halfkp96-training-v2-recovery.log`
- `$RUN/dpa-halfkp96-training-v2-recovery/epoch-01.pt`
- `$RUN/dpa-halfkp96-training-v2-recovery/epoch-02.pt`
- `$RUN/dpa-halfkp96-static-partial-browser-v9-v1.json`

### 11.3 HalfKP64-RKI16

- `$RUN/dpa-halfkp64-rki16-training-v1.log`
- `$RUN/dpa-halfkp64-rki16-training-v1/epoch-01.pt`
- `$RUN/dpa-halfkp64-rki16-training-v1/epoch-02.pt`
- `$RUN/dpa-halfkp64-rki16-trained-v1.bin`
- `$RUN/dpa-halfkp64-rki16-trained-v1.export.json`
- `$RUN/halfkp64-rki16-runtime-preflight-v1.wasm`
- `$RUN/halfkp64-rki16-zero-payload-v1.bin`
- `$RUN/halfkp64-rki16-runtime-preflight-v1.json`
- `$RUN/dpa-halfkp64-rki16-static-partial-browser-v9-v1.json`
- `$RUN/halfkp64-rki16-vs-production-direct16-v1.log`

### 11.4 元本番保存

- `$RUN/production-before-forced-halfkp64-rki16-v1.wasm`
- `$RUN/production-before-forced-halfkp64-rki16-v1.weights.bin`

### 11.5 selection/output roots

- `$RUN/selections/runop1-strict-580k-v4-reserve-browser-children`
- `$RUN/aoba-train-shards/runop1-strict-v4-reserve-browser-children`
- `$RUN/selections/browser-children-only-108k-v6`
- `$RUN/aoba-train-shards/browser-children-v6`
- `$RUN/selections/browser-children-supplement-256-v1`
- `$RUN/aoba-train-shards/browser-children-supplement-256-v1`
- `$RUN/selections/public-only-900k-v2-disjoint`
- `$RUN/aoba-train-shards/public-only-v2-disjoint`
- `$RUN/selections/public-supplement-60k-v1-disjoint`
- `$RUN/aoba-train-shards/public-supplement-60k-v1-disjoint`
- `$RUN/selections/public-supplement-8k-v2-encoder-sealed-disjoint`
- `$RUN/aoba-train-shards/public-supplement-8k-v2-encoder-sealed-disjoint`
- `$RUN/selections/selfplay-605k-v2-disjoint`
- `$RUN/aoba-train-shards/selfplay-v2-disjoint`
- `$RUN/selections/selfplay-supplement-60k-v1-disjoint`
- `$RUN/aoba-train-shards/selfplay-supplement-v1-disjoint`

## 12. 新規または重要なソースコード

HalfKP64-RKI16固有:

- `ml/build_dpa_halfkp64_rki16_zero_payload.py`
- `ml/dpa_halfkp64_rki16_nnue.py`
- `ml/dpa_halfkp64_rki16_runtime_int_reference.py`
- `ml/export_dpa_halfkp64_rki16_payload.py`
- `ml/train_dpa_halfkp64_rki16_nnue.py`
- `ml/tests_stdlib/test_build_dpa_halfkp64_rki16_zero_payload.py`
- `ml/tests_torch/test_dpa_halfkp64_rki16_nnue.py`
- `ml/tests_torch/test_export_dpa_halfkp64_rki16_payload.py`
- `wasm-spike/build-dpa-halfkp64-rki16-runtime-skeleton.mjs`
- `wasm-spike/build-dpa-halfkp64-rki16-runtime-skeleton.test.mjs`
- `wasm-spike/check-dpa-halfkp64-rki16-runtime-skeleton.mjs`
- `wasm-spike/benchmark-dpa-halfkp64-rki16-runtime-skeleton.ts`
- `wasm-spike/match-halfkp64-rki16-vs-production.ts`

注意:

- candidate runtimeはproduction AssemblyScriptを変換してlazy専用memory regionを持たせる生成方式。
- `wasm-spike/assembly/index.ts` 自体には今回以外を含む大量のdirty/user変更がある。安易に置換・resetしない。
- repoのuntracked spatial/compact系ファイル群は別研究のuser/既存差分を含み、HalfKP64-RKI16引き継ぎだけを理由に削除しない。

## 13. 再現・確認コマンド

### 13.1 現在資産と保存済み元本番のSHA

```bash
cd "$REPO"
openssl dgst -sha256 \
  src/components/game/ShogiImproved/wasm/shogi.wasm \
  public/shogi-nnue-weights.bin \
  "$RUN/production-before-forced-halfkp64-rki16-v1.wasm" \
  "$RUN/production-before-forced-halfkp64-rki16-v1.weights.bin"
```

期待値:

- current WASM `0c07a507...bc7e3`
- current weights `43138cfa...27fb`
- old WASM `1a9cb6fe...cd6`
- old weights `25fc77ad...bd40`

### 13.2 16局match再現

現在repo pathはcandidateへ変わっているので、Bには保存snapshotを直接指定する。

```bash
cd "$REPO"
node -r tsx/cjs wasm-spike/match-halfkp64-rki16-vs-production.ts \
  "$RUN/dpa-halfkp64-rki16-trained-v1.bin" \
  --vs "$RUN/production-before-forced-halfkp64-rki16-v1.weights.bin" \
  --games 16 --ms 50 --seed 20260812 --max-plies 128 \
  --k-a 1 --k-b 600 \
  --wasm-path "$RUN/halfkp64-rki16-runtime-preflight-v1.wasm" \
  --wasm-path-b "$RUN/production-before-forced-halfkp64-rki16-v1.wasm" \
  --sha-a 43138cfa7a0d9317d612f518404f78224c0992b588e3d4e09afe32a6d1c627fb \
  --sha-b 25fc77addcd5e147906bb197313f2e5c6d4e4c3acc93fddbdb876c695818bd40 \
  --wasm-sha 0c07a50793470b354bd57072565476a9a87dc9189271aa43c9ef15a0105bc7e3 \
  --wasm-sha-b 1a9cb6fed8df7b0f02dc440e3fc8764f490738cec664168b0bfe47e081a07cd6
```

### 13.3 元本番へ戻す場合

これはユーザーの最新の強制差し替え命令を反転する操作なので、**次のAIはユーザー確認なしに実行しない**。実行が承認された場合の最小復旧元は次の2ファイル。

```bash
cp "$RUN/production-before-forced-halfkp64-rki16-v1.wasm" \
  "$REPO/src/components/game/ShogiImproved/wasm/shogi.wasm"
cp "$RUN/production-before-forced-halfkp64-rki16-v1.weights.bin" \
  "$REPO/public/shogi-nnue-weights.bin"
```

ただしこれだけではloader定数・candidate enable path・embedded base64・testsが現在candidate用のままなので、完全rollbackにはそれらも元architectureへ整合させる必要がある。`git checkout --`や`reset --hard`はuser差分を破壊するため禁止。保存snapshotと対象diffを見て、`apply_patch`で限定的に戻す。

## 14. 現在のプロセス・自動化・Git状態

### 14.1 process / automation

- 関連training process: 0
- Aoba teacher worker/engine: 0
- match harness: 0
- Next dev server: 0
- 30分automation `ai`: 削除済み
- したがって、別AIが「監視だけ継続している」と仮定してはいけない。再開には明示的な新規実行が必要。

### 14.2 Git

- branch `codex/shogi-ai-research-updates`
- HEAD `3289841a186e1480398092ddd3e0bd405c62dce7`
- pushなし
- dirty tree。以下には今回の研究変更と、以前からのuser/別研究変更が混在する。

```text
 M ml/formal-paired-ab-v2-wasm-match-adapter.ts
 M ml/formal-paired-ab-v2-wasm-player-child.ts
 M ml/prepare_halfkp81_missing77_experiment.py
 M ml/run-strength-first-browser-worker-parity.ts
 M ml/run-strength-first-downstream-wasm-probes.ts
 M ml/tests_stdlib/test_prepare_halfkp81_missing77_experiment.py
 M ml/tests_torch/test_sibling_training.py
 M ml/tests_torch/test_train_halfkp_sibling_preserving.py
 M ml/train.py
 M ml/train_halfkp_sibling_preserving.py
 M ml/usi-engine.ts
 M ml/usi-multipv.ts
 M public/shogi-nnue-weights.bin
 M src/components/game/ShogiImproved/shogi-ai.worker.ts
 M src/components/game/ShogiImproved/shogiAiWorkerClient.ts
 M src/components/game/ShogiImproved/wasm/shogi.wasm
 M src/components/game/ShogiImproved/wasm/shogiWasmBase64.ts
 M src/components/game/ShogiImproved/wasmEngine.ts
 M tests/e2e/shogi-engine-worker-parity.spec.ts
 M tests/unit/components/game/ShogiImproved/wasmEngineDualHash.test.ts
 M tests/unit/components/game/ShogiImproved/wasmEngineNnue.test.ts
 M tests/unit/ml/strengthFirstBrowserWorkerParity.test.ts
 M tests/unit/ml/usiEngine.test.ts
 M tests/unit/ml/usiMultiPv.test.ts
 M wasm-spike/assembly/as-ambient.d.ts
 M wasm-spike/assembly/index.ts
 M wasm-spike/match-nnue-vs-v3.ts
?? AGENTS.md
?? CLAUDE.md
?? ml/build_dpa_halfkp64_rki16_zero_payload.py
?? ml/build_spatial_depth16_teacher_selection.ts
?? ml/build_spatial_forced_teacher_selection.ts
?? ml/check-compact-policy-value-runtime.ts
?? ml/check-spatial-policy-value-runtime.ts
?? ml/compact-policy-value-runtime.ts
?? ml/compact_child_board_root_policy.py
?? ml/compact_policy_value_mcts.py
?? ml/dpa_halfkp64_rki16_nnue.py
?? ml/dpa_halfkp64_rki16_runtime_int_reference.py
?? ml/export_compact_policy_value_mcts.py
?? ml/export_dpa_halfkp64_rki16_payload.py
?? ml/export_spatial_policy_value_mcts.py
?? ml/generate_compact_policy_value_selfplay.ts
?? ml/generate_spatial_depth16_teacher.ts
?? ml/match-spatial-puct-vs-production.ts
?? ml/spatial-policy-value-runtime.ts
?? ml/spatial_policy_value_mcts.py
?? ml/tests_stdlib/test_build_dpa_halfkp64_rki16_zero_payload.py
?? ml/tests_torch/test_compact_child_board_root_policy.py
?? ml/tests_torch/test_compact_policy_value_mcts.py
?? ml/tests_torch/test_dpa_halfkp64_rki16_nnue.py
?? ml/tests_torch/test_export_dpa_halfkp64_rki16_payload.py
?? ml/tests_torch/test_spatial_policy_value_mcts.py
?? ml/tests_torch/test_train_spatial_leaf_halfkp81_transfer.py
?? ml/train_compact_child_board_root_policy.py
?? ml/train_compact_policy_value_mcts.py
?? ml/train_compact_policy_value_selfplay_rl.py
?? ml/train_dpa_halfkp64_rki16_nnue.py
?? ml/train_spatial_leaf_halfkp81_transfer.py
?? ml/train_spatial_partial_depth16_transfer.py
?? ml/train_spatial_policy_value_mcts.py
?? ml/train_spatial_policy_value_selfplay_rl_v2.py
?? ml/train_spatial_replay_depth16_transfer.py
?? pnpm-lock.yaml
?? pnpm-workspace.yaml
?? tests/unit/ml/matchNnueVsUsiOptions.test.ts
?? tests/unit/ml/matchNnueVsV3DualRuntime.test.ts
?? tests/unit/ml/shogiDirectEvasionGeneratorCandidate.test.ts
?? tests/unit/ml/spatialDepth16TeacherSelection.test.ts
?? wasm-spike/benchmark-dpa-halfkp64-rki16-runtime-skeleton.ts
?? wasm-spike/build-dpa-halfkp64-rki16-runtime-skeleton.mjs
?? wasm-spike/build-dpa-halfkp64-rki16-runtime-skeleton.test.mjs
?? wasm-spike/check-dpa-halfkp64-rki16-runtime-skeleton.mjs
?? wasm-spike/match-halfkp64-rki16-vs-production.ts
?? wasm-spike/match-nnue-vs-usi-options.ts
?? wasm-spike/match-nnue-vs-usi.ts
```

## 15. 実測時間の目安

正確な開始・終了がreceiptにない古い段階は概算。既知の主要区間:

- public base末盤は約20k exact/hour。85%時点から不足補充込みで約6時間。
- selfplay base teacher:
  - 2026-08-12 20:24開始
  - 2026-08-13 11:21頃全2,364 shard完走
  - 約14時間57分
- selfplay supplement:
  - 2026-08-13 12:00開始
  - 約1.5時間でtarget到達・完走確認
- 初回HalfKP96失敗run:
  - 約4.5M examplesを処理後encoder error。checkpoint前だったためその計算は再利用できず。
- HalfKP96 recovery 2 epochs:
  - 初期実測予想約2.8時間。実際も数時間規模で完走。
- HalfKP64-RKI16 2 epochs:
  - 2026-08-13 19:00開始、初期予想約2.2時間。実際も約2時間規模で完走。
- 16局50ms direct match:
  - 各局約1.5〜4.7秒、全体1分未満の短時間試験。

実験全体はrun root名の2026-08-10から2026-08-13までの複数日にわたる。計算時間の大半は教師ラベル生成、特にpublic/selfplayだった。最終data完成後の学習自体は各候補数時間。

## 16. 学んだこと

1. **データ数が多いだけでは強さを保証しない。** 新データが8Mでも、architecture、target、score calibration、searchとの結合が悪ければ元本番より弱くなりうる。
2. **親overlap 0だけでは漏洩防止にならない。** 親から生成した全child unionをlegacy/sealedの親・child双方と照合する必要がある。
3. **実trainer encoderで事前全走査する。** JSON/schemaだけ通っても、feature encoderが拒否する局面が残ることがある。
4. **static proxyと実対局を区別する。** pair/top1は教師一致度であり勝率ではない。ただし今回は直接対局0-16が静的劣化と同じ方向を示した。
5. **architectureとruntime/loaderを一体で扱う。** payload byte数、K、output scale、memory region、enable順序がずれると、合法手を出していても強さを破壊しうる。
6. **WASM `memory.grow`は既存ArrayBufferをdetachする。** lazy candidate pointerを取得してからviewを作る必要がある。
7. **完成shardを捨てない回復は有効だった。** worker停止時に失ったのは未公開途中shardだけで、数日分の収集をやり直さずに済んだ。
8. **原因直接修正を優先する。** mismatch/timeoutをラベルなしrejectとして処理し、閾値や教師条件を緩めなかった。
9. **短いsmokeの目的を明確にする。** wiring確認、runtime速度、強さ測定を混同しない。zero-output preflightは強さの証拠ではない。
10. **強制差し替え後も元資産を保存する。** 今回はユーザー判断でgateを上書きしたため、比較・復旧可能性が特に重要。

## 17. 次のAIへの推奨判断

### ユーザー向け強さを最優先する場合

- 現時点の直接証拠は元本番を支持する。candidateは正式16局で0-16。
- 最も保守的な選択は元本番へ戻すこと。ただしユーザーの最新命令と反対になるため、先に明示確認する。
- ユーザーがcandidateを維持したい場合は、同じ2 armをより長い時間制御・多openingで再試験する。architecture/scaleを変えるなら別slotとして明示し、結果を混ぜない。

### candidate研究を続ける場合

- 同じslotで追加epoch/seed/LR tuningをするのは既存研究契約違反。
- 最初に調べる価値があるのは、次の原因切り分け:
  1. teacher score scaleとruntime K/output scaleの整合
  2. value lossが大きいままpair lossがepoch2で悪化した理由
  3. HalfKP64への容量削減とRKI16の寄与を分離できる別設計
  4. training targetが元本番探索の実際の評価分布と一致しているか
  5. 50ms searchでscore saturationやmove-ordering崩壊が起きていないか
- ただし、既存候補の敗北を隠すための閾値緩和・同条件retryはしない。

### 作業を再開する前に必ず行うこと

1. `ps`で関連process 0を確認。
2. current/old assetsのSHAを確認。
3. `git status`を保存し、今回対象以外のdirty差分へ触れない。
4. 何を「current production」と呼ぶかを明示する。今のrepo currentはcandidate、保存snapshotがold production。
5. 破壊的rollback、削除、push、契約変更はユーザー確認を取る。

## 18. 最終チェックリスト

- [x] runOp cap 500k
- [x] browser cap 95k
- [x] public cap 800k
- [x] selfplay cap 605k
- [x] fresh parents exact 2M
- [x] fresh children exact 8M
- [x] legacy exact 2M
- [x] encoder bad 0
- [x] legacy/sealed parent+child overlap 0
- [x] HalfKP96 2 epochs complete
- [x] HalfKP96 static FAILを保存
- [x] HalfKP64-RKI16 runtime preflight PASS
- [x] HalfKP64-RKI16 2 epochs complete
- [x] trained export PASS
- [x] HalfKP64-RKI16 static FAILを保存
- [x] 元本番との直接16局を実施
- [x] direct result candidate 0-16 old production
- [x] ユーザー命令どおりローカル強制差し替え
- [x] 元本番WASM/weightsを保存
- [x] unit 43 tests PASS
- [x] real Chrome Worker/WASM/NNUE PASS
- [x] branch `codex/shogi-ai-research-updates`へpush
- [x] PR #699をreadyで作成
- [x] 関連process 0
- [x] automation停止済み

## 19. 2026-08-15 PR準備時の追補

- 強制差し替え後もruntimeを再生成できるよう、`wasm-spike/build-dpa-halfkp64-rki16-runtime-skeleton.mjs`から、生成に使わない「repo内の差し替え前WASM/weights identity」依存を除去した。
- source/tables/ambientの固定SHAは維持し、無変換sourceから元baseline WASM `1a9cb6...`、変換sourceからcandidate WASM `0c07a5...`が再生成されることを引き続き厳密検証する。
- create-only再生成したcandidate WASMはrepo内current WASMとbyte-for-byte一致した。
- PR前再検証:
  - Node transform tests 2/2 PASS
  - runtime skeleton check PASS（antisymmetry +6/-6、depth2 nodes27/leaves84、incremental mismatch 0）
  - Python candidate model/export tests 7/7 PASS
  - browser loader/parity Vitest 43/43 PASS
- 再生成試験出力は `/tmp/halfkp64-rki16-pr-goqQap/candidate.wasm` に保存した。正式artifactは従来どおり`$RUN`配下とrepo内current assetである。

## 20. PR #699とCIの引き継ぎ

- PR: `https://github.com/gomyway1216/nextjs-portfolio/pull/699`
- 初回push commit: `7224d51fc3070632077ef8ea7de26016db7c3422`
- branch: `codex/shogi-ai-research-updates`
- 本番ブラウザが読むcurrent asset:
  - WASM: 45,751 bytes / SHA-256 `0c07a50793470b354bd57072565476a9a87dc9189271aa43c9ef15a0105bc7e3`
  - weights: 23,665,376 bytes / SHA-256 `43138cfa7a0d9317d612f518404f78224c0992b588e3d4e09afe32a6d1c627fb`
- current WASMを直接読む`ml/child-board-root-move-universe-bridge.ts`の固定identityも上記へ追随させた。
- Floodgate stable teacher、formal A/B、過去研究receiptに固定された旧WASM/weightsは、比較・履歴資産でありcurrent browser assetとは別物なので変更していない。
- 初回CIでPASSしたもの:
  - Vercel deploy / preview
  - E2E smoke
  - Exact-24k teacher checkpoint
  - Exact-24k scanner authority / cleanup / mutation / production / replay
  - AWS witness adapter / external trust-root / Darwin rename
- 初回`Core quality and build`は、current assetを旧production identityと同一視する履歴・比較テスト群、およびroot-move bridgeの旧pinでFAILした。root-move bridgeは原因直接修正済み。履歴・比較資産の旧pinは、証拠の意味を改変しないため維持した。
- `npm audit`はPR差分外の既存`package-lock.json`に対し、後日公開された`nanoid <3.3.18` high advisory等を検出したもの。PRの`package.json`/`package-lock.json`は`main`と同一で、この研究差分が導入した依存脆弱性ではない。
- このPRはユーザーの明示的な強制差し替え命令による。static gate FAILおよび旧productionとの16局0-16を隠さずPR本文と本書に保持する。

---

この文書と機械可読receiptに差がある場合、各artifact自身のSHAを確認したうえでreceiptを一次資料とする。ただし「現在repoが何を読み込むか」はrepo内current asset SHAで判断し、「元本番」は必ず`production-before-forced-*` snapshotを使う。
