# raw pathをteacherから外した — Floodgate pathless staging core

> [前段のtraining-row consumer](./blog-shogi-floodgate-training-row-consumer.md)は、認証済みtraining rowsをpathなしのcallbackへ渡す境界を作った。今回のPR-B1はteacher generatorからliteral raw path、任意の個別output path、旧CLIを除き、非本番の`CoreForTests` seamを`AuthenticatedFloodgateTrainingRows`型へ移した。targeted testは12/12 PASSである。ただし、この型はB1単独では偽造可能で、stage / engine / eval pathのdisjointnessもまだ認可していない。production runner、consumer postflight後のatomic final publish、real bundleでの実行、teacher searchは未実装・未実行である。これはrunner実装前のcore移行記録であり、teacher dataや棋力の結果ではない。English version: [blog-shogi-floodgate-pathless-teacher-staging.en.md](./blog-shogi-floodgate-pathless-teacher-staging.en.md)

---

## 現在地

| 項目                                | 状態       | このPR-B1で確認した範囲                              |
| ----------------------------------- | ---------- | ---------------------------------------------------- |
| pathless core seam                  | 実装済み   | 非本番`CoreForTests`がstructural inputを直接受け取る |
| fixed relative filenames            | 実装済み   | callerが指定するrootの下で4 file名を固定             |
| stage / input path認可              | 未実装     | private性、sealed rootとのdisjointnessはB2で閉じる   |
| resume binding                      | 実装済み   | training binding全体をrun fingerprintへ入れる        |
| resume semantic audit               | 実装済み   | current MultiPV、limit、候補和集合を再導出する       |
| targeted unit tests                 | 12/12 PASS | synthetic rowsとfake engineだけを使用                |
| production runner / final publisher | 未実装     | consumer postflight後の公開境界は別段                |
| real bundle / teacher run           | 未実行     | selection / final labelも未読                        |
| strength claim                      | なし       | claim boundaryは`non-production-core-migration-only` |

## 1. 旧CLIから削除したauthority

旧generatorは`--raw`で任意のinput pathnameを受け、`--out-train`、`--out-val`、`--manifest`、`--work`で4つのoutput pathnameを個別に選べた。さらに`--max-parents`で入力の先頭部分だけを処理できた。この形では、consumerが認証したrowsを使わずに別fileを開く、outputをprotected inputへ重ねる、24,000 rowsの一部だけを同じrunのように扱う、といった誤用余地が残る。

PR-B1の非本番test seamはCLIを持たず、入口を次へ変更した。

```text
stageSiblingTeacherDatasetCoreForTests(
  structuralTrainingRows,
  { stageRoot, engineBin, engineReceipt, evalDir, search options },
  dependencies,
)
```

raw pathname、個別output pathname、`maxParents`、caller指定のpipeline revisionはこのseamにない。pipeline revisionは渡されたbindingの`verifier_revision`から取る。親集合は`input.rows`の全件であり、途中までを選ぶoptionはない。

ただしTypeScript interfaceはruntime capabilityではない。callerは自己整合する偽のbindingとrowsを作れるほか、`engineBin`、`engineReceipt`、`engineArgs`、`evalDir`、`stageRoot`にはまだ任意pathを渡せる。このためexport名を`CoreForTests`とし、production entryとして使えないことをコードコメントとCLI tombstoneで明示した。test fileの旧形compatibility helperもsynthetic fixture専用である。

## 2. candidate stagingのfile名は固定4つ

callerが指定する`stageRoot`の下で、coreが導出する相対file名は固定した。

| file            | stagingでの役割                        |
| --------------- | -------------------------------------- |
| `train.jsonl`   | game-level split後のtraining records   |
| `val.jsonl`     | game-level split後のvalidation records |
| `manifest.json` | 既存teacher manifest v2                |
| `work.jsonl`    | durable per-parent resume checkpoint   |

cleanなtargeted fixtureではstage root直下にこの4 fileだけが生成された。output verifierへ渡すoutput pathも常にこの4つであり、このfixtureでは削除済みraw pathを保持しなかった。engine binary、engine receipt、engine argument files、eval treeは引き続きprotected inputとして扱う。

これはprivate/disjoint stageの証明でもfinal publicationでもない。`stageRoot`とengine/eval系pathがrole-bundle、raw lock、role lock、final rootのalias・祖先・子孫でないことをrealpath/inodeで検証するのはB2である。`train.jsonl`、`val.jsonl`、`manifest.json`はcore完了時にcandidate stage内へwriteされるが、consumer postflight後に別rootへcomplete artifactとして公開するpublisherは未実装である。

## 3. receiptの一部だけでなくbinding全体をresumeへ結ぶ

`AuthenticatedFloodgateTrainingRows.binding`は次のidentity群を持つ。

- result receiptのbytes / SHA-256
- role-bundle manifestのbytes / SHA-256
- bundle producer revision / verifier revision
- raw format / bytes / SHA-256
- record count / game count / semantic-position count
- game IDs / parent IDs / position IDsの各集合digest

旧work fingerprintがraw SHAだけを持つ形では、同じraw identityを参照する別receiptや別verifier contextを区別できない。PR-B1は渡されたbinding object全体をcanonical run-fingerprint preimageの`authenticated_training_binding`へ入れる。targeted testでは、rowsとraw SHAを変えずに`result_receipt_sha256`だけ変えたinputでresumeしようとすると、checkpoint header mismatchで停止した。これはfingerprintの挙動を示すunit factであり、そのbindingがconsumer発行であることのruntime authenticationではない。

full bindingは既存manifest v2へ新fieldとして露出させてはいない。既存schemaを維持したまま、`work.jsonl` headerの`run_fingerprint`を変える入力として使う。したがって、この段階の保証は「bindingが違うcheckpointをresumeしない」であり、「manifest v2単体が新しいproduction result receiptになった」ではない。最終publisherのreceiptは別段で必要になる。

## 4. rows側のaggregateも再計算する

staging coreはbindingをコピーするだけではない。受け取ったrowsから次を再計算し、bindingと照合する。

- rows数とparent ID数が`records`に一致
- distinct game ID数が`games`に一致
- distinct position ID数が`position_ids_count`に一致
- game / parent / position ID集合のdomain-separated digestが各binding digestに一致
- `parent_id`がstrict UTF-8 byte順で、semantic position duplicateが0

各rowについてもschema、parent SFENとposition ID、ply、`played_move`を再検査する。raw bytes / raw SHA自体は、このcoreがJSONLを再openして再計算するものではない。実consumer発行inputをB2が渡す場合のbyte authenticationは前段consumerの責務であり、B1が単独で確認するのはcaller-supplied rowsとbinding aggregateの自己整合性だけである。

## 5. resume時はcurrent search contractから再導出する

payload checksumとrun fingerprintが一致するだけではresume entryを信用しない。`work.jsonl`を開くたびに、現在のinput rowと現在のoptionsから次を再導出する。

1. current MultiPVを合法手数でcapしたproposal本数
2. proposal searchと各single-move searchのcurrent requested limit
3. proposal movesと`played_move`の現行v6 candidate union
4. candidateのstrict UTF-8 byte順とcandidate-set SHA-256
5. MultiPV 1 / exactly-one `searchmoves`の各独立探索
6. score、rank、child SFEN、`played` / `teacher` sourceの対応

このため、古いdepth / nodes limit、別MultiPV、候補を欠落・追加したentryをpayloadごと再sealしてもresumeできない。false skip、candidate execution order、total nodes、tie rank、child derivationも再検査する。

ただし`payload_sha256`は非鍵checksumであり、torn write検出にすぎない。scoreと全派生fieldを整合的に改竄して再sealする相手を認証できない。trusted exclusive stageまたは別のauthenticationをB2で導入するまで、`work.jsonl`をteacher evidenceとして扱わない。

ここでいう「現行candidate union」は、既存v6の**teacher MultiPV proposal + strong game's `played_move`**である。全体計画にあるrunOp1 stable moveを加えるproposerは、このPR-B1にはまだ接続していない。B1の役割はliteral raw fieldを除き、resume validationを狭めるところまでである。

## 6. manifest v2を維持した理由

teacher outputのschemaは引き続き次の2つである。

```text
shogi-sibling-teacher-manifest-v2
shogi-sibling-teacher-work-v2
```

teacher engine / eval snapshot、search reset、candidate accounting、progress checkpoint、split、output bytes / SHA-256という既存manifestの形は変えていない。pathless化のためにlabel recordやdownstream trainerのschemaを同時変更せず、input authorityとresume authenticationだけを狭めるためである。

これはv2 manifestがproduction publish済みという意味ではない。今回生成したのはfake engineを使うsynthetic test artifactだけであり、real training stageのmanifestはまだ存在しない。

## 7. 12/12 targeted testが閉じた範囲

targeted suiteは次の12件でPASSした。

1. 旧raw-path CLIがnonzeroで停止し、既存sentinelを変更しないtombstone
2. raw pathnameを削除したstructural input、binding全field、固定4 output
3. top-N外のplayed move、deterministic resume、duplicate 0
4. proposal / candidateごとのresetとcanonical execution order
5. resealed corrupt independent-search derivationの拒否
6. 複数合法手parentをfalse skipしたentryの拒否
7. depth / nodesのexactly-one limit
8. legal-move cap、parent-boundary TT reset、forced-move skip
9. 任意不成を含むrules-complete sibling候補
10. exact engine binaryへ束縛したcanonical / exact-key receipt
11. immutable engine / argument / eval runtime snapshot
12. mutable option overrideになる`eval_options.txt`の拒否

これらはstaging coreのunit evidenceである。production consumerを呼ぶrunner、consumer callbackを跨ぐpostflight、stagingからfinal rootへのatomic adoption、production result receipt、real bundle、YaneuraOu実行は試していない。

## 8. このPR-B1の結論

selection / final labelは読んでいない。teacher searchもcandidate trainingも実行していないので、評価値、accuracy、勝率、Elo、段位のclaimはない。

今回言えることは1つだけである。**旧raw-path CLIは成功を装うno-opではなくfail-closedで停止し、非本番teacher seamからliteral raw field、個別output path、partial-parent optionを除いた。** rowsのruntime authenticity、他pathからsealed treeへ入れないこと、private stage、postflight後final publicationはまだ証明していない。次はconsumer-owned runnerだけをproduction entryにし、その全境界をまとめて閉じる。
