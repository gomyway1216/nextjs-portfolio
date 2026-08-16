# 自作将棋AI 研究台帳

この台帳は、候補の採用・不採用をGit履歴から追えるようにするための短い記録である。
大きな対局log、checkpoint、教師データは引き続き `~/.codex/shogi-runs/` に保持し、
ここには再現に必要な条件、artifact identity、最終判断だけを追記する。

文書全体の入口は[研究ドキュメント案内](./blog-shogi-ai-research-map.md)、直近候補の横断的な
原因分析は[2026-08-08以降のpostmortem](./blog-shogi-ai-20260808-postmortem.md)、現在の実行計画は
[DPA-HalfKP96 10M fast lane](./blog-shogi-dpa-halfkp96-10m-fast-lane.md)、過去の失敗をv2の判断へ反映する規則は
[再発防止メモ](./blog-shogi-ai-dpa-10m-v2-failure-controls.md)に分離する。この台帳には同じ説明を複製しない。

## 現行production

- shipped NNUE weights: 23,665,376 bytes, SHA-256
  `43138cfa7a0d9317d612f518404f78224c0992b588e3d4e09afe32a6d1c627fb`
- shipped WASM: 45,751 bytes, SHA-256
  `0c07a50793470b354bd57072565476a9a87dc9189271aa43c9ef15a0105bc7e3`
- shipped evaluator: HalfKP64-RKI16 epoch-2（ユーザーの明示的な強制差し替え）
  - static gate FAIL、直前productionとの16局は0勝16敗。強度gate通過とは扱わない。
- 直前のgate承認済みproduction: direct-evasion generator
  - formal 768局: 520勝31分217敗、得点率69.7266%、technical fault 0
  - 旧WASM/weightsは比較・復旧用snapshotとして保持する。

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

## 2026-08-10

### Dual-perspective KingPair bootstrap — 診断FAIL、deployment対象外

- 23,992,849 parameterのKingPair interaction NNUEについて、architecture、学習、checkpointの経路を
  1,582,708 training rows、2 epochで確認した。
- checkpoint:
  `~/.codex/shogi-runs/kingpair-interaction-bootstrap-v1-20260809/kingpair-interaction-bootstrap.pt`
- checkpoint: 95,976,850 bytes、SHA-256
  `a1d58b203ea7514f03b12f6c15634164d9372a32d5b7382869e4a5490bcc7e36`
- result:
  `~/.codex/shogi-runs/kingpair-interaction-bootstrap-v1-20260809/bootstrap-result.json`
- result: 4,985 bytes、SHA-256
  `723e928363b97b74a27536f3e0a7f3cc5f1cc3c7ee21008381611634c52b7c19`
- weighted validation MAEはproduction 501.3095cp、candidate 595.7368cpで、candidateが94.4272cp悪化した。
  複数のsibling pair/top-1も回帰した。
- このrunは最初からarchitecture/bootstrap診断でdeployment eligibilityを持たない。checkpointを次候補の
  initializerへ使わず、artifactはhistoricalとして保持する。production assetは変更していない。
- 数か月を要する50M-first計画は時間制約により本線から外し、旧lineageを2M/20%に制限して
  fresh Aoba 8Mを使う別protocolの10M fast laneへ移行する。

### Dual-perspective KingPair interaction runtime — 学習前FAIL

- 10M学習を始める前に、23,992,849 parameterの固定architectureをzero-output payloadで
  productionと同一探索木にしてruntime costだけを測定した。
- candidate WASM: 45,805 bytes、SHA-256
  `63cf89850e4fbbdfc5cb9c3042ee36c28f1bb2aac6d731398a46ad6c1c84de64`
- zero payload: 47,401,444 bytes、SHA-256
  `b395833c996d95ebe5ff15774e2d4e24d76fdcbaaeeaabb2603d7e66d45da822`
- 64局面depth 4ではbest move、score、depth、nodes、leavesが64/64で一致し、両armの
  workは1,253,856で同一だった。その条件でproduction平均約1.139秒に対しKingPairは
  約3.721秒、slowdownは226.5%だった。
- 8局面500msではKingPairの探索workはproductionの29.38%で、多くの局面が2〜3 ply浅かった。
  原因は各評価のdual perspective foldと35,872 MAC dense tailであり、固定上限+5%を明確に超える。
- このarchitectureの10M学習は開始しない。生成済み・生成中のAoba教師rowはarchitecture非依存のため
  次の本体候補へ再利用する。production assetは変更していない。

## 更新規則

- 実装・検証ハーネスと、採否結果は別commitにする。
- 進行中の中間スコアは採否としてcommitしない。
- failed candidateのartifactは上書きせず、productionへ昇格した変更だけをproduction節へ反映する。
- 既存エンジンのコードや重みはコピーせず、Aoba/YaneuraOuは教師ラベルと比較相手に限定する。
