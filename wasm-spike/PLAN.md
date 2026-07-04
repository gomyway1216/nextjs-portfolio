# フル移植計画: 将棋エンジンの WASM 化

## スパイクの結論（推奨: **移植する価値あり**）

- 手生成＋make/unmake＋王手判定＋増分ハッシュ/マテリアル評価のホットパスで **×28〜32**（実測、README.md 参照）。
- 現エンジンは 3 秒で ≈35k positions/sec（内部 22k + 静止 85k ノード）。ボトルネックは手生成 ≈6µs/回と evaluateV3 ≈12.6µs/回で、どちらも整数演算＋小テーブル参照が主体 = WASM 化の効果が最も出やすいワークロード。
- 評価関数は手生成より分岐が多く JIT との差が縮む可能性を見込み、エンジン全体では保守的に **×10〜20**、つまり **350k〜700k positions/sec** を期待。同じ 3 秒思考で探索深さ +2〜3 ply 相当。
- AssemblyScript は既存 TS とほぼ同一構文のため、移植は「書き直し」ではなく「型注釈の付け替え＋データ構造の平坦化」で済む。スパイクでは手生成一式が 1 ファイル ~500 行に収まった。

## ツールチェーン選定

**AssemblyScript を推奨**（Rust ではなく）:

- 既存コードが TS。canMove/canJump/PSQT 等のテーブルは自動生成で同期可能（`gen-tables.mjs` 方式を拡張）。
- 出力 wasm が小さい（スパイクで 5.2KB、フル移植でも数十 KB 想定）。Rust + wasm-bindgen は最小でも 50-100KB＋グルーコード。
- ロジックの JS/AS 差分レビューが容易（アルゴリズム変更なしのポートだと diff がほぼ型注釈のみになる）。
- リスク: AS は GC 付き言語だが、エンジンは全バッファを起動時に静的確保（StaticArray）すれば `--runtime stub` で GC 不要（スパイクで実証済み）。

## フェーズ計画と工数見積

前提: 1 人、既存エンジン（V20）に精通していること。合計 **10〜15 人日**。

### Phase 1: コア局面表現＋手生成の本実装（2〜3 日）
- スパイクの `assembly/index.ts` をベースに、打ち歩詰めチェック・PSQT 増分更新を追加し `KyokumenImproved.move()/back()` と完全パリティにする。
- perft の JS/WASM 一致テストを vitest 化（`tests/unit/` に追加、wasm ビルド成果物をコミットして CI でも実行可能に）。
- 完了条件: 多様な局面（持駒・成駒・王手絡み）で perft d1-4 一致。

### Phase 2: 評価関数 evaluateV3 の移植（2〜3 日）
- `KyokumenImproved.evaluateV3()` と依存項（handBonus / kingSafetyV2 / castleShapes / majorPieceActivity / fileDefense / promotionThreats / PSQT）を移植。
- float の phase 係数（0.25/0.45/0.7/1.0）は 128 スケールの固定小数点に置換（JS 側と最大 ±1 の丸め差 → 許容するか JS 側も固定小数点化するか決める）。
- 完了条件: ランダム 1 万局面で JS と評価値一致（丸め差の許容幅を明記）。

### Phase 3: 探索（V20 alpha-beta + 静止探索 + TT）の移植（3〜5 日）
- `ShogiAIImprovedV20` の反復深化・move ordering（killer/history/TT move）・静止探索を移植。
- TT は `TranspositionTableImprovedPacked` 方式（Int32Array パック済）が WASM の線形メモリと相性が良い。サイズは wasm メモリ上限（初期 64-128MB）内で固定確保。
- 乱数（Zobrist seed）は JS 版と同一アルゴリズム・同一 seed にして TT キーの互換性を保つ（デバッグ時に JS/WASM のハッシュを突合できる）。
- 時間管理: wasm 内でループカウンタ毎にホストへ経過確認するのではなく、ノード数 N 毎に `Date.now` 相当を import して確認（現行 V20 と同じ方式）。
- 完了条件: 固定深さ探索で JS 版と同一 bestmove/score（move ordering まで揃えれば決定的に一致するはず）。

### Phase 4: Next.js / Worker 統合（1〜2 日）
- ビルド: `npm run build:shogi-wasm`（asc 呼び出し）を追加し、`shogi.wasm` を `src/components/game/ShogiImproved/wasm/shogi.wasm` としてコミット（ビルド成果物込み。CI に asc を入れない選択）。
- ロード: 既存 `shogi-ai.worker.ts` 内で `WebAssembly.instantiate(fetch(new URL('./wasm/shogi.wasm', import.meta.url)))`。Next.js 15/webpack は `new URL` 参照で wasm を asset として同梱できる。SSR パスには載せない（worker 内のみ）。
- API: worker 境界は現行のまま（`shogiAiWorkerClient` は無変更）。worker 内部で `searchWasm(sfenLike, timeMs)` を呼び、結果の Te を既存型に変換。局面の受け渡しは平坦な Int32Array（盤 176 + 持駒 64 + 手番）で十分。
- 完了条件: 既存 UI が無変更で WASM エンジンと対局できる。

### Phase 5: 検証・フォールバック・計測（2 日）
- セルフプレイ: WASM(V21) vs JS(V20) を `scripts/shogi-ai-match.ts` 流用で 100 局、同持ち時間で勝率確認（期待: 深さ向上分で有意に勝ち越し）。
- ベンチ: 3 秒思考の positions/sec を before/after で記録。
- フォールバック戦略:
  1. worker 起動時に `WebAssembly` 存在＋instantiate 成功を確認。失敗したら現行 JS エンジンをそのまま使用（両実装を worker に同梱。JS 側は削除しない）。
  2. エンジン選択を `localStorage`/クエリでオーバーライド可能に（A/B・デバッグ用）。
  3. 例外時（wasm abort / メモリ不足）は catch して JS へ切替、Sentry 相当にログ。
- リリース後 1〜2 週間は JS 版をデフォルト、WASM をオプトインにしてから切替も可。

## リスクと対策

| リスク | 対策 |
|---|---|
| 評価値の丸め差で JS と bestmove が変わる | Phase 2 で許容幅を定義。パリティテストは「評価値一致」でなく「自己対戦強さ」でも判定 |
| AS の暗黙 i32 オーバーフロー挙動差 | eval/hash は全て 32bit 内に収まる設計（現行も `|0` 前提）。境界値テスト追加 |
| wasm メモリ上限（モバイル Safari） | TT サイズを instantiate 時に段階フォールバック（128→64→32MB） |
| テーブル二重管理（JS/AS） | gen-tables.mjs による自動生成を PSQT・評価テーブルにも拡張し、生成物をコミット＋CI で drift 検出 |
| 保守コスト（エンジン改良が二重実装に） | 切替完了後は JS 版を「フォールバック凍結」とし、新機能は WASM 側のみに実装 |

## 期待効果まとめ

- 手生成系ホットパス: **×28〜32（実測）**
- エンジン全体（eval 含む・保守的見積）: **×10〜20** → 3 秒で 350k〜700k positions/sec
- 体感: 同じ思考時間で +2〜3 ply、または同じ強さで思考時間 1/10
