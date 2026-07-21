# Shogi WASM spike (feasibility check → 段階移植)

将棋エンジン（`src/components/game/ShogiImproved/`）の WebAssembly 化でどれだけ速くなるかを実測するためのスパイク。フェーズ1（盤面表現＋完全合法手生成＋perft＋Zobrist）、フェーズ2（評価関数 `evaluateV3()` の完全移植、JS と整数一致）に続き、**フェーズ3 で V20 探索本体を完全移植**した（固定深さで JS と bestMove・スコア・ノード数まで完全一致）。

フル移植の計画は [PLAN.md](./PLAN.md) を参照。

## 構成

```
wasm-spike/
  assembly/index.ts      # AssemblyScript エンジン本体（盤面・make/unmake・手生成・打ち歩詰め・Zobrist・perft・evaluateV3/evaluateV3Full）
  assembly/halfkp81-research.patch # 固定した本番sourceへ研究用81-bucket差分だけを当てるpatch
  assembly/tables.ts     # 自動生成（gen-tables.mjs）。canMove/canJump/diff/komaValue/canPromote
  assembly/as-ambient.d.ts # ルート tsconfig で型チェックを通すための ambient 宣言（asc は無視する）
  gen-tables.mjs         # 既存 TS ソースからテーブルを抽出して tables.ts を生成
  bench-wasm.mjs         # WASM 側 perft ベンチ
  bench-eval.ts          # evaluateV3 の JS vs WASM ベンチ（各局面 10 万回呼び出し）
  parity.ts              # JS⇄WASM パリティハーネス（合法手数・Zobrist ビット一致・evaluateV3 整数一致検証）
  nnue-ref.ts            # NNUE int_forward の TS 参照実装（特徴抽出・SFEN パーサ・ダミー重み生成）
  nnue-parity.ts         # NNUE AS⇄TS パリティ（ダミー重み、1000 局面 + 差分アキュムレータ 1200 局面 + 探索一致）
  nnue-bench.ts          # NNUE eval 単体 + perft オーバーヘッド + 3秒探索ベンチ（full/fast/マテリアル重み比較）
  nnue-verify-reference.ts # 実重み照合（ml/dump-reference.py の出力と 3-way 照合）
  artifacts/shogi-halfkp81-research.wasm # 81-bucket HalfKP 研究専用（本番loaderは参照しない）
  build-halfkp81-research-wasm.mjs # temp内でpatch・compile・hash検証して研究artifactだけを更新
scripts/shogi-perft-js.ts # JS 側 perft ベンチ（既存エンジンをそのまま使用）
src/components/game/ShogiImproved/wasm/shogi.wasm # 本番固定バイナリ（HalfKP研究artifactと分離）
src/components/game/ShogiImproved/wasm/shogiWasmBase64.ts # 上記の base64 埋め込み（gen-wasm-base64.mjs で再生成）
```

## ビルド手順

ツールチェーン: **AssemblyScript 0.28**（Rust 未インストールのため。`npm install --no-save assemblyscript` で導入、package.json は変更していない）。

```sh
npm install --no-save assemblyscript

# テーブル再生成（既存TSソースが変わったときのみ必要）
node wasm-spike/gen-tables.mjs

# HalfKP研究ビルド。本番sourceをtempへcopyして研究patchを適用し、
# AssemblyScript 0.28.19 + SIMDでcompileして研究専用artifactだけを更新する。
node wasm-spike/build-halfkp81-research-wasm.mjs
```

本番 `assembly/index.ts`、`shogi.wasm`、`shogiWasmBase64.ts` は固定したままである。
本番WASMは35,597 bytes / SHA-256
`e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c` の固定assetのままである。
HalfKPの研究中は `gen-wasm-base64.mjs` を実行しない。将来、正式A/B・ブラウザ複数workerの
メモリゲート・ロールバック条件を通過して本番昇格する別PRだけが、本番assetとbase64を同時に更新する。
81-bucket差分は`assembly/halfkp81-research.patch`だけに隔離した。研究用artifactは35,837 bytes / SHA-256
`1b95659d54fc897e2ff766583ccc2035a0932929fcb9520800c3a5ca2b1430db` で、`--wasm-path` を明示したハーネスだけが読み込む。

## ベンチ実行

```sh
node -r tsx/cjs scripts/shogi-perft-js.ts 4   # JS（legal / lazy 両方式）
node wasm-spike/bench-wasm.mjs 4              # WASM
```

## パリティ検証（フェーズ1: 手生成 + Zobrist / フェーズ2: evaluateV3）

```sh
node -r tsx/cjs wasm-spike/parity.ts
```

- シード付きランダム自己対局 50 局（最大 80 手）＋ 打ち歩詰めが実際に発動するカスタム終盤局面 5 個 ＋ perft 相互照合で、累計 **4,184 局面** を照合し **100% 一致**。
- 各局面で照合する項目:
  - 合法手数（JS `generateLegalMoves().length` == WASM `countLegalMoves()`、**打ち歩詰め判定込み**）
  - Zobrist ハッシュの **ビット一致**（`BanHash` / `HandHash` / 手番込み `HashVal`）。初期計算（`calcHash` vs `finalizePosition`）と増分更新（`move()/back()` vs `makeMove/applyMove`）の両経路。
  - 増分マテリアル評価・手番
  - **増分 PSQT 評価**（`k.psqtEval` vs `getPsqtEval()`、make/unmake 経由の増分更新パス込み）
  - **`evaluateV3()` の整数一致**（フェーズ bucket・`scaleEvalV3` の固定小数対称丸め・玉安全度の f64 `Math.round` 含めて JS と完全一致）
  - **hangingThreat**（V20 の `hangingThreatSente` と同一ロジックの JS 参照実装と照合。4,184 局面中 813 局面で非ゼロ＝検証は空虚でない）と `evaluateV3Full() == evaluateV3() + hangingThreat()`
- Zobrist シードは `KyokumenImproved.initializeHash()` と同一の決定的 PRNG（Mulberry32 系）・同一次元（`HashSeed[48][176]` / `HandHashSeed[40][20]` / `TebanHashSeed`）・同一順序で生成しているため、JS 側の TT エントリと WASM 側のキーが将来そのまま互換になる。

## フェーズ2: 評価関数の完全移植

`KyokumenImproved.evaluateV3()` の全依存項を AssemblyScript に移植（すべて JS と**整数一致**）:

- **PSQT**: `initializePsqt` のテーブル生成（後手は dan ミラー＋符号反転）＋ `move()/back()` 相当の増分更新を `makeMove/unmakeMove` に実装
- `evaluateHandBonus` / `evaluateKingSafetyV2WithPhase`（f64 の phase 係数と `Math.round` を JS と同一式・同一結合順で計算）/ `evaluateCastleShapes`（穴熊・美濃・矢倉）/ `evaluateMajorPieceActivity`（飛角竜馬の mobility + 玉へのライン）
- `evaluateFileDefense` + `evaluateClimbingSilverPressure`（棒銀。銀侵入 level 4 = 敵陣半分への侵入まで）
- `evaluatePromotionThreats`（成り込み済み竜馬の敵陣 ±350 ボーナス込み）
- フェーズ bucket（持駒総数: ≤2 / ≤6 / ≤10 / それ以上）と `scaleEvalV3` の固定小数スケーリング（`Math.imul` == i32 乗算、負値の対称丸め `(product ± 64) >> 7`）
- **`hangingThreat()`**: エンジン側 `ShogiAIImprovedV20.hangingThreatSente` の移植（銀以上・攻撃されかつ**未防御**の駒のみ・loss は 700 でキャップ・`(worstGote - worstSente) / 3` 切り捨て）。`getLeastAttackerValue` も移植。
- **`evaluateV3Full() = evaluateV3() + hangingThreat()`** を export — V20 エンジンが eval mode 'v3' で葉に使う値そのもの。**フェーズ3 の探索はこれを葉評価に使う**。

「王が盤上にいない」表現も JS と揃えた（`-34`。`evaluateMajorPieceActivity` が `kingPos >> 4` / `& 0x0f` を王不在でも計算するため）。

### evaluateV3 速度（各局面 10 万回、best-of-5、macOS / Apple Silicon / node v20.14.0）

`node -r tsx/cjs wasm-spike/bench-eval.ts`

| 局面 | JS evaluateV3 | WASM | 倍率 | JS +hangingThreat | WASM | 倍率 |
|---|---|---|---|---|---|---|
| midgame A (ply 30) | 1,325 ms | 46.4 ms | ×28.6 | 2,345 ms | 88.1 ms | ×26.6 |
| midgame B (ply 40) | 1,340 ms | 42.8 ms | ×31.3 | 2,466 ms | 88.1 ms | ×28.0 |
| midgame C (ply 50) | 1,313 ms | 45.8 ms | ×28.7 | 2,429 ms | 89.8 ms | ×27.0 |
| endgame-ish (ply 70) | 1,276 ms | 44.6 ms | ×28.6 | 2,617 ms | 99.8 ms | ×26.2 |
| **合計** | **5,254 ms** | **180 ms** | **×29.3** | **9,857 ms** | **366 ms** | **×26.9** |

WASM 側はループをモジュール内で回す（`benchEvaluateV3(n)`）。フェーズ3 では探索自体が WASM 内に住むので、これが実運用に近い形。チェックサム照合済み（JS/WASM が同じ値を積算していることを確認）。

## 正しさの検証

perft 値（王手放置チェックあり合法手数え上げ）が **JS / WASM で全深さ・全局面で完全一致**：

| 局面 | d1 | d2 | d3 | d4 |
|---|---|---|---|---|
| 初期局面 (hirate) | 30 | 900 | 25,440 | 718,565 |
| 持駒あり局面 (drops)* | 85 | 6,815 | 418,334 | 25,722,489 |

\* hirate から 7七歩・3三歩を除去し、先手持駒 歩+銀 / 後手持駒 歩+金 とした局面。打ち手生成（二歩・打ち場所制限含む）を検証するため。

初期局面 depth1 = 30 手 ✓。なお d3 以降は標準 perft 値（25,470）と異なるが、これは既存エンジンが角・飛の不成をあえて生成しない仕様（`forcePromoteMajor`）のためで、JS/WASM 両方がこの仕様で一致している（＝エンジン移植として正しい）。

## 実測結果（macOS / Apple Silicon / node v20.14.0、best-of-N）

| 局面 / 深さ | leaves | JS (lazy)** | WASM | 倍率 |
|---|---|---|---|---|
| hirate d3 | 25,440 | 27.9 ms | 1.03 ms | **×27.1** |
| hirate d4 | 718,565 | 798.4 ms | 28.8 ms | **×27.7** |
| drops d3 | 418,334 | 464.4 ms | 14.5 ms | **×32.1** |
| drops d4 | 25,722,489 | 28,440 ms | 894 ms | **×31.8** |
| hirate d5 | 19,778,301 | —(未計測) | 829 ms | — |

スループット: JS ≈ **0.90M leaves/s**、WASM ≈ **24〜29M leaves/s** → **約28〜32倍**。

\** JS は V20 探索と同じホットパス（`generatePseudoLegalMovesPooled` ＋ 遅延 `isKingInCheck`）。eager 版（`generateLegalMovesPooled`）もほぼ同速で、counts は一致。

## WASM 版が JS と同等にやっている仕事（比較の公平性）

- 盤面 make/unmake（`KyokumenImproved.move()/back()` 相当）
- 増分マテリアル評価（`eval`）＋ **増分 PSQT 評価（`psqtEval`、フェーズ2で移植）**
- 増分 Zobrist ハッシュ（BanHash / HandHash / HashVal）… JS と**ビット一致**（parity.ts で検証）。perft 前後で復元されることもベンチ内で検証
- **打ち歩詰めチェック**（`isUtiFuDume` と同一判定。応手生成の再帰も JS と同じ）
- 王手放置の遅延フィルタ、二歩・打ち場所制限、成り分岐（強制成り＋角飛成り枝刈り）
- **評価関数 `evaluateV3` / `evaluateV3Full`（フェーズ2で移植、整数一致）**

## フェーズ3: 探索本体の完全移植

`ShogiAIImprovedV20` の探索を statement-for-statement で AssemblyScript に移植（`assembly/index.ts` 末尾の Phase 3 セクション）:

- 反復深化 + negamax + αβ + **PVS** + **aspiration**（窓 300、4倍→全窓の段階拡張）
- **パック型 TT**（2^20 スロット、hash/value/flag/remainDepth/bestKey/secondKey、`TranspositionTableImprovedPacked` と同一の置換ポリシー。キーは JS の `moveKey(te)` とビット互換）
- move ordering: TT best/second → killer×2 → countermove → history + **continuation history（1296×1296）** → promotion/MVV-LVA/SEE-lite nudge/drop ヒューリスティクス/root 専用 opening・safety bonus（`openingOrderBonusAtRoot` / `rootMoveSafetyOrderAdjustment` 込み）。JS の `Map` ベースの history/counterMove/root キャッシュは moveKey の全単射コンパクト索引（425,088 エントリ）のフラット配列で厳密に再現
- null-move（適応 R: `2or3 + (depthLeft>=7)`）/ LMR 段階(1–3) / futility(d≤2, 350/700) / LMP(d≤3, 7+5d) / RFP(d≤3, 200d) / IID(d≥5) / mate-distance 境界 / root check extension
- 静止探索: TT 手順序 + 非王手時 noisy 部分ソート（JS と同じ swap パーティション＋挿入ソート） + delta pruning(150) + SEE-lite プルーニング + 王手プローブ（budget 連動上限）
- 経路上の千日手検出（HashVal カウント 4回目=引き分け + contempt 12）と遅延合法性チェック + `legalTried`/`prunedAny` 詰みステイルメイト判定
- eval キャッシュ（2^18、キー=`getHash()` 手番なし、値=`evaluateV3Full()` SENTE 視点）
- **時間管理**: `env.now(): f64` をホストから import（`performance.now` を渡す）。ノード+リーフ 2048 個ごとにサンプリング。AS に例外がないため JS の `TimeUpError` は `stopped` フラグで代替（部分イテレーション破棄のセマンティクスは同一）
- API: `searchBestMove(maxTimeMs, maxDepth, quiescenceDepthMax): i32`（戻り値 = `(koma&0x3f)|from<<6|to<<14|promote<<22`、0=手なし）、`setRootTesu(tesu)`、`clearTT()`、`getSearchScore/Depth/Nodes/Leaves()`
- 詰みソルバー（MateSolverImproved）とオープニングブックは**意図的に未移植**（JS 側で先に処理するハイブリッド構成。`match-wasm-vs-js.ts` の `WasmHybridPlayer` がフェーズ4 の形）

### 検証（`node -r tsx/cjs wasm-spike/search-driver.ts`）

固定深さ（maxTimeMs=0、depth 4/5/6 × 16 局面 = 48 比較）で JS V20 と **48/48 完全一致** — bestMove・スコアだけでなく **node 数・leaf 数までバイト一致**（= 探索木が同一）。

### 3秒ベンチ（`--bench`、macOS / Apple Silicon / node v20）

| 局面 | JS depth / nodes / leaves | WASM depth / nodes / leaves |
|---|---|---|
| midgame ply24 | 9 / 25,400 / 79,048 | **12** / 373,043 / 1,220,301 |
| midgame ply33 | 9 / 29,884 / 62,276 | **12** / 433,064 / 1,078,360 |
| endgame-ish ply42 | 7 / 35,991 / 58,217 | **11** / 398,588 / 1,010,436 |

同一時間で **深さ +3〜+4**、スループット約 15 倍。

### 対戦（`node -r tsx/cjs wasm-spike/match-wasm-vs-js.ts`）

WASM ハイブリッド vs JS V20、各手 200ms、curated opening 6手、10局（先後交替）: **WASM 10勝 0敗 0分**。全手合法性検証つき（違法手は即エラー終了）。

## NNUE 風ニューラル評価（推論）

`ml/` の蒸留パイプライン（`train.py` → `export-weights.py`）で学習した小型 NN の**推論**を AssemblyScript に実装した（`assembly/index.ts` の NNUE セクション）。デフォルトは無効で、有効化しない限りエンジンの挙動は従来と完全に同一（parity.ts 4,184 局面 / search-driver 48/48 EXACT で確認済み）。

- **特徴変換**: `train.py parse_sfen` と同一仕様を盤面表現（`ban[(suji<<4)+dan]`）から直接計算。手番側視点に正規化（後手番は盤 180 度回転＋色入替）、28 プレーン×81 マスの one-hot index ＋ 持ち駒 14 次元（自分 7 / 相手 7、FU..HI 順）。python `parse_sfen` との一致はスクリプト照合済み（成駒・持駒・後手番回転含む）。
- **整数演算**: `export-weights.py int_forward` とビット一致 — `acc = b1 + Σw1_board[feat] + Σw1_hand[i]*count[i]`（i32）→ `clamp(0,127)` → `h2 = clamp((w2@h1 + b2)>>6, 0,127)` → `out_q = w3@h2 + b3`。cp 変換は `trunc(out_q * K / 8128)`（i64 経由、K は `weights.meta.json` の k_sigmoid、デフォルト 600）。
- **重みロード**: `getNnueWeightsPtr()` が指す WASM メモリ静的領域へ `weights.bin` をそのまま memcpy（レイアウト同一、再パック不要）。`getNnueWeightsSize()` でサイズ検証、`setNnueScaleK(k)` で K 設定。
- **2フォーマット対応（第3サイクル）**: `setNnueBuckets(1|6)` でレイアウト切替。デフォルト 1 = 現行盤面 one-hot（1,185,988 B、従来とビット互換）。6 = **縮約KP**（自玉位置6バケット×盤面/持ち駒テーブル、7,027,908 B、`ml/train.py --features kp|kp-factor` で学習）。静的領域は大きい方（約7MB）で確保するが `memory.data` は data segment を出さないため .wasm バイナリサイズは不変。KP では玉のバケット境界越えでその視点のアキュムレータを盤面から refresh（折り込み済み差分の unmake 時は dirty フラグ→次回評価時に再構築）。ロード側はファイルサイズからフォーマットを自動判別できる（`nnue-ref.ts bucketsForByteLength`）。
- **探索統合**: `setNnueEnabled(1)` で探索の葉評価（`evaluateSenteCached`）が `nnueEvaluateCp()`（SENTE 視点へ符号調整、evaluateV3Full と同じ規約）に切替わる。NNUE は手番依存のため eval キャッシュキーに手番シードを含める。`setNnueEnabled(0)`（デフォルト）で従来の `evaluateV3Full`。
- **出力スケール適応**: `setNnueOutputScale(numer, denom)`（デフォルト 1/1 = 従来とビット一致）。探索定数（ASPIRATION_WINDOW=300 / futility 350,700 / delta 150 / RFP 200·d など）は evaluateV3Full のスケール（≈3.7×真 cp、教師フィット cp≈0.27·v3）前提なので、真の cp を出す NNUE では 37/10 を設定して**評価出力側を V3 スケールに揃える**（案A。マージン定数一式を 1/3.7 に切り替える案Bより変更が一箇所で済み、mate 境界等の他の定数とも整合する）。cp 変換の i64 除算に numer/denom を折り込み（truncation は 1 回のみ）、±1,000,000 でクランプ（mate 窓 `S_MATE−10_000` から十分遠く、デフォルトスケールでは到達不能）。スケール変更時は eval キャッシュを無効化。
- **exports**: `getNnueWeightsPtr/Size`, `setNnueEnabled`, `setNnueBuckets/getNnueBuckets`, `setNnueScaleK`, `setNnueOutputScale`, `nnueEvaluate()`（raw out_q, int_forward とビット一致）, `nnueEvaluateCp()`, `benchNnueEvaluate(iters)`。差分更新関連: `nnueEvaluateFast()`, `nnueRefreshAccumulators()`, `nnueAccMismatch()`, `setNnueForceFull(flag)`, `getNnueEvalCount()/resetNnueEvalCount()`, `benchNnueEvaluateFast(iters)`。

### 差分アキュムレータ（NNUE 高速化）

第1層を毎回フル再計算せず、標準 NNUE と同様に**差分更新**する。

- **両視点アキュムレータ**: 特徴が手番側視点（後手番=盤180度回転+色入替）のため、手番が変わると全特徴が回転する。そこで `nnueAccS`（先手視点）と `nnueAccG`（後手視点）の**2本を常時維持**し、評価時に手番側を選んで clamp → 第2層以降を計算。両 acc は (盤, 持駒) のみの関数で手番に依存しないため、**null move（手番反転のみ）は自動的にゼロコスト**。
- **遅延適用（lazy）**: 探索は評価回数よりはるかに多くの make/unmake を行う（合法性チェック・打ち歩詰め再帰など）ので、`makeMove` は acc を触らず pending スタックに手を積むだけ（数 ns）。実際に評価が起きた時点で未適用の差分をまとめて折り込み、`unmakeMove` は**適用済みの差分だけ**逆適用する。差分は手のエンコードのみで決まる（盤状態を読まない）ため遅延適用しても正確。視点ごとに適用済みプレフィックスを別管理し、評価に使う側の acc だけ折り込む。perft(4) の make/unmake オーバーヘッドは **±0%**（NNUE 無効時は分岐1つのみ。eager 実装だと +1,348% だった）。
- **差分のケース分け**（1手 = fused sub/add パス 1〜2 回/acc）: 移動 = `-駒@from, +配置駒@to`（成りは配置駒が成駒）／打ち = `持駒行 -1, +駒@to`／捕獲 = さらに `-被捕獲駒@to, +持駒行(捕獲側, 生駒種) +1`。持ち駒特徴は count×重みで、1手あたりの増減は必ず ±1 なので行の加減算そのもの。
- **スパース第2層**: 高速パスは h1 が ClippedReLU 後（多くが 0）であることを利用し、`w2` の転置コピー（列単位アクセス、`nnueRefreshAccumulators()` で再構築）で非ゼロ活性だけを積む。i32 加算は mod 2^32 で可換・結合的なので dense 版 / int_forward と**ビット一致**。
- **リビルド**: `setNnueEnabled(1)` と `finalizePosition()`（局面ロード）で acc と w2 転置をフル再構築。pending スタック溢れ（実際は到達不能）時はフル再計算へフォールバック（遅くなるだけで常に正しい）。
- **検証**（nnue-parity.ts に統合、**buckets=1 / buckets=6 の両フォーマットでフルスイート実行**）: ① `applyMove` 駆動の自己対局 **1,200 局面**で「差分更新後 acc == フルリビルド acc」（make 直後 + `countLegalMoves` の make/unmake 撹拌後の両方）かつ `nnueEvaluateFast() == nnueEvaluate() == TS int_forward` をビット一致で確認（捕獲/打ち/成り/後手番に加え、KP では玉移動 126 回・うち**バケット境界越え 87 回 = refresh 経路**をカバレッジ必須条件として検証）。② `setNnueForceFull(1)`（葉評価だけフル再計算に切替、探索木は不変）との**固定深さ探索一致** — bestMove・score・nodes・leaves 完全一致、探索後も acc がフルリビルドと一致。

### 検証

```sh
node -r tsx/cjs wasm-spike/nnue-parity.ts    # 本番AS vs TS、1/6 buckets
node -r tsx/cjs wasm-spike/nnue-parity.ts \
  --wasm-path wasm-spike/artifacts/shogi-halfkp81-research.wasm # 研究用1/6/81 buckets
node -r tsx/cjs wasm-spike/nnue-bench.ts     # eval 単体 10万回 + 3秒探索 nnue on/off
# 実重み照合（torch 環境で ml/dump-reference.py を先に実行 → ml/README.md 参照）
node -r tsx/cjs wasm-spike/nnue-verify-reference.ts <weights.bin> <reference.json>
```

- `nnue-ref.ts` = int_forward の TS 移植（`|0` の i32 演算）＋特徴抽出＋ SFEN パーサ＋ダミー重み生成＋マテリアル重み生成（温度計コーディングで純マテリアル評価を厳密表現、ベンチ用）。
- **パリティ**: シード付きダミー重み（weights.bin 互換バッファ）でランダム自己対局 **1,000 局面**の AS vs TS が out_q / cp とも**ビット一致**（後手番 496 / 持駒あり 681 局面を含む）。NNUE 有効時の探索が合法手を返すことも確認。差分アキュムレータの検証（1,200 局面 + 固定深さ探索一致）は上記セクション参照。
- **速度**（macOS / Apple Silicon / node v20、10 万回 best-of-3）: フル再計算 `nnueEvaluate` ≈ **6.2µs/回** → 差分 `nnueEvaluateFast` ≈ **1.15µs/回**（約 5.4 倍。`evaluateV3Full` ≈ 0.94µs の 1.2 倍まで短縮）。探索内の実効削減（同一探索木で force-full vs fast、固定深さ）は **≈4.85µs/eval** → 探索内の実効 NNUE 評価コスト ≈ **1.4µs**。
- **3 秒探索**: ダミー重み（ランダム評価面 = move ordering/枝刈りが壊れるため深さは参考値）で nnue(full) depth 6〜8 / 0.11M evals/s → nnue(fast) **depth 7〜8 / 0.23〜0.27M evals/s**（同一評価関数でノード・葉スループット約 2.2 倍）。**マテリアル重み**（正気な評価面、推論コストは同一）では **depth 9〜15**（4局面: 15/10/9/9、0.31〜0.49M evals/s）— v3full の 8〜12 と同等の深さに到達し、学習済み重みでも depth 10 前後が見込める。

### 実重み検証と A/B 対戦（2026-07-04、run100k 重み — 不採用）

学習済み実重み（`ml/runs/run100k/weights.bin`、教師 100k 局面 / val MAE ≈ 405cp）での最終検証の記録。

- **3-way 照合**: `ml/dump-reference.py --n 300`（torch）→ `nnue-verify-reference.ts` で
  **300/300 局面が WASM == TS == torch int16 シミュレーションとビット一致**（out_q / cp とも）。
  量子化誤差 |cp_float − cp_int| は mean 26.8cp / max 144.9cp（export 時検証の 24.1/145.3cp と整合）。
  推論実装は正しい。
- **等時間 A/B 対戦** `match-nnue-vs-v3.ts`（両側 WASM・素の探索同士、ブック/詰みソルバーなし、
  評価関数だけが差分。opening 6 plies curated、先後交替、全手合法性チェック）:
  - 200ms/手 16 局（seed 1）: **NNUE 2 勝 / V3 14 勝 / 0 分（12.5%）**
  - 1000ms/手 6 局（seed 2）: NNUE 1 勝 / V3 5 勝 / 0 分（16.7%）
  - 1000ms/手 6 局（seed 3）: NNUE 2 勝 / V3 3 勝 / 1 分（41.7%）
  - 合計 5.5/28（19.6%）、全 2,660 手合法。**判定: 不合格 → 本番配線は見送り**。
- **速度は原因ではない**: 等時間 1s 探索で NNUE 側もノード数は同等以上
  （例: 138k vs 142k nodes）、depth −1〜±0。差分アキュムレータは機能している。
- **原因仮説**（静的評価の教師近似では NNUE 優位＝ml レポート「合格」だったのに対局で負ける理由）:
  1. **ノイズ vs 校正**: 探索に効くのは兄弟局面間の相対順位。net の val MAE ≈ 405cp は
     典型的な手の評価差（<100cp）を大きく上回るノイズで、指し手のランキングを壊す。
     一方 V3 は絶対スケールこそ教師とずれるが決定的な特徴量ベースで自己一貫しており、
     単調な校正ずれは alpha-beta の指し手選択に影響しない（教師近似メトリクスは
     対局強度の予測子として不適切だった）。
  2. **探索定数のスケール不整合**: `ASPIRATION_WINDOW=300 / DELTA_PRUNING_MARGIN=150 /
     FUTILITY_MARGIN_1,2=350,700` は V3 スケール（≈3.7×cp、教師フィット cp ≈ 0.2696×v3）
     前提の定数。NNUE の真の cp 出力では実効 ~3.7 倍のマージンになり枝刈りが甘くなる
     （q-search の delta pruning は V3 単位の駒価値と NNUE cp の standPat が混在）。
  3. **教師データの偏り**: |cp|>1000 が 6 割超の自己対戦分布 + 100k という規模
     （NNUE の通常は数億局面）で、互角圏・終盤の詰み前後の精度が不足
     （cp は ±3000 クランプで学習しており大差の表現も飽和する）。
- **次の一手**: 教師データ増量（1M+、均衡局面比率を上げる）／探索マージンの NNUE
  スケール適応（または net 出力を V3 スケールに合わせる）／相対順位を重視した損失
  （ペアワイズ/ランキング損失）の検討。推論・差分更新・ロード経路は検証済みなので、
  強い重みができれば `getNnueWeightsPtr()` へ memcpy → `setNnueScaleK(K)` →
  `setNnueEnabled(1)` だけで差し替え可能。

```sh
# A/B 対戦ハーネス（両側 WASM、片側だけ NNUE）
node -r tsx/cjs wasm-spike/match-nnue-vs-v3.ts <weights.bin> [--games 16] [--ms 200] [--seed 1] [--k 600] \
  [--scale-numer 1] [--scale-denom 1]   # 37/10 = NNUE cp を V3 スケールへ校正
```

### スケール適応の単離測定（2026-07-04、setNnueOutputScale 37/10 — 回復せず）

第1サイクル敗因仮説②（探索マージンのスケール不整合）を単離して測るため、同じ run100k
重み（K=600）に **出力校正 37/10 だけ**を適用して同条件（同 seed・同 opening 方式）で再戦した。
探索定数・重み・ハーネスの他の条件は一切不変。校正が探索に効いていることは事前に確認済み
（初期局面 cp 73 → 273、固定深さ d5 で bestMove・nodes が変化）。

| 条件 | 第1サイクル（無校正） | 第2サイクル（37/10 校正） |
|---|---|---|
| 200ms×16局 seed1 | 2勝14敗0分（12.5%） | 1勝14敗1分（9.4%） |
| 1000ms×6局 seed2 | 1勝5敗0分（16.7%） | 0勝6敗0分（0.0%） |
| 1000ms×6局 seed3 | 2勝3敗1分（41.7%） | 1勝5敗0分（16.7%） |
| **合計** | **5.5/28（19.6%）** | **2.5/28（8.9%）** |

全 2,620 手合法。**判定: スケール適応単独では回復しない**（−10.7pt。n=28 なので統計的な
断定はできないが、少なくとも「マージン不整合が主因で、直せば大きく回復する」仮説は棄却）。
解釈: 無校正だと実効マージンが ~3.7 倍緩く、枝刈りが浅い分だけノイズの多い評価値を追加探索で
検証していたのが、校正で本来の強度に締まると MAE ≈ 405cp のノイズがそのまま枝刈り判断に乗る
—— 敗因は仮説①（評価ノイズが指し手ランキングを破壊）が支配的で、教師データの質・量が本丸。
機構自体（`setNnueOutputScale`）は検証済みで残す: 強い重みができた時に探索定数側を触らず
1 呼び出しでスケールを揃えられる。

## 省略したもの（caveats）

- 詰みソルバー / オープニングブック（JS 側で先に処理するハイブリッド構成のため意図的に未移植）
- Worker 統合（→ フェーズ4）

## フェーズ4（Worker 統合）への引き継ぎ注意

**フェーズ4 は完了済み**: `src/components/game/ShogiImproved/wasmEngine.ts`（WASM クライアント）＋ `shogi-ai.worker.ts`（book → 詰みソルバー → WASM → JS V20 フォールバックのハイブリッド）で本番統合済み。以下は移植時に守った制約のメモ。

- **instantiate 時に `env.now` を渡すこと**（`performance.now.bind(performance)` 等）。渡さないと LinkError。`env.abort` も従来どおり必要。
- 局面ロードは `clearBoard → setSquare× → setHand× → setSideToMove → finalizePosition`（`search-driver.ts` の `syncWasm` を参照）。1手ごとに再同期するのが安全（`searchBestMove` は make/unmake で必ず局面を復元するが、防御的に）。
- 対局中は `clearTT()` を呼ばない（TT 持ち越しで強くなる）。新規対局で呼ぶ。
- `setRootTesu(手数)` を検索前に設定（root の opening ordering に影響。未設定でも動くが JS と挙動がずれる）。
- ハイブリッド順序: JS オープニングブック → JS 詰みソルバー（gate/budget は `match-wasm-vs-js.ts` の `WasmHybridPlayer` を移植）→ WASM `searchBestMove(残り時間, 32, 10)`。
- 戻り値 0 は「合法手なし」（投了/詰み）。Te 復元は `teFromWasmKey`（capture は盤から読む）。
- 探索は同期実行でメインスレッドをブロックするため Worker 内で動かすこと（現行 `shogi-ai.worker.ts` と同じ形）。
- WASM メモリは TT 19MB + continuation history 6.7MB ほかで合計 ~35MB 程度。Worker 生成のたびに instantiate し直すとその分のアロケーションが走る点に注意（使い回し推奨）。
- 千日手は**探索経路内のみ**検出（JS V20 と同一仕様）。対局全体の千日手判定は従来どおりホスト側で。

## フェーズ5: マルチスレッド探索（Lazy SMP、2026-07）

`/games/shogi-improved` を COOP/COEP でクロスオリジン分離し、SharedArrayBuffer を有効化して
**Lazy SMP**（min(4, hardwareConcurrency−2) スレッド）で探索する。

### アーキテクチャ（なぜ wasm の `--sharedMemory` を使わないか）

AssemblyScript は静的データ（盤面・履歴テーブル・NNUE アキュムレータ等の全ミュータブル状態）を
リニアメモリの固定アドレスに置くため、複数インスタンスで 1 つの shared memory を共有すると
**TT だけでなく全探索状態が衝突**する。回避策（全配列のスレッドローカル・アリーナ化、または
`--memoryBase` 違いの複数バイナリ）はどちらも大改修で、ビット一致パリティを危険に晒す。

代わりに **各 Worker がプライベート wasm インスタンスを持ち、TT のみを JS 側の
SharedArrayBuffer で共有**する:

- `src/components/game/ShogiImproved/sharedTT.ts` — ロックフリー共有 TT（2^20 エントリ×32B ≈ 32MB。
  エントリは XOR チェック付き 5×i32、Atomics で読み書き。破れた読み書きは XOR 検証で miss になる
  標準の lockless hashing）。ヘッダの generation セルが停止フラグを兼ねる。
- wasm 側は `sharedTtProbe` / `sharedTtStore` / `sharedShouldStop` の 3 import を追加
  （`setSharedTtEnabled(1)` のときだけ呼ぶ。**シングルスレッド時は一切呼ばれず、従来の
  StaticArray TT 経路のまま = ビット一致**。parity / search-driver / nnue-parity で検証済み）。
- トポロジ: ページ(client) が main worker + N−1 helper worker
  (`shogi-ai-helper.worker.ts`) を生成し MessageChannel で直結（バンドラ制約上 `new Worker` は
  すべて window コンテキストから）。main が世代を publish → helper へ `go` → 自分の探索完了で
  世代を 0 に → helper は ~2048 ノードごとのポーリングで停止。helper の指し手は捨て、
  共有 TT エントリだけが成果物（これが Lazy SMP）。奇数 helper は反復深化を 1 ply 深い側から
  開始（標準の非同期化）。ponder はシングルスレッドのまま（helper はアイドル。ponder の
  書き込みも共有 TT に載るので次の本探索には効く）。
- フォールバック: SharedArrayBuffer が無い（ヘッダ無し・旧ブラウザ）/ helper 生成失敗 /
  コア数不足（hc≦3）のときは従来のシングルスレッド経路そのまま。easy 難易度も意図的に ST。

### ヘッダ（next.config.ts）

- `/games/shogi-improved` のみ `COOP: same-origin` + `COEP: require-corp`（サイト全体に付けると
  外部画像等が壊れるためルート限定）。
- **`/_next/static/:path*` に `COEP: require-corp` が必須**: 分離ページから dedicated worker を
  spawn するとき、worker スクリプトのレスポンス自体に互換 COEP が必要（無いと
  `ERR_BLOCKED_BY_RESPONSE` で worker が起動しない）。非分離ページには無害（逆方向は許可）。

### 検証

```sh
# ST ビット一致（従来ゲート、全パス）
node -r tsx/cjs wasm-spike/parity.ts          # 4,184 局面 100%
node -r tsx/cjs wasm-spike/search-driver.ts   # 48/48 EXACT
node -r tsx/cjs wasm-spike/nnue-parity.ts
node -r tsx/cjs wasm-spike/nnue-parity.ts \
  --wasm-path wasm-spike/artifacts/shogi-halfkp81-research.wasm

# MT 妥当性（非決定なので別ゲート）: 全手合法 / 同一局面100回の手集合 / ノードスケーリング
node -r tsx/cjs wasm-spike/mt/mt-sanity.ts --threads 4 --repeats 100

# 強度 A/B: MT(4スレッド) vs ST、NNUE 両側、2000ms/手
node -r tsx/cjs wasm-spike/mt/match-mt-vs-st.ts --games 24 --ms 2000 --seed 1
```

実測（macOS / Apple Silicon 14 コア / node v20）: ノード合計 ×3.0（4 スレッド、アイドル時）、
同一局面 100 回で返る手は 1〜数種に収束、全手合法。強度は README 更新時点の A/B ログ参照
（PR に記載）。
