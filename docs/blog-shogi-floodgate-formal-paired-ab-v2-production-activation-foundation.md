# 将棋評価関数: formal A/B v2の本番activationを0局のまま閉じて準備した

> 2026-07-19時点で、実formal A/Bは **0 / 768局**、engine processは0、network requestは0、live weight変更は0である。この変更は棋力を上げる計算ではなく、候補が実際に揃った後に384 pair / 768局を取り違えず開始するための小さな先行準備である。教師生成は別経路で並行しており、この準備はそのCPUを使わない。English version: [blog-shogi-floodgate-formal-paired-ab-v2-production-activation-foundation.en.md](./blog-shogi-floodgate-formal-paired-ab-v2-production-activation-foundation.en.md)

## 結論

formal A/B v2には、既に統計規則とlocal-only test launcherがあった。一方、本番開始に必要なcandidate / stable、opening、time control、adapter、上流receiptを1つのexactなactivationへ束縛する入口はまだなかった。

今回追加したのは次の3点だけである。

1. enrollmentがすべて`null`のexact closed registry
2. argumentを一切受け取らず、registryを検証して0局のまま`STOP`するproduction entry
3. 将来のready enrollmentに必要な全identityとexact 768-game accountingを検査できる、明示的な`CoreForTests`

実identityは登録していない。実対局を始めるproduction adapterも、engine / game / network / live-weight writerへの経路も追加していない。

## closed registry

新しいregistryはpath / byte count / SHA-256 / schemaをcodeに固定している。内容は次の状態だけを許す。

| 項目                                  | 固定状態        |
| ------------------------------------- | --------------- |
| candidate / stable                    | `null` / `null` |
| opening manifest                      | `null`          |
| time control                          | `null`          |
| pair workers                          | `null`          |
| match adapter                         | `null`          |
| result / retention / rollback receipt | すべて`null`    |
| execution authorized                  | `false`         |
| production weight write authorized    | `false`         |
| pairs / games started                 | 0 / 0           |

validatorはこのregistryだけでなく、既存v1 registry、v2 amendment、v2 closed registry、fresh sibling planのexact bytesも、repository-relative pathの全componentでsymlinkを辿らない`no-follow` openで読む。1 byte、field、type、順序外の追加、重複JSON key、schema、digestが違えば停止する。

## argumentless production entry

入口は次である。

```text
python3 ml/formal_paired_ab_v2_production_activation.py
```

argumentを渡すとregistryを読む前に`arguments-forbidden`で停止する。argumentなしではclosed chainを再検証し、次の意味のsanitized receiptを返してexit 2になる。

```json
{
  "status": "STOP",
  "reason": "enrollments-closed",
  "pairs_started": 0,
  "games_started": 0,
  "engine_processes_started": 0,
  "network_requests": 0,
  "live_weight_changes": 0
}
```

このentryはcaller-selected registry pathを受け取らない。`CoreForTests`を呼ばず、engine、game process、AWS、GCP、Vercel、Firebase、外部対局site、live weightへ接続しない。productionを開くには、実データが揃った後に別のreview済み変更が必要である。

## `CoreForTests`が束縛するもの

test-only compositionは実行APIではない。synthetic mappingを検査し、次のidentityからdeterministicなbinding SHA-256を作るだけである。

| binding            | 検査内容                                                               |
| ------------------ | ---------------------------------------------------------------------- |
| experiment / run   | 別々のnonzero semantic SHA-256 ID                                      |
| candidate / stable | 別々のexact weight artifact identity                                   |
| openings           | 既存launcher schema、canonical SFEN / USI、384 unique opening / seed   |
| colors             | 各pairでcandidate先手、その後candidate後手                             |
| time control       | exact content identity、非負clock、正のthinking time、固定adjudication |
| pair workers       | integer 1〜6                                                           |
| match adapter      | exact artifact identity                                                |
| result receipt     | exact downstream-result artifact identity                              |
| retention receipt  | exact retention artifact identity                                      |
| rollback receipt   | exact rollback-readiness artifact identity                             |

opening manifestは既存local launcherと同じschemaとfield構造を使う。opening IDとgame IDは同じdomain-separated ruleで内容から再導出し、各pairにunique positive signed-64-bit seedを要求する。384 pairの各2局を検査し、合計がexact 768、candidate先手384局、candidate後手384局でなければcomposition receiptを返さない。

bindingのprotocol部分にはsource plan / amendment / v2 registryだけでなく、今回のexact activation-registry identityも含める。したがって将来closed registryをready registryへ置き換える場合、古いcomposition receiptと同じbinding hashを再利用できない。

返すauthorityは常に次のとおりである。

- game execution: `false`
- production activation: `false`
- production weight write: `false`

`CoreForTests`はartifact fileを開かない。receiptのidentityを束縛するだけで、実receiptの意味をproduction-readyだとは認定しない。特にrollback-readiness receiptは将来の別contractであり、今回実物を作っていない。result / retention schemaが上流の最終mergeで変われば、このclosed foundationを開く前にexact enrollment側を更新して再reviewする。

## adversarial test

unit testは次を拒否した。

- registryのbyte driftと中間directory symlink
- argument付きproduction entry
- 383 pair、wrong color、duplicate / wrong game ID
- duplicate / bool / nonpositive / signed-64-bit超過のopening seed
- opening / time-control contentとidentity digestの不一致
- candidateとstableの同一digestまたは同一path
- bool、0、7、floatのpair worker
- wrong adapter / receipt schema、receipt digest / path alias
- unsafe relative path、extra field、nestedを含む`dict` subclass
- `a//b`、`a/./b`、trailing slashによるpath alias
- `production_authority: true`などのauthority拡張

同じsynthetic inputとkey順だけを変えたinputは同じcomposition receiptを作る。返却値はinputとaliasせず、composition中にfilesystem openを行わない。

## 検証

独立reviewは最初に`P0=0`、`P1=2`、`P2=1`を報告した。P1はpair seedの欠落とcomposition hashからactivation-registry identityが落ちていたこと、P2はnoncanonical path aliasでdistinct-path checkを回避できたことだった。実装anchor `651359df6a56a36379d834cd092b77cbac15a076`で3点を修正し、既存launcher validatorへ同じsynthetic opening manifestを通す互換testと、duplicate / bool / 0 / negative / signed-64-bit overflow seedの各probeも追加した。exact review head `ea56f82b44234a41243545fbb8e6960bb9b06010`の最終read-only reviewは`P0=0`、`P1=0`、`P2=0`、safe-to-reviewだった。

PR reviewでは、non-string SFENを`_normalized_sfen`へ渡すと明示型checkより先にraw `TypeError` / `AttributeError`が漏れ得る指摘も受けた。現行実装anchor `35d0ca71bd5d60747667c3dad4e804b270cb3551`はtype checkをnormalization前へ移し、`null`、integer、listがすべて`FormalAbV2ActivationError`としてfail closedになる回帰probeを追加した。

後続reviewの3点は実装anchor `eb444083b0f98a7da56a1af7f9c84ed08168257c`で修正した。`os.geteuid`がない環境はraw `AttributeError`ではなく明示的にfail closedし、pair数とworker上限の診断は固定値ではなくcontract定数から生成する。publication testの禁止import検出は`from subprocess import Popen`、`import urllib.request`、alias、複数importも検出する回帰例で固定した。

| 検証                                        |                     結果 |
| ------------------------------------------- | -----------------------: |
| Python compile                              |                     PASS |
| activation focused                          |             12 / 12 PASS |
| 既存protocol / local launcherを含む関連test |             61 / 61 PASS |
| ML stdlib全体                               |           205 / 205 PASS |
| publication evidence                        |               5 / 5 PASS |
| Ruff / Prettier / diff check                |                     PASS |
| argumentless production entry               | expected STOP、0 / 768局 |

機械可読値は[production activation foundation evidence](./data/floodgate-formal-paired-ab-v2-production-activation-foundation-2026-07-19.json)に記録した。

## 次のgate

この変更単体でAIは強くならない。次に必要なのは、現在進行中のteacher生成、3-seed再学習、candidate selection、sealed holdout / retention / regression / production parityである。それらがpassした後にだけ、実candidate / stable、opening、time control、adapter、result / retention / rollback receiptを別PRでenrollし、production entryをreview済みadapterへ接続する。

768局のformal A/Bを完走しても、人間の高段を直接証明するわけではない。formal A/B pass後に外部校正を行い、rollbackとmonitoringを確認するまでlive weightは変更しない。
