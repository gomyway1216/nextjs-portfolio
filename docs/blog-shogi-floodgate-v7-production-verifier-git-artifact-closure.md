# production verifierをGit source/artifact closureへ固定する — Floodgate v7

> [PR #474](https://github.com/gomyway1216/nextjs-portfolio/pull/474)は、production registryを作る前とprefix-100 preflight中に、固定verifierのtracked source treeと7個のpinned receipt/evidence artifactをGit履歴へ閉じる。review修正後の実装headは`9f647bef3568634f3b3c7634fb66a79ffa090723`、固定verifierは`e8a9197608cb48b1160b6707d97b0c4f78f90a1d`である。この変更ではproduction registry、gate、teacher、label、training、selection、対局、live activationを一度も実行しておらず、runOp1も変更していない。English version: [blog-shogi-floodgate-v7-production-verifier-git-artifact-closure.en.md](./blog-shogi-floodgate-v7-production-verifier-git-artifact-closure.en.md)

## 1. 結果と現在地

PR #473は通常のmerge commit `7e4a4a9ffe5960a013d409f886d73e6041c7789e`で統合済みである。その上にPR #474をready-for-reviewとして作成し、verifier revision、tracked source tree、pinned artifact、producer ancestryを一つのfail-closed readiness境界へまとめた。[機械可読証拠](./data/floodgate-v7-production-verifier-git-artifact-closure-2026-07-16.json)は実装headと、evidence作成時点でPRがopen、CIが進行中、reviewと通常mergeが未完であることを分けて記録する。

これはproductionを開始した証拠ではない。readiness successはregistry authority、gate authority、training label、棋力のいずれにも昇格しない。

## 2. なぜrevisionの更新が必要だったか

以前の固定revisionは、production consumerが要求するresult receiptと6個のexecution evidenceを含まず、receipt producerもancestorにできなかった。そのrevisionのままcreate-only registryを作ると、exact clean HEADとartifact provenanceを同時に満たせない設定を永続化する危険があった。

そこで固定revisionを、必要なsourceとartifactの両方を含む`e8a9197608cb48b1160b6707d97b0c4f78f90a1d`へ進めた。既存registryの上書き、adopt、rotationは行っていない。

## 3. 313c → 0f3 → e8 のprovenance chain

closureは次の順序をGit ancestryで要求する。

```text
313c7699e206332f9d380858d90d0326a0a1fd12
  -> 0f3cadb76ec46eb82d5bc9623277525ce1d2252b
  -> e8a9197608cb48b1160b6707d97b0c4f78f90a1d
```

最初は独立verifier revision、中央はpinned receipt/evidence producer、最後は今回選んだproduction verifierである。artifactが現在のworktreeに存在するだけでは足りず、producer revisionのGit blobとbyte一致し、producerが選択revisionのancestorでなければfail closedする。

## 4. exact clean tracked source tree

選択したe8 treeは**1,431 blobs / 21,322,485 bytes**である。readinessはstandard Git ignore rulesに従うnonignored statusがcleanであること、HEADがexact revisionであること、index entryに特殊flagがないこと、全tracked entryのmodeとbytesがHEAD treeに一致することを検査する。

このexact-clean検査をartifact検査の前後に1回ずつ行うため、tracked treeだけでも最低**2回 / 42,644,970 bytes**を読む。ignored entryはclosureの対象外である。全tracked bytesを読むので、これはメタデータだけの検査ではない。

## 5. 7 artifactと113,325 bytesのclosure

対象はresult receipt 1個と、publish / verifyそれぞれのstatus、output、time evidenceの計6個、合計**7 artifacts / 37,775 bytes**である。7個をworktreeからartifact検査の前後に2回読み、producer revisionのGit blobを1回読む。

したがってartifact byte readの最小内訳は、worktree **75,550 bytes**とGit blobs **37,775 bytes**、合計**113,325 bytes**である。前後snapshotのidentityとbytesが一致し、receipt内容、execution evidence、固定ancestryがすべて通った場合だけreadiness receiptを返す。

## 6. public privacyとsingle-use identity binding

production entry pointはoperator指定のrepository pathやrevision overrideを受け取らない。現在のOS user informationから固定repositoryをprivateに導き、readiness receiptはpath、user identifier、filesystem identity、private digest value、private configurationを公開しない。

receiptにはprivate identity bindingがあり、provisionerまたはpreflightが**readiness receiptごとに1回だけ**claimできる。別user contextへの差し替え、同じreceiptのreplay、malformed receiptはいずれも失敗する。ただしこれは任意の同一user権限processを隔離する保証ではない。

## 7. v1 readinessとv2 consumer boundary

新しいleaf contractは`shogi-floodgate-v7-production-connector-verifier-readiness-v1`である。一方、closure confirmation fieldと`verifier-readiness` failure phaseを追加した既存consumerは互換なv1のままにせず、次をv2へ更新した。

- registry provisioner successとprovisioning CLI failure
- prefix-100 preflight coreとclaim boundary
- preflight under-lock outcome
- preflight CLI successとfailure

旧v1 receiptはcurrent sourceで新しい成功として受理されない。closure fieldを知らないconsumerがpartial successを作ることも、古いreceiptが新しい検査を通ったように見えることも防ぐ。

## 8. install前の検査とpreflight再検査

provisionerはverifier readinessをcurrent-key binding、approved enrollment、entropy取得、create-only installより前に検査する。ここで失敗すればphaseは`verifier-readiness`、registry creation countは0、fresh invocation requiredで終了する。

prefix-100 preflightはfixed registry configurationをclaimした後、runs namespaceやdeployment keyを検査する前にreadinessを再実行する。失敗時はsanitized NO-GOとなり、gate invocation、checkpoint、namespace mutationを開始しない。provisioning時の成功を将来のpreflight authorityとして再利用しない。

## 9. full verifier実測との違い

既存production full verifierのaccepted runは**1045.52 seconds / 5,629,476,864 bytes maximum RSS**、confirmation runは**1089.52 seconds / 5,492,424,704 bytes maximum RSS**だった。これらはexternal role bundleを開き、全roleと内容を検証する重い境界である。

bounded read修正後のcurrent read-only closureは同じclean e8 worktreeで3回繰り返し、全てexit 0だった。実測は順に**0.68 / 0.53 / 0.53 seconds**、maximum RSSは**179,748,864 / 186,564,608 / 186,368,000 bytes**で、各runともswap 0、block output operations 0だった。これはOS計測値であり、source境界がpersistent content / namespace writeを実行しないこととは別に記録する。external role-bundle file readは0、full verifier invocationも0である。ただし高速なclosureはfull verifierと同等の検証ではない。source/artifact provenance readinessを先に確認するものであり、bundle内容の完全検証を置き換えない。readによるaccess-time不変、filesystem全体のatomic snapshotもclaimしない。

## 10. PR #474のvalidation境界

review修正後の実装head `9f647bef3568634f3b3c7634fb66a79ffa090723`では、exact Git revision helper、7-artifact closure、readiness leaf、provisioner / preflight / CLI integrationを別commitとして保持した。source regressionはexact revision、dirty/nonignored worktree、tracked byte/mode差、artifact差、ancestry差、identity replay、旧v1 shape、fail-before-install、preflight recheckを含む。Copilotのactionable comment 2件は修正・reply・resolve済みでunresolved 0、Geminiのactionable findingは0だった。

初回evidence commit `779fe1b607403848ca3c4c33d8e7aeb9c7dea7d7`のexact treeを対象にしたfinal local validationは、full Vitest **150 files / 2,804 tests PASS**（duration 155.73秒、wall 156.22秒、maximum RSS 4,373,692,416 bytes、swap 0）、production build **193 / 193 pages PASS**（wall 35.21秒、maximum RSS 2,654,404,608 bytes、swap 0）だった。ML stdlibは58 / 58、`npm audit`はvulnerability 0だった。`9f647be`で実施したfocused Git / receipt test 2 files・29 / 29、TypeScript、上記closure 3回も別の実測として保持する。

GitHubの`9f647be` headではTest and buildが146 passed / 3 skipped files、2,696 passed / 99 skipped testsまで完了したが、unhandled rejection 1件でFAILした。race testが意図したrejectionへのhandlerを`await`後に付けており、遅いCIでunhandledになるtest harness defectだった。repair `c26e0cc8639286cacf3a38e49141bf86b983b3df`はhandlerを即時attachし、同じtest fileを5回連続PASS、TypeScriptもPASSした。Darwin、E2E、audit、Vercelは`9f647be`でPASSしたが、Test and buildのfailureを相殺しない。

このvalidation refreshを作成した時点の[PR #474](https://github.com/gomyway1216/nextjs-portfolio/pull/474)はready openで、Copilotのactionable comment 2件は対応・resolve済み、Geminiのactionable findingは0だった。test-only repairとrefreshを含むheadのCIは未実行、通常mergeもpendingである。過去の`9f647be` CIをgreenとして書き換えず、再実行前の結果をPASSとして先取りしない。

## 11. production executionはすべて0

PR #474でのproduction registry provision、prefix-100 / 500 / final-24000 gate、teacher generation、teacher label、training、optimizer step、candidate selection、candidate promotion、formal A/B、external calibration、live activationはすべて0である。external role-bundle readとfull verifier executionも0、production weight overwriteも0である。

runOp1はcurrent production evaluatorかつrollback evaluatorのままで、live weightは変えていない。したがってこのclosureを「強くなった」「高段になった」という証拠には数えない。

## 12. 次の安全な順序と棋力判定

PR #474をreview・CI後に通常mergeし、次にauthenticated 24,000 training-label finalizerを別PRで完成させる。両方がmergeされるまではcreate-only registryをprovisionしない。その後だけ、registry、review済みkill-drill、prefix-100、prefix-500、final-24000、teacher label、3 seed training、selectionへ順に進む。

候補が得られてもliveへ直結しない。正式A/Bは**192 color-swapped pairs / 384 games**、外部校正は**200 games**である。安全・品質・棋力gateとrollback rehearsalの証拠が揃うまでrunOp1を維持し、安定した高段という最終判定を保留する。
