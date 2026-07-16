# completed parentを学習行へ写す — Floodgate v7 training-label projection

> 前段のfinal-24000 contractが成功時に確定するのは、HMACで連鎖したauthenticated workと、各completed-parentに残る`teacher_labels_emitted: 0`までである。そこから学習用の`shogi-sibling-v1`行へ進むには、探索証拠を一度だけ決定的に写す境界が必要になる。本PRは、その最初の狭い境界として、completed-parent evidenceを構造的に再検証して同期的に学習行へ投影する。sealed workは読まず、入力のoriginも認証しない。real data、engine、training、weight、live activation、holdout、棋力測定は実行していない。English version: [blog-shogi-floodgate-v7-training-label-projection.en.md](./blog-shogi-floodgate-v7-training-label-projection.en.md)

---

## 1. final-24000の完了はlabel publicationではない

final-24000の既存境界は、checkpoint workをauthenticatedな完了状態へ進めるためのものだ。completed-parentには候補、独立rescore、探索bindingが残る一方、completionは意図的に`teacher_labels_emitted: 0`を保つ。

```text
authenticated completed-parent work
              |
              +-> teacher_labels_emitted: 0
              +-> training row: まだない
```

したがってfinal-24000の成功、またはその実行コードが存在することを、teacher labelの生成・公開・学習済みweightと読み替えてはいけない。

## 2. 今回はpure synchronous projectionだけを追加する

今回の関数は、callerが渡したcompleted-parent evidence 1件を受け取り、`shogi-sibling-v1`のreadonly row配列を同じcall stack内で返す。filesystem、network、clock、randomness、engine、checkpoint、keyには触れない。

```text
completed-parent evidence
          |
          v
strict structural re-verification
          |
          v
deep-frozen shogi-sibling-v1 rows
```

これはformat変換と意味検査の境界であり、sealed workからlabel datasetをmaterializeするfinalizerではない。

## 3. 構造は再検証するがoriginは認証しない

投影前に既存completed-parent verifierを通し、schema、exact key set、parent / legal / candidate / rescore binding、child identity、score、completion、semantic digestを再導出・照合する。caller objectをそのまま信用したり、部分的なfield copyだけで済ませたりしない。

ただしcompleted-parent digestはunkeyedなsemantic identityである。projectionはcheckpointのheld descriptorを受け取らず、HMAC chainもscanせず、sealed work bytesも読まない。構造的に自己整合した入力が「承認されたfinal-24000 runから来た」とは証明しない。このorigin authenticationは次段に残る。

## 4. forced parentは0行になる

rules-complete legal moveが1つだけのforced parentは、前段でteacher proposalと独立rescoreをskipする。そのparentから比較対象のない単独labelを合成すると、sibling ranking contractを壊す。

そのため`forced-parent-skip`のprojection結果はexactに空配列である。played / stableの一致を利用して擬似scoreを作らず、1行のtraining recordも出さない。

## 5. 通常parentの順位はCPとUTF-8だけで決める

non-forced parentでは、各独立rescoreのparent-perspective CPを降順に並べる。同値ならmoveのUTF-8 bytesを昇順比較する。この順序から`teacher_rank`を1始まりで連続採番し、出力rowも同じ順序へ固定する。

```text
primary:   teacher_parent_cp descending
tie-break: UTF-8(move) ascending
rank:      1, 2, ... N
```

candidateの元の列挙順、engine response順、locale、worker数には依存しない。

## 6. child側CPは符号を反転する

独立rescoreのscoreはparent視点である。`teacher_parent_cp`にはその値を保持し、model inputとなる着手後局面は手番が交代するため、`teacher_child_cp`とcanonical `cp`には符号反転値を入れる。

```text
teacher_child_cp = cp = -teacher_parent_cp
```

ただし0はcanonicalな0のまま扱う。このperspective変換をrank計算より前へ混ぜず、parent側の強さ順を維持する。

## 7. sourcesはprovenanceからcanonicalに作る

各candidateの既存provenanceだけをsourceへ写し、固定順`played`、`teacher`、`stable`で重複なく並べる。

| completed-parent provenance | `shogi-sibling-v1` source |
| --------------------------- | ------------------------- |
| `strong_game_played`        | `played`                  |
| `production_proposal`       | `teacher`                 |
| `stable_policy`             | `stable`                  |

move名やrankからsourceを推測せず、falseのprovenanceを補わない。同じmoveが複数経路に現れた場合もrowは1件のまま、sourcesだけが複数になる。

## 8. mate metadataはexactに保持する

通常CP scoreは`teacher_score_kind: "cp"`だけを持ち、mate用fieldを付けない。mate scoreは`teacher_score_kind: "mate"`に加え、検証済みdistanceとsignから符号付き`teacher_mate`を再構成し、`mate_sign`を`teacher_mate_sign`へexactに写す。distance 0はJSONで表せない`-0`へせずcanonical `+0`に正規化し、負側の意味はexplicit signに保持する。対応するmapped parent CPとchild側の符号反転も残す。

distanceやsignをrankから再推測したり、0 distanceの符号情報を落としたり、ordinary CPへ変換した後にmate metadataを捨てたりしない。構造verifierが確認した組を一体として投影する。

## 9. `split: "train"`は前段のrole isolationを表す

将来のauthenticated finalizerは、selection / final holdoutをtraining roleから分離した既存role-lock boundaryの後段でだけこのprojectionを呼ぶ。その出力指定としてprojection rowはrandom再分割を行わず、exactに`split: "train"`を持つ。ただし、このpure関数自身はrole-lockもHMACも検査せず、callerの入力が本当にtraining roleだったという証拠を発行しない。

これはholdoutを読んだ、またはdataset publicationやtrainingが完了したという意味ではない。将来のtraining-only callerが別roleを再混入させないための明示fieldであり、receiptも`training_role_authenticated: false`を保持する。

## 10. 出力は決定的でdeep-frozenである

出力は正規化済みparent identity、着手、child SFEN / position identity、score、rank、sources、`split`だけから作る。同じ検証済みevidenceにはbytewiseに同じ意味と順序のrowsを返し、top-level array、各row、nested `sources`までdeep-frozenにする。

callerによる入力の後編集は返却済みrowsを変えず、返却値の後編集もできない。projection自体はfileを作らず、JSONL serialization、fsync、rename、manifest authenticationをclaimしない。

## 11. threat matrixと検証結果

| Threat / condition                                   | 今回の扱い                                | claimしないこと                 |
| ---------------------------------------------------- | ----------------------------------------- | ------------------------------- |
| malformed / inconsistent completed-parent evidence   | 既存structural verifierでfail closed      | origin authentication           |
| candidate順や同点CPによる非決定性                    | parent CP降順、UTF-8 move昇順へ再順位付け | engine再実行                    |
| forced parentからの擬似label                         | exact 0 rows                              | 単独着手のteacher score         |
| provenance、mate、child perspectiveの取り違え        | exact mappingと符号反転を検査             | search quality                  |
| 自己整合した偽造object / recomputed unkeyed digest   | このpure boundaryだけでは防げない         | checkpoint HMAC provenance      |
| crash、partial write、work/result/manifestの取り違え | filesystemを扱わない                      | durability / atomic publication |

focused unit testは**1 file / 6 tests、6 / 6 PASS**（Vitest duration 631 ms、test 90 ms）だった。通常14-candidate parent、CP tie、複数provenanceの同一手統合、mate metadata・negative nonzero mate・negative-zero canonicalization、符号反転、forced 0-row、deep freeze、再現性、clone / tamper / Proxy / arity拒否を対象にする。`tsc --noEmit`とPrettierもPASSした。

exact commit `214d047443a02ccc084bae94ce725b49a2cdbc8a`のfinal validationでは、full Vitest **152 files / 2,816 tests PASS**（duration 161.46秒、wall 161.93秒、maximum RSS 4,378,476,544 bytes、swap 0）、production build **193 / 193 pages PASS**（wall 37.24秒、maximum RSS 2,671,001,600 bytes、swap 0）だった。full ESLintはexit 0、error 0、既存warning 157（wall 35.96秒、maximum RSS 2,343,272,448 bytes、swap 0）、ML stdlibは58 / 58、`npm audit`はvulnerability 0だった。GitHub CIはPR公開後に別途確認する。

## 12. 次はauthenticated finalizationである

次の境界は、private checkpointをheld file descriptorから増分scanし、各recordのHMAC chainとexact final-24000 completionを検証しながらprojectionへ渡す。その後、training JSONL、result、manifestをcrash-safeに確定し、consumerのexact postflight receiptとpublication transactionへ結び付ける。

```text
held-FD incremental HMAC scan
              |
              v
deterministic projection
              |
              v
train JSONL -> fsync -> result -> fsync -> manifest -> fsync
              |
              v
exact consumer postflight -> publication
```

現時点ではreal Floodgate dataを読まず、engineを起動せず、teacher datasetを確定せず、trainingを行わず、weightを変更せず、live評価関数を切り替えず、selection / holdoutを開かず、Eloや段位を測っていない。得られるのは、authenticated finalizerへ接続する前のdeterministic projection contractだけであり、棋力向上の証拠ではない。
