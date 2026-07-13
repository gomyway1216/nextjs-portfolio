# v7 checkpointを定数メモリで再検証するincremental scanner

> **v2 update（現在の境界）:** 現行scannerはv2 checkpoint identityと認証済み`producer_control`を検証する。parent deadline、各running signalへの1回限りのabort、controllerの1回限りのabort-drain、drain timeout / timer cancellation処理はtest-only v2 boundaryで実装・検証済みだが、production coordinatorやlive teacherには未配線である。以下本文にある「valid 24k未実行」「timeout / cancellationは次段階」という記述と旧計測値はv1時点のhistorical recordであり、現行v2 evidenceとしては扱わない。これはreal label、training、weight、対局、棋力の証拠ではない。

> [v7 HMAC work checkpoint](./blog-shogi-floodgate-v7-hmac-work-checkpoint.md)は、完成した親をstrict input順で永続化し、crash後に未完了親だけを再実行できるようにした。しかし、再開時と最終検証時のscannerはwork file全体を先にmemoryへ読んでいた。この変更では、64 KiBのread chunkと24,576-byteのline bufferで1行ずつ認証し、HMAC chain、順序、torn-tail recoveryを変えずに追加作業メモリをfile sizeから切り離した。実装・local full validation・独立reviewは完了したが、24,000親の意味的にvalidなload testとPR CIは未完了である。この記事はproduction readinessまたは棋力向上をまだ主張しない。English version: [blog-shogi-floodgate-v7-incremental-checkpoint-scan.en.md](./blog-shogi-floodgate-v7-incremental-checkpoint-scan.en.md)

---

## 現在の境界

| 項目                        | 状態             | 意味                                                                      |
| --------------------------- | ---------------- | ------------------------------------------------------------------------- |
| per-parent HMAC checkpoint  | 前段で完成       | durable parentだけを再利用し、headerからsealまで順序付きで認証する        |
| whole-file scanner          | codeから削除     | `readWholeFile`、全slice、全decoded line保持を使わない                    |
| bounded incremental scanner | local検証完了    | 64 KiB chunkと24,576-byte lineを固定し、完全な1行を直ちに検証する         |
| 24,000-parent load test     | 未実行           | peak RSS、時間、short read、resume、sealed-final scanを実測する必要がある |
| label / training / strength | 未実行・証拠なし | weight、A/B、Elo、段位、高段安定性をこの変更では証明しない                |

## 1. なぜwhole-fileの上限だけでは足りないか

work streamの上限は589,897,154 bytes（562.57 MiB）である。この上限は異常に大きなfileを早期rejectするためには必要だが、「上限内なら安全にscanできる」という意味ではない。従来の`readWholeFile`型の検証は、少なくともfile全体の`Buffer`を一度に確保し、さらにdecoded stringやline管理用のallocationを重ね得る。562.57 MiBは拒否境界であって、許容できるpeak RSS、GC負荷、throughputを示す測定値ではなかった。

24,000親のlabelingは、途中crashから何度もresumeする可能性がある。resumeのたびにfile sizeと同じ作業メモリを要求する設計では、探索engineへ割り当てたいmemoryを圧迫し、OSのmemory pressureによって完了時間も不安定になる。必要なのはtotal-byte capを外すことではなく、capを維持したままscanner固有の追加memoryをfile sizeへ比例させないことである。

## 2. 64 KiB chunkと24,576-byte lineの設計

incremental scannerは、開いたfile descriptorからposition付きreadを繰り返し、次の2つの固定bufferだけでlineを組み立てる。

```text
read buffer: 65,536 bytes (64 KiB)
line buffer: 24,576 bytes

chunk -> LFを探す -> line bufferへ必要部分だけcopy
      -> 完全な1行をparse / canonical確認 / HMAC確認
      -> line stateを破棄して次の1行へ
```

LFがchunk境界をまたいでも、未完部分だけをline bufferに残す。lineが24,576 bytesを1 byteでも超えた時点でrejectし、巨大line用のallocationは行わない。short readは正しく継続し、file size到達前のzero-byte readは同時変更としてfail closedにする。complete record数は`parents + header + seal`以下、total bytesは従来どおり589,897,154 bytes以下でなければならない。

file SHA-256もchunkごとに更新し、全recordのarrayや全decoded lineを保持しない。JSON parseと1 recordのsemantic verificationにはline上限内の一時allocationがあるため、process全体を厳密な定数memoryと呼ぶのではなく、scanner固有のbuffer overheadを`O(chunk + line)`、file sizeに対して`O(1)`と表現する。authenticated training parentの既存入力やNode runtime自体のmemoryは、この境界に含めない。

## 3. HMAC、順序、torn tailを変えない

I/O方式を変えても、認証state machineは変えない。scannerが保持するのはcomplete record数、completed parent数、直前のMAC、sealの有無、最後に認証済みのbyte offsetだけである。

```text
header
  -> parent[0]
  -> parent[1]
  -> ...
  -> parent[n-1]
  -> seal
```

各complete lineはraw bytesのcanonicality、strict key set、expected parent、前のMAC、現在のentry MACを通過した後にだけstateを進める。parentの欠落、重複、並べ替え、training inputより多いentry、早すぎるseal、seal後のcomplete lineはrejectする。全file SHA-256はreceipt用であり、HMAC chainやsemantic verificationの代用品にはしない。

scan policyも2つに分ける。

- `resumable-prefix`: seal前の最後に不完全fragmentがある場合だけ、最後の認証済みoffsetを返し、従来のdurability手順でそこまでtruncateして再開できる。
- `sealed-final`: torn tail、seal不足、親不足、認証済みbyte以外の余分なdataをすべてrejectする。

valid seal後のfragmentはresume対象にしない。scannerはtorn-tail recoveryの許可範囲を広げず、既存の「durable parentはexact-once、engine executionはat-least-once」という境界を維持する。

## 4. 発見: TextDecoderはBOMを見えなくし得る

UTF-8 decodingにはcanonical byte verification上の落とし穴があった。`TextDecoder`のdefault BOM処理は、line先頭のUTF-8 BOM bytesをdecoded textから除去し得る。そのまま`JSON.parse`してstringだけをcanonical JSONと比較すると、raw fileには余分なbytesがあるのに正規lineとして受理する危険がある。

scannerはinvalid UTF-8をfatal errorにし、BOMを暗黙に捨てない設定を使う。ただしdecoder optionだけはsecurity boundaryにしない。parse後にcanonical JSONをUTF-8 bytesへ再encodeし、元のraw line bytesと長さ・内容の両方をexact比較する。したがって、decoderが将来違う挙動をしても、BOM、別表現、余分な空白、またはcanonical serializationと異なるbyte列は認証stateへ入らない。

これは「同じUnicode textに見える」ことではなく、「HMAC chainのrecordとして期待したcanonical bytesそのもの」であることを確認する境界である。headerとparent entryの先頭BOM、invalid UTF-8、CRLF、canonical再encode不一致をadversarial testで拒否した。

## 5. 最終pathnameとinodeを再確認する

開いたfile descriptorをscan中ずっと保持すれば、途中でpathnameが別fileへ差し替えられてもheld inode自体は変わらない。しかし、success receiptが示す`work.jsonl` pathnameが最後までそのinodeを指していたとは限らない。held fileだけの検査ではpathname swapを見落とす。

このためscannerは開始時にheld fileの`dev`、`ino`、type、mode、owner、link count、size、`mtime`、`ctime`をsnapshotし、scan後に同じdescriptorのsnapshotが完全一致することを確認する。最終sealed scan後はstage pathnameを`lstat`してauthorized stage identityを再確認し、entry setが`work.jsonl`だけであることを検査する。さらに`work.jsonl` pathnameを別に`lstat`し、そのsnapshotがheld work fileと一致すること、held descriptorも再度同じsnapshotであることをsuccess前に確認する。open / reopenはsymlinkをfollowしない。

この再確認は検査した時間窓でのpath-to-inode bindingを強くするが、hostile rootや同じprocess内のtrusted codeを隔離するsandboxではない。HMAC threat modelも従来どおり、keyを持たない主体によるpersisted-byte tamperを検出する範囲である。

## 6. 24,000親load testの方針

production labelingへ進む前に、holdoutを使わないsynthetic fixtureで100、1,000、24,000親の3段階を同じNode runtime上で測定する。24,000という件数だけを通すのではなく、次を記録する。

| 測定・検査  | 記録するもの                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| stream規模  | parent数、record数、file bytes、最大line bytes、file SHA-256                                                              |
| memory      | scan前RSS、peak RSS、scan後RSS、差分、および件数増加に対する傾向                                                          |
| 時間        | resumable-prefix scanとsealed-final scanのwall time                                                                       |
| read挙動    | 最大read sizeが65,536 bytes以下、1-byteを含むshort read、LFのchunk境界分割                                                |
| recovery    | header-only、途中parent、seal直前のresume、許可されたtorn tail                                                            |
| fail closed | oversized line / file、BOM、invalid UTF-8、wrong HMAC、順序違反、seal後fragment、scan中mutation、pathname / inode差し替え |

24,000 fixtureはtest keyとsynthetic parentだけから作り、fresh selectionやfresh / legacy final holdoutを開かない。589,897,154-byte capは「全24,002 lineが24,576 bytes」という保守的な理論上限なので、sparse exact-cap / cap+1 fileによるallocation境界と、観測最大14-candidate entryを使う意味的にvalidな24,000-parent streamを別の証拠にする。後者では実bytes、SHA-256、RSS、wall time、read上限を測る。理論cap全量をvalid streamとして完走したとは主張せず、どちらもreal teacher labelの正しさや棋力を示さない。

合否は「processが終了した」だけでは決めない。scanner固有memoryがfile sizeとともに線形増加していないこと、全recordとdigestが一致すること、resume / final policyが同じbytesへ同じ判定を返すこと、adversarial caseがfail closedになることを確認して初めてproduction coordinatorへ接続する。

## 7. holdoutとclaimの境界

scannerが読むのはprivate stage内の`work.jsonl`と、呼び出し時にすでに認証済みのtraining bindingだけである。selection / final labelのpath、reader、keyをAPIへ渡さない。load fixtureもsynthetic training parentから作るため、scanner実装・test・性能調整のためにfresh selection、fresh final、legacy finalを開く必要はない。

この変更はlabel生成方針、candidate score、training row、optimizer、weightを変えない。live環境へ新weightを配らず、対局A/Bも行わない。この段階で作られる証拠は、bounded scan、canonical bytes、HMAC order、crash / resume、file identityに限られる。

したがって、この変更からteacher JSONLの品質、weight改善、A/B勝率、Elo、81Dojo rating、段位を推定しない。「評価関数が強くなった」「高段で安定した」というclaimは0である。

## 8. validation記録

次の表は同じworking-tree内容をNode v22.13.0で検証した確定値である。途中run、別SHAの結果、推定値を合格数へ混ぜない。

| 対象                                        | 確定結果                                                             |
| ------------------------------------------- | -------------------------------------------------------------------- |
| focused incremental-scanner tests           | checkpoint 24/24                                                     |
| related checkpoint / completed-parent tests | candidate union + completed parent + checkpoint 70/70                |
| full Vitest                                 | 111 files / 1,910 tests                                              |
| TypeScript / scoped ESLint / Prettier       | pass / 0 warnings / Prettier 3.9.5 pass                              |
| Python ML stdlib / Next production build    | 58/58 / 193/193 pages                                                |
| repository-wide ESLint                      | 0 errors / 157 existing warnings                                     |
| byte ceiling / 24,000-parent load test      | sparse exact capはbounded readへ進みcap+1はread 0、valid 24kは未実行 |
| independent review / CI                     | P0–P2 findingなしでGO / PR CIは未実行                                |

## 9. 次はproducer timeoutとcancellation

bounded scanが閉じても、rolling window内のproducer Promiseが永遠にsettleしない場合、failure drainもcheckpoint完了も停止する。次の境界はparentごとのdeadline、engine processのcancellation / kill、すでにdurableなparentを壊さない停止順序、timed-out parent以後をappendしない決定性である。

timeoutを単なる`Promise.race`で実装すると、背後のengineが走り続けたり、遅れて返った結果が別runへ混ざったりする。owning coordinatorがengine lifecycleを直接持ち、timeout時に探索を止め、全started taskを回収し、stageを再開可能なprefixとして残す必要がある。その後にdeployment key authority、training-only projection、100–500親pilotへ進み、24,000 real labelingはそれらの証拠が揃ってから開始する。
