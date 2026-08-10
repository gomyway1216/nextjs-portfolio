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

### Deterministic 2-worker root partition alpha-beta — 不採用

- rootのstable pseudo-move indexをeven/oddへ完全分離し、共有TTを使わない2 private WASMが
  同じ500msの壁時計で並列探索する。探索、評価、重み、pruning、move orderingは変更していない。
- candidate WASM: 39,030 bytes, SHA-256
  `5ee5b5163584fd4abda5e0552dd21e413b8f6fdc0f15691ea4eabf150e511fec`
- technical runtime report:
  `~/.codex/shogi-runs/root-partition-alpha-beta-v1-20260809/runtime-gate-v3.json`
- runtime report SHA-256:
  `fe71f918498c7bd4e497d7486de552ab514ec41783df525629a42b066d3725d1`
- 8局面のtechnical gateでは、single-thread 4,016.669msに対してparallel 4,019.982ms、
  wall-time ratio 1.00082466だった。両partitionはnon-vacuousで、片側faultは正常側、
  両側faultはproduction single-threadへfail closedした。2局smokeは273手すべて合法、fault 0だった。
- 強度screenは56局、500ms/手、seed base `26460001`、合格線62/112で開始した。
- artifact: `~/.codex/shogi-runs/root-partition-alpha-beta-screen56-20260809/screen.log`
- artifact SHA-256:
  `00faa47ae3169f2197e582d30965962dd9b40a2bab57e5a62947e19e42dac638`
- 27/28 pair、54局完了時点で候補28勝、1分、25敗、57/108 half-points、technical fault 0だった。
  残り1 pairを全勝しても最大61/112で合格線62に届かないため、数学的早期FAILとして停止した。
- independent 96局とformal 768局には進めない。同じroot-partition topologyは再試行せず、
  production WASM、weights、single-thread runtimeは変更していない。

### 同容量2-way depth-preferred TT — 不採用

- 1,048,576-entryのdirect-map TTを、総entry数とmemoryを変えず524,288 set×2-wayへ変更した。
  同keyは深さ優先、collision時は空きwayから使い、両way使用中は浅いentryだけを置換した。
- candidate WASM: 38,456 bytes, SHA-256
  `a84fbc82abdcf957094ac7d758a899742f7dbc2478d0989bd774295124b773ae`
- screen 56局は32勝4分20敗、68/112 half-points、得点率60.7143%で通過した。
- 完全分離したindependent 96局も53勝4分39敗、110/192 half-points、
  得点率57.2917%で通過した。
- 最終formalは別panelの384 pair/768局、500ms/手、ペア単位100,000回bootstrapで完走した。
- formal artifact:
  `~/.codex/shogi-runs/two-way-depth-preferred-tt-formal768-20260809/formal-result.json`
- formal artifact SHA-256:
  `e42e1ce800582c43abf35f0c3269535e95473f2b66d48a1ca823661ba8a6b3ce`
- formal結果は353勝38分377敗、744/1536 half-points、得点率48.4375%だった。
  93,144手はすべて合法でtechnical faultは0だった。
- ペアbootstrapのone-sided 95% lowerは45.5078%、two-sided 95% lowerは44.9870%で、
  superiority条件のlower > 50%を満たさなかった。小標本のscreen/independentで観測した優位を
  別panelのformalで再現できなかったため不採用とした。
- 同じTT slotは再試行・係数調整しない。production WASM、weights、TTは変更していない。

## 更新規則

- 実装・検証ハーネスと、採否結果は別commitにする。
- 進行中の中間スコアは採否としてcommitしない。
- failed candidateのartifactは上書きせず、productionへ昇格した変更だけをproduction節へ反映する。
- 既存エンジンのコードや重みはコピーせず、Aoba/YaneuraOuは教師ラベルと比較相手に限定する。
