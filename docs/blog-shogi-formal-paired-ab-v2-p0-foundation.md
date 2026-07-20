# 将棋評価関数: formal A/Bを速く正しく回すためのP0基盤

> 2026-07-20時点で、formal A/B本番は **0 / 768局**、実2/4/8/12 worker benchmarkは0 round、live weight変更は0である。今回の変更は候補を強くした結果ではない。候補が揃った直後に、誤ったopeningや再試行を混ぜず、ローカルPCの安全な最大並列度を選んでformal A/Bへ進むための基盤である。English version: [blog-shogi-formal-paired-ab-v2-p0-foundation.en.md](./blog-shogi-formal-paired-ab-v2-p0-foundation.en.md)

## 結論

以前のformal contractには3つの食い違いがあった。

1. match bindingはYaneuraOuのassetを要求していたが、実対局はproduction browser/WASMを使う。
2. Python側はsigned 64-bit seedを許したが、Node側は`Number.MAX_SAFE_INTEGER`までしかexactに扱えない。
3. 実runnerの上限は2 pair workerで、CPUを十分使えなかった。一方で、並列度を上げても同一結果になることを確認する選抜器がなかった。

このP0では、過去に公開済みのlauncher artifactを改変せず、次のready-registry bridgeが使うWASM専用contractを追加した。

## 実runnerと一致するmatch binding

実dual-WASM対局経路そのものは[real WASM match runtime](./blog-shogi-formal-paired-ab-v2-real-wasm-match-runtime.md)で公開済みである。今回のcontractは、その実経路に必要なものだけを登録対象にする。

新contractが要求する実行assetは次だけである。

- candidate / stableのNNUE weight
- canonical pair entry
- WASM match adapter
- isolated player child
- embedded WASM module source

対局に使わないYaneuraOu engine、build receipt、eval directoryは要求しない。探索条件はclockなし、fixed depth 11、quiescence depth 10、`K=600`、各着手前TT clear、bookなし、fallback禁止、512 ply上限で固定した。AWS、GCP、cloud、network、external calibration、live-weight writeはすべて禁止のままである。

## openingを対局前に全件検査する

新しいlabel-blind builderはsource gameから次の固定規則で384 openingを作る。

1. 入力は`source_game_id`とUSI move列だけに限定し、勝敗、評価値、rating、candidate/stable labelを受け取らない。
2. 各source gameの先頭16 plyをopeningとして使う。
3. source game IDのdomain-separated SHA-256順で並べる。
4. productionの将棋ルールで全16手を実際に適用する。
5. 違法手、4回同一局面、最終局面で合法手0を拒否する。
6. move numberを除いた意味上の最終局面が重複した場合、hash順で最初の1件だけを残す。
7. 384件すべてに別source gameを要求する。

manifest preflightは384件すべてについて、合法・非終局・source unique・semantic final uniqueを確認し、そのexact manifestに結び付いたPASS receiptを返す。このpreflightはpair journalやengine processを作らない。次のready-registry bridgeは、そのPASSを得てからだけjournal作成へ進める。

## seedと再試行をjournalより前で止める

実WASM launcherは、次をreceipt directory作成より前に拒否する。

- `attempt_index`がexact integer `0`でない
- seedがintegerでない
- seedが0以下
- seedが`Number.MAX_SAFE_INTEGER`を超える
- `pair_workers`がbenchmark候補`[2, 4, 8, 12]`にない

今回のformal operational contractはattempt 0だけである。現在のjournalは部分結果を保持するため、結果を見た後のattempt 1を安全な「blind rerun」とは扱わない。将来rerunが必要なら、結果をoperatorから隠す別protocolを事前登録する必要がある。

## PCの最大並列度は2/4/8/12から選ぶ

safe capを12 pair workerへ広げ、候補を`[2, 4, 8, 12]`に限定した。ただし12を無条件採用しない。

benchmark harnessは同じ12 pair / 24 gameを`2,4,8,12,12,8,4,2`の固定順序で各設定2回ずつ測る。最大候補12 workerを1 waveすべて使い、各roundで要求したworker数と実測peakが一致することも必須にした。全8 roundのordered transcript SHA-256 vectorがexactに一致した場合だけ、2回のelapsed合計が最小の設定を選ぶ。同一workload・同一sample数なので、これはmean elapsed最小と同値である。各sample、合計、meanの分子と分母2をintegerのまま記録し、floatや丸めを選抜根拠に使わない。mean elapsedから換算するthroughputは表示専用で、選抜authorityではない。hashが1件でも違う、technical faultが1件でもある、workerが埋まらない、roundが欠ける、順序が違う場合はworkerを選ばない。同率なら小さいworker数を選び、不要なmemory/process負荷を避ける。実測時の総量は96 pair / 192 game、理想化24 worker waveであり、12 workerでのformal 384 pairに必要な理想化32 waveより小さい。

このPRでは実candidateも実opening manifestもないため、重い実WASM benchmarkはまだ走らせていない。fixtureでは2/4/8/12の各設定で要求数まで同時callbackが立つこと、384 pair / 768 game会計、hash drift時の選抜拒否を確認した。

重要なのは、現PRのregistry検査が証明するのはworker数がbenchmark候補集合に入ることまでで、benchmark receiptのcontent identityや`selected_pair_workers`との一致ではない点である。production entryはchecked-in ready registry未登録のため閉じたままにする。次のreviewed ready-registry bridgeは、benchmark receipt identityと選抜値の一致をjournal作成前のhard gateとして実装しなければならない。

## 今回確認した値

| 項目                     |             結果 |
| ------------------------ | ---------------: |
| Python focused tests     | 15 pass / 0 fail |
| TypeScript focused tests | 14 pass / 0 fail |
| 実formal pair / game     |            0 / 0 |
| 実worker benchmark round |                0 |
| network / cloud job      |            0 / 0 |
| live weight変更          |                0 |

機械可読な境界は[P0 foundation evidence](./data/floodgate-formal-paired-ab-v2-p0-foundation-2026-07-20.json)に記録した。

## 次に残すもの

このPRは基盤だけで、次の変更に以下を明示的に残す。

- reviewed ready-registryと新WASM contractのbridge
- benchmark receipt identityと`selected_pair_workers`の一致を確認するpre-journal hard gate
- argumentless production CLI
- manifest / benchmark / resultのatomic publication
- source-game provenance closure
- 実strong-game sourceからの384 opening生成
- candidate選抜後の実2/4/8/12 benchmark
- 選ばれたworker数でのformal 384 pair / 768局

その後にretention、regression、外部校正を行う。これらの証拠が揃うまでlive weightは変更しない。このP0単体は「強くなった」「高段に達した」という証拠ではない。
