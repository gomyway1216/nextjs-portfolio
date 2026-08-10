# 自作将棋AI 研究台帳

この台帳は、候補の採用・不採用をGit履歴から追えるようにするための短い記録である。
大きな対局log、checkpoint、教師データは引き続き `~/.codex/shogi-runs/` に保持し、
ここには再現に必要な条件、artifact identity、最終判断だけを追記する。

## 現行production

- NNUE weights: 94,656,708 bytes, SHA-256
  `25fc77addcd5e147906bb197313f2e5c6d4e4c3acc93fddbdb876c695818bd40`
- WASM: 38,288 bytes, SHA-256
  `1a9cb6fed8df7b0f02dc440e3fc8764f490738cec664168b0bfe47e081a07cd6`
- 採用済み: direct-evasion generator
  - formal 768局: 520勝31分217敗、得点率69.7266%、technical fault 0
  - production weightsは変更していない

## 2026-08-09

### Aoba exact transposition opening book — 不採用

- Aoba depth 12 MultiPV 4の評価ラベルだけから33,344局面を構築し、重複conflictは0だった。
- artifact: `~/.codex/shogi-runs/aoba-exact-opening-book-v1-20260809/book.jsonl`
- artifact SHA-256:
  `a6d172b7d4c6d2ca493db754925234cafaeb0eef0d57545fe47d5813277a1f35`
- 固定screen seed `26460001..26460028` の6手opening後に一致する探索開始局面は0/28、
  初期局面も不一致だった。実効coverage 0のためruntime実装前に終了した。
- production assetは変更していない。同一book slotは再試行しない。

### HalfKP81 2-thread Lazy SMP — 不採用

- 壁時計は500ms/手のまま、main 1 + helper 1の2 private WASMと共有TTを使う。
- resource report:
  `~/.codex/shogi-runs/halfkp81-lazy-smp2-resource-v1-20260809/report.json`
- Node topology測定の2-instance sampled peak RSSは617,906,176 bytes、
  shared TTは33,554,496 bytesだった。
- 9局面、各500msのsanityでは全着手合法、technical fault 0、
  single-thread比の合計visited nodeは平均2.19倍だった。
- 強度screenは56局、500ms/手、seed base `26460001`、合格線62/112で実施した。
- artifact: `~/.codex/shogi-runs/lazy-smp2-vs-st-screen56-20260809/screen.log`
- artifact SHA-256:
  `d441d2c5194d75af8820e5e1092fae7928175f1efec9d453873609d2f132c4fc`
- 最終結果は2-thread側8勝、2分、46敗、18/112 half-points、得点率16.0714%だった。
  6,466手はすべて合法で、technical faultは0だった。
- 合計visited nodeが増えても強度は大きく悪化したため、この共有TT Lazy SMP topologyを不採用とした。
  independent 96局とformal 768局には進めず、productionはsingle-threadのまま維持する。

## 更新規則

- 実装・検証ハーネスと、採否結果は別commitにする。
- 進行中の中間スコアは採否としてcommitしない。
- failed candidateのartifactは上書きせず、productionへ昇格した変更だけをproduction節へ反映する。
- 既存エンジンのコードや重みはコピーせず、Aoba/YaneuraOuは教師ラベルと比較相手に限定する。
