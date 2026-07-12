# 15 MBのJSONLを、そのままteacherへ渡さない — Floodgate training-row consumer

> [label-free role bundleの実行ログ](./blog-shogi-floodgate-fresh-sibling-run.md)では、training / selection / finalを分離し、training 1,000局から24,000親を固定した。しかし、正しいmanifestを検証できることと、後段が正しいfileだけを競合なく読むことは別問題である。本稿は、固定済み`training.raw.jsonl`をFDで保持したまま認証し、pathを持たないcallbackへ必要最小限の行だけを渡すconsumerの実装記録である。targeted adversarial testは33/33だが、この段階ではproduction entry pointによるfull verifierもteacher searchも実行していない。したがって、これは入力integrityの改善であり、棋力向上の結果ではない。English version: [blog-shogi-floodgate-training-row-consumer.en.md](./blog-shogi-floodgate-training-row-consumer.en.md)

---

## 現在地

| 項目                         | 状態     | この段階で言えること                                                                             |
| ---------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| pinned training identity     | 固定済み | tracked result receiptにexact bytes / SHA-256 / aggregate digestsがある                          |
| training-row consumer        | 実装済み | synthetic fixtureとdependency-injected verifierによる33/33 targeted test                         |
| production full verification | 未実行   | production APIはpinned bundle verifierへ接続しているが、実bundleでの完走結果はまだ記録していない |
| teacher / stable proposer    | 未実行   | 次の別段でpathless coreとして実装・実行する                                                      |
| selection / final labels     | 未読     | consumerはrole selectorもselection / finalのlabel pathも受け取らない                             |
| strength claim               | なし     | teacher値、candidate checkpoint、static score、実戦A/Bはまだない                                 |

ここでいう「実装済み」は、APIと敵対的unit contractができたという意味である。実bundleに対してfull verifierが完走した、teacher dataができた、強くなった、という意味ではない。

## 1. 固定した入力identity

consumerが受理するproduction inputは、tracked role-bundle result receipt内のtraining identityだけである。別manifestの自己整合するtraining fileへ差し替えても受理しない。

| 項目                  |                                                             固定値 |
| --------------------- | -----------------------------------------------------------------: |
| file                  |                                               `training.raw.jsonl` |
| format                |                   `shogi-floodgate-label-free-raw-parent-jsonl-v1` |
| bytes                 |                                                         15,369,952 |
| SHA-256               | `c9ee90da69135ead5dbb60cbab6eaa82ad018db791132dd4ec122d6088c37b62` |
| parent rows           |                                                             24,000 |
| games                 |                                                              1,000 |
| semantic position IDs |                                                             24,000 |
| game-ID digest        | `97609ce53a9dee1fffd8faadcf408d79bc3e0724c17d52d8a2ac095bc607e3d7` |
| parent-ID digest      | `6681bd08bb282be04f47bf3157ea07fbbe2bc6a6864a100ce65902dc9cc3f08f` |
| position-ID digest    | `a97788b608a6687c078b7fbe2172a5c4068c57a42ed322c3997692f697e73b5c` |

24,000行はlabelではない。各行は親局面のSFEN、実戦で指された合法手、game / parent / semantic-position identityを持つ。実戦手は次段のproposal候補の1つであり、teacherの正解値ではない。teacherは各候補を独立探索して初めてscoreを付ける。

## 2. なぜreceipt verificationだけでは足りないのか

危険な実装は、「manifestを検証する → pathをteacherへ返す → teacherが後からopenする」という形である。検証とopenの間にrenameやin-place writeが入れば、検証したinodeと学習したbytesが別になり得る。さらに、汎用pathとrole文字列をteacherへ渡すと、誤って`selection`や`final`を選べるAPIになる。

今回のproduction入口は`withVerifiedPinnedFloodgateTrainingRows(...)`である。処理順を固定した。

1. callerのoptions、callback、dependencyをI/O前にcaptureし、exact key、plain non-Proxy data、absolute normalized path、revision形式を確認してfreezeする
2. bundle rootをmode 0700、current user owner、non-symlink directoryとして開き、`training.raw.jsonl`だけをmode 0600、owner一致、hard link 1、64 MiB以下のregular fileとして`O_NOFOLLOW`で開く
3. pathnameとopen descriptorのdevice / inode / mode / link count / owner / size / nanosecond timestampsが一致することを確認し、raw bytesをdescriptorから1回snapshotする
4. descriptorを閉じずにpinned role-bundle verifierを走らせ、その前後でrootとtraining fileのidentity不変を確認する
5. verifierが返したcurrent / result manifest全体をcanonical serializeし、pinned manifest text、bytes、SHA-256へ一致させたうえでtraining identityを取り出す
6. snapshotのbytes / SHA-256、UTF-8、JSONL framing、各rowのschema・identity・合法性、集合aggregateを検証する
7. pathlessでdeep-frozenなtraining capabilityをcallbackへちょうど1回渡す
8. callback完了後にもdescriptorとpathnameのidentityを再確認し、close failureを含めてfail closedにする

callback内では最終成果物を直接publishしない。まずstagingへ書き、consumer全体がresolveしてpostflightとcloseを通った後だけ、外側がfinal manifestを公開する。これにより、callback自体が完了してもpostflightで改変を検出したrunをcompleteとして残さない。

## 3. callbackが受け取るcapability

callbackの引数は次の概念形だけである。

```text
{
  schema: "shogi-authenticated-floodgate-training-rows-v1",
  role: "training",
  binding: { receipt / manifest / revision / raw aggregate identities },
  rows: [{ game_id, parent_id, position_id, parent_sfen, ply, played_move }]
}
```

引数にはpathname、file descriptor、mutable bytes、raw JSONL text、role selector、`source_url`、`game_sha256`、selection / final artifact identityを入れない。source URLとCSA body digestはparse中のgame-source consistency確認に使うが、検証後のrowから投影除外する。bindingとrowsは配列の内側までfreezeする。callbackはnative `Promise<void>`だけを返し、同期値、独自thenable、値付きPromiseを拒否する。将来のproduction runnerでは、teacherが必要な状態を検証済みprivate stagingへ置き、consumer全体の成功後に外側からpublishする。

これは「training rowsを使える」という限定capabilityである。ファイルをどこからでも開ける権限を渡し、その利用規約をコメントで頼む形ではない。

## 4. byte一致だけでなく、将棋としても閉じる

SHA-256が一致すればproduction fileの内容は固定できる。それでもstrict parserを別に置いた。将来identityを更新する時や、test fixtureのように別identityを注入する時に、自己整合する壊れたJSONLをsemantic rowへ昇格させないためである。

parserは次をすべて要求する。

- fatal-valid UTF-8、BOM / NUL / CRなし、exactly one final LF、blank lineなし
- 各lineはexact keyだけを持ち、UTF-8 byte順のcanonical compact JSONとbyte-for-byte一致
- schema version 1、sourceは`floodgate`、canonical HTTPS URLからgame IDを再導出
- `parent_id = H(game_id, ply)`、SFEN move numberは`ply + 1`、`position_id`はSFENから再導出
- `played_move`はrules-complete legal-move generatorに含まれる
- rowは`parent_id`のstrict UTF-8 byte順で、parent / semantic positionのduplicateは0
- 同一game IDのsource URL / CSA digestは一貫し、game / parent / positionのcountと集合digestがmanifestに一致

selectionやfinalのlabelを開いて、この検証を行う必要はない。この段階で扱うのは固定済みtrainingのlabel-free parentだけである。

## 5. 敵対的testで見つかった境界の穴

targeted suiteは33/33である。各testにはBOM、CRLF、NUL、invalid UTF-8、unknown field、identity mismatch、Promise prototype改変などのmutation matrixも含む。これはsynthetic fixtureとdependency injectionによるunit evidenceであり、production full verifierを実bundleで完走した証拠ではない。

実装中に、普通のhappy-path testでは見落としやすい2つのbugが見つかった。

### BOMはdecode後だけ見ても遅い

`TextDecoder("utf-8", { fatal: true })`はinvalid UTF-8を拒否するが、先頭UTF-8 BOMを通常のdecodeで消費できる。decode後の文字列が`U+FEFF`で始まるかだけを調べる実装では、raw bytesがBOM付きでも通る余地があった。修正後はdecode前に先頭3 bytes `EF BB BF`を直接拒否し、decode後の`U+FEFF`確認も残した。SHA-256の対象とparserが認識するframingを同じraw bytesへ揃えた。

### `JSON.parse`はobject key order違反を知らせない

JSONの意味だけをparseすると、同じkey/valueを別順に並べたlineも同じobjectになる。しかし、このartifact contractはcanonical key orderまで含むexact bytesである。修正後は各lineをparseしたあと、keyをUTF-8 byte順に並べたcanonical JSONへ再serializeし、元lineとexact一致しなければ拒否する。通常のJavaScript default sortやinsertion orderには依存しない。これによりkey順、余分な空白、duplicate-keyによる上書き、非canonical number framingを「意味は同じ」として通さない。

追加の敵対testは、callerがI/O開始直後にoptionsを書き換える場合、callbackが`fs.promises.lstat` / `FileHandle.stat`をpoisonする場合、`Promise.reject(undefined)`、symlink / directory / hard link、verify中またはcallback中のrename / in-place writeを確認した。Promise / Object / Array prototypeの`then`汚染は隔離したchild processで再現した。optionsと必要なintrinsicを先にcaptureし、failure有無をrejection valueとは別booleanで持つことで、postflightを迂回させない。

### SFENはparseできるだけではcanonicalではない

move numberが`03`や`3junk`でも`Number.parseInt`だけなら3として読める。そこで、SFENをpositionへparseした後、同じmove numberで再serializeしたbytesが元SFENと完全一致することを要求した。`ply + 1`と数値上同じでも、canonical表現でなければ拒否する。

### Promiseのbrandだけでなく、settlement値も守る

敵対レビューでは、`Symbol.species`で早期resolveさせる、`Promise.prototype.then`でpostflightを偽る、さらに`Object.prototype.then` / `Array.prototype.then`で本物の`BigIntStats`やclose-error配列をthenableとして再解釈させる経路が再現された。修正後は、objectを返すpostflight statをcapture済みcallback-style `fstat/lstat`で取得し、その場でprimitive filesystem identityへ落とす。内部Promiseのfulfilled valueはnull-prototype boxへ入れてから待ち、public APIの完了値は`void`だけにした。hostile species、prototype poisoning、`undefined` rejectionを別々の回帰testで固定している。

## 6. この境界が守るもの、守らないもの

守るのは、**pinned receiptのtraining bytesとcallbackが見たsemantic rowsの同一性**である。検証前後・callback前後のpath substitutionとin-place mutationを検出し、callback argumentからrole選択とraw-file authorityを外す。selection / final labelをtraining APIへ混ぜない。

一方、これはOS sandboxではない。同じprocessの悪意あるcallbackが自分で`node:fs`をimportすることまでは防げないし、trusted private storageの外側で動く別processを無力化するものでもない。teacher engineのbinary / eval identity、`isready` / TT reset、search結果、output publisher、training code、candidate checkpoint、対局harnessもこのconsumer単体では認証しない。

したがってclaim boundaryは`input-integrity-only`である。teacherをまだ実行しておらず、評価値、selection score、final score、勝率、Elo、段位についてのclaimは0である。

## 7. 次はpathless teacher coreとstable proposer

次段では、teacher generatorのcoreもpathを受け取らない形にする。consumer callback内で`AuthenticatedFloodgateTrainingRows`を直接受け、engine runnerとstaging sinkを明示capabilityとして注入する。入力fileを再openするCLIへは戻さない。

各parentのproposal集合は事前登録どおり、次のunionに固定する。

1. YaneuraOu MultiPV 12
2. 強豪棋譜の`played_move`
3. 現行runOp1 production int16がfixed depth 11で選ぶstable move

stable proposerはinitializer / eval identityとproduction int16経路をreceiptへ束縛し、合法手を1手だけ返す独立capabilityにする。candidate QATモデルの手はproposalへ足さない。その後、各候補をMultiPV 1、`searchmoves` 1手、fixed depth 16で独立探索し、proposal前と各candidate前の`isready` / TT reset、UTF-8 byte順、12 one-thread process、Hash 64 MiB、1探索600秒timeoutを維持する。欠落、timeout、不完全parent、provenance不一致はfail closedであり、途中workを別条件のteacherへ混ぜない。

このcoreとstable proposerができ、実bundle上のconsumer / verifier / teacherを完走してreceiptを閉じるまで、3 seed学習へ進まない。

## 8. 対局harnessも768局へ広げてから使う

現行v1計画の192 color-swapped pair / 384局は、worst-caseの95%誤差半幅が約7.1 percentage pointsになる。判定したい5 points marginに対して不足しているため、そのまま棋力gateには使わない。

別PRで予定するv2は、まだ実装も実行もしていない。停止・合格条件を先に次へ固定する。

- 384 color-swapped opening pair、合計768局を固定完走する
- 有効な途中結果でearly successもearly failureも宣言せず、全pair完了前の勝率を採用判断に使わない
- opening / colorをpair blockとして保つpair-stratified bootstrapを行う
- one-sided 95% lower boundが45%を超えることをsafety gateにする
- two-sided 95% intervalのlower boundが50%を超えた時だけ「stableより強い」と呼ぶ
- technical faultは0件を必須とし、1件でもあればrunをpassにしない

その前のstatic family gate、fresh final、未開封WCSC36 final、既知回帰、production parity / browserのどこかで落ちれば、対局harnessをunlockしない。v2 A/Bを通っても人間段位の証明ではない。外部高段校正は、その時点の公式規約と段級位表を再確認し、ユーザー承認後に別段で行う。

現時点の結論は短い。**強い棋譜を上書きする準備ができたのではなく、固定済みtraining rowsだけを後段へ渡す安全な入口ができた。** 次に閉じるべきものはteacher capabilityであり、強さの判定はまだずっと後にある。
