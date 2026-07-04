# Shogi WASM spike (feasibility check → 段階移植)

将棋エンジン（`src/components/game/ShogiImproved/`）の WebAssembly 化でどれだけ速くなるかを実測するためのスパイク。フェーズ1（盤面表現＋完全合法手生成＋perft＋Zobrist）、フェーズ2（評価関数 `evaluateV3()` の完全移植、JS と整数一致）に続き、**フェーズ3 で V20 探索本体を完全移植**した（固定深さで JS と bestMove・スコア・ノード数まで完全一致）。

フル移植の計画は [PLAN.md](./PLAN.md) を参照。

## 構成

```
wasm-spike/
  assembly/index.ts      # AssemblyScript エンジン本体（盤面・make/unmake・手生成・打ち歩詰め・Zobrist・perft・evaluateV3/evaluateV3Full）
  assembly/tables.ts     # 自動生成（gen-tables.mjs）。canMove/canJump/diff/komaValue/canPromote
  assembly/as-ambient.d.ts # ルート tsconfig で型チェックを通すための ambient 宣言（asc は無視する）
  gen-tables.mjs         # 既存 TS ソースからテーブルを抽出して tables.ts を生成
  bench-wasm.mjs         # WASM 側 perft ベンチ
  bench-eval.ts          # evaluateV3 の JS vs WASM ベンチ（各局面 10 万回呼び出し）
  parity.ts              # JS⇄WASM パリティハーネス（合法手数・Zobrist ビット一致・evaluateV3 整数一致検証）
  build/shogi.wasm       # ビルド成果物（16KB）
scripts/shogi-perft-js.ts # JS 側 perft ベンチ（既存エンジンをそのまま使用）
```

## ビルド手順

ツールチェーン: **AssemblyScript 0.28**（Rust 未インストールのため。`npm install --no-save assemblyscript` で導入、package.json は変更していない）。

```sh
npm install --no-save assemblyscript

# テーブル再生成（既存TSソースが変わったときのみ必要）
node wasm-spike/gen-tables.mjs

# コンパイル
npx asc wasm-spike/assembly/index.ts \
  --outFile wasm-spike/build/shogi.wasm \
  -O3 --runtime stub --noAssert
```

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

## 省略したもの（caveats）

- 詰みソルバー / オープニングブック（JS 側で先に処理するハイブリッド構成のため意図的に未移植）
- Worker 統合（→ フェーズ4）

## フェーズ4（Worker 統合）への引き継ぎ注意

- **instantiate 時に `env.now` を渡すこと**（`performance.now.bind(performance)` 等）。渡さないと LinkError。`env.abort` も従来どおり必要。
- 局面ロードは `clearBoard → setSquare× → setHand× → setSideToMove → finalizePosition`（`search-driver.ts` の `syncWasm` を参照）。1手ごとに再同期するのが安全（`searchBestMove` は make/unmake で必ず局面を復元するが、防御的に）。
- 対局中は `clearTT()` を呼ばない（TT 持ち越しで強くなる）。新規対局で呼ぶ。
- `setRootTesu(手数)` を検索前に設定（root の opening ordering に影響。未設定でも動くが JS と挙動がずれる）。
- ハイブリッド順序: JS オープニングブック → JS 詰みソルバー（gate/budget は `match-wasm-vs-js.ts` の `WasmHybridPlayer` を移植）→ WASM `searchBestMove(残り時間, 32, 10)`。
- 戻り値 0 は「合法手なし」（投了/詰み）。Te 復元は `teFromWasmKey`（capture は盤から読む）。
- 探索は同期実行でメインスレッドをブロックするため Worker 内で動かすこと（現行 `shogi-ai.worker.ts` と同じ形）。
- WASM メモリは TT 19MB + continuation history 6.7MB ほかで合計 ~35MB 程度。Worker 生成のたびに instantiate し直すとその分のアロケーションが走る点に注意（使い回し推奨）。
- 千日手は**探索経路内のみ**検出（JS V20 と同一仕様）。対局全体の千日手判定は従来どおりホスト側で。
