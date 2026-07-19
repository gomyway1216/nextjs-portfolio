# ml/ — 将棋AI 蒸留学習パイプライン

やねうら王(NNUE) + 公開評価関数『Háo』をローカルで教師として使い、
自作エンジン(`src/components/game/ShogiImproved/`)向けの小型ニューラル評価関数を
PyTorch で蒸留学習するためのパイプライン。

```
自己対戦(自作エンジン, 低budget+ランダム分岐)
   → SFEN 局面生成 (王手中除外, 手数6〜120, 重複排除)
   → やねうら王 NNUE で depth 8 評価 (USI, 並列プロセス)
   → ml/data/teacher.jsonl (追記式・再開可能)
   → train.py (2282→256→32→1, ClippedReLU, MPS対応)
   → export-weights.py (int16 量子化, 自作エンジン/WASM 向け)
```

**このディレクトリでコミットされるのはコードと README のみ。**
エンジンバイナリ・評価関数・データセット・venv・チェックポイントは `.gitignore` 済み。

---

## 1. セットアップ

### 1-1. やねうら王のビルド (macOS Apple Silicon)

```sh
cd ml
git clone https://github.com/yaneurao/YaneuraOu.git engine/YaneuraOu
git -C engine/YaneuraOu checkout 9133c527791c8b2f5f378a32df29a5e3752bd41b
cd engine/YaneuraOu/source
make -j normal YANEURAOU_EDITION=YANEURAOU_ENGINE_NNUE TARGET_CPU=APPLEM1 COMPILER=clang++
cd ../../..
mkdir -p bin && cp engine/YaneuraOu/source/YaneuraOu-by-gcc bin/yaneuraou
```

- 標準 NNUE (halfkp_256x2-32-32) エディション。Intel Mac は `TARGET_CPU=APPLEAVX2` / `APPLESSE42`。
- 注意: macOS はファイルシステムが大文字小文字を区別しないため、
  クローン先 `engine/YaneuraOu` と同名になる `engine/yaneuraou` にバイナリを置かないこと (`bin/` を使う)。
- この教師buildのsource/toolchain/binary hashは
  `ml/engine-receipts/yaneuraou-9133c527-applem1.json` に固定する。

### 1-2. 評価関数『Háo』の配置

```sh
cd ml
curl -sL -o eval/hao.7z \
  https://github.com/nodchip/tanuki-/releases/download/tanuki-.halfkp_256x2-32-32.2023-05-08/tanuki-.halfkp_256x2-32-32.2023-05-08.7z
cd eval && bsdtar -xf hao.7z && cd ..   # → ml/eval/eval/nn.bin (61MB)
```

- **出典**: tanuki- チーム (nodchip) 公式 GitHub リリース
  <https://github.com/nodchip/tanuki-/releases/tag/tanuki-.halfkp_256x2-32-32.2023-05-08>
- **内容**: 標準 NNUE (halfkp_256x2-32-32) 評価関数『Háo』。WCSC33 版 tanuki-『Lí』と同程度の棋力とされる。
- **ライセンス**: アーカイブに `gpl-3.0.txt` が同梱されており **GPL-3.0**
  (配布リポジトリ nodchip/tanuki- 自体も GPL-3.0、やねうら王のフォーク)。
  ローカルでの利用・改変は自由。本パイプラインは評価値(数値ラベル)を教師として利用するのみで、
  評価関数バイナリ自体は再配布しない (gitignore 済み)。
- 使用時は `FV_SCALE=20` を指定 (配布元推奨。generate-teacher.ts が自動設定)。
- SHA-256 (`eval/eval/nn.bin`): `1141d275bceec911156801f27303dc9ff5beb24f4f59144cc069306c59e80782`

疎通確認:

```sh
cd ml
printf 'usi\nsetoption name EvalDir value %s/eval/eval\nsetoption name FV_SCALE value 20\nsetoption name USI_OwnBook value false\nisready\nposition startpos\ngo depth 8\n' "$(pwd)" \
  | ./bin/yaneuraou   # readyok と bestmove が出れば OK
```

### 1-3. Python 環境 (PyTorch)

```sh
cd ml
python3 -m venv venv
./venv/bin/pip install torch     # macOS arm64 は MPS 対応 wheel が入る
```

依存は PyTorch のみ (numpy 等は不要)。

---

## 2. 教師データ生成

```sh
# リポジトリルートで実行 (npx tsx は不可、node -r tsx/cjs を使う)
node -r tsx/cjs ml/generate-teacher.ts --target 10000                 # パイプライン検証用
node -r tsx/cjs ml/generate-teacher.ts --target 100000 --engines 8    # 本番 (バックグラウンド推奨)
```

- 出力: `ml/data/teacher.jsonl` (1行1局面 `{sfen, cp, ply, bestmove, depth}`)
  - `cp` は **手番側視点** の centipawn。詰みは `±(30000 - 手数)` に写像 (`mate` フィールド付き)。
- **再開可能**: 追記式。中断しても同じコマンドを再実行すれば、既存局面を重複排除しつつ
  `--target` に達するまで続きから生成する。
- 局面生成: 自作エンジン V20 (maxDepth 4 / 25ms) の自己対戦 + 確率 0.2 のランダム分岐。
  手数 6〜120、手番側が王手されている局面は除外、SFEN(手数除く) で重複排除。
- 主なオプション: `--target N` `--engines N` `--depth 8` `--epsilon 0.2`
  `--movetime 25` `--chunk 2000` `--out path`
- 実測 throughput (M4 Pro): 生成 ≈ 20 局面/s (ボトルネック)、
  ラベリング ≈ 1,300〜1,400 局面/s (depth 8, エンジン 4〜6 並列)。
  10万局面 ≈ 約 90 分。

### 2-1. WCSC強豪棋譜からsibling教師を作る

棋譜の実戦手を正解として直接コピーせず、実戦手と教師MultiPVを候補集合にし、
同じ親局面から生じる兄弟候補を比較する。**全候補を1回のjoint `searchmoves`へ渡した
v1〜v3は、候補の入力順だけで順位とcpが変わったため学習利用禁止。** v4も独立探索への
移行を検証した診断版であり、v1〜v4の生成物はすべて診断専用とする。

現行v6はproposal MultiPVで候補集合だけを作り、実戦手を追加したあと、各候補の前に
`isready`で探索状態をresetする。UTF-8 bytes昇順で1手ずつ、`MultiPV=1`かつ
`searchmoves <1手>`で独立探索し、cp降順・手のUTF-8 bytes昇順で順位を合成する。
通常cpは`|cp| ≤ 900,000`、mateは`±1,000,000`帯へ分離する。指定depth未満の完了は、
単一候補探索の最後の受理更新がterminal exact mateの場合だけ許可する。

```sh
# WCSC36決勝28局を取得・固定（SHA-256は必ず照合する）
mkdir -p ml/data/wcsc36/extracted
curl --fail --location https://www.computer-shogi.org/kifu/wcsc36_kifu.zip \
  --output ml/data/wcsc36/wcsc36_kifu.zip
openssl dgst -sha256 ml/data/wcsc36/wcsc36_kifu.zip
unzip -q ml/data/wcsc36/wcsc36_kifu.zip 'wcsc36_kifu/WCSC36-F*.csa' \
  -d ml/data/wcsc36/extracted

node -r tsx/cjs ml/import-csa-games.ts \
  --csa-dir ml/data/wcsc36/extracted/wcsc36_kifu \
  --source wcsc \
  --source-url https://www.computer-shogi.org/kifu/wcsc36_kifu.zip \
  --archive-sha256 48ece58b091dbb4df41e6fb55b73600767f77f4c9ee9ff8360474d5b75bb2631 \
  --archive-file ml/data/wcsc36/wcsc36_kifu.zip \
  --out ml/data/wcsc36/parents.raw.jsonl \
  --report ml/data/wcsc36/import-report.json \
  --min-ply 8 --max-ply 120

# PR3時点の履歴用command。現在のsealed full runには使わない。
# 現在のHEADではこのraw-path CLI自体を削除済みで、下は実行例ではない。
readonly LABEL_DEPTH=18

node -r tsx/cjs ml/generate-sibling-teacher.ts \
  --raw ml/data/wcsc36/parents.raw.jsonl \
  --engine-bin ml/bin/yaneuraou \
  --engine-receipt ml/engine-receipts/yaneuraou-9133c527-applem1.json \
  --eval-dir ml/eval/eval \
  --pipeline-revision "$(git rev-parse HEAD)" \
  --depth "$LABEL_DEPTH" --multipv 12 --engines 12 \
  --seed 42 --val-ratio 0.2 --hash-mb 64 \
  --out-train ml/data/wcsc36/siblings.train.jsonl \
  --out-val ml/data/wcsc36/siblings.val.jsonl \
  --manifest ml/data/wcsc36/sibling-manifest.json \
  --work ml/data/wcsc36/sibling-progress.jsonl
```

> **Superseded（2026-07-10）**：上のdepth-18 commandはPR3時点の再現記録である。
> 120秒枠のfull attemptは215親、600秒枠は393親で停止し、heavy parentの隔離診断では
> 8 siblingsに1,693.48秒かかった。Lane A再比較ではfixed depth 16、MultiPV 12、12 engines、
> Hash 64 MiB、1探索600秒を最終contractに選んだfresh full runはexit 0で完了した。
> manifestは3,112 selected = 3,106 completed + 6 skipped、36,365 candidate recordsをaccountし、
> train 23,813行（20,286,990 bytes / SHA `909f12a5…`）、val 8,761行（7,422,900 bytes /
> SHA `5a2435df…`）、work SHA `f183d403…`、manifest SHA `3381e238…`を確定した。下のpartitionerは
> 供給されたstrict manifestを継承するだけで、
> depth / nodes / timeoutを選ばない。

以下は旧v6 generatorが当時のfull runで固定した履歴であり、削除済みCLIの現行contractではない。

- `--pipeline-revision`と40桁Git HEADの一致、clean worktreeを開始時と公開直前に検査する
- source/build/compiler/binary hashを含むengine receiptを実binaryと照合する
- engine、file引数、評価treeをprivate temp directoryへsnapshotし、copy後のhashを検査して
  write bitを落とす。workerはこのread-only copyとprivate working directoryだけを使う
- `eval_options.txt`、bound score、mixed/incomplete depth、不正rank、古いnodesを拒否する
- 親ごとにwork checkpointを`datasync`し、raw、policy、pipeline、engine/eval、探索条件の
  fingerprintが同じ場合だけ再開する
- 全行とsplitを検証後、train/valをatomic writeし、両方のbytes/hashを結ぶmanifestを
  最後にatomic writeする。manifestがない、またはhashが違うデータは未公開扱いにする

PR-B1時点の現行moduleは、旧CLIをnonzeroのtombstoneにし、production entryをまだ提供しない。
非本番`CoreForTests` seamはstructural rows、binding由来verifier revision、固定4 stage filenameを使うが、
rowsのruntime authenticity、engine/eval/stage pathとsealed rootのdisjointness、private/exclusive stage、
consumer postflight後のfinal publication、result receiptはB2 runnerで実装する。したがってB1のstage
manifestや非鍵checkpoint checksumを公開済みteacher evidenceとして扱わない。

#### Floodgate v7 Macローカル教師run 2回目のverification STOP（2026-07-19）

最初のpreparation blockerを修正した後の2回目は、5つのmaterializationをすべて完了し、
教師engine起動前のrole-bundle verificationで安全停止した。全72,717 files /
1,227,490,748 bytesはcopy-by-value元と一致し、原因はデータ破損、AWS、network、
timeoutではなく、historical inode / ctime固定とfresh copy-by-value closureの契約不整合だった。
教師行、checkpoint、学習、対局、live weight変更は引き続き0である。詳細は
[日本語記事](../docs/blog-shogi-floodgate-v7-local-clean-room-teacher-second-run-verification-stop.md) /
[English article](../docs/blog-shogi-floodgate-v7-local-clean-room-teacher-second-run-verification-stop.en.md) /
[machine evidence](../docs/data/floodgate-v7-local-clean-room-teacher-second-run-verification-stop-2026-07-19.json)を参照。

#### Floodgate v7 ローカルcheckpoint runtime-claim順序修正（2026-07-19）

実教師run前の再監査で、training-row runtime claimがconsumer callbackの同期呼び出し中だけ有効なのに、
従来runnerはcallback内でcheckpoint key準備を`await`してからcheckpointを呼んでいたことを確認した。
keyをconsumer前に準備し、callbackの同期区間でcheckpoint関数を直接呼んでからPromiseを待つ順序へ修正した。
未使用keyは常にdiscardし、stage claim前後の成否にかかわらず同じidempotent lease-close Promiseへjoinする。
operation / discard / closeの複数失敗もnested `AggregateError`で保持する。変更対象68 / 68、
checkpointを含む独立再実行117 / 117、Node v22.13.0の最終関連実行121 / 121 PASS、
PR前の実装review P0–P3は0件だった。最初のPR CIは旧evidence pin 2件で停止し、readiness reviewで
P1 1件・P2 2件として検出した。pin、hermetic Git環境、review履歴を修正後、Node v22.13.0 focused
runは82 / 82 PASSし、最終再reviewのP0–P3は0件になった。
教師、label、学習、対局、AWS / GCP / Vercel call、live weight変更はすべて0である。詳細は
[日本語記事](../docs/blog-shogi-floodgate-v7-local-checkpoint-runtime-claim-order.md) /
[English article](../docs/blog-shogi-floodgate-v7-local-checkpoint-runtime-claim-order.en.md) /
[machine evidence](../docs/data/floodgate-v7-local-checkpoint-runtime-claim-order-2026-07-19.json)を参照。

#### Floodgate v7 sealed 24,000件のMacローカルfinalizer（2026-07-19）

clean-room教師runnerが同じ認証済みstreamを100 → 500 → 24,000へ進めてsealした後だけ使う、
別のargumentless commandを追加した。

```sh
npm run shogi:floodgate-v7-local-clean-room-training-label-finalizer
```

operational entryはDarwinと専用entry / exact argvをprivate I/O前に検査し、固定private handoffの
HMAC、deployment key ID、run binding digest、stage identity、work bytes / SHA-256、resume 500、
sealed 24,000、ordered completion chainを再検証する。prefix 100 / 500はfinalizeしない。
stage authorization前に`O_EXCL`、file `fsync`、directory `fsync`でdurable one-shot claimを作るため、
CLI再起動後の同じhandoffも拒否する。既存stage authorization、pinned training consumer、
sealed scanner、production finalizerだけを合成し、AWS、Firebase / GCP、Vercel、networkへ接続しない。

実装fileのexact bytes / SHA-256 / Git blob、validated commit / tree、focused / 関連test件数は
更新のたびに変わるため、[machine evidence](../docs/data/floodgate-v7-local-clean-room-training-label-finalizer-2026-07-19.json)を
唯一のauthoritative recordとする。evidence pin testがその値を実fileとGit historyから再計算する。
real teacher、real label finalization、optimizer training、weight、対局、live activationはすべて0である。
独立再reviewと通常merge前には実commandを動かさない。詳細は
[日本語記事](../docs/blog-shogi-floodgate-v7-local-clean-room-training-label-finalizer.md) /
[English article](../docs/blog-shogi-floodgate-v7-local-clean-room-training-label-finalizer.en.md) /
[machine evidence](../docs/data/floodgate-v7-local-clean-room-training-label-finalizer-2026-07-19.json)を参照。

train/validationは対局単位で分け、親局面と実際のmodel入力である子局面のtranspositionも
validation優先でtrainから親単位に除く。depth 14/16の100親v6診断は完走しているが、
clean-pipeline manifest導入前なので学習には使わない。実測値とjoint探索の順序依存例は
WCSC36記事（[日本語](../docs/blog-shogi-wcsc36-sibling-training.md) /
[English](../docs/blog-shogi-wcsc36-sibling-training.en.md)）を参照。

### 2-2. model training / selection / PR4A以降exact-row holdoutを固定する

full sibling manifest完成後、そのままのtrain/valを学習へ渡さない。depth選択pilotだけでなく
hard-case、repeat、node-policy診断を含むLane A workは全28局に触れている。現行tracked receiptは
102 parent IDsと`position_id ∪ child_position_id`の1,392 semantic IDsを別々のsorted/unique/LF fileへ
固定する。parent IDまたは兄弟group内のsemantic IDが1つでも一致すれば、そのgroup全体をtraining /
selection / holdoutすべてから先に除外する。full teacherを同じpartition logicでauditした結果、除外対象は
training 307親 / 3,642行、selection 64親 / 762行、holdout 49親 / 588行、full teacherに現れない
exposed parent IDは7件だった。この値とreceipt 4,111 bytes / SHA-256
`083a86e48f1af134b854cdf0e505f0f39cc55ef75d5cbbc0df47c3e1c5013a6f`を固定した。
このためgame-level未見とは呼ばず、PR4A以降のexact-row sealだけを主張する。そのうえでvalidation 7局を固定
domain `shogi-sibling-eval-partition-v1`、seed `wcsc36-d16-v6-eval-v1`でmodel selection
4局 / final holdout 3局へ分ける。`position_id ∪ child_position_id`をsemantic identityとし、
holdoutとselectionが重なればholdoutを優先する。さらにselection+holdoutのevaluation unionと
重なるtraining親も親グループ単位で落とし、21 training gamesを保った`model_training`を作る。

```sh
# role_accountingを固定する前のaudit履歴: observed JSONだけを出し、
# artifactは公開せずexit 2になった。pin後の再auditも常に非publishである。
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
  --audit-policy-exposure

# observed role valuesをreceipt/codeへ固定後、同じcommandをまず --preflight で通す。
# その後 --preflight だけを外してatomic publishする。
# --audit-policy-exposureはpin後も常に非publishで、Audited (no publish)と明示する。
```

出力JSONLは元行bytesのfilterで、partition manifestを最後にatomic writeする。full sourceは
raw SHA、3,112 entryの3,106 completed + 6 skipped accounting、engine/eval receipt、fixed depth 16 / MultiPV 12 / engines 12 /
FV scale 20 / Hash 64 MiB / timeout 600,000 msをexact検証する。partitioner自身はteacher policyを
選ばない。学習processへfinal-holdout JSONL pathは渡さない。replayはpolicy semantic union ∪ selection
semantic union ∪ protected holdout IDsを先に除外し、そのeligible集合からexact 500,000行をsampleする。
不足時は停止する。candidate-selection
receiptを実装する別PRまではfinal-holdout評価自体をrejectする。固定した6 training runs、判定gate、
停止したdepth-18 attemptsと次のpolicy比較は続編（[日本語](../docs/blog-shogi-wcsc36-sibling-training-results.md) /
[English](../docs/blog-shogi-wcsc36-sibling-training-results.en.md)）を参照。

clean revision `6d541f1108a22f18751ee009417c3e57e27f8205`でpreflight後に公開し、Python consumerでも再検証した
partition成果物は次のとおり。全isolation fieldは0で、manifestを最後のcommit markerにした。

| artifact           | records / parents |      bytes | SHA-256                                                            |
| ------------------ | ----------------: | ---------: | ------------------------------------------------------------------ |
| model training     |    20,123 / 1,725 | 17,154,270 | `f6dcfd6a7ca0b42e730ba0aff46394bf61e772a9b01270c5bfe126daf81c6e26` |
| model selection    |       3,912 / 341 |  3,319,397 | `97b15ba1ee780009986b5e8210cbfdbfc181f93555b7c1a87f4a6a585b7bb5ba` |
| final holdout      |       3,391 / 290 |  2,870,874 | `89b3e2ca1e637a507b4b6559326ada420d205c3967ac33063a9084ee5290e8c8` |
| protected IDs      |         3,372 / — |    242,784 | `762b95b52f50223fd484573d7d3823f3d2d7622ea3817f4300ae9fcc95935d26` |
| partition manifest |                 — |      5,357 | `d95e66239dbf2dcf3979f4cf52a5ed666922f808f82b35aff4ccefc95c0d8ee1` |

---

## 3. 学習

```sh
ml/venv/bin/python ml/train.py --data ml/data/teacher.jsonl --out ml/runs/run1 --epochs 20
```

- 入力特徴 (2282 次元, **手番側視点に正規化**。後手番は盤を 180 度回転して色を入替):
  - 盤面: 駒種 14 × 自分/相手 = 28 プレーン × 81 マス = 2268 (one-hot)
  - 持ち駒: 自分 7 種 + 相手 7 種 = 14 (枚数)
- ネットワーク: 全結合 2282 → 256 → 32 → 1、活性化 ClippedReLU (`clamp(x,0,1)`)。
  第1層は EmbeddingBag で NNUE の accumulator と同型 (差分更新・WASM 実装がしやすい)。
- ターゲット: `y = sigmoid(cp / K)` (K=600, cp は ±3000 にクランプ)。損失は MSE。
  推論時は `cp ≈ 出力ロジット × K`。
- MPS (Apple GPU) / CPU 自動選択 (`--device` で強制可)。
- 出力: `runs/<name>/best.pt`, `last.pt`, 学習曲線 `curve.csv`
  (epoch, train_loss, val_loss, val_mae_cp, lr, sec)。
- 主なオプション: `--epochs` `--batch 256` `--lr 1e-3` `--k 600` `--val-ratio 0.1` `--limit N`
- **特徴量 (`--features`)**: `board` (既定, 2282次元) / `kp` (縮約King-Piece: 自玉位置を
  6バケットに量子化し盤面/持ち駒テーブルをバケット毎に複製, 13692次元) /
  `kp-factor` (同特徴の分解学習: `w1[b][f] = w_shared[f] + w_delta[b][f]`, 本家NNUEの
  factorizer 定石。エクスポート時に合成されるので推論形式は `kp` と同一)。
  バケット定義は `kp_bucket()` (WASM/TS 側と厳密一致必須)。
  第3サイクルの結果 (教師1Mでは base を上回れず、本番不採用) は
  `ml/data/training-report-3.md` 参照。

### 3-1. sibling学習をrunOp1から安全にwarm-startする

本番weightsへ上書きせず、hash固定したlegacy runOp1 checkpointからmodelだけを読み、optimizerは
新規にする。runOp1には現行sibling/partition provenanceがないため、同一実験のresumeとは扱わない。
旧valueデータのreplayはvalidationへ混ぜず、既定では全ファイルからseed固定で50万行を
一様抽出する。`best-value.pt`と`best-sibling.pt`を別々に残し、`best.pt`の選択規則も
checkpoint metadataへ記録する。

```sh
ml/venv/bin/python ml/train.py \
  --data ml/data/wcsc36/siblings.model-training.jsonl \
  --val-data ml/data/wcsc36/siblings.model-selection.jsonl \
  --sibling-manifest ml/data/wcsc36/sibling-manifest.json \
  --validation-partition-manifest ml/data/wcsc36/sibling-eval-partition-manifest.json \
  --experiment-plan ml/protocols/wcsc36-six-run-plan.json \
  --holdout-protected-position-ids ml/data/wcsc36/final-holdout-position-ids.txt \
  --policy-exposure-receipt ml/protocols/wcsc36-policy-exposure-receipt.json \
  --policy-exposed-parent-ids ml/protocols/wcsc36-policy-exposed-parent-ids.txt \
  --policy-exposed-semantic-position-ids ml/protocols/wcsc36-policy-exposed-semantic-position-ids.txt \
  --pipeline-revision "$(git rev-parse HEAD)" \
  --experiment-series warm \
  --loss sibling-ranking --features board --device cpu --torch-threads 2 --batch 256 \
  --k 600 --cp-clamp 3000 --select-metric sibling-pair \
  --rank-weight 1.0 --rank-pair-min 50 --rank-pair-max 600 --rank-margin-cp 50 \
  --policy-weight 0.25 --policy-temp-cp 200 \
  --init-ckpt /absolute/path/to/runOp1/best.pt --allow-legacy-init \
  --replay-data /absolute/path/to/runOp1-train.jsonl \
  --replay-limit 500000 --replay-ratio 1.0 \
  --lr 1e-4 --epochs 20 --seed 42 \
  --out ml/runs/wcsc36-six-run/warm-seed-42

ml/venv/bin/python ml/eval-sibling.py \
  --data ml/data/wcsc36/siblings.model-selection.jsonl \
  --sibling-manifest ml/data/wcsc36/sibling-manifest.json \
  --validation-partition-manifest ml/data/wcsc36/sibling-eval-partition-manifest.json \
  --policy-exposure-receipt ml/protocols/wcsc36-policy-exposure-receipt.json \
  --policy-exposed-parent-ids ml/protocols/wcsc36-policy-exposed-parent-ids.txt \
  --policy-exposed-semantic-position-ids ml/protocols/wcsc36-policy-exposed-semantic-position-ids.txt \
  --holdout-protected-position-ids ml/data/wcsc36/final-holdout-position-ids.txt \
  --data-role selection \
  --checkpoint stable=/absolute/path/to/runOp1/best.pt \
  --checkpoint warm=ml/runs/wcsc36-six-run/warm-seed-42/best-sibling.pt \
  --json-out ml/data/wcsc36/sibling-eval.json
```

事前登録した本番matrixはwarm / scratchの各seed 42, 43, 44。warmは
`--experiment-series warm`、固定runOp1 SHA-256、`lr=1e-4, 20 epochs`。scratchは
`--experiment-series scratch`、`--init-ckpt`/`--allow-legacy-init`なし、`lr=1e-3, 40 epochs`。
両方とも固定SHA-256のreplayを500,000行・ratio 1.0で使う。全6 runは`--device cpu`へ固定する。
同じ42行smokeを各2回測るとCPUは0.94/1.06秒（平均1.00秒）、native MPSは
`aten::_embedding_bag`未実装で即失敗、MPS fallbackは1.65/1.19秒（平均1.42秒、+42%）かつ
毎回warningだったため、fallback環境変数は使わない。予定runtimeのPython 3.13.0 / Torch 2.12.1では
native MPSが動作し、batch 256の200-step microbenchmarkはCPU 0.3476/0.3619秒、MPS
0.1932/0.1796秒だった。しかしCPUは同一2 runのloss/weight hashがexact一致し、MPSはdeterministic
error modeでも両方が不一致だった。6 runを2 CPU threadsずつ並列化できる点も含めCPUを維持する。
tracked six-run planはplatform / system / machine /
processor / CPU model / logical CPU数 / Python / PyTorch / `cpu`を完全一致で固定する。6 processは各々
intra-op 2 threads、inter-op 1 thread、deterministic algorithms有効、debug mode `error`へ固定し、
checkpointと完走時だけ最後にatomic writeする`result.json`へ同じruntime receiptを残す。
six-run plan自身にはGit revisionを埋め込まない。plan commit後のbytes hashを次commitでコード定数へ
固定する2段階sealにし、自己参照を避ける。実行時はplan hash・tracked/unmodified planとは別に、
worktree全体がcleanかつ`HEAD == --pipeline-revision`を検証し、そのexecution HEADをcheckpointと
`result.json`へ記録する。完走後auditは6 resultと6 checkpointの両方について、実行revision
`d18d3c43677255c518dce83f4a53caf46057f878`、plan bytes/SHA、完全runtime receiptを固定値と照合する。
全input/runtimeを埋めたplanは3,057 bytes / SHA-256
`0e34262f77555897d92b01a3737c71057d8b90cc98cdcb2fe63ad24ec4dde070`で、planを先にcommitした後の
別commitにある`SEALED_SIX_RUN_PLAN_SHA256`がexact bytesを固定する。
model-selectionのint16 pair accuracy、top-1、value MAEの順で各seriesのmedian seedを選ぶ。
6 runそれぞれのresult marker/checkpoint/int16 export/int16 selection report identity、median-ranked seed strategy、
selection metrics/tie-break、selected checkpoint、run-plan SHAをauditでexact検証する。現時点のcandidate receipt decoderは
自己申告された構造を検査するだけで、公開authorization APIは常にfail-closedである。将来holdoutを許可するには、固定入力と
clean codeから6候補＋stableのexport/evaluationを再実行したin-memory auditとの完全一致を別途実装する。単にreceiptとauditの
bytes/SHAを一緒に渡すだけでは許可しない。完走後は次のauditをclean revisionから生成する。audit commandはfinal-holdout JSONLを
引数に取らず、開始時と書き込み直前の両方で同じclean HEADを検証する。

```sh
python3 ml/sibling_selection_audit.py \
  --run-root ml/runs/wcsc36-six-run \
  --run-plan ml/protocols/wcsc36-six-run-plan.json \
  --stable-checkpoint /absolute/path/to/runOp1-best.pt \
  --stable-selection-report ml/runs/wcsc36-six-run/stable-int16-selection.json \
  --evidence-python /absolute/path/to/sealed/venv/bin/python \
  --selection-data ml/data/wcsc36/siblings.model-selection.jsonl \
  --sibling-manifest /absolute/path/to/full-depth16-v6/manifest.json \
  --validation-partition-manifest ml/data/wcsc36/sibling-eval-partition-manifest.json \
  --policy-exposure-receipt ml/protocols/wcsc36-policy-exposure-receipt.json \
  --policy-exposed-parent-ids ml/protocols/wcsc36-policy-exposed-parent-ids.txt \
  --policy-exposed-semantic-position-ids ml/protocols/wcsc36-policy-exposed-semantic-position-ids.txt \
  --holdout-protected-position-ids ml/data/wcsc36/final-holdout-position-ids.txt \
  --stable-weights ml/runs/wcsc36-six-run/stable-int16/weights.bin \
  --stable-weights-meta ml/runs/wcsc36-six-run/stable-int16/weights.meta.json \
  --pipeline-revision "$(git rev-parse HEAD)" \
  --out ml/protocols/wcsc36-six-run-selection-audit.json
```

実行済み6 runのmedian代表はwarm seed 42 / scratch seed 42、暫定candidateはwarm seed 42となった。
しかしint16 top-1がstable未満（`0.2639296 < 0.2668622`）で、float→int16 pair低下の絶対値も
上限を超えた（`0.0027204 > 0.002`）。そのため27,692-byte audit
`5a7c4b1041ad6c01109fd0f9575f1e40e9f2fc18abe0c9c9c222500dc32b8c19`は
`not_emitted_selection_gate_failed`と`sealed_not_opened`を記録し、成功candidate receiptを生成しない。
同auditは記録したローカルvenvと固定exporter/evaluatorから6候補＋stableを再生成し、全weights/metaのbyte一致と
float/int16 metrics・core provenance一致も記録する。Python実行file/runtimeは記録しているが、venv全packageの
再構築可能なlockまでは固定していないので、将来再現性の完全なenvironment sealとは呼ばない。
結果のよい別seedへ差し替えず、次は別planとしてint16-aware学習を事前登録する。

`--sibling-manifest`とpartition manifestはv6 policy、clean pipeline revision、runtime snapshot、
base train/val、semantic-isolated model training、model selectionのsizeとSHA-256をJSONL parse前に
検証し、そのprovenanceをcheckpointと評価reportへ保存する。base trainを直接`--data`へ渡すと
拒否する。
`eval-sibling.py`はfloatとint16量子化後のvalue MAE、親内pair accuracy、teacher top-1を
同じvalidation行で比較し、量子化による順位変化も報告する。

このvalidationをepoch・checkpoint・warm/scratch・hyperparameterの選択に使った場合、
その値は**モデル選択指標**であって最終holdoutではない。昇格判定には、選択に一度も
使わないLane A exposure除外後のexact-row holdout、既知回帰局面、量子化後探索、本番時間のA/Bを用意する。
pilotが全28局へ触れていたため、これはgame-level untouchedという意味ではない。

### 3-2. int16-awareを選別ラベルなしで3 seed学習する

前実験はfloatでは改善した一方、int16化でpair accuracyが`0.0027204`低下し、固定gate
`abs(delta) <= 0.002`を越えた。次の仮説は、export後と同じ整数forwardを学習損失へ直接入れる
STE（straight-through estimator）である。変更不能なplanは
`ml/protocols/wcsc36-int16-aware-plan.json`（8,152 bytes / SHA-256
`bef7863a5f6c85d5d6c5b97cc21aef48d17dae137ffd679efeda764d352a6b6b`）。これは強さの証明ではなく、
既存model-selection上のdevelopment screeningを1 familyだけ行う事前登録である。

学習processへ`--val-data`を渡さない。replay除外に必要なpolicy / selection / holdoutのsemantic IDは、
既に使ったmodel-selectionとラベルを含まないholdout protected IDsから、学習前にID-only unionへ変換する。
final-holdout JSONLはgeneratorの引数に存在しない。固定成果物は8,678 IDs / 624,816 bytes / SHA-256
`1cddfa87218de7c0752acfd6d238d3581103a6051e7f17bf54256bee2586ce5a`である。

```sh
python3 ml/prepare_qat_replay_exclusion.py \
  --selection-data ml/data/wcsc36/siblings.model-selection.jsonl \
  --policy-exposed-ids ml/protocols/wcsc36-policy-exposed-semantic-position-ids.txt \
  --holdout-protected-ids ml/data/wcsc36/final-holdout-position-ids.txt \
  --out ml/data/wcsc36/int16-aware-replay-excluded-position-ids.txt
```

各batchは同じprimary rowsと同じreplay indicesに対して
`0.5 * float full task + 0.5 * exact-int16 STE full task`を計算する。両full taskはvalue、親内rank、
listwise policy、replay valueをすべて含む。量子化はexporterと共通の実装で、activation scale 127、
後段weight scale 64、round-half-to-even、int32 accumulator、`>> 6`、output scale 8,128を再現する。
epoch中の評価・early stop・best checkpoint選択はなく、epoch 20の`final.pt`だけを候補にする。

```sh
# seedは42, 43, 44。outputもplanでseedごとに固定されている。
SEED=42
ml/venv/bin/python ml/train.py \
  --experiment-family int16-aware \
  --experiment-plan ml/protocols/wcsc36-int16-aware-plan.json \
  --data ml/data/wcsc36/siblings.model-training.jsonl \
  --sibling-manifest /absolute/path/to/full-depth16-v6/manifest.json \
  --validation-partition-manifest ml/data/wcsc36/sibling-eval-partition-manifest.json \
  --holdout-protected-position-ids ml/data/wcsc36/final-holdout-position-ids.txt \
  --policy-exposure-receipt ml/protocols/wcsc36-policy-exposure-receipt.json \
  --policy-exposed-parent-ids ml/protocols/wcsc36-policy-exposed-parent-ids.txt \
  --policy-exposed-semantic-position-ids ml/protocols/wcsc36-policy-exposed-semantic-position-ids.txt \
  --replay-excluded-position-ids ml/data/wcsc36/int16-aware-replay-excluded-position-ids.txt \
  --init-ckpt /absolute/path/to/runOp1-best.pt --allow-legacy-init \
  --replay-data /absolute/path/to/runOp1-train.jsonl \
  --pipeline-revision "$(git rev-parse HEAD)" \
  --loss sibling-ranking --features board --device cpu --torch-threads 2 \
  --batch 256 --k 600 --cp-clamp 3000 \
  --rank-weight 1.0 --rank-pair-min 50 --rank-pair-max 600 --rank-margin-cp 50 \
  --policy-weight 0.25 --policy-temp-cp 200 \
  --replay-limit 500000 --replay-ratio 1.0 \
  --lr 1e-4 --epochs 20 --seed "$SEED" \
  --out "ml/runs/wcsc36-int16-aware/seed-$SEED"
```

3つのatomic `result.json`と`final.pt`が揃う前はmodel-selectionを開かない。揃った後に各finalを1回だけ
float/int16評価し、int16 pair、top-1、MAE、seed、checkpoint SHAの固定順で中央seedを代表にする。
代表が4 gateすべて、3 seed中2つ以上が4 gateすべて、かつ全3 seedが2つの量子化delta gateを通った
場合だけ次へ進む。失敗後のseed追加、ratio/lr/epoch調整、よい非中央seedへの差替えは禁止する。
通過してもproduction昇格ではなく、sealed final holdout、既知回帰、量子化後探索/browser、
事前登録したformal paired A/B、外部高段ratingを順に要求する。original v1の192 pair /
384局は未実行のままbyte不変で保存し、結果を見る前の明示amendmentでv2を384 pair /
768局へ拡張した。v2も全artifact identityが未登録なので実行は閉じている。

公式のselection入口は次の集約commandだけである。最初に3つの`result.json`、`final.pt`のbytes/SHA、
checkpoint metadata、共通runtime/revisionを検証し、全部揃った後で初めてmodel-selectionを1回読む。
commandにはfinal-holdout JSONL optionがなく、auditがstatic passでもproduction昇格は許可しない。

```sh
ml/venv/bin/python ml/qat_selection_audit.py \
  --run-root ml/runs/wcsc36-int16-aware \
  --run-plan ml/protocols/wcsc36-int16-aware-plan.json \
  --stable-checkpoint /absolute/path/to/runOp1-best.pt \
  --selection-data ml/data/wcsc36/siblings.model-selection.jsonl \
  --sibling-manifest /absolute/path/to/full-depth16-v6/manifest.json \
  --validation-partition-manifest ml/data/wcsc36/sibling-eval-partition-manifest.json \
  --policy-exposure-receipt ml/protocols/wcsc36-policy-exposure-receipt.json \
  --policy-exposed-parent-ids ml/protocols/wcsc36-policy-exposed-parent-ids.txt \
  --policy-exposed-semantic-position-ids ml/protocols/wcsc36-policy-exposed-semantic-position-ids.txt \
  --holdout-protected-position-ids ml/data/wcsc36/final-holdout-position-ids.txt \
  --training-revision "$(git rev-parse HEAD)" \
  --audit-revision "$(git rev-parse HEAD)" \
  --out ml/protocols/wcsc36-int16-aware-selection-audit.json
```

実行結果は`static_selection_fail`だった。3 seedすべてのint16 pair accuracyはstable
`0.6048967`を上回った（42: `0.6071637`、43: `0.6092363`、44: `0.6073580`）が、
seed 42はpair量子化delta、seed 43はstable top-1、代表seed 44はpair/top-1の両deltaを
通らず、4 gate完走は`0/3`だった。29,616-byte auditのSHA-256は
`aab9a6fdb49e4d393ca11132671d5aa433b9a208bfafeaa031f3e9554b148737`。
`production_promotion_authorized=false`、final holdoutは未開封、本番runOp1は変更していない。
詳細は[日本語結果](../docs/blog-shogi-wcsc36-int16-aware-results.md) /
[English results](../docs/blog-shogi-wcsc36-int16-aware-results.en.md)に記録した。同じselectionでの
seed追加・epoch差替え・閾値緩和は行わず、次は新しい強豪棋譜と新しいdevelopment splitを
事前登録してから進める。

次のデータ変更実験は
[`floodgate-q1-2026-fresh-sibling-plan.json`](./protocols/floodgate-q1-2026-fresh-sibling-plan.json)
に事前登録した。Floodgate 2026年Q1のgroup 0・対局時rating双方3600以上・累積30局以上・
正常投了を、training 1,000局 / fresh selection 200局 / fresh final 200局へlabel生成前に
分ける。モデル、exact-int16 STE、seed 42/43/44、20 epoch、selection gateは変更しない。
計画は10,890 bytes、SHA-256
`ad9e6d7f2cc7ae2d03913c405d81755d24a0b9f02b84c384b4d641c6c2b7a0af`。
詳細は[日本語plan](../docs/blog-shogi-floodgate-fresh-sibling-plan.md) /
[English plan](../docs/blog-shogi-floodgate-fresh-sibling-plan.en.md)に記録した。raw lock、
process-wide scheduler、live取得以降の進捗と途中監査値は
[日本語run log](../docs/blog-shogi-floodgate-fresh-sibling-run.md) /
[English run log](../docs/blog-shogi-floodgate-fresh-sibling-run.en.md)へ逐次追記する。

fresh QATは旧WCSC36 verifierを変更せず、exact fresh pathだけを別versionへ送る
dispatcherまで準備した。現在のtracked registryはexecution plan bytes / SHA-256を
`null`にして閉じており、実teacher・partition・training artifact identityが完成するまで
`data-only blocked`で停止する。詳細は
[日本語binding記事](../docs/blog-shogi-floodgate-fresh-qat-plan-binding.md) /
[English binding article](../docs/blog-shogi-floodgate-fresh-qat-plan-binding.en.md)を参照。

fresh training artifactは旧WCSC36と別schemaで出力し、3つのresult/checkpoint identityを
事前登録するselection preflightも別registryで閉じてある。3 resultと3 checkpointをすべて
snapshotし、全resultのstrict parse、全checkpoint/modelのstrict-load、再確認が終わるまで
selection readerへ到達できない。replay exclusionもlegacy / fresh final / fresh selectionの
exactで相互に重ならないunionとして検証する。現在は全identityが`null`なので、実artifact、
Torch、selection labelを読まずに停止する。注入可能test coreはplain valueだけを返し、
reader用guardは固定public経路だけが発行する。tracked registry / planは固定`/usr/bin/git`、
無害化環境、exact HEAD tree blob / index mode / capture済み実bytesで照合する。同一processで
module internalsへ自由にアクセスする敵対的Python codeへの暗号的な偽造不能性は主張しない。詳細は
[日本語preflight記事](../docs/blog-shogi-floodgate-fresh-qat-selection-preflight.md) /
[English preflight article](../docs/blog-shogi-floodgate-fresh-qat-selection-preflight.en.md)を参照。

fresh teacherの固定入力24,000親と、forced skip後に実際の`train.jsonl`へ出る親group数を
混同しないparent-accounting v2も、結果を見る前の追記専用amendmentとして閉じた。
`input_parents = forced_parents_skipped + emitted_parent_groups`を要求し、3 seedの
`model_training_parents`にはemitted数だけを渡す。15,369,952-byte raw入力をexact SHA-256で
照合してからtupleと順序をparseし、forcedは欠落groupから推測しない。productionでは認証済み
finalizer result / manifest / workから導出し登録したper-parent completion evidenceを必須とし、
現在は未登録なのでmaterializer自体がSTOPする。test-only coreでも全入力のexplicit forced flagと
non-forced groupのrecords / SHA-256を照合し、24,000件すべてが認証済みでforcedの場合だけ
`STOP-no-trainable-parent-groups`を返す。入力外parent、replacement、resampling、順序変更を拒否し、
strict sibling invariantとtrain bytes / SHA-256 / records / games / parent IDs /
semantic position IDsを束縛する。proposal validatorはexact input / completion / train bytesから
全digestとcontractを再生成する。v1 plan/selection registryと過去の日英記事・evidenceはbyte不変で、
v2 registryも全enrollmentが`null`、全gate/authorityが`false`である。
モデル、loss、seed 42/43/44、20 epoch、selection gate、holdout、ライブ重みは変更していない。
詳細は[日本語parent-accounting記事](../docs/blog-shogi-floodgate-fresh-qat-parent-accounting-v2.md) /
[English parent-accounting article](../docs/blog-shogi-floodgate-fresh-qat-parent-accounting-v2.en.md)を参照。

parent-accounting結果を学習入口へ渡すfresh QAT v2 execution dispatcherも追記した。
3,387-byte permanent activation anchorは、v1 plan registry、v1 selection registry、
3,501-byte closed parent-accounting v2 registryをbyte identityで固定し、自身は永久に閉じたままにする。
将来のactivationはanchor編集ではなく、exact input / per-parent completion / plan / proposal /
train identityと`F + E = 24000`を持つ別のready-successorファイルを新規追加する方式である。
現在そのsuccessorは存在しないため、v2 routeはproposal、plan、train、他のtraining artifact、
runtime reader、training contract生成の前でSTOPする。exact v2 pathだけを受け付け、near path、
symlink、v2を指す非plain-string path、wrong schema、v1/v2/WCSC36 hybridを拒否する。`os.fspath`は
一度だけsnapshotし、以後のroute判定はその固定文字列だけを使うため、値が変化する`PathLike`でも
v2から旧fallbackへcross-routeできない。successorの
completion enrollment宣言だけは信頼せず、production source-accounting validatorが登録済みexact
input / completion / train bytesからproposalを再生成した後にだけcontractへ進む。`E = 0`宣言は
source authentication前の早期fail-closed例外で、認証済みall-forcedやliteral STOP receiptの証拠ではないが、
contractを1件も発行しない。既存v1 routeとtraining / slot / selection contractは
不変で、selection、holdout、production weight writeも未許可である。この検証はローカルで完結し、
AWS、Firebase / GCP、Vercel、network、実teacher、実Torch学習を使っていない。詳細は
[日本語execution-dispatch記事](../docs/blog-shogi-floodgate-fresh-qat-v2-execution-dispatch.md) /
[English execution-dispatch article](../docs/blog-shogi-floodgate-fresh-qat-v2-execution-dispatch.en.md)を参照。

取得先はGit worktreeと交差しないcanonical absolute pathに限定する。PR #417以降の
status確認と単一process取得は次のCLIを使う。

```bash
npm run shogi:floodgate-acquire -- status --output /absolute/path/to/raw-lock
npm run shogi:floodgate-acquire -- run --output /absolute/path/to/raw-lock
```

### 3-3. 契約テスト

```sh
# TypeScript: CSA、SFEN、USI MultiPV、生成checkpoint、split、比較report
npm test -- tests/unit/ml

# PyTorch不要: checkpoint互換性とPython構文（CIでも実行）
npm run test:ml:stdlib

# PyTorch必要: strict dataset、warm-start/replay、損失、評価・量子化
ml/venv/bin/python -m unittest discover -s ml/tests_torch -v
```

CIにはPyTorchを追加せず、標準ライブラリsuiteと`py_compile`を実行する。Torch suiteは
上記venvで本番実験前に必ず実行する。

### ホールドアウト比較 (eval-holdout.py)

複数チェックポイントを共通ホールドアウトで比較する (MAE / median / pair_acc / |cp|バケット別 MAE):

```sh
ml/venv/bin/python ml/eval-holdout.py --data ml/data/holdout-1m-4k.jsonl \
    --ckpt base=ml/runs/run1m-base/best.pt kp6=ml/runs/run1m-kpf/best.pt
```

---

## 4. 重みのエクスポート (自作エンジン用)

```sh
ml/venv/bin/python ml/export-weights.py --ckpt ml/runs/run1/best.pt --verify ml/data/teacher.jsonl
ml/venv/bin/python ml/export-weights.py --ckpt ml/runs/run1/best.pt --json   # JSON 版も欲しい場合
```

- `weights.bin` + `weights.meta.json` (int16 フラット配列, NNUE 風固定小数点) を出力。
- 量子化スキームと `weights.bin` のバイトレイアウトは `export-weights.py` の docstring 参照。
  整数演算のみ (int16 重み・int32 アキュムレータ・`>>6` シフト) で推論でき、
  `cp = out_q * K / (127*64)`。`--verify` で float モデルとの誤差 (cp) を確認できる。

### WASM エンジン側との照合 (dump-reference.py)

WASM エンジン (`wasm-spike/assembly/index.ts` の `nnueEvaluate()`) が実重みで
int_forward とビット一致するかを検証する手順:

```sh
# torch 環境側 (このリポジトリ + venv)
ml/venv/bin/python ml/dump-reference.py --ckpt ml/runs/run1/best.pt \
    --data ml/data/teacher.jsonl --out ml/runs/run1/reference.json --n 200
ml/venv/bin/python ml/export-weights.py --ckpt ml/runs/run1/best.pt

# torch 不要 (WASM / TS 参照実装 / torch int16 シミュの 3-way 照合)
node -r tsx/cjs wasm-spike/nnue-verify-reference.ts \
    ml/runs/run1/weights.bin ml/runs/run1/reference.json
```

---

## 5. 今後の拡張

- **局面数を 100 万へ**: 生成がボトルネック (~20 局面/s) なので、
  自己対戦を worker_threads で並列化するか、`--movetime` を下げる /
  やねうら王自身の自己対戦 (`gensfen` 系コマンド) への置換で 10 倍以上にできる。
  ラベリング側は depth 8 で 1,300 局面/s 出ており余裕がある。
- **教師の質**: `--depth 10〜12` に上げる、multipv で分布を取る、
  勝敗結果 (WDL) とブレンドする (`lambda * eval + (1-lambda) * result`)。
- **WASM 推論への接続**: 第1層は active feature の加算だけなので、
  自作エンジンの `KyokumenImproved.move/back` に差分更新 (accumulator) を実装すれば
  1 局面あたり 256 次元の加減算 + 小さい行列積 2 回で評価できる。
  `weights.bin` をそのまま `Int16Array`/`Int32Array` として `fetch` → WASM/TS 側で読み込む。
  特徴 index の定義 (`plane*81 + (suji-1)*9 + (dan-1)`, 手番側視点) は train.py と一致させること。
- **強化学習ループ**: 蒸留済み NN を自作エンジンに載せ、その自己対戦で再生成 → 再学習 (iterated distillation)。

## 再開コマンド早見

```sh
# 10万局面生成の継続 (何度でも可)
node -r tsx/cjs ml/generate-teacher.ts --target 100000 --engines 8

# 学習 (データが増えたら再実行)
ml/venv/bin/python ml/train.py --data ml/data/teacher.jsonl --out ml/runs/run2 --epochs 30
```
