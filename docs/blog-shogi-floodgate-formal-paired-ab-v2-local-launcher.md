# 将棋評価関数: formal A/B v2をローカル6並列で安全に再開できる境界

> 2026-07-18時点で実対局はまだ0局である。この変更は384 pair / 768局の正式A/Bを自動実行しない。現在のclosed v2 registryをargumentless commandが再検証し、candidate / stable weight、opening manifest、match bindingが未登録なので、pair用directoryを作る前に`STOP`する。English version: [blog-shogi-floodgate-formal-paired-ab-v2-local-launcher.en.md](./blog-shogi-floodgate-formal-paired-ab-v2-local-launcher.en.md)

## 結論

[v2 protocol](./blog-shogi-floodgate-formal-paired-ab-protocol-v2.md)が固定した384個のcolor-swapped pairを、将来ローカルmachineで最大6 pair並列に実行・再開するためのorchestration boundaryを追加した。

今回実装したのは次の範囲である。

- original plan、closed v2 registry、v2 amendment identityの再検証
- reviewed data-only enrollmentを受け取るstrict ready-registry reader
- candidate / stable weight、YaneuraOu binary / receipt / eval、既存local match adapterのbytes / SHA-256検証
- exact 384 opening、768 game ID、pair順、candidate先手→後手、固定seed / optionsの束縛
- 最大6 pair worker
- pairごとの追記専用JSONL journal
- 完了pairだけを再利用し、途中pair・technical fault・改変・重複・欠落・順序違反では停止
- 384 pair完了後の再検証と既存v2 result decoderへの接続

一方、tracked v2 registryのenrollmentは依然すべて`null`である。実weight、実opening manifest、実match binding、実local adapterはこの変更で登録していない。

## AWSは使わない

このlauncherの範囲はlocal filesystemとlocal processだけである。ready match bindingは次をexactに要求する。

| 境界                 | 固定値  |
| -------------------- | ------- |
| local only           | `true`  |
| network              | `false` |
| AWS                  | `false` |
| external calibration | `false` |
| live weight write    | `false` |
| automatic run        | `false` |

game requestにも同じfalse値を毎回含める。AWS account、DynamoDB、KMS、Firebase、Vercel、81Dojo、production weight writerには接続しない。

## 既存protocolとassetを使い、対局規則を追加しない

launcher自身は新しいtime control、投了、引分、最大手数、adjudication規則を決めない。これらは結果を見る前に別のreview済みmatch bindingへexact JSONとして登録され、そのSHA-256を全game receiptが返す。

notation / engine境界は既存のものだけを受け入れる。

- engine protocol: `USI`
- opening protocol: `SFEN+USI`
- result: candidate視点の`win | draw | loss`
- YaneuraOu binaryと既存engine receiptのbinary bytes / SHA-256一致
- candidate / stable weightは別々のexact bytes / SHA-256

現行argumentless commandはready match bindingへ到達しない。unit testはreal adapterやYaneuraOu processの代わりにdependency-injected stubを使った。

## exact pair計画

future opening manifestは384 pairをindex 0〜383の順に持つ。各pairは次を固定する。

1. canonical SFENとUSI move列
2. opening内容からdomain-separated SHA-256で導出したopening ID
3. uniqueなpositive signed-64-bit seed
4. game 0はcandidate先手
5. game 1はcandidate後手
6. opening ID、pair index、game index、colorから導出したunique game ID

manifestの順序、ID、seed、colorをcallerは上書きできない。match optionsもreview済みbindingのexact bytesに含め、launcherはそのままlocal adapterへ渡す。

## 6 pair workerと追記専用journal

worker数はready registryに固定するが、許容範囲は1〜6だけである。pairはmanifest順の最大6件batchとして開始し、1 workerが同じopeningの2局をcandidate先手、candidate後手の順に実行する。

各pairはcurrent-user-owned `0600` regular fileへ次の4 eventを追記する。

1. `pair-started`
2. `game-completed`（candidate先手）
3. `game-completed`（candidate後手）
4. `pair-completed`

各eventは直前のcanonical JSONL bytesのSHA-256、registry、plan、amendment、opening manifest、match binding、両weight、pair / opening / seed identityを束縛する。receipt directoryはcurrent-user-owned `0700`だけを許し、unknown entry、symlink、hardlink、非canonical JSONLを拒否する。

再開時はcomplete journalが作る0からの連続prefixだけを読んでskipする。途中pair、fault event、missing lower pair、game 1先行、duplicate game、wrong color、digest driftが1件でもあれば、complete pairを含めて新しいgameを開始しない。したがってcomplete pairは再対局せず、partial pairも勝手に再対局しない。

fileを`fsync`してから次eventへ進むが、directory entryのpower-loss durabilityや、同じUIDを持つmalicious processに対するtamper-proof storageは主張しない。これはlocal trusted-operator boundaryであり、remote witnessではない。

## technical fault

adapter throw、wrong ID / color / seed / weight / binding、invalid result、`technical_fault: true`はそのpairへsanitized fault eventを追記してrunを停止する。同じrunでそのgameを差し替えない。並列batchですでに開始済みの他pairはdrainするが、新しいbatchは開始しない。

faultやpartial journalからstrength resultを作らない。全384 pairがcompleteの場合だけ、candidate / stable、run / experiment、attempt ledger、amendment、768 gameを既存[`decode_pair_score_units`](../ml/formal_paired_ab_protocol_v2.py)へ渡す。bootstrap分析やpromotionはこのlauncherのauthorityではない。

## argumentless commandは現在0局で停止する

explicit commandは次である。

```text
npm run shogi:formal-ab-v2-local
```

argumentを1つでも渡すと`arguments-forbidden`で停止する。argumentなしでも現在はexact closed registryを検証した後、次のreceiptを返してexit 2になる。

```json
{
  "games_started": 0,
  "pairs_started": 0,
  "reason": "candidate-identities-not-enrolled",
  "schema": "shogi-floodgate-formal-paired-ab-local-cli-receipt-v1",
  "status": "STOP"
}
```

このcommandからready coreやlocal adapterへ到達する経路はまだない。これはenrollment前の自動開始を防ぐ意図的な境界である。

## 検証結果

実測値は[機械可読evidence](./data/floodgate-formal-paired-ab-v2-local-launcher-2026-07-18.json)に記録した。

| 検証                       |                           結果 |  wall time |
| -------------------------- | -----------------------------: | ---------: |
| focused Python             |                   10 / 10 PASS |     0.87秒 |
| ML stdlib全体              |                 148 / 148 PASS |    11.75秒 |
| argumentless npm preflight | expected STOP、0 pair / 0 game | 0.26秒未満 |

stub testではexact 384 pair / 768 callbackの完走、complete resume時の0 callback、6 concurrent pair、fault / partial、wrong plan / registry / weight / binding / color / ID、receipt tamper、unknown entry、alias、network / AWS / live flagを検証した。これはorchestrationのtestであり、棋力データではない。

## 現在値と次のdata-only gate

| 項目                                    |                  現在値 |
| --------------------------------------- | ----------------------: |
| real formal A/B                         | 0 / 384 pair、0 / 768局 |
| real YaneuraOu / match process          |                   0 / 0 |
| candidate / stable enrollment           |                   0 / 0 |
| real opening / match binding enrollment |                   0 / 0 |
| external calibration                    |                     0局 |
| live weight changed                     |                   false |

次はteacher生成、3-seed学習、selection、fresh / legacy final、retention、既知回帰、production parityを通したあとである。その時点でだけcandidate / stable、384 opening、既存local adapter、すべてのmatch optionをdata-only reviewで登録する。登録bytesを見てから、このSTOP commandをreal local adapterへ接続する別reviewが必要である。

formal A/B完走だけでも人間の高段を証明しない。正式A/B pass後に、別の明示確認を伴う外部校正とrelease gateが必要であり、それまではlive weightを変更しない。
