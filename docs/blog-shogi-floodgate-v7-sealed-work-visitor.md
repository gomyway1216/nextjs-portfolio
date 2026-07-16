# validated entryを出力権限なしで観測する — Floodgate v7 sealed-work visitor

> V3 checkpoint scannerはprivateな`work.jsonl` streamをすでに認証しているが、検証済みcompleted-parent valueはscanner内部に閉じていた。今回、既存のsealed-final scanへnon-productionな同期internal visitor seamを追加する。visitorがentryを観測できるのは、そのentryが既存の構造、binding、canonical bytes、HMAC chain検査をすべて通過した後だけである。ただしvisitorはcapabilityではなく、enclosing scanを成功にせず、出力のwriteやpublicationを認可しない。この境界でproduction-executable reader、production command、dataset、weight、live evaluator、棋力証拠は変わらない。English version: [blog-shogi-floodgate-v7-sealed-work-visitor.en.md](./blog-shogi-floodgate-v7-sealed-work-visitor.en.md)

---

## 1. projectionにはまだauthenticated sourceが必要である

前段のtraining-label projectionは、構造的に検証済みのcompleted parent 1件を決定的な`shogi-sibling-v1` rowへ変換する。設計上、そのpure functionは`work.jsonl`をopenせず、checkpoint descriptorを保持せず、V3 HMAC chainやfinal-24000 originも証明しない。

一方、V3 scannerはheld file descriptorとcheckpoint keyを所有している間に、それらをすでに検査している。scan後にcaller-supplied cloneをもう一度parseすると、最も強いorigin boundaryを捨てることになる。必要なのは新しいpublic readerではなく、scanner内部の狭いobservation seamである。

## 2. このseamは意図的にnon-authorizingである

visitorは既存V3 scan内部のoptional test dependency `verifiedParentVisitorForTests`である。scannerが管理するcompleted-parent eventを受け取り、同じcall stack内でreturnする。stage lease、deployment key、publication transaction、consumer postflight capability、output descriptor、signing operationは受け取らない。

```text
held V3 work descriptor
          |
          v
既存のexact line + chain validation
          |
          +----> internal synchronous observation
          |
          v
残りのmilestone、seal、tail、snapshot、gate検査
```

eventを観測できたことが示すのは、そのentryがその時点までの検査を通ったことだけである。file全体がcomplete sealed-final streamである証拠にはならない。

## 3. exact final-24000は24,004 complete recordsである

sealed V3 streamのrecord layoutは1通りに固定される。

| record kind              |       件数 | 必須位置                                  |
| ------------------------ | ---------: | ----------------------------------------- |
| Header                   |          1 | 最初のcomplete record                     |
| Completed parent         |     24,000 | sequence / input index `0..23,999`        |
| Durable-prefix milestone |          2 | parent 100件目と500件目の直後             |
| Seal                     |          1 | 24,000 parentsと両milestoneの後           |
| **合計**                 | **24,004** | seal後にcomplete byteもpartial byteもない |

scannerのcomplete-record boundは`24_000 + 4`のままである。visitorがrecord数を変えたり、recordを挿入したり、milestoneをskipしたり、exact final gate assertionを緩めたりすることはない。

## 4. 既存のheld-file検査とbyte boundを維持する

seamは現在のheld-descriptor scanner内部で動く。readの前後と途中で、既存のprivate regular-file metadata、expected device/inode identity、unchanged filesystem snapshotを引き続き強制する。readはbounded chunkでincrementalに行い、各JSON lineはnewlineを除いて最大24 KiB、V3 file全体は`FLOODGATE_V7_TEACHER_CHECKPOINT_V3_MAX_TOTAL_BYTES`以下に制限する。

各lineはnon-empty、fatal UTF-8、plain canonical JSON objectであり、期待するcanonical encodingとbyte-for-byteで一致しなければならない。zero-progress read、oversized line、record過多、read中mutation、unauthenticated tail、valid seal後のfragmentは従来どおりfail closedになる。visitor eventはread bufferを渡さず、boundを変更するcapabilityも渡さない。ただし既存checkpointと同様にtest hookと現在のJavaScript realmはtrustedであり、悪意あるsame-process callbackや事前に改変されたintrinsicに対するsecurity boundaryではない。

## 5. completed entryがexactになった後だけeventを渡す

completed-parent recordでは、scannerが先に既存の検査をすべて完了する。

1. exact schemaとkey set
2. stream順と一致するcanonicalな`sequence` / `input_index`
3. そのinputに対応するexact parent IDとexact parent object
4. exactな`previous_mac` chain link
5. V3 domain下のvalid entry HMAC
6. completed-parent evidenceの構造的再検証
7. exact completed-evidence digest
8. canonical expected authenticated lineとのbyte-for-byte一致

これらが成功した後にだけvisitorへvalidated entry eventを渡せる。exact contractは`shogi-floodgate-v7-teacher-verified-parent-entry-event-v1`で、readonly eventには固定contract、provisional status、claim boundaryに加え、`input_index`、exact parent、verified completed evidence、completed-evidence SHA-256、entry MACを含める。malformed parent、forged digest、wrong sequence、broken chain、noncanonical bytes、構造矛盾のあるcompleted evidenceでは、そのentryのeventは発生しない。

## 6. callback contractはsynchronous、`void`、non-Proxyである

optional visitorはdirectなnon-Proxy functionでなければならない。結果は同期的かつexactに`undefined`である必要がある。値、Promise、thenable、その他のasynchronous handoffを返した場合は拒否する。visitorがthrowした場合はenclosing scanをabortする。

この制約により、awaitやPromise species boundaryがscannerのheld descriptorとmutable scan stateを越えてownershipを延長することを防ぐ。またevent順はauthenticated entry順と同じになり、後続line、seal、snapshot検査と並行observerがraceしない。

## 7. visitorはsealより前に動けるため、全eventはprovisionalである

streaming scanはfinal sealより先にcompleted-parent entryへ到達する。そのためvisitorがvalid entryを観測した後でも、milestone欠落、wrong seal MAC、seal後tail、file snapshot mutation、exact final gate countが24,004でないことによりenclosing scanは失敗し得る。

したがってvisitor invocationだけでdurable output、manifest、publication、training、棋力claimを認可してはいけない。consumerは、enclosing `sealed-final` scan全体が成功してfinal snapshotとgate contractが受理されるまで、観測結果をprovisionalに保つ必要がある。

## 8. prefix-100 / prefix-500 scanはvisitorを呼ばない

新しいseamはsealed-final observation専用である。durable-prefix-100とdurable-prefix-500はvisitor invocationなしで、現在のcheckpoint / resume behaviorを維持する。それぞれのexact final shapeはunsealedな102 recordsと503 recordsのままである。

この分離によりpartial gateをlabel sourceと誤認せず、early parentをprefix時とfinal-24000時に二重投影しない。prefix execution、milestone durability、torn-tail resume、producer scheduling、gate receiptはこの境界で変わらない。

## 9. ownership、production reader / command、output surfaceは追加しない

visitorはproduction-executable readerとしてexportされず、zero-argument production CLIへargumentを追加しない。contract constant、type、test dependency、既存callback contractをO(1)で検査するtest-only helperは追加するが、helperはeventを認証もmintもしない。outer-lock capability、stage lease、training-input claim、consumer postflight receipt、checkpoint-key authorization、finalizer key、publication transactionのmint / claimも行わない。

またoutput operationは0である。`train.jsonl`、`result.json`、`manifest.json`、temporary fileのcreate、truncate、append、sync、rename、destination reopen、live-weight updateは行わない。internal observerが存在するだけで、現在のproduction runnerとそのnonclaimsがlabel-finalizer evidenceへ変わることはない。

## 10. threat / failure matrix

| threat / condition                    | この境界での扱い                                            | この境界の外に残るもの             |
| ------------------------------------- | ----------------------------------------------------------- | ---------------------------------- |
| forged / noncanonical completed entry | event前に既存のexact structure、digest、bytes、HMAC検査     | production finalizer authority     |
| wrong order / replayed parent         | exact sequence、input index、parent、previous-MAC検査でfail | crash-safe output resume           |
| valid early entriesの後にinvalid seal | early eventはprovisionalのままenclosing scanがfail          | output rollback / publication      |
| visitorがPromiseや他の値を返す        | non-`void` synchronous callbackとして拒否                   | asynchronous worker orchestration  |
| Proxy callback / callback throw       | Proxyを拒否し、throwはscanをabort                           | caller recovery policy             |
| hostile same-process hook / realm     | test hookと現在のJavaScript realmをtrustedとする            | hostile callback / intrinsic耐性   |
| prefix gateにobserverを与える         | prefix visitor pathを作らない                               | partial workからのlabel generation |
| separate process / cloneによるhandoff | durable / public capability自体がない                       | fresh same-lock ownership bridge   |

## 11. validationはpendingであり、結果をまだ主張しない

本記事へpass countやtimingを書く前にimplementation candidateを実測する必要がある。evidence fieldは意図的にpendingのままにする。

focused testの設計自体は固定する。synthetic corpusは23,999件の合法forced parentと1件のnon-forced parentからなり、実Floodgate棋譜を読まない。prefix-500から追加する23,500 parentとsealの計23,501回のper-line regular-file syncだけをtest-only fixture buildで抑止し、native `FileHandle.sync`をexactに復元してwork fileとstage directoryを各1回batch syncしてからvisitor付きfinal scanを1回行う。したがってこの最適化runはper-entry fsync durabilityを再証明せず、そこは既存checkpoint / scan-load evidenceの責務である。exact-undefined違反は、そのfull scanから保持したreal eventを同じcallback enforcement helperへ渡してO(1)で検査する。full scan成功後のfailpointでoperationを失敗させ、eventだけではterminal successにならないことも確認する。

| validation item                            | status      |
| ------------------------------------------ | ----------- |
| Focused sealed-work visitor unit tests     | **PENDING** |
| V3 checkpoint / scan-load regression tests | **PENDING** |
| TypeScript typecheck                       | **PENDING** |
| Scoped lint / formatting checks            | **PENDING** |
| Full unit suite / production build         | **PENDING** |
| GitHub CI / review                         | **PENDING** |

実際に観測して記録するまでは、test count、duration、memory、commit revision、CI resultを一切主張しない。

## 12. 次はtwo-pass authenticated finalizerである

将来のfinalizerは、provisionalなvisitor eventをそのままoutput authorityへ変えてはいけない。安全なcompositionはtwo-passになる。

```text
first:  common outer lockを保持してfresh active stage leaseと
        opaque V3 checkpoint-scan key capabilityを取得

pass 1: retained authority下でvisitorなしのheld-FD sealed scan
        -> exact 24,004-record sealed streamを証明しsnapshotをpin

pass 2: 同じheld identity / snapshotをvisitor付きで再scan
        -> deterministic training rowsをprovisionalにproject
        -> enclosing sealed scanの再成功を必須化

then:   current consumer postflightをclaimし、domain-separatedな
        output-finalizer key authorityを取得
        -> fresh active stage leaseは引き続き保持
        -> crash-safe train/result/manifest finalization
        -> publication + destination revalidation

finish: 最後に必要なwork再検証後にkeyをzeroizeし、
        outer lockを保持したままstage leaseをterminal close
```

次の境界は、common outer lock下でfresh active stage leaseとcheckpoint-scan keyを先に取得し、両passを同じwork identity / bytesへbindしなければならない。stage leaseはpass 2だけで解放せず、その後のcurrent consumer postflight claim、別domainのoutput-finalizer key取得、partial outputのno-overwrite finalization、publication、destination revalidationまで保持する。最後に必要なwork再検証が終わるまでcheckpoint-scan keyを保持し、全keyのzeroizeとstage leaseのterminal closeもouter lock内で行う。それを実装・検証するまでは、このvisitorはteacher dataset、optimizer run、candidate weight、live activation、match result、Elo、rank、stable high-dan strengthの証拠ではない。
