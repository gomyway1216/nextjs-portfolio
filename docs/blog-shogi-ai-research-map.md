# 自作将棋AI研究ドキュメント案内

このページは、自作将棋AIに関する文書の**索引**である。実験結果や手順をここへ複製せず、
「何を知りたいときに、どの文書を読むか」だけを定義する。

## 現在地

- 現行productionの最新採用はdirect-evasion generatorである。
- production NNUE weightsは94,656,708 bytes、SHA-256
  `25fc77addcd5e147906bb197313f2e5c6d4e4c3acc93fddbdb876c695818bd40`。
- production WASMは38,288 bytes、SHA-256
  `1a9cb6fed8df7b0f02dc440e3fc8764f490738cec664168b0bfe47e081a07cd6`。
- 2026-08-08以降の探索・policy・MCTS・RL・評価学習候補は、direct-evasionを除いて未採用である。
- 旧dual-perspective KingPair interactionは学習前runtimeで不適合となった。現在の次候補は、
  runtime preflightを通過したDPA-HalfKP96本体の10M fast laneである。まだproduction候補ではない。

## 文書ごとの責務

| 文書 | 担当する内容 | 担当しない内容 |
|---|---|---|
| [AI再構築の長編記録](./blog-shogi-ai-rebuild.md) | 初期のTypeScript探索、WASM移植、旧NNUE構築、過去の人間実戦までの物語 | 2026-08-08以降の候補一覧、現在の実行契約 |
| [研究台帳](./blog-shogi-ai-research-ledger.md) | 採否、固定条件、artifact path/SHA、productionが変わったか | 長い原因分析、将来計画、実装解説 |
| [2026-08-08以降の失敗分析](./blog-shogi-ai-20260808-postmortem.md) | 直近候補を系統別に比較し、失敗原因と再発防止を整理 | artifact SHAの正本、fast laneの操作手順 |
| [DPA 10M v2再発防止メモ](./blog-shogi-ai-dpa-10m-v2-failure-controls.md) | screenとformalの差、漏洩、旧lineageリスクをv2の固定判断・7日停止条件へ変換 | 候補一覧、artifact SHA、machine-readable contract |
| [旧KingPair 10M fast lane](./blog-shogi-kingpair-10m-fast-lane.md) | 学習前runtime FAILへ至った旧計画 | 現在の実行手順、最終採否 |
| [DPA-HalfKP96 10M fast lane](./blog-shogi-dpa-halfkp96-10m-fast-lane.md) | 現在の本体、データ、学習、gate、停止条件 | 過去候補の詳細、artifact SHAの正本 |
| [DPA 10M machine protocol v2](../ml/protocols/dpa-halfkp96-nnue-10m-fast-v2-plan.json) | sealed holdout除外後の現候補をコードが検査する数値・不変条件 | 人間向け背景説明 |
| `~/.codex/shogi-runs/` | 大容量log、checkpoint、教師データ、result JSONの実体 | Git上の読み物、最新判断の要約 |

## 更新規則

1. 候補の設計理由は、その候補の記事へ一度だけ書く。
2. 実験の最終結果は研究台帳へ短く追記し、詳細分析からリンクする。
3. 大容量artifactはGitへ追加せず、研究台帳へpath、bytes、SHA-256を記録する。
4. 実装済み、静的PASS、実戦PASS、production採用を混同しない。
5. 中間scoreは採否として記録せず、完了済みgateだけを確定事実とする。
6. 新しい記事を追加するときは、この索引の責務表を更新し、既存記事との境界を明示する。
