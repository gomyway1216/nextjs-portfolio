# v7 teacherを親単位で再開するHMAC work checkpoint

> [v7 candidate union](./blog-shogi-floodgate-v7-candidate-union.md)はproposal / strong-game played move / stable moveを同じ合法手集合上で結合し、[production stable runtime](./blog-shogi-floodgate-production-stable-wasm-runtime.md)は固定assetから得たdirect resultを発行できるようにした。しかし、未知のindependent rescoreを実行しながらcrash後に安全に再開する境界は残っていた。このPRはcompleted-parent evidenceとv7専用のappend-only HMAC checkpointを追加する。これはsynthetic test coreであり、real Floodgate label、training、holdout、棋力の証拠ではない。English version: [blog-shogi-floodgate-v7-hmac-work-checkpoint.en.md](./blog-shogi-floodgate-v7-hmac-work-checkpoint.en.md)

---

## 現在の境界

| 項目                             | 状態             | 意味                                                                    |
| -------------------------------- | ---------------- | ----------------------------------------------------------------------- |
| candidate union                  | 前段で完成       | proposal / played / stable候補の合法性とcanonical unionを検査する       |
| direct stable runtime result     | 前段で完成       | owning runtimeから得たstable rowとruntime bindingを同じcallで返す       |
| completed-parent semantic core   | このPRで実装     | union、stable direct result、全rescoreを1つの親へcross-bindする         |
| per-parent HMAC checkpoint       | このPRで実装     | durableな親だけを再利用し、未確定親だけproducerへ要求する               |
| production coordinator / key     | 次段階           | zero-argument runtimeとdeployment key authorityを直接所有する必要がある |
| real label / training / strength | 未実行・証拠なし | weight、A/B、段位、高段安定性をこのPRでは証明しない                     |

## 1. なぜ既存checkpointを上書きしないか

既存stable-proposal checkpointは、完成済みartifact全体を先に受け取り、そのdeterministic全行をHMAC付きで保存する。stable候補には正しいが、v7 teacherでは各親のproposal後に未知個数のcandidateをdepth 16で独立rescoreする。全24,000親をmemoryで完成させてから保存すると、途中crash時の探索をすべて失う。

既存schema / HKDF domainを意味の違うartifactへ流用すると、verifierの取り違えも起こり得る。このためv1は変更せず、v7固有schema、HKDF info、header / parent-entry / seal domainを持つ別streamにした。

## 2. dense parent entryを選んだ理由

work streamは次の3種類だけを持つ。

```text
header -> parent[0] -> parent[1] -> ... -> parent[n-1] -> seal
```

各parent entryはcandidateごとのrescoreをcanonical candidate順に内包する。1 candidateごとのfsyncより、1 parentをsemantic transactionにする方が、resume state、重複排除、canonical order、最終sealを小さく保てる。search後・parent append前にcrashした場合はその親を再実行するが、durable parentは再実行しない。

探索を直列化するとfixed 12-engine poolの11 engineが遊ぶため、writerは最大12親をrolling windowで先行実行する。完成順が逆でもentry / fsyncはstrict input index順である。1 taskが失敗すると新規scheduleを止め、すでに起動したtaskをすべてsettleしてからfailし、失敗index以後をappendしない。

したがって保証境界は次である。

- engine search execution: at-least-once
- HMAC streamへdurableに受理されたparent entry: exact-once
- 完成前のprefix: resumable private workであり成功artifactではない

## 3. headerが固定するrun identity

headerは少なくとも次をHMACする。

- run ID / key ID / v7固有algorithmとclaim boundary
- authorized private stageのparent / stage device・inode・basename
- authenticated training binding全文
- strict parent-ID順のrecord count、parent IDs digest、parent rows digest
- fixed teacher plan identity
- production stable runtime receipt digest
- production teacher USI runtime receipt digest

resumeはcallbackを呼ぶ前にheaderと既存の全parent entryを再認証する。別key、別run、別stage、別training input、別runtime receiptのworkはprefixとしても受理しない。

## 4. completed-parent evidenceのcross-binding

non-forced parentは次を1つのimmutable projectionへcaptureする。

```text
authenticated training parent
  + rules-complete legal-set binding
  + stable runtime result { row, stable_runtime_binding }
  + teacher proposal runtime binding
  + canonical candidate union
  + every independent searchmoves rescore
```

各rescoreはcandidate index / move / child identity、depth、cpまたはmate、nodes、PV length、domain-separated PV digest、full-result digestを持つ。raw PV全文をworkへ複製しないため、24,000親でもUSI line上限に比例して無制限に膨らまない。full resultはcapture時に厳密検査し、raw PVを捨てた後はそのdigestをHMAC stream内のcommitmentとして保持する。resume時にはcompact projectionの意味論を再検証するが、保存していないraw engine outputやengine truthを再構成したとは主張しない。

forced parentでもstable runtime resultは必須だが、teacher proposal runtime bindingは`null`、candidate / rescoreは0件である。sole legal move、played move、stable moveが一致しなければrejectする。

### 発見: 2つのstable-row digestは同じ値ではない

production stable runtimeの`row_sha256`とcandidate-union receiptの`stable_row_sha256`は、同じrowに対して別のdomainを使う。名前が似ていても値の一致を要求してはいけない。completed-parent coreはrowを1回captureして各domainを独立再導出し、direct stable runtime bindingとunion bindingの両方を同じ親へ結ぶ。

同様に、unionの`runtime_binding`はYaneuraOu proposal側であり、stable側ではない。checkpointでは`stable_runtime_binding`とteacher proposal bindingを別fieldとして保存する。forced parentでも前者は存在し、後者だけが`null`になる。

### 発見: USIの`-0`はcanonical zeroへ正規化する

USI parserはsigned decimal tokenを受理するため、`cp -0` / `nodes -0` / mate `-0`はprotocol上の入力になり得る。一方、canonical JSONはnegative zeroを拒否する。proposalとrescore captureはinteger / score boundを変えずにzeroだけを`+0`へ正規化し、mateは距離0と明示的signへ分離する。`-0`と`+0`が同じsemantic digestになること、負のnodesや範囲外CPは引き続きrejectすることを回帰testで固定した。

## 5. crash / resume state machine

| failure point                      | restart時の扱い                                                      |
| ---------------------------------- | -------------------------------------------------------------------- |
| search前                           | その親をproducerへ要求する                                           |
| search後、append開始前             | entryがないためその親を再searchする                                  |
| append中の不完全tail               | 認証済みprefixを保持し、許可したtail条件だけfail-closed recoveryする |
| 完全line append後、fsync成否が不明 | restart時にHMAC lineを再検証し、有効なら再searchしない               |
| parent fsync後、次parent要求前     | durable sequenceをcursorとして次の親だけ要求する                     |
| 全parent後、seal前                 | parentは再searchせずsealだけ追加する                                 |
| seal後                             | complete streamとして最終reopen / exact verificationする             |

producerが違うparent、順序、candidate、extra key、rescoreを返した場合はappend前にrejectする。callback resultを認証済みevidenceとして信頼せず、checkpoint内部でsynchronous semantic coreを再実行する。

1 canonical lineは24,576 bytes以下、全streamは24,000 parentにheader / sealを加えた589,897,154 bytes以下へ固定する。raw PVを保存しない最大14-candidate fixtureの実測entryは17,338 bytes（line capの70.55%）だった。同じ最大entryを24,000件並べる保守的な算術projectionは416,185,154 bytesで、capまで173,712,000 bytes残る。これは1件のsynthetic fixtureから求めた容量計算であり、24,000親runやscannerのload testではない。

一方、このtest coreのresume verifierは現在`readWholeFile`でstream全体を1個のbounded `Buffer`へ割り当てる。589,897,154-byte（562.57 MiB）のceilingは拒否境界にすぎず、その規模を安全にscanできるという実運用保証ではない。24,000親のproduction labeling前に、bounded incremental line parsing / HMACへ置き換えてload testする必要がある。このPRはproduction-scaleのmemory、throughput、scanner readinessを主張しない。

## 6. HMACだけではengine truthにならない

root keyを持つwriterは任意の内容を正しくHMACできる。ここで証明するのは「同じkey-holderが記録した内容が、run / stage / inputへ結び付いたまま改ざんされていない」ことだけである。engine binaryが本物であること、runtime callが実際に行われたこと、teacher labelが正しいことは、次のzero-argument coordinatorがowning runtime capabilityから直接入力を得ることで初めて主張できる。

このtest coreはproducer、すべてのtest hook、現在のJavaScript realm / intrinsicsをtrusted codeとする。producerが返すparent evidence自体はadversarialとして同期再検証するが、HMACが示すのはそのtrusted realmの下でnon-key-holderによるpersisted bytesの改ざんがないことだけである。hostileなsame-process codeによるprototype / crypto method / filesystem methodのmutationやkey accessを隔離するsandboxではない。この境界はexported claim stringにも固定した。

test coreはproduction originを名乗らず、plain completed evidenceにもauthentication claimを付けない。partial prefix、SHA-256だけのdigest、再署名できるtest keyのどれもplaying-strength evidenceではない。

## 7. 14コアMacでの並列方針

実機は14 CPU core、51,539,607,552 bytes RAMである。stable探索のpilotでは12 workerが10 workerより約5.8%高throughputだったため、real labelingでもengine poolは12を維持する。実装・監査中は、checkpoint code、completed-parent semantic core、adversarial testsを別sub-agentで並行し、focused Vitestは最大4 worker、TypeScript / lint /日英文書監査を重ねる。

同じ14 coreへengine 12 workerとfull test 4 workerを同時に常時走らせるとCPU競合で探索が遅くなる。コード検証では並行し、real search中は12 engineへ優先配分する。この方針は「CPU使用率最大」ではなく、24,000親の完了時間を短くするための実測ベースの配分である。

## 8. validationとnonclaims

このPRのtest inputはsynthetic parent / result / keyだけである。real Floodgate training row、fresh selection、fresh / legacy final holdoutを開かず、production engineを起動しない。selection / final labelのpathやreaderをcheckpoint APIへ渡さない。Node v22.13.0ではcandidate union 34本、completed-parent 12本、checkpoint 17本のfocused Vitestが63/63で通った。bundled Node v24.14.0では関連6 files / 132 tests、全111 files / 1,903 testsが通った。TypeScript、Python ML stdlib 58/58、Next production build 193/193 pages、scoped ESLint `--max-warnings=0`、Prettierも成功した。repository全体のESLintは0 errors / 157 existing warningsだった。これらはsemantic capture、compact-evidence re-verification、HMAC resume、wrong binding、forced skip、key isolation、crash境界を検査する。

この段階ではteacher JSONL、weight、A/B、Elo、段位、81Dojo ratingを作らない。「評価関数が強くなった」「高段で安定した」という主張は0である。次はdeployment key authorityとtraining-only projectionを閉じ、zero-argument production coordinatorで100–500親のpilotを行う。そこで失敗率、throughput、resume、score分布を確認してから24,000親へ進む。
