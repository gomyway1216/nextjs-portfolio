# v7 checkpoint v3で100 / 500をunsealed milestoneにし、24,000だけをsealする

> 前段の[v7 HMAC work checkpoint](./blog-shogi-floodgate-v7-hmac-work-checkpoint.md)は、completed parentをinput順にHMAC chainへ保存し、crash後にdurable parentを再利用できるv2 streamを作った。[valid 24,000-parent scan-load](./blog-shogi-floodgate-v7-valid-24k-scan-load.md)は、そのv2 streamをholdout-free synthetic inputで実測した。しかし、同じfull training inputを100親、500親、24,000親の順に進めながら、prefixを完成datasetと誤認させずにdurability gateだけを記録する契約はなかった。この変更はv2を残したまま別のv3 test-only entry pointを追加し、100 / 500をdomain-separated HMAC milestone、24,000だけをsealとして固定する。source revision、v3実測、validation結果はsource freeze後に記入するため、本稿では`[TBD]`とする。production実行、deployment key、real dataset、teacher label、training、weight、live評価関数 / weight activation、対局、棋力の証拠ではない。English version: [blog-shogi-floodgate-v7-checkpoint-v3-milestones.en.md](./blog-shogi-floodgate-v7-checkpoint-v3-milestones.en.md)

---

## 1. 現在の境界

current sourceは、既存の`checkpointFloodgateV7TeacherParentsCoreForTests`とそのpublic contractを保持し、別の`checkpointFloodgateV7TeacherParentsV3CoreForTests`を追加する。v3が固定する識別子は次のとおりである。

- schema: `shogi-floodgate-v7-teacher-work-v3`
- algorithm: `hmac-sha256-hkdf-sha256-v7-parent-gated-milestone-chain-v3`
- gate contract: `shogi-floodgate-v7-teacher-gate-contract-v1`
- gates: `durable-prefix-100`、`durable-prefix-500`、`sealed-final-24000`

| 境界                                 | 状態                         | この変更が示すこと                              |
| ------------------------------------ | ---------------------------- | ----------------------------------------------- |
| v2 checkpoint API / schema / format  | 保持                         | 既存v2 callerとhistorical streamをそのまま残す  |
| v2 valid 24,000 scan-load            | historical accepted baseline | v3実測へ流用せず比較基準だけにする              |
| v3 gate contract / scanner / receipt | current sourceに実装         | source revisionとvalidationは`[TBD]`            |
| real 100 / 500 / 24,000 teacher run  | 0                            | production dataやengineをこの変更では実行しない |
| weight / live / match / strength     | 0                            | 高段安定や棋力向上を主張しない                  |

v3はprivate test-only checkpointである。production coordinatorやdeployment key authorityから到達するzero-argument production pathではなく、callerから渡されたauthenticated training-row capability、authorized private stage lease、run binding、producer controller、test dependencyを検査するcoreに留まる。

## 2. v2を上書きせず、同じfull 24,000親を固定する

v2とv3は同じ`work.jsonl`名を使うが、意味を共有しない。current sourceはv2のschema、algorithm、HKDF info、header / entry / seal domain、public function signatureを保持し、v3に別schema、別HKDF info、別domain、別receipt unionを与える。v3で増えた`after-milestone-durable` failpointと`durable-prefix-final` read policyも`FloodgateV7TeacherCheckpointV3Dependencies`へ分離し、v2のdependency hook型を広げない。

| 項目           | v2                                                | v3                                                                                               |
| -------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| public core    | `checkpointFloodgateV7TeacherParentsCoreForTests` | `checkpointFloodgateV7TeacherParentsV3CoreForTests`                                              |
| schema         | `shogi-floodgate-v7-teacher-work-v2`              | `shogi-floodgate-v7-teacher-work-v3`                                                             |
| chain          | header → parent entries → seal                    | header → parent entries → milestone 100 → parent entries → milestone 500 → parent entries → seal |
| prefix success | なし                                              | 100 / 500のexact unsealed receipt                                                                |
| migration      | なし                                              | v2 bytesのin-place re-sign、upgrade、resumeをしない                                              |

v3 invocationは、persistenceを始める前にauthenticated training inputが**exact 24,000 parents**であることを要求する。100 gateにも500 gateにも24,000 rows全体を渡し、100-row sliceや500-row sliceは渡さない。headerはfull training binding、record count、全parent ID digest、全canonical parent digestに加え、plan、producer-control policy、stable runtime receipt digest、teacher USI runtime receipt digestを含むrun binding、run ID、key ID、stage identityをHMACする。

したがって3回の正規呼び出しは、同じauthenticated 24,000 rows、同じrun binding、同じrun ID、同じkey ID、同じstage streamを使う。どれか1 byteでも別なら既存headerのexact再構成に失敗し、producerを呼ぶ前にrejectする。100 / 500を別datasetとして作らないため、pilotだけ別identityへ分岐してfinalと結び付かなくなる余地を閉じる。

## 3. 1本のHMAC chainへ2つのmilestoneを入れる

v3 streamの正規形は1つだけである。

```text
header
  -> completed-parent[0..99]
  -> durable-prefix-100 milestone
  -> completed-parent[100..499]
  -> durable-prefix-500 milestone
  -> completed-parent[500..23999]
  -> seal
```

| 到達点 | parent entries | milestone lines | seal lines | total JSONL lines |
| -----: | -------------: | --------------: | ---------: | ----------------: |
|    100 |            100 |               1 |          0 |               102 |
|    500 |            500 |               2 |          0 |               503 |
| 24,000 |         24,000 |               2 |          1 |            24,004 |

このline数は実測値ではなく、current sourceのexact gate構造から決まる契約値である。各parent entryは直前のheader / entry / milestone MACを`previous_mac`として結び、100 milestoneの`milestone_mac`がentry 100のchain head、500 milestoneの`milestone_mac`がentry 500のchain headになる。

2つのmilestoneはそれぞれ別のHMAC domainを使い、次を同時に認証する。

- gate literalとexact `completed_parents`
- milestone直前のchain MAC
- その時点までのprefix parent-ID digest
- full 24,000 training inputのparent-ID digest
- full 24,000 canonical parent rows digest
- `not-sealed-not-published`を含むprefix status

header、parent entry、100 milestone、500 milestone、sealはすべてdomain-separatedである。markerの名前や件数だけを書いたplain JSON、SHA-256だけのprefix、別runから持ち込んだvalid markerはchain authorityにならない。

## 4. 100 / 500はunsealed、24,000だけをsealする

3つのgateは同じ型の「成功」として返さない。receipt unionは`gate`、`sealed`、`target_parents`、`completed_parents`、milestone MACの有無をliteralで分ける。

| gate                 | target / completed | receipt status                                                                             | sealed  | milestone receipt    |
| -------------------- | -----------------: | ------------------------------------------------------------------------------------------ | ------- | -------------------- |
| `durable-prefix-100` |          100 / 100 | `complete-authenticated-durable-private-v7-teacher-parent-prefix-not-sealed-not-published` | `false` | 100あり、500は`null` |
| `durable-prefix-500` |          500 / 500 | `complete-authenticated-durable-private-v7-teacher-parent-prefix-not-sealed-not-published` | `false` | 100 / 500ともにあり  |
| `sealed-final-24000` |    24,000 / 24,000 | `complete-authenticated-private-v7-teacher-parent-checkpoint-not-published`                | `true`  | 100 / 500ともにあり  |

100 / 500 receiptの`training_parents`は100や500ではなく、どちらも24,000である。これは「full inputへ結ばれたdurable prefix」を意味し、「100-row dataset」や「500-row completed teacher dataset」を意味しない。prefix scannerもfinal reopen時に`sealed=false`、exact line count、exact target、余分なtailがないことを要求する。

seal payloadはexact 24,000 entries、final entry MAC、100 / 500両milestone MAC、full parent-ID digest、full canonical parent digestを認証する。片方のmarkerがない、24,000未満、24,000を超える、marker後のchainが違う場合にsealは成立しない。したがってdurability / resume gateを通ったことと、final private checkpointがsealedになったことをreceiptだけでも混同しにくい。

## 5. gate skip / lower / malformed transitionをfail closedにする

正規のstate transitionは`fresh → 100 → 500 → 24,000`だけである。scannerは既存bytesを全て認証してから、要求gateがそのstateを所有できるか検査する。skip、lower、ambiguous stateはproducer、append、truncateより前にrejectする。

| durable state       | requested gate | 結果                                             |
| ------------------- | -------------- | ------------------------------------------------ |
| fresh               | 100            | header、100 entries、100 milestoneを作る         |
| fresh               | 500 / 24,000   | skipとしてreject                                 |
| exact milestone 100 | 100            | same-gate retry。producer / append / truncateは0 |
| exact milestone 100 | 500            | entries 100..499と500 milestoneを追加            |
| exact milestone 100 | 24,000         | 500 gate skipとしてreject                        |
| exact milestone 500 | 100            | lower targetとしてreject                         |
| exact milestone 500 | 500            | same-gate retry。producer / append / truncateは0 |
| exact milestone 500 | 24,000         | entries 500..23999とsealを追加                   |
| exact final seal    | 100 / 500      | lower targetとしてreject                         |
| exact final seal    | 24,000         | same-gate retry。producer / append / truncateは0 |

same-gate retryでもauthenticated scan、native sync、final reopenは行うため、「filesystem operationが0」という意味ではない。0なのは新しいproducer call、line append、tail truncationである。

milestoneがearly / late / duplicate、100 markerなしでentry 100を越える、500 markerなしでentry 500を越える、両markerなしでsealする、24,000を超えてentryを足す、seal後に完全lineを足す場合もfail closedである。完全なlineだがcanonical JSON、exact key set、parent identity、semantic evidence、MACのいずれかが違う場合はcorruptionとしてrejectし、都合のよいprefixへ巻き戻さない。

## 6. torn tailは現在gateの未完了部分だけ回復する

incomplete final fragmentは、newlineで終わる完全な不正lineとは別に扱う。scannerは最後のauthenticated complete lineまでのbyte offsetを保持するが、requested gateがそのtorn tailを所有できる場合だけ、そこへtruncateしてresumeする。

| durable authenticated prefix   | requested gate | torn tailの扱い                                 |
| ------------------------------ | -------------- | ----------------------------------------------- |
| header〜100 marker前           | 100            | current gate内なのでtruncate / resume可         |
| exact 100 marker + fragment    | 100            | 次の500 gateが始まった可能性があるためreject    |
| exact 100 marker〜500 marker前 | 500            | current gate内なのでtruncate / resume可         |
| exact 500 marker + fragment    | 500            | 次の24,000 gateが始まった可能性があるためreject |
| exact 500 marker〜seal前       | 24,000         | current gate内なのでtruncate / resume可         |
| exact seal + fragment          | 24,000         | post-seal corruptionとしてreject                |

たとえば100番目のentryや100 markerのpartial writeは100 gateが回復できる。一方、100 markerがdurableになった後のfragmentを100 gateが消すと、500 gateで始まった正当な探索結果かもしれないbytesをlower authorityが破壊する。このためmarker完成後は次gateだけが未完成tailを所有する。同じ規則を500 markerとfinal sealにも適用する。

search実行はcrash位置によってat-least-onceになり得るが、HMAC streamへdurableに受理されたparentとmilestoneはexact-onceである。完全lineのMAC再検証、current-gate限定truncation、strict input-index appendを組み合わせ、再探索と二重受理を区別する。

## 7. 実測はv2 baselineとv3 placeholderを分ける

v2のaccepted 24,000-parent scan-loadは比較用のhistorical baselineとして残す。これはv3の成功値ではない。

| v2 historical identity / measurement | accepted value                                                     |
| ------------------------------------ | ------------------------------------------------------------------ |
| source commit                        | `017692c7a076babbd40e7be0b14ea27d9988fa6c`                         |
| harness SHA-256                      | `23578cbf11deafb49cd288f38d9f3ec081e76d0f41a5b2948b3ccf08fabfb9a2` |
| wall time                            | `435.60 s`                                                         |
| valid stream                         | `429,245,287 bytes`                                                |
| stream SHA-256                       | `8039ec02f3421d934d0a9f1d10b47a97f273e397ad414e64db50bded13c498ac` |
| maximum RSS                          | `483,491,840 bytes`                                                |
| new temporary roots after exit       | `0`                                                                |

v3はheader、HKDF / MAC domain、2 milestone line、final validation policyが違う。v2 bytesへmarker 2行分を単純加算してもv3実測にはならない。source freeze後、同じmachine / runtime条件を固定して各gateとfull resumeを測る。

| v3 evidence                                  | 100 gate | 500 gate | 24,000 gate |
| -------------------------------------------- | -------: | -------: | ----------: |
| source revision                              |  `[TBD]` |  `[TBD]` |     `[TBD]` |
| expected total JSONL lines                   |      102 |      503 |      24,004 |
| actual bytes                                 |  `[TBD]` |  `[TBD]` |     `[TBD]` |
| wall time                                    |  `[TBD]` |  `[TBD]` |     `[TBD]` |
| maximum RSS                                  |  `[TBD]` |  `[TBD]` |     `[TBD]` |
| maximum line / read request                  |  `[TBD]` |  `[TBD]` |     `[TBD]` |
| producer / completed / resumed               |  `[TBD]` |  `[TBD]` |     `[TBD]` |
| same-gate retry producer / append / truncate |  `[TBD]` |  `[TBD]` |     `[TBD]` |

validation結果も、sourceとtestsが確定する前に数字を先取りしない。

| validation                            | result  |
| ------------------------------------- | ------- |
| focused v3 checkpoint tests           | `[TBD]` |
| v2 compatibility regression tests     | `[TBD]` |
| 24,000 scan-load / evidence validator | `[TBD]` |
| full Vitest                           | `[TBD]` |
| TypeScript / scoped ESLint / Prettier | `[TBD]` |
| Next production build                 | `[TBD]` |

## 8. validation境界と明示的nonclaims

この変更のsource contractとsynthetic testsが通っても、production runや棋力証明にはならない。現在の明示的な件数は次のとおりである。

| 対象                                          | この変更での実行・変更・claim |
| --------------------------------------------- | ----------------------------: |
| production coordinator invocation             |                             0 |
| deployment key-authority / production key use |                             0 |
| real Floodgate dataset / holdout read         |                             0 |
| teacher labels produced                       |                             0 |
| training runs                                 |                             0 |
| QAT seed 42 / 43 / 44 runs                    |                     0 / 0 / 0 |
| model checkpoint / weight exports or changes  |                             0 |
| live evaluation-function / weight activation  |                             0 |
| matches / 81Dojo games                        |                             0 |
| formal A/B pairs                              |                 0 / 192 pairs |
| formal A/B games                              |                 0 / 384 games |
| playing-strength claims                       |                             0 |

test dependencyの32-byte root keyと`key_id`は、deployment key authorityが実行されたことを示さない。`key_id`はkey truth、key secrecy、production originの証明ではない。sourceはreal dataset path、holdout reader、teacher JSONL writer、training process、weight path、browser deployment、match runnerを受け取らない。

HMACが示せるのは、trusted key holderが作ったbytesがrun / stage / full input / runtime receipt / chainへ結ばれ、non-key-holderによるpersisted-byte tamperingを検出できることだけである。engine binaryの真正性、runtime callの実行、label quality、non-repudiation、anti-rollback、hostile same-process mutationへの隔離は示さない。100 / 500 prefix、24,000 seal、synthetic validationのどれも「評価関数が強くなった」「高段で安定した」というclaimではない。

## 9. 24,000後にも残る棋力gate

source freezeとvalidationの後に進める順序は、同じfull authenticated inputと同じrun identityを保った100 → 500 → 24,000である。各prefixではthroughput、timeout、failure、bounded abort / drain、resume、durability、score分布を監査する。100 / 500用の別sliceや別dataset identityを作らず、24,000 sealまではholdoutを開かない。

24,000 teacher checkpointがsealedになっても、棋力評価は始まったばかりである。次に固定QAT seed 42 / 43 / 44を事前登録どおり実行し、結果を見てseedを差し替えない。その後にfresh selection、fresh final、legacy final、known regression、production parityを順に通す。

内部gateをすべて通過したcandidateだけが、**formal 192-pair / 384-game A/B**へ進める。現在値は**0 / 192 pairs、0 / 384 games**である。そのA/Bも通過した後にだけ、別の明示承認を得て81Dojo calibrationを始める。したがってこの変更の終了条件は「v3 durability contractを閉じたこと」であり、「安定して高段になったこと」ではない。
