# 将棋評価関数: formal A/B v2をローカル6並列で安全に再開できる境界

> 2026-07-18時点で実対局はまだ0局である。この変更は384 pair / 768局の正式A/Bを自動実行しない。argumentless commandはclosed protocol chainを再検証した後、code-pinnedなready registryが存在しないため、pair用directoryを作る前に`STOP`する。実行可能なdependency-injected coreは明示的な`CoreForTests`だけであり、本番用実行関数ではない。English version: [blog-shogi-floodgate-formal-paired-ab-v2-local-launcher.en.md](./blog-shogi-floodgate-formal-paired-ab-v2-local-launcher.en.md)

## 結論

[v2 protocol](./blog-shogi-floodgate-formal-paired-ab-protocol-v2.md)が固定した384個のcolor-swapped pairを、将来ローカルmachineで最大6 pair並列に実行・再開するためのorchestration boundaryを追加した。

今回実装したのは次の範囲である。

- original plan、closed v1 / v2 registry、v2 amendment identityを、repository-relative pathの全componentでsymlinkを辿らず再検証
- synthetic fixtureを受け取る明示的なtest-only `CoreForTests`
- 将来の本番activationを、codeに固定したchecked-in ready-registryのexact path / bytes / SHA-256 / schemaがなければ拒否するclosed route
- candidate / stable weight、YaneuraOu binary / receipt / eval、既存local match adapterのbytes / SHA-256検証
- attempt ledgerと再試行認可を、実際に読み込むread-only regular artifactのpath / bytes / SHA-256 / schemaへ束縛
- canonical four-field SFEN、exact 384 opening、768 game ID、pair順、candidate先手→後手、unique seedの検証
- test fixtureで許すdeterministic optionsを1つのexact JSONへ固定
- 最大6 pair worker
- pairごとの追記専用JSONL journal
- 完了pairだけを再利用し、途中pair・technical fault・改変・重複・欠落・順序違反では停止
- 384 pair完了後の再検証と既存v2 result decoderへの接続

一方、tracked v2 registryのenrollmentは依然すべて`null`である。実weight、実opening manifest、実match binding、実local adapterはこの変更で登録していない。

## AWSは使わない

このlauncherの範囲はlocal filesystemとlocal processだけである。AWSは強化・学習・A/Bに必要なく、このlauncherから利用する場所もない。repository内にあるAWS関連の別記事やcontractは、過去または将来のremote witness研究であり、このローカルA/B経路には接続されていない。`CoreForTests`のmatch bindingは次をexactに要求する。

| 境界                 | 固定値  |
| -------------------- | ------- |
| local only           | `true`  |
| network              | `false` |
| AWS                  | `false` |
| external calibration | `false` |
| live weight write    | `false` |
| automatic run        | `false` |

game requestにも同じfalse値を毎回含める。AWS account、DynamoDB、KMS、Firebase / GCP、Vercel、81Dojo、production weight writerには接続しない。Firebase FunctionsはGCP側、VercelはWeb deployment側であり、どちらもローカルの教師生成・再学習・正式A/Bを実行する計算基盤としてこのlauncherは使わない。

## 既存protocolとassetを使い、対局規則を追加しない

launcher自身は新しいtime control、投了、引分、最大手数、adjudication規則を決めない。現時点の`CoreForTests`が受け入れるdeterministic optionsは、synthetic fixture専用の1つのexact JSONだけである。任意のtime controlやendpointをcallerが自己申告して通すことはできない。実対局用optionsはまだ未登録であり、結果を見る前に別のcode reviewでexact bytesへ固定する必要がある。

notation / engine境界は既存のものだけを受け入れる。

- engine protocol: `USI`
- opening protocol: `SFEN+USI`
- result: candidate視点の`win | draw | loss`
- YaneuraOu binaryと既存engine receiptのbinary bytes / SHA-256一致
- candidate / stable weightは別々のexact bytes / SHA-256

現行argumentless commandはready match bindingへ到達しない。callerが選んだready registryを受け取る本番関数も存在しない。unit testはreal adapterやYaneuraOu processの代わりにdependency-injected stubを使った。

## exact pair計画

synthetic test opening manifestは384 pairをindex 0〜383の順に持つ。各pairについて`CoreForTests`は次を検証する。

1. 既存stdlib validatorを通るcanonical four-field SFENとUSI move列
2. opening内容からdomain-separated SHA-256で導出したopening ID
3. uniqueなpositive signed-64-bit seed
4. game 0はcandidate先手
5. game 1はcandidate後手
6. opening ID、pair index、game index、colorから導出したunique game ID

test fixtureのcallerはopening内容とseedを作れるが、pair index、内容から再導出されるID、seedの一意性、game順、colorとの不整合は通せない。このsynthetic自由度はproduction authorityではない。将来の本番経路は、exact manifestとmatch bindingを参照するready registry自体のpath / bytes / SHA-256 / schemaをcodeへ固定する別変更が必要である。

## 6 pair workerと追記専用journal

worker数はready registryに固定するが、許容範囲は1〜6だけである。pairはmanifest順の最大6件batchとして開始し、1 workerが同じopeningの2局をcandidate先手、candidate後手の順に実行する。

各pairはcurrent-user-owned `0600` regular fileへ次の4 eventを追記する。

1. `pair-started`
2. `game-completed`（candidate先手）
3. `game-completed`（candidate後手）
4. `pair-completed`

各eventは直前のcanonical JSONL bytesのSHA-256、registry、plan、amendment、opening manifest、match binding、両weight、pair / opening / seed identityを束縛する。receipt directoryはcurrent-user-owned `0700`だけを許し、unknown entry、symlink、hardlink、非canonical JSONLを拒否する。registry、protocol、manifest、binding、asset、attempt ledger、rerun authorizationを読むときは、final fileだけでなくrepository-relative pathの各directory componentもdirectory descriptorと`nofollow`で開くため、中間symlinkも拒否する。

attempt ledgerとattempt 1のrerun authorizationは、digest文字列だけでは受理しない。current user所有、hardlinkなし、write bitなしのregular artifactを実際に読み、申告したbytes / SHA-256 / schemaと一致させる。

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

このcommandからtest-only coreやlocal adapterへ到達する経路はまだない。将来これを開くには、review済みのchecked-in ready registryのexact identityをcodeへ固定し、本番用adapter compositionを別途reviewする必要がある。callerがpathを渡して開く設計にはしない。

## 独立reviewで見つかった穴と修正

最初の独立reviewでは、synthetic callerが自己作成した`ready-local-only` registry、任意weight、実artifactを読まないattempt / rerun digest、invalid SFEN、任意options、中間directory symlinkを通せることが分かった。これはtest seamと将来のproduction境界の区別が弱かったためであり、その状態を本番readyとは扱えない。

remediationでは、実行可能APIを`CoreForTests`へ改名し、production routeをcode-pinned identity未設定の`STOP`へ閉じた。さらにread-only attempt artifacts、全path componentの`nofollow`、既存SFEN validator、exact test-only optionsを追加し、上記のadversarial caseを回帰testへ固定した。最終独立再review、PR、CIはまだ`PENDING`である。

## 検証結果

実測値は[機械可読evidence](./data/floodgate-formal-paired-ab-v2-local-launcher-2026-07-18.json)に記録した。

| 検証                       |                           結果 | wall time |
| -------------------------- | -----------------------------: | --------: |
| Python compile             |                           PASS |         — |
| focused Python             |                   14 / 14 PASS |    1.12秒 |
| ML stdlib全体              |                 152 / 152 PASS |   12.05秒 |
| publication evidence       |                     5 / 5 PASS |    0.29秒 |
| argumentless npm preflight | expected STOP、0 pair / 0 game |    0.32秒 |

stub testではexact 384 pair / 768 callbackの完走、complete resume時の0 callback、6 concurrent pair、fault / partial、wrong plan / registry / weight / binding / color / ID、receipt tamper、unknown entry、alias、network / AWS / live flagに加え、caller-selected production registry不在、bare attempt / rerun digest、writable attempt artifact、invalid SFEN、任意options、中間symlinkの拒否を検証した。これはorchestrationのtestであり、棋力データではない。

## 現在値と次のdata-only gate

| 項目                                    |                  現在値 |
| --------------------------------------- | ----------------------: |
| real formal A/B                         | 0 / 384 pair、0 / 768局 |
| real YaneuraOu / match process          |                   0 / 0 |
| candidate / stable enrollment           |                   0 / 0 |
| real opening / match binding enrollment |                   0 / 0 |
| external calibration                    |                     0局 |
| live weight changed                     |                   false |

次はteacher生成、3-seed学習、selection、fresh / legacy final、retention、既知回帰、production parityをローカルで通したあとである。その時点でだけcandidate / stable、384 opening、既存local adapter、すべてのmatch option、attempt ledgerをreviewし、ready registryのexact identityをcodeへ固定する。登録bytesを見てから、このSTOP commandをreal local adapterへ接続する別reviewが必要である。AWSはこの手順の前提ではない。

formal A/B完走だけでも人間の高段を証明しない。正式A/B pass後に、別の明示確認を伴う外部校正とrelease gateが必要であり、それまではlive weightを変更しない。
