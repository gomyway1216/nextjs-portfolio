# 将棋AI強化ログ 2026-08-16〜08-20

対象: `/games/shogi` のブラウザ対局AI(HalfKP81 NNUE + WASM alpha-beta探索)。

このドキュメントは、codexによる10Mデータ収集run(PR #699)の失敗の事後検証から、
原因特定→本番モデルの再学習・昇格(PR #702)→反復蒸留パイプラインの構築までの
実験記録と教訓をまとめたもの。一次資料(receipt/log/weights)はすべて
`~/.codex/shogi-runs/` 配下の各runディレクトリに保存されている。

## 1. 出発点

- codexの研究run(2026-08-10〜13、`kingpair-interaction-10m-fast-v1-20260810`)は
  10M examples/epochの新教師データを完成させたが、2つの候補アーキ
  (DPA HalfKP96 / HalfKP64-RKI16)はいずれも**旧本番に0勝16敗**で完敗した。
- 敗北した候補がユーザー命令で強制デプロイされていたため、まずPR #701で
  旧本番(HalfKP81, weights SHA `25fc77ad…`)へ復旧した。

## 2. 事後検証: 0-16の原因(確定)

3つの独立調査(epoch-1対局 / trainer・データ実測 / 旧アーキ互換性調査)で原因を確定した。

1. **学習ターゲットの設計欠陥(主因)**: 新trainerは教師cpを生のまま
   `smooth_l1(pred, cp)` で回帰していた。旧本番の契約は
   `y = sigmoid(clamp(cp, ±3000) / 600)` + runtime K=600(`cp = raw_q × K / 8128`)で、
   この変換が丸ごと欠落していた。
2. **mateセンチネルの混入**: Aoba教師のmateスコアは±30,000ではなく**±999,98x(≈±10^6)**。
   fresh行の3.2%に混入し、value loss ≈25,900の約96%を占めていた。
   exact-onlyフィルタはboundの正確性の話であり、mate行を弾かない。
3. **K=1では出力レンジが物理的に不足**: 初期化std 0.01 + lr 5e-5 + 2 epochでは
   量子化後のモデル出力は実効±70〜80cpが上限。教師ラベルの約9割が表現不能で、
   評価関数はほぼ平坦になっていた(top1 0.03、全局詰まされて0-16は必然)。
4. **epoch-1も0勝16敗**(exportして実対局で検証)。epoch2の発散(pair loss 1.15→2.83)は
   副次的で、最初からターゲット設計で死んでいた。
5. trainerにはvalidationが無く`isfinite(loss)`のみだったため、完全に壊れたモデルが
   「2 epoch完走」として通過した。

**重要**: データ自体は無傷だった。監査済みの10Mコーパス
(legacy 2M + fresh親2M×4子=8M)は後続の全実験の基盤になった。

## 3. 本番モデルの再学習と昇格(PR #702)

- レシピ: 旧本番HalfKP81を、baseline checkpoint(`halfkp81-g3-full-all-seed42/epoch2.pt`)
  からwarm-startし、10Mデータ(fresh 8M子をflat化+legacy 2M、親レベルでval分割)で
  sigmoid/K=600/clamp3000、lr 5e-5、4 epoch学習。**学習時間は約19分**(MPS、41k examples/s)。
- ゲート(すべて直接対局。static指標は判定に使わない):
  - 1000ms/手 × **80局**: **48勝3分29敗 = 61.9%、Wilson 95% CI [50.9%, 71.7%]**
    (CI下限が50%超=統計的有意、5 seed全セット勝ち越し、≈+84 Elo)
- PR #702で本番昇格(2026-08-18マージ)。差し替えはweights payloadのみで、
  バイト数(94,656,708)/K=600/buckets=81/WASMは不変。
- 付随して「飛車先歩打ちループ」回帰テストを、単一手の禁止(`P*8f`)から
  **本来の契約(千日手ループしないこと)の検証**へ書き換えた。新weightsはdepth 11
  ちょうどでP*8fを選ぶが(深さパリティのブリップ)、継続対局で同一局面の再出現すら
  なく、ループフリーであることをプローブで確認済み。
- CI通過の過程で踏んだ罠: (a) 無関係な新advisory(deepmerge-ts)→ min-release-age=5 が
  修正版をブロックするため html-to-text を9.0.5へピン、(b) package.json の
  bytes/sha/git-blob を三重ピンする証拠スナップショットテスト群 → 慣行どおりピン更新、
  (c) 遅いCIランナーでの5秒タイムアウトflaky 2件 → ローカルPASS確認の上で再実行。

## 4. ネガティブ結果(再試行しないこと)

### 4.1 union scratch(2026-08-18)
fresh 7.92M + runOp1 5.71M = 13.63M行(13,626,416行)でゼロから学習(実際のfresh∩runOp1重複は183,316行で、
codex見積り~59kより大幅に多かった)。**チャンピオンに2勝14敗(12.5%)で大敗**。
val loss/pair_accはチャンピオンより僅かに良かったのに、である。
- 教訓: 「検証指標は強さを予測しない」(このプロジェクトで4回目の実証)。
- 副次発見: scratchモデルは量子化誤差が約1.8倍悪い(mean 40.8cp vs 22.8cp)。
  warm-startは強いモデルの近傍に留まるため量子化に構造的に有利。
- 結論: 旧runOp1データの大量混入は有害。**「freshデータのみ+強checkpointからの
  warm-start」が勝ちパターン**。

### 4.2 蒸留ラウンド1(R1、2026-08-19)
チャンピオン自身の自己対局6,717局→disjoint親100,096→Aoba depth12 MultiPV4ラベル
(exact 89.3%)→子357,468行(データ全体の3.6%)を追加して同一レシピ・同一initで再学習。
**ゲート48局で24勝24敗(50.0%ちょうど)— 有意差なし、チャンピオン防衛**。
- 2026-07のサイクル4½(self-playデータ3.7%混合→引き分け)の正確な再現。
  **数%の増分データでは、~10Mで飽和したモデルは動かない**(2回目の確認)。
- ただしパイプライン自体は完成し、全工程fault 0で再利用可能になった(§5)。

## 5. 反復蒸留パイプライン(構築済み・再利用可能)

Stockfish/やねうら王系の開発ループ(現最強で自己対局→深い探索で採点→学習→
ゲート→昇格→繰り返し)の縮小版。主要部品:

| 部品 | 実体 | 備考 |
|---|---|---|
| 自己対局 | `ml/generate-nnue-selfplay.ts`(repo) | HalfKP81 champion weights対応。progress.jsonlで再開可能 |
| opening corpus | fresh親のply6-16から決定的抽出 | v1: 30k行 / v2: 50k行(R2用、v1と排他) |
| 親選択+shard化 | `build_nnue_selfplay_selection_shards(-c).ts` | disjointフィルタ内蔵(既存学習・sealed・過去ラウンドの親子ID除外)。-c版はshortfall許容 |
| 教師ラベル | `ml/generate_kingpair_aoba_teacher_shards.ts`(repo) | Aoba depth12 MultiPV4 exact-only。エンジンSHA検証つき。shard単位再開 |
| 学習 | `ml/train.py --init-ckpt`(warm-start) | 実測 ~40k examples/s、10Mで~220s/epoch |
| export | `ml/export-weights.py` | 94,656,708 bytes / K=600を検証 |
| ゲート | `wasm-spike/match-nnue-vs-v3.ts --vs` | 両側SHA検証・同一WASM・全手合法性チェック内蔵 |

### 5.1 インシデントと恒久対策(R2で発生)

1. **driver二重起動→shard二重書き込み**: 完全終端ゲームのみのprefix再構築で修復
   (1,417局保全)、mkdirロックで再発防止。
2. **固定深さ探索のライブロック(最重要)**: `--play-depth`の固定深さ探索には
   時間・ノード上限がなく、**約700局に1局の「病的局面」で1手の探索が55分を超える**。
   チャンク(≈55分)でkillされると、決定論的に同じゲームを最初から再生して
   また55分止まる無限ループになり、8ワーカー中4つが死に体になった。
   - 対策: 生成ツールのコピー版(`generate-nnue-selfplay-c.ts`)に
     `--max-game-wall-ms`(1局のwall-clock上限、採用値600,000ms=通常局中央値の約10倍)
     を追加。超過ゲームはterminal reason `deadline`・サンプル全破棄でスキップ
     (部分データは残さない)。fingerprintには正当な新パラメータとして反映。
   - 効果: 全ワーカー稼働に復帰し、306局/チャンク(過去最速)。deadline発動率~1.3%は
     事前予測(1/700×8)と整合。
3. **選択ツールの厳格チェックとの不整合**: target-parents未達で即死する仕様に対し、
   shortfall許容版(-c)を新設(選択意味論は不変)。

### 5.2 実測スループット(M4 Pro 14コア)

- 自己対局: ~5.5〜6.3局/分(8 workers、play-depth 4、~39 samples/局(sample-every 2))
- ラベリング: ~0.7s/親/worker(depth12 MultiPV4)。生成との並行走行(4 workers)で
  壁時間をほぼ隠蔽できる
- 12ワーカー並行(8+4)はネット+6%程度(E-coreの寄与が小さい)。**真の短縮は
  ラベリングの前倒し重畳**で得られる

## 6. 進行中: 蒸留ラウンド2(R2、2026-08-19開始)

R1の教訓に基づき蒸留データのシェアを3.6%→約17-20%へ引き上げる規模拡大ラウンド。

- 目標: 自己対局24,000局(サンプル倍化で局数を半減)→ disjoint親 約50-60万
  → 子 約200万超 → 既存9.92M+R1子357kと合算した約12.6M行で同一レシピ再学習
  → 対チャンピオン48〜80局ゲート
- 本ドキュメント作成時点: 合算 約11,000/24,000局、t1(親149,895)のラベリング完了
  (exact 86.1%)。生成完了見込み8/22、最終判定見込み8/22深夜〜8/23。
- 状態は `~/.codex/shogi-runs/halfkp81-distill-r2-scale-20260819/`
  (state.json / handoff.md / chunk-driver-c.sh)に永続化されており、
  どのセッションからでも再開可能。

## 7. 教訓(2026-08分の追記)

1. **検証指標(val loss / pair_acc / MAE)は採用判定に使わない。** ゲートは常に
   本番時間制御(1000ms+)の直接対局、有意性はWilson CIで判定する。
2. **教師スケールとruntime契約(K、clamp、センチネル処理)は一体で検証する。**
   ターゲット変換の欠落は「学習は完走するが完全に弱い」モデルを生む。
3. **trainerには最低限のvalidationを入れる。** `isfinite`だけでは全損を検出できない。
4. **数%の増分データは飽和モデルを動かさない。** 効かせたいなら2割級のシェア、
   または全データ再構成が必要。
5. **warm-startは強さだけでなく量子化親和性でも有利。**
6. **固定深さ探索を無人パイプラインに使うなら、wall-clock上限が必須。**
   病的局面は~1/700局の頻度で必ず出る。
7. **長時間ジョブは「チャンク実行+ファイル永続化された状態+再開可能な設計」で組む。**
   すべての工程(生成・選択・ラベル・学習・対局)がこの形なら、プロセスkillや
   エージェント交代に耐える。
8. **並列化はコア数の壁より工程重畳が効く。** 生成とラベリングの並行走行が最大の短縮。

## 8. 主要artifact索引

| 内容 | 場所 |
|---|---|
| codex 10M runの一次資料 | `~/.codex/shogi-runs/kingpair-interaction-10m-fast-v1-20260810/`(HANDOFF-2026-08-13.md含む) |
| 現本番モデル(champion)一式 | `~/.codex/shogi-runs/halfkp81-newdata-warmstart-v1-20260817/`(weights SHA `e04e60c7…`、80局verdict JSON、学習データ・スクリプト) |
| union scratchネガティブ結果 | `~/.codex/shogi-runs/halfkp81-uniondata-scratch-v1-20260818/` |
| R1蒸留パイロット一式 | `~/.codex/shogi-runs/halfkp81-distill-r1-pilot-20260818/`(pilot-manifest.json、r1-gate-verdict.json) |
| R2(進行中) | `~/.codex/shogi-runs/halfkp81-distill-r2-scale-20260819/`(state.json、handoff.md) |
| 旧本番snapshot(比較基準) | `$RUN/production-before-forced-halfkp64-rki16-v1.{wasm,weights.bin}`(SHA `1a9cb6fe…` / `25fc77ad…`) |

関連PR: #699(codex研究run)、#701(旧本番復旧)、#702(newdata再学習の本番昇格)。
