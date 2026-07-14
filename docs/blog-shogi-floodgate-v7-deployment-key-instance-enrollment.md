# Floodgate v7 deployment key instanceのinspectionとcontrol-plane enrollmentを分離する

> [deployment-key provisioner](./blog-shogi-floodgate-v7-deployment-key-provisioner.md)は意図的に`key_instance_id`を返さない一方、本稿作成時のhistorical [production checkpoint connector](./blog-shogi-floodgate-v7-production-checkpoint-connector.md) v1はkey authorityを開く前にcaller-supplied `expectedKeyInstanceId`を要求していた。本稿は、authorityと同じpublic instance IDを導出しながら観測を承認へ変えない、狭いcandidate inspectorを実装・検証した記録である。source、operator CLI、focused / related / full tests、Python regression、TypeScript、production build、format、lint、audit、independent review、PR #459の実装head CIは完了し、PRはregular merge commit `19e826f`で統合された。actual-home key-byte inspectionとcontrol-plane pinningは**0 / 0**である。実測7時間51分のfull-bundle verifierも別blockerとして残る。real data、teacher、training、weight、live evaluation function、対局、棋力のclaimは本稿から生じない。English version: [blog-shogi-floodgate-v7-deployment-key-instance-enrollment.en.md](./blog-shogi-floodgate-v7-deployment-key-instance-enrollment.en.md)

後続のapproved record / opaque single-use capability境界の設計と現在地は、[approved-key enrollment control plane](./blog-shogi-floodgate-v7-approved-key-enrollment-control-plane.md)へ分離した。現行connector v2はraw `expectedKeyInstanceId`をpublic optionとして受けず、approved recordからmintされたopaque single-use capabilityだけを同期claimする。このv2 deltaはenrollment 21 / 21、connector 111 / 111、combined focused 132 / 132、related 335 / 335、stable full 2,245 / 2,245をlocalでPASSし、production build、TypeScript、lint / format、audit、final independent reviewも完了した。ready PR / CI / regular mergeはpendingである。actual production recordのcreation / installation / loadとconnector executionは、引き続き**0 / 0 / 0 / 0**であり、live weightと棋力claimも変わらない。

## 1. 現在地と、この境界が閉じる1つのgap

| 項目                                     | current status              | 意味                                                     |
| ---------------------------------------- | --------------------------- | -------------------------------------------------------- |
| candidate-inspector contract             | implemented                 | approval / persistenceを含まないcandidate-only境界       |
| inspector source / operator CLI          | completed                   | import-safe、argumentless、actual executionは0           |
| focused / related tests                  | 9 / 9、116 / 116 PASS       | temporary-key cryptographyとactual-home metadata guard   |
| TypeScript / Prettier / ESLint           | PASS                        | exact current diffのlocal validation                     |
| full regression / build                  | PASS                        | 119 files / 2,156 testsとproduction build                |
| Python regression / npm audit            | 58 / 58 PASS、0件           | stdlib suiteとdependency audit                           |
| independent code / test review           | P0 = 0、P1 = 0、P2 = 0      | 2系統の修正後sealが完了                                  |
| pull request / CI / merge                | #459 / 6 of 6 PASS / merged | implementation head `4eda5f4`、regular merge `19e826f`   |
| actual fixed-home candidate inspection   | 0                           | このinspector候補はproduction key byteをまだ読んでいない |
| approved control-plane enrollment record | 0                           | expected instanceは承認も固定もされていない              |
| production connector gates               | 0                           | 100 / 500 / 24,000は未実行                               |
| live weight / evaluation-function変更    | 0                           | 既存production bytesは不変                               |

metadata-only readiness probeはfixed slotに安全そうなfileがあるかを答えるが、key byteを読まずinstance IDも返さない。create-only provisionerはsecretを配置できるが、意図的にcryptographic readerにはならない。connectorが同じexecution中にinstanceを発見し、その値をexpectationとして無条件採用してはならない。

不足する境界は、次の明示的な2段階である。

1. fixed keyをinspectし、non-secretな**enrollment candidate**を出す
2. candidateを別にreviewし、approved trusted control-plane recordとして永続化する

historical connector v1へraw `expectedKeyInstanceId`を渡せるのは2段目だけだった。現行v2はraw IDを受けず、2段目のapproved recordからmintされたopaque capabilityをclaimしてinternal expectationを得る。

## 2. Candidate-inspector APIとauthority境界

production entry pointはzero-argumentの`inspectFloodgateV7DeploymentKeyInstance()`である。current processのeffective UIDと`os.userInfo()`からhomeを取得し、caller指定のpath、key bytes、expected ID、output path、approval flag、callbackを受けない。

arity-1の`inspectFloodgateV7DeploymentKeyInstanceCoreForTests(dependencies)`はtemporary-key test専用である。result typeは`FloodgateV7DeploymentKeyInstanceEnrollmentCandidateReceipt`である。

2つのdedicated package commandはoperational orderを明示するが、どちらも自動実行にはしない。

| command                                                    | boundary                                    | actual execution |
| ---------------------------------------------------------- | ------------------------------------------- | ---------------: |
| `npm run --silent shogi:floodgate-v7-key-provision`        | write: fixed keyへのexclusive provision 1回 |                0 |
| `npm run --silent shogi:floodgate-v7-key-instance-inspect` | read-only: candidate JSON 1件をstdoutへ出す |                0 |

両command fileはargumentを拒否する。provisioningはwriteであり、独立したoperator explicit approvalを必要とする。このcandidate inspectorの実装、文書化、test、review、merge中には絶対に呼ばない。inspectionはread-onlyだが、ID導出に必要な短時間だけreal fixed secretを読むため、後の別承認を必要とする。unit testが呼ぶのはtemporary-home coreだけである。test、lint、build、PR作成 / merge、CI、application deploy、module importは、どちらのpackage commandも実行しない。

inspectorが行えることは次だけである。

- fixed current-EUID key deploymentを1つ開く
- held descriptorからexact 32 bytesを読む
- authority-compatibleなpublic instance IDを導出する
- held / named filesystem identityを再検証する
- secretを含まないdeeply frozen candidate receiptを返す

keyのcreate、overwrite、rotation、delete、backup、export、run authorization、checkpoint key導出、arbitrary signing、enrollment record書込、自己承認、connector呼出、dataset read、runtime起動はできない。

これはcandidate-inspection authorityであり、provisioning authority、execution authority、control planeではない。

## 3. Key-instance導出はauthorityとexact一致させる

inspectorは2つ目のfingerprint方式を発明しない。既存deployment-key authorityと同じconstantとbyte operationを使う。

```text
instance_key = HKDF-SHA256(
  root_key,
  salt = "shogi-floodgate-v7-deployment-key-instance-salt-v1\0",
  info = "shogi-floodgate-v7-deployment-key-instance-key-v1\0",
  length = 32
)

key_instance_id = HMAC-SHA256(
  key = instance_key,
  data = "shogi-floodgate-v7-deployment-key-instance-id-v1\0"
).hex_lowercase
```

receiptのalgorithmは`hkdf-sha256-domain-separated-hmac-sha256-v1`で、resultはexact 64 lowercase hex charactersである。これはraw-key hashでもkey materialでもない。32-byte rootを公開せず、後のauthoritative executionでdifferent / rotated key materialを拒否するためのstable public identifierである。ID単体では、同じkey bytesが別inodeへcopyされていないことまで証明しない。

parity testではsynthetic keyを使い、candidate inspectorのIDと既存authorityの`key_deployment.key_instance_id`を比較する。手写しでずれたconstant、異なるstring encoding、NUL terminator省略、異なるHKDF argument順、raw SHA-256はfailureである。

## 4. 1回のheld read、final revalidation、bounded secret lifetime

production pathはpathname-only readではなく、authorityと同じheld-descriptor shapeを取る。

1. POSIX effective-UID support、current EUIDと`os.userInfo().uid`の一致、canonical non-root homeを要求する。
2. fixed parentと`root-key.bin`だけを組み立てる。symlink traversalのないcanonical real pathを要求する。
3. named parent / key metadataをsnapshotする。current-EUID owner、exact `0700` directory、exact `0600` regular file、`nlink = 1`、exact 32 bytesを要求する。
4. parentを`O_DIRECTORY | O_NOFOLLOW`、keyを`O_NOFOLLOW`で開き、held `fstat` identityとnamed snapshotの一致を要求する。
5. offset 0からexact 32 bytesを読み、33 byte目でEOFを要求する。short / oversized readはfail closedにする。
6. domain-separated instance keyとpublic IDだけを導出する。
7. owned root-key、instance-key、extra-read bufferを、次のrevalidation / descriptor-close awaitより前に同期zeroizeし、all-zeroを確認する。failure pathにも同じcleanup ruleを適用する。
8. held / named parent / keyのidentity、owner、mode、link count、sizeを再検証する。replacementまたはmetadata changeがあればreceiptを出さない。
9. held descriptorsを両方closeする。cleanup failureをsuccessful candidateとして返さない。

`held_descriptors_revalidated: true`が意味するのは、このinspection中に1つのstable fixed deploymentを観測したことだけである。将来のexecution leaseではない。connector実行時にはkey authorityが再openし、authoritative checkを繰り返す必要がある。

zeroizationが対象にするのは、このmoduleが明示的に所有するbufferである。JavaScript heap、kernel page cache、filesystem、SSD、backup、hardware wear-levelingからのphysical erasureはclaimしない。

## 5. Test coreはactual homeを絶対にinspectしない

test helperへhomeをinjectできると、`test-only` receiptを返しながら誤ってreal fixed keyを指すshortcutが生じる。このためtest boundaryはkey open / readより前にguardを持つ。

test coreは次を要求する。

- injected UIDがcurrent effective UIDと一致する
- production homeを`os.userInfo()`から独立取得する
- そのhomeとのdirect string equalityを拒否する
- 両homeをresolveし、canonical-path equalityを拒否する
- same-device / same-inode aliasを拒否する
- separationを確立できなければfail closedにする

cryptographic success / failure testはtemporary current-EUID homeとsynthetic 32-byte secretだけを使う。別のguard testはactual homeとsymlink aliasのmetadata-only snapshotを取り、test coreへ渡してkey open / observerより前に拒否されることを確認するが、actual key bytesは読まない。test hookはrevalidation / zeroization順序を証明する目的でinternal copyを観測できるが、zero-argument production wrapperには存在しない。actual-home key-byte inspectionは別途承認されたoperational actionであり、unit-test side effectにはしない。

## 6. Receipt shapeはapprovalを意味しない

`FloodgateV7DeploymentKeyInstanceEnrollmentCandidateReceipt`のtop-level fieldsは次である。

```text
contract
status
claim_boundary
trust_boundary
execution_boundary
algorithm
key_deployment
test_boundary
nonclaims
```

`key_deployment`はfixed layout / key ID、owner UID、exact mode / size / link count、parent / key device / inode identity、public `key_instance_id`、そのalgorithm、held-descriptor revalidationだけを記録する。absolute home path、root-key byte、derived-key byte、key hash、authorization MAC、checkpoint key、generic signatureを含まない。

statusはexact `fixed-key-instance-candidate-observed-and-held-revalidated-not-approved-or-persisted`である。nonclaimsではkey create / write、key-material disclosure、root-key-hash disclosure、key-path disclosure、authorization MAC、run / stage authorization、checkpoint-key capability、control-plane approval、record persistence、connector execution、checkpoint、dataset read、runtime、label、training、weight、live activation、playing strengthをfalseに保つ。expected-instance pinning、provisioning、rotation、matchもclaim boundary外であり、field省略から暗黙にclaimしない。

approved enrollmentは後続control-plane artifactである。そのworkflowはcandidateをreviewし、exact canonical receipt bytesとdigestを保存し、approved public IDをfixed `key_id` / deployment identityへbindしてapprovalをaudit可能にする必要がある。key bytesは保存しない。このinspector候補はtrusted storeを定義もwriteもしないため、有効なactual-home candidateを得ても`control_plane_approval = false`のままである。

historical connector v1はapproved public IDをraw pre-pinned expectationとして受け取った。現行v2はapproved record由来のopaque capabilityを同期claimし、そのclaimからpublic ID、owner UID、parent / key device・inodeをinternal expectationとして得る。authoritative prepareがIDとdeployment identityを再導出し、exact equalityを要求する。したがってdifferent / rotated key materialを自動的にnew expectationへ変えず、mismatchとして拒否できる。同一bytesのfilesystem replacementもdevice / inode比較でapproved deployment identityと区別されるが、rotation / recoveryは別のoperational workflowである。

## 7. Failure / retry rules

| 観測                                             | candidate result | operational action                                             |
| ------------------------------------------------ | ---------------- | -------------------------------------------------------------- |
| slot absentまたはmetadata unsafe                 | receiptなし      | readiness / provisioning reconciliationへ戻る                  |
| symlink、alias、wrong owner / mode / size / link | receiptなし      | inspector内でrepairせず停止する                                |
| short / oversized held read                      | receiptなし      | fixed deploymentを調査する                                     |
| read中にidentityが変化                           | receiptなし      | race / replacementとして停止する                               |
| zeroization、revalidation、close失敗             | receiptなし      | candidateをpersistしない                                       |
| valid candidate、control-plane reviewなし        | unapproved       | connectorはblockedのまま                                       |
| approved recordと後続authority IDが不一致        | connector reject | rotation / wrong recordを調べ、expectationをその場で更新しない |

inspectionを再実行すれば同じpublic IDを得る場合があるが、repeatはapprovalではない。rotationとrecoveryも別のexplicitly authorized workflowである。

## 8. 7時間51分のfull-bundle verifierはblockerのまま

accepted label-free role-bundle verificationは`2026-07-12T04:20:01Z`から`2026-07-12T12:11:22Z`まで、`28,281,000 ms`、すなわち**7時間51分21秒**かかった。このmeasurementはcomplete input-integrity verificationのものであり、key inspectionやteacher searchの時間ではない。

current production connectorはpathless 24,000-row callbackへ入る前に、complete production full-bundle verifierを通る。enrollmentが閉じるのはtrusted expected-instance inputの欠落だけである。そのverifierを短縮もskipもせず、candidate receiptをdataset-verification cache tokenとして使うこともできない。

real 100-parent gateより前に、このwall-time issueを明示的に閉じる必要がある。approved execution boundaryでcomplete verifierをbudget / measureするか、同等以上のfreshness / filesystem closureを持つauthenticated reusable training projectionを別設計する。verifierのsilent skipはoptimizationではない。従来の100親teacher約3.5分という推定を、この7時間51分境界が未解決のままend-to-end wall timeとして示してはならない。

## 9. Validation planとnonclaims

focused 9 testsはdeterministic derivation / existing-authority parity、wrong domain / raw SHA / authorization-MAC separation、exact receipt / all nonclaims / deep freeze / no byte-view、direct / symlink-alias actual-home rejection、filesystem-root rejection、wrong metadata、initial symlink、held-versus-named replacement、short / oversized size、hook-before-await ordering、success / observer-failure zeroization、sanitized error、CLI import / argument boundaryを検査してPASSした。

関連authority、readiness、provisioner、connectorを含む5 files / 116 tests、full Vitest 119 files / 2,156 tests、Python stdlib 58 / 58、TypeScript、production build、formatting、npm audit 0件はPASSした。full lintもerror 0で、今回のdiffと無関係な既存157 warningsだけを報告した。descriptor-close failure injectionと全failure phaseの個別zeroizationは未網羅で、個別evidenceはpendingのままである。source reviewと実装上のcleanup orderingは、そのtest evidenceの代替ではない。独立した2系統の修正後reviewはsecret lifetime、CLI stream failure、candidate observation / control-plane approvalの分離を確認し、P0 / P1 / P2すべて0でsealした。ready PR #459では3 review threadsを修正・返信・resolveし、implementation head `4eda5f4`のCI 6 / 6がPASSした。CI unit testは119 / 119 files、2,142 PASS + environment-dependent 14 SKIP（total 2,156）、production buildもPASSした。

review修正後に他のCPU調査と同時実行したlocal full rerunは、無関係なstable-WASM workerの3秒initialization timeout 1件で118 / 119 files、2,155 / 2,156 testsとなった。同じ53-test fileは直後の単独実行で53 / 53 PASSし、上記CIもcurrent implementation headでPASSした。このtransient resultをenrollment test failureとは数えないが、途中dataとして記録する。

現在のlocal implementation時点では次が事実である。

- metadata-only fixed-home readiness: **`not-provisioned`**（parent / keyとも`absent`、key bytes readはfalse）
- temporary-home inspector core executions: **test-only**
- production wrapper / actual-home CLI executions: **0**
- actual provisioning-command executions: **0**
- actual production-key inspections: **0**
- approved / persisted enrollment records / expected-instance pinning: **0**
- real role-bundle connector callbacks: **0**
- production 100 / 500 / 24,000 gates: **0**
- teacher labels、optimizer steps、candidate weights、formal games、ratings: **0**
- production weight overwrite / live evaluation activation: **unchanged**

## 10. 承認後に残るexecution order

PR #459のregular mergeは完了した。残るoperational orderは次である。

1. keyがまだabsentなら、別のoperator approvalで`npm run --silent shogi:floodgate-v7-key-provision`を実行し、non-secret provision receiptを保存する。このwrite commandのactual executionは現在**0**である。
2. freshな別承認processで`npm run --silent shogi:floodgate-v7-key-instance-inspect`を1回だけ実行し、stdoutへ出るone-line non-secret candidate JSONを保存する。このread-only actual-home commandのactual executionも**0**である。
3. approved enrollment / trusted control-plane recordをreview / persistし、opaque capabilityをmintする。step 2をself-approvalとして扱わない。
4. metadata-only readinessとclaimed approved identityを再確認し、7時間51分verifier blockerも別に解消する。
5. その後にだけ100-parent connector gateの別承認を求める。

どのstepもteacherを自動実行せず、modelをtrainせず、live weightを変更せず、stable high-dan strengthを確立しない。
PR mergeやapplication deployもstep 1 / 2を実行しない。
