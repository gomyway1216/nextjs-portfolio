# Shogi WASM spike (feasibility check)

将棋エンジン（`src/components/game/ShogiImproved/`）の WebAssembly 化でどれだけ速くなるかを実測するためのスパイク。**フル移植ではない**。盤面表現＋擬似合法手生成＋perft（王手放置チェックあり）のみを AssemblyScript に移植し、既存 JS エンジンと同一の perft 値・速度を比較した。

フル移植の計画は [PLAN.md](./PLAN.md) を参照。

## 構成

```
wasm-spike/
  assembly/index.ts      # AssemblyScript エンジン本体（盤面・make/unmake・手生成・打ち歩詰め・Zobrist・perft）
  assembly/tables.ts     # 自動生成（gen-tables.mjs）。canMove/canJump/diff/komaValue/canPromote
  assembly/as-ambient.d.ts # ルート tsconfig で型チェックを通すための ambient 宣言（asc は無視する）
  gen-tables.mjs         # 既存 TS ソースからテーブルを抽出して tables.ts を生成
  bench-wasm.mjs         # WASM 側 perft ベンチ
  parity.ts              # JS⇄WASM パリティハーネス（合法手数・Zobrist ビット一致検証）
  build/shogi.wasm       # ビルド成果物（5.7KB）
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

## パリティ検証（フェーズ1: 手生成完全パリティ + Zobrist ビット一致）

```sh
node -r tsx/cjs wasm-spike/parity.ts
```

- シード付きランダム自己対局 50 局（最大 80 手）＋ 打ち歩詰めが実際に発動するカスタム終盤局面 5 個 ＋ perft 相互照合で、累計 **4,184 局面** を照合し **100% 一致**。
- 各局面で照合する項目:
  - 合法手数（JS `generateLegalMoves().length` == WASM `countLegalMoves()`、**打ち歩詰め判定込み**）
  - Zobrist ハッシュの **ビット一致**（`BanHash` / `HandHash` / 手番込み `HashVal`）。初期計算（`calcHash` vs `finalizePosition`）と増分更新（`move()/back()` vs `makeMove/applyMove`）の両経路。
  - 増分マテリアル評価・手番
- Zobrist シードは `KyokumenImproved.initializeHash()` と同一の決定的 PRNG（Mulberry32 系）・同一次元（`HashSeed[48][176]` / `HandHashSeed[40][20]` / `TebanHashSeed`）・同一順序で生成しているため、JS 側の TT エントリと WASM 側のキーが将来そのまま互換になる。

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
- 増分マテリアル評価（`eval`）
- 増分 Zobrist ハッシュ（BanHash / HandHash / HashVal）… JS と**ビット一致**（parity.ts で検証）。perft 前後で復元されることもベンチ内で検証
- **打ち歩詰めチェック**（`isUtiFuDume` と同一判定。応手生成の再帰も JS と同じ）
- 王手放置の遅延フィルタ、二歩・打ち場所制限、成り分岐（強制成り＋角飛成り枝刈り）

## 省略したもの（caveats）

- **PSQT 増分更新**: JS の `move()/back()` は psqtEval も更新する（1 手あたり数回のテーブル参照）。WASM 側は未移植なので、実効倍率は上記より数%〜1 割程度小さい可能性がある。→ フェーズ2（評価関数）で移植
- 評価関数（evaluateV3）・探索（alpha-beta/TT）は未移植。→ PLAN.md
