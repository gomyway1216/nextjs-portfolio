# prefix-100をpreflightからpostflightまで同じouter lockで閉じる — Floodgate v7

> [fresh prefix-100 one-shot](./blog-shogi-floodgate-v7-fresh-prefix-100-one-shot.md)を実装・検証したPR #471は、通常のmerge commit `4a14507a5a228cac71c011c94989fa9307f8218a`で統合された。今回のローカル候補は、そのread-only preflight receiptを後の実行権限として再利用せず、**1回だけ取得した同じouter OS lock**の内側でpreflight、active lease、prefix-100 connector 1回、exact-100 postflightを直列化する。低レベルscan単体はcaller supplied anchorを確認するだけで、固定runnerが真正なconnector anchorと同じlock内のscan結果を合成した場合だけ、直前の認証済みscanとのcontinuityへ昇格する。これは独立したHMAC再認証ではない。この候補ではproduction command、namespace mutation、gate、teacher、training、weight、match、live activationを一度も実行しておらず、runOp1も変更していない。English version: [blog-shogi-floodgate-v7-prefix-100-same-lock-one-shot.en.md](./blog-shogi-floodgate-v7-prefix-100-same-lock-one-shot.en.md)

## 1. 結果と現在地

| 項目                 | ローカル候補の結果                           | productionへの意味                                                  |
| -------------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| prerequisite         | PR #471を通常merge済み                       | fresh preflightとdisposable kill-drillの境界はdefault branchにある  |
| same-lock owner      | source・adversarial testを追加               | 公開preflight receiptをgate authorityへ変換しない                   |
| preflight順序        | OS lock取得後、最初のcontrol mutationより前  | NO-GOならactive leaseもconnectorも開始しない                        |
| connector            | 固定prefix-100 ownerからexactly once         | generic production callbackやreceipt再利用を追加しない              |
| postflight           | low-level read-only scanを固定runner内で合成 | scan単体は非認証・非authorizingで、runnerだけがcontinuityへ昇格する |
| production execution | 今回は全て0                                  | registry provision、kill-drill、prefix-100もまだ実行しない          |
| evaluator            | runOp1のまま                                 | 棋力改善や高段到達の証拠ではない                                    |

この候補はready-for-reviewのPR #472として公開済みで、authoritative local validationは完了した。この記事と[機械可読証拠](./data/floodgate-v7-prefix-100-same-lock-one-shot-2026-07-16.json)は、GitHub CIとreviewだけを未完として分離する。

## 2. PR #471が閉じた前提条件

PR #471は、production namespaceを変更しないfresh zero-work preflightと、productionから隔離したprocess-death kill-drillを追加した。最終local validationはfocused 153 / 153、full 2,680 / 2,680、production build 193 / 193で、通常merge後のcommitは`4a14507a5a228cac71c011c94989fa9307f8218a`である。

そのPRで実施したproduction観測はread-only監査に限定され、固定`registry.json`不在によるsanitized `NO-GO`だった。今回の候補はその過去receiptを入力にせず、production commandも再実行していない。PR #471のread-only監査を今回のcommand数へ数え直すことも、過去の`NO-GO`を現在の`GO`として扱うこともしない。

## 3. なぜ別々のpreflightとgateでは足りないか

公開preflightがlockを解放した後、別processでgateを起動するまでの間にregistry、deployment key、runs namespace、outer controlが変わり得る。receiptが真正でも、その後のfilesystem stateは保証しない。したがって次の構成は許可しない。

```text
preflight under lock A -> unlock -> reuse public receipt -> gate under lock B
```

固定prefix-100 ownerだけがlockを一度取得し、その所有権を最後まで保持する。public receipt、CLI引数、environment override、operator指定pathをgate capabilityへ変換しない。

## 4. 1回のlock内に固定した順序

成功経路の順序は次で固定する。

1. fixed private registryをread-only descriptorで開き、共通outer OS lockを1回だけ取得する。
2. lock-held専用のopaque single-use capabilityでfresh prefix-100 preflightを実行する。
3. exact frozen/null-prototype `GO`だけを受け入れ、同じregistry identityとbytesを再検証する。
4. deployment keyをfreshに読み直し、最初にcaptureしたkeyとのexact一致を確認する。
5. 初めてouter control namespaceを準備し、認証済みactive leaseをpublishする。
6. active leaseにbindしたsingle-use connector capabilityで固定prefix-100 runnerをexactly once呼ぶ。
7. 固定runnerがconnectorの真正なfinal scan anchorをlow-level read-only exact-100 scanへ渡し、結果をexact検証してcontinuityへ昇格する。
8. runner receiptをouter ownerが同じlockの保持中にexact検証し、active leaseをretireする。
9. final namespaceを検証した後にdescriptorをcloseし、OS lockを解放する。

preflight、connector、postflightを別々のlock ownershipへ分割するproduction経路はない。prefix-500とfinal-24000の既存shapeは変更しない。

## 5. 最初のmutationより前のpreflightとkey再読込

preflightはouter control directoryの作成・active publicationなど、最初のcontrol mutationより前に完了しなければならない。NO-GO、malformed receipt、Proxy、accessor、extra field、unclaimed capability、例外、registry置換のどれでも、active lease publicationとconnector invocationを0のまま停止する。

さらにpreflight中のdeployment-key差し替えraceを閉じるため、preflight成功後もlockを保持したままproduction keyをfreshに読み直す。長さとbytesをconstant-timeで最初のprivate copyと比較し、不一致ならmutation前にfail closedする。fresh copyは比較後にzeroizeする。この再読込はkey rotation機能ではなく、1回のone-shot内で別keyを混ぜないためのrepairである。

## 6. active leaseとconnector exactly once

preflightを通過しただけではconnectorを直接呼べない。outer ownerは既存の認証済みactive leaseをdurableにpublishし、exact gateへbindしたsingle-use capabilityを固定runnerへ渡す。runnerがcapabilityをclaimしない、二重claimする、別gateへ使う、またはreceiptがexactでない場合は成功にしない。

connector開始後の失敗ではcheckpointがpersistした可能性を否定しない。自動retryやfresh runへの置換ではなく、既存のauthenticated evidenceとcheckpoint reconciliationを要求する。success stdout失敗もconnectorをもう一度起動する理由にはしない。

## 7. exact-100 postflightが証明する範囲

prefix-100 connectorはV3 streamを既存のHMAC authorityで認証し、final scanでworkのbytes、SHA-256、record数を得る。low-level scanはcaller supplied anchorを受け取り、次をread-onlyに観測する。

- runs directoryのentryが対象stageだけである。
- stageのentryが`work.jsonl`だけで、destinationとinner authorization leaseが不在である。
- runs、stage、workがcurrent EUID所有のexact private modeで、symlinkでない。
- workがregular file、link count 1で、held descriptorとnamed pathのidentity・size・mtime・ctimeが一致する。
- exact bytesだけを読み、unauthenticated tailやtorn final recordがなく、102 records / completed parent 100である。
- 再計算SHA-256がcaller supplied anchorと一致し、全descriptorをcloseできる。

low-level scan単体はouter lock、connector origin、anchorの真正性、authenticated continuity、gate authorityのどれもclaimしない。固定runnerだけが真正なconnector receiptからprivate anchorを構築し、同じouter lockの保持中にscanを呼び、そのexact observationを検証して`authenticated final scan continuity`へ昇格する。scan自身はdeployment HMAC keyを持たず、`independent HMAC authentication`を行わない。

scanはfile contentやnamespaceを書き換えるwrite operationを行わないが、readによるatime不変はclaimしない。filesystemをatomic snapshotにする、power-loss durabilityを証明する、arbitrary same-EUID hostile processを隔離する、とも主張しない。

## 8. failure、cleanup、receipt境界

postflightでextra entry、destination / lease出現、symlink、hardlink、owner / mode不一致、rename、same-size rewrite、record数・digest・末尾不一致、descriptor close failureのどれかを観測したら、runnerは`exact-prefix-100-postflight`で停止する。connectorは既に完了しcheckpointがpersistした可能性があるため、retry dispositionはcheckpoint reconciliationである。

prefix-100 success receiptだけにrunner-promoted continuity confirmationを追加する。low-level scan結果はproduction-authenticated receiptでもgate authorityでもない。prefix-500 / final-24000のsuccess・failure shapeは変えず、両gateがprefix-100 scanを誤って呼ばないことをtestで固定する。raw anchor、path、run ID、digest、filesystem identity、key materialはpublic receiptへ出さない。

## 9. local candidate validation

実装と記事はまだ統合中のローカル候補である。独立監査は、low-level APIがcaller path/anchorからproduction-authenticatedに見えるreceiptを作れたP1 overclaim、`throw undefined`がno-error sentinelと衝突し得るP2、`filesystem_mutated: false`がread時のatimeまで不変と読めるP2に加え、registry revisionをcurrent app HEADと誤認してfinalizer mergeをprovisioning blockerとしたP1 ordering overclaimを検出した。low-level scanの非authorizing化、明示的なerror-state sentinel、file-content / namespace writeとatime nonclaimの分離、historical verifier / artifact ancestry closureに基づくorderingへの修正は完了し、focused regressionは全てPASSした。

exact Node v22.13.0の安定したsource候補で、focused 9 files・179 / 179 PASS（wall 2.80秒、maximum RSS 282,869,760 bytes、swap 0）と、default concurrencyのfull 147 files・2,734 / 2,734 PASS（wall 159.48秒、maximum RSS 4,307,124,224 bytes、swap 0）を完了した。production buildは193 / 193 pages（wall 40.61秒、maximum RSS 2,590,867,456 bytes、swap 0）、TypeScript、changed-scope ESLint、Prettier、diff checkもPASSした。ML stdlibは58 / 58、`npm audit`はvulnerability 0だった。最初のfull、build、ML、auditは4-wayで並行実行したため、wall timeはその同時負荷を含む。

evidence更新後のdefault-concurrency確認runは、変更対象外の別々のsuiteで1件ずつ失敗した。1件目はstable-WASM workerの30秒startup timeout、2件目はstable proposal finalization fixtureのretry disposition差で、各suiteを直後に単独実行すると53 / 53、11 / 11でPASSした。これら2 runはauthoritativeへ数えない。resource contention仮説を再現可能な事実と混同しないため、classificationはnonfinal concurrency-flake candidateに留める。最終exact treeはworker上限8でfull 147 files・2,734 / 2,734 PASS（wall 150.96秒、maximum RSS 4,355,293,184 bytes、swap 0）を完了した。GitHubのrequired CIは別途default workflowで判定する。

これはauthoritative local validationであり、GitHub CIやreviewの完了証拠ではない。現在のevidence statusは`authoritative-local-complete-required-darwin-ci-pending`である。

最低限のmatrixは、1 lock / ordering、preflight競合中のrunner block、NO-GO時mutation 0、key再読込差し替え、registry revalidation、single-use claim、postflight exact namespace / identity / SHA / record / close、500 / final非回帰、private value非漏えい、日英12章・duplicate JSON key・privacy・stale A/B値拒否を含む。

same-lock ownerとreal-boundary integrationにはDarwin専用`runIf`があり、Ubuntu full suiteでskipされる経路をUbuntuのPASSだけでcover済みにしてはいけない。`.github/workflows/ci.yml`の`macos-latest` jobにある`Run Darwin prefix-100 same-lock one-shot adversarial tests` stepで、`tests/unit/ml/floodgateV7ProductionPrefix100SameLockOneShot.test.ts`と`tests/unit/ml/floodgateV7ProductionPrefix100RealBoundariesIntegration.test.ts`を同時に実行することをrequired CIとして固定する。このCIが未完ならfinal integrated validationは未完である。

## 10. 今回のproduction実行とnonclaim

今回のsame-lockローカル候補で新たに実行したproduction commandは0である。production registry provision、review済みkill-drill、prefix-100、prefix-500、final-24000、teacher generation、training、selection、candidate weight、formal A/B、external calibration、live activation、rollback activationも全て0で、production namespaceのread / mutationも行っていない。

これはPR #471で記録した過去のread-only監査が消えたという意味ではない。action classと変更単位を分け、今回のsource/test executionをproduction gateへ数えないという意味である。棋譜、row、position、label、private registry値をこの記事へ載せない。

## 11. compatible verifier closureより先にregistryを作らず、finalizerより先にreal gateを始めない

現在の`FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_REVISION`は、現在のmerged app HEADではなく、historical revision `b086243781396e2c197cc9e1cfab1fc6b773ae2a`へ固定されている。production training consumerが使うpinned role-bundle verifierは、固定repositoryのclean HEADが`verifier_revision`とexact一致することを要求する。同時に、byte-pinned result-verifier receipt / evidenceはproducer revision `0f3cadb76ec46eb82d5bc9623277525ce1d2252b`で初めて追加され、そのproducerが選択したverifier revisionのancestorであることも要求する。

`b086243`は`0f3cadb`より前で、必要なreceipt / evidence fileを含まず、`0f3cadb`は`b086243`のancestorではない。したがって現構成のままcreate-only registryをprovisionすると、clean HEAD一致と必要artifact / producer ancestryを同時に満たせない`verifier_revision`へregistryを固定し、利用不能にする。将来finalizerをmergeするとapp HEADが変わることは、このblockerの理由ではない。

独立registry監査は`e8a9197608cb48b1160b6707d97b0c4f78f90a1d`をevidence-backed viable candidateと確認した。`0f3cadb`はこのcandidateのancestorで、必要artifactを含み、clean detached worktreeのproduction full verifierもaccepted runとconfirmationの両方でexit 0だった。ただし現在のprovisionerはまだ`b086243`を固定しているため、`e8a9197`をreview済みcompatible closureとしてbindし、entropy取得やinstallより前にsource / artifact / ancestry closureをfail closedで検査する別repair PRが必要である。

24,000 workを認証済みtraining labelへ変換するfinalizerも、real gate開始前のoperational completenessとして別PRで実装・review・通常mergeする。ただしfinalizerが必要なのは`verifier_revision`をapp HEADへ一致させるためではない。

したがって安全な予定順序は次である。

1. same-lock one-shot候補を最終validation・review後に通常mergeする。
2. `e8a9197` candidateのbindingとfail-before-install closure checkを別repair PRで実装・reviewし、通常mergeする。
3. authenticated training-label finalizerを別PRで実装・reviewし、real gate開始前に通常mergeする。
4. 両方の前提を確認した後だけ、compatible closureへbindするcreate-only registryを一度だけprovisionし、postflightする。
5. reviewed disposable kill-drillを実行してevidenceを確認する。
6. prefix-100 one-shotを一度だけ実行し、exact-100 evidenceで停止する。

既存registryを上書き・adopt・rotateしてshortcutにしてはいけない。

証拠が揃う前にlive weightを変更しない。

## 12. 棋力目標と次の判定

runOp1はproduction evaluatorとrollbackのままである。今回の変更は安全な実行境界を閉じるもので、label、optimizer step、candidate、対局、Elo、段位を生んでいない。したがって「強くなった」「安定して高段になった」というclaimはまだできない。

prefix-100 evidenceを独立確認した後に500、24,000 finalization、warm-only QAT seeds、selection / sealed holdout、候補選抜へ進む。正式A/Bのcanonical規模は**192 color-swapped pairs / 384 games**である。そこでrunOp1に対する安全・品質・棋力gateを満たし、さらに外部200局校正と段階的0% live gate / rollback rehearsalを通した後にだけlive変更を判断する。
