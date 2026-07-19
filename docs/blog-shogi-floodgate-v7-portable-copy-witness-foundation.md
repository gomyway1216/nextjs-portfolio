# Floodgate v7 portable copy witness基盤: 新しいinodeを安全に引き継ぐ

> 2026-07-19時点の結論: clean-roomへのcopy自体は全byte一致で成功していた。停止原因はデータ破損でもtimeoutでもなく、過去の意味検証receiptが元sourceのinodeを正しく固定する一方、copy-by-valueがcopy先に新しいinodeを正しく要求するという、2つの安全契約の衝突だった。このPRはその間を将来つなぐfilesystem-only基盤を追加する。意味検証、teacher、学習、候補選抜、A/B、ライブ重みは実行も許可もしていない。English version: [blog-shogi-floodgate-v7-portable-copy-witness-foundation.en.md](./blog-shogi-floodgate-v7-portable-copy-witness-foundation.en.md)

## 何が522.211秒後に止まったのか

2回目のMacローカルclean-room準備では、4 treeのcopyとverifier repositoryのmaterializationがすべて完了し、その後にstandalone legacy exclusion fileもcopyされた。copy先だけを隔離してrole-bundle verifierを再現すると、522.211秒後に次の安全なsubstageで停止した。

```text
role-lock-full-replay-watched-directory-closure-binding
```

元sourceで成功済みのhistorical full-replay receiptは、role-lockのparent、root、対象fileのdevice / inode / ctimeを固定している。clean-room copyはhard linkやfilesystem cloneを使わず、新規inodeへ全byteを書き直す。したがってcopy先のbyteが完全に同じでも、元inodeを参照するhistorical receiptをそのままcopy先へ適用してはいけない。

これは次の2つが同時に正しいという意味である。

1. generic verifierは、別inodeをhistorical source receiptとして受け入れてはいけない
2. clean-room copyは、sourceと同じinodeを使ってはいけない

generic verifierのinode検査を弱める修正は行っていない。

## 3つの実測時間を混同しない

| 測定                                         |         時間 | 対象                             | 結果                        |
| -------------------------------------------- | -----------: | -------------------------------- | --------------------------- |
| historical role-lock full replay             | 14,059.521秒 | 元sourceのhistorical full replay | PASS                        |
| current source full role-bundle confirmation |   1,089.52秒 | 元sourceの現行full bundle検証    | PASS                        |
| copied destination isolated verification     |    522.211秒 | copy先のrole-bundle検証          | inode closure bindingでFAIL |

14,059.521秒は過去のfull replay全体、1,089.52秒は元sourceに対する現行bundle confirmation、522.211秒はcopy先で停止点を分離したrunである。同じ処理の速度比較ではなく、完了範囲も結果も異なる。

copy監査で記録した4 treeは合計72,717 files / 1,227,490,748 bytesで、byte mismatchは0、source / destination inode aliasも0だった。standalone legacy fileのcopy完了はこのtree合計とは別に確認した。したがって「copyされたデータが壊れた」が今回の原因ではない。

## このPRが追加したもの

変更範囲は[`ml/floodgate-v7-clean-room-copy.ts`](../ml/floodgate-v7-clean-room-copy.ts)とunit test、文書だけである。次の4 kindを曖昧なく区別する。

- `raw-lock-tree`
- `role-lock-tree`
- `role-bundle-tree`
- `legacy-file`

filesystem capabilityはmodule-privateな`WeakMap`にだけ実体を持つ。外へ返すobjectはnominal typeの空のfrozen objectで、object spread、clone、同じ形の偽物から内部状態を再構成できない。production用registryとtest用registryも別であり、片方が発行したcapabilityをもう片方へ渡すと拒否する。

状態遷移は次の順序に固定した。

```text
source preseal
  → 外部の意味検証を置くためのgap
  → one-shot source filesystem seal
  → existing copy coreによるby-value copy
  → one-shot copy witness
  → 4 kindすべてのcomposite destination seal
  → serialized pre / callback / post revalidation
  → explicit idempotent revoke
```

presealはsourceのexact path、entry path / type、mode、uid、nlink、device、inode、ctime、mtime、birthtime、size、SHA-256を内部に保持するが、destinationを作らない。後続PRはpresealとfilesystem sealの間で、変更していないgeneric source verifierを実行する。

filesystem sealはpresealを1回だけ消費し、source全体を再取得して一致した場合だけcopyへ進める。copy witnessは別実装のreceiptを自己申告させず、既存copy coreが最終revalidationで得た非公開inventoryへ直接bindする。既存のpublic copy receipt、受入条件、error shapeは変えていない。

## なぜcomposite sealが必要か

`raw-lock`、`role-lock`、`role-bundle`は同じ`inputs` parentへ並列に作られる。最初のtreeをcopyした直後にparent identityを固定すると、正しい後続siblingの作成だけでparent ctimeが変わる。

そこで各copyは個別witnessだけを返し、4 kindすべてが成功した後に初めてcomposite sealを作る。composite作成時は次を行う。

1. kindの欠落、重複、capability replayを拒否する
2. destination pathの重複とancestor / descendant overlapを明示的に拒否する
3. 全destination root / fileを再取得する
4. 重複を除いた各immediate parentのidentityとexact entry一覧を取得する
5. 全destinationとparentをもう一度取得し、途中変更がないことを確認する

parent scanは`readdir`で全entryを先に配列化しない。`opendir.read()`で最大`maxEntries + 1`件目をprobeし、保持するentryは`maxEntries`以下に制限する。「余分な1件をfilesystemから読まない」とは主張しない。

## callback前後を検証するが、実行中のnamespace排他性は主張しない

後続PRは意味を持つ処理を次の単一APIへ渡す。

```text
with...CompositeDestinationRevalidation(seal, operation)
```

APIは最初の`await`より前に`inUse`を立て、destination / parentのpre-revalidation、callback、Promise / thenable assimilation、post-revalidationを直列に行う。同時borrow、callbackの同期throw / async reject、前後検証、file descriptor close、active revokeのどれかが失敗すればsealを永久に失効させる。成功したsealの3 gate上限はこの基盤では自己申告せず、後続のsession compositionが管理する。

独立reviewでは、通常functionのconfigurableな`length` getterがpre-revalidation前に実行できる問題を検出した。修正後は`length`を通常readせず、own property descriptorがdata descriptorかだけをgetter非実行で確認する。fake compositeとvalid compositeの両方でgetter call count 0を回帰テストした。

PR #517のCopilot reviewはさらに、witness一覧の検査が変更可能な
`Array.prototype.includes`を実行時に参照していたことを指摘した。これを単独で直すだけでは不十分だった。
広い監査では、module読み込み後に`WeakMap.prototype.get` / `set` / `delete`を書き換えると、
本物のprivate stateを偽capabilityへ代入したり、one-shot消費を無効化してreplayさせたりできることも
確認した。

commit `89de568e`は、必要な`Array` / `String` / `WeakMap` / `WeakSet`のmethodと
`Reflect.apply`をmodule初期化時に取得し、その後は取得済みの`Reflect.apply`からだけ呼ぶ。
保護対象のcopy / portable capability pathでは、`Map` / `Set`の変更可能なinstance methodへの
実行時依存も、明示的なkind比較、短い配列のlinear scan、pairwise identity比較へ置き換えて除去した。
選択したcollection / string methodのdynamic instance-call scanは0件である。

module読み込み後にそれらのintrinsicを敵対的に変更するtestでも、fake state代入、消費済みwitnessの
replay、destination overlapを拒否し、`Array.prototype.every`が常にtrueを返すよう変更されても
destination byte mutationを検出した。commit `11b7c9e6`では、正規compositeの処理でraw private
stateを観測できたと仮定した後、そのstateを偽witnessへ返す順序に回帰testを強めた。ただし保証するのは**module初期化後**に取得対象intrinsicが
変更された場合である。module初期化前からrealmが侵害されている場合や、Node builtinを含む
任意のprototype変更すべてに耐えるとは主張しない。

最初にpushしたPR head `bfcf9773`のCore quality CIはgreenだった。その後、intrinsic hardeningを
含む状態でtest-isolation failureを初めてtriggerしたfollow-up head `b818f9a4`では、199 test
files中195 PASS / 1 FAIL / 3 skip、raw footerの3,344 testsに対して3,189 PASS / 1 FAIL /
150 skip、unhandled error 1を記録した。後者3分類の合計は3,340であり、残る4 taskは
unreported / unclassifiedとして保持する。同じrealmの汚染がVitest自身のtask accountingを
中断したためで、raw totalを都合よく3,340へ書き換えない。
失敗したのは実装ではなく、この敵対testが`Array.prototype.includes`を壊したまま`await`し、
同じrealmのVitest task update自身が`includes`を呼んだためだった。

commit `67353985`は`array-includes`、`weak-collections`、`collections`の3 adversarial modeを
plain Node child processへ隔離し、外側のVitest realmではprototypeを変更しない。commit
`57cb3142`はchildへ渡す環境をPATH / HOME / TMPDIRと言語・test設定に限定し、`NODE_OPTIONS` /
`NODE_PATH`を継承しないこともchild内で確認する。3 modeは3 / 3 PASSである。最初のCI failureを
実装failureへ書き換えず、test harness isolationの発見として残した。

隔離後のhead `70a7dd89`ではportable testはPASSした一方、Core quality CIがPR #517の変更pathではない
既存`floodgateStableProposalFinalizationResume.test.ts`の`does not steal a stale authorization
marker`で1件失敗した。199 filesは195 PASS / 1 FAIL / 3 skip、3,344 testsは3,193 PASS /
1 FAIL / 150 skipで、こちらの分類合計はraw totalと一致する。同じtargetをNode v22.13.0で
単独10回実行すると10 / 10 PASSし、同時刻のPR #518 CoreもPASSした。1回の失敗をportable実装の
failureへ読み替えず、変更外の既存testの非決定的failureとして履歴を残し、無関係な実装変更は加えなかった。

さらにsynthetic private temp fixtureで境界を確認した。callback内でdestinationの共通ancestorを一時的にrenameし、同じabsolute pathへ異なるbyteのreplacementを作って読み、callback終了前に元を戻すと、post-revalidationは元のidentityを再確認してPASSする。実private dataは読んでいない。

したがってAが主張するのはcallback**前後**のexact revalidationであり、callback実行中のabsolute-path namespace exclusivityや、callbackが読んだbyteのsemantic authenticityではない。これは隠れた安全保証として扱わない。後続Bはdestinationをheld directory / file descriptorから読み、そのexact bytesをsource verifierが認証したSHA-256とrecord identityへ一致させなければならない。

## ローカル検証

Node v22.13.0で次を確認した。

- portable witness専用test: 19 / 19 PASS
- 既存copy regression: 13 / 13 PASS
- 合計: 32 / 32 PASS、1.42秒
- evidence pin test: 4 / 4 PASS
- prototype poisoning plain-Node child mode: 3 / 3 PASS
- 関連3 file合計: 36 / 36 PASS、1.50秒
- PR #518統合前のcopy利用側runner / gate / finalizer拡張回帰: 7 files、107 / 107 PASS、1.73秒
- 最新`main`統合後の同じ7 files: 113 / 113 PASS、3.90秒
- 変更外stale-authorization-marker targetの単独反復: 10 / 10 PASS
- CI同等core再実行: 198 / 199 files、3,342 PASS / 1 FAIL / 1 skip、76.55秒
- scoped ESLint: PASS
- Prettier: PASS
- `git diff --check`: PASS
- repository全体TypeScript: 既存baseline errorのみ、今回変更fileのerrorは0

CI同等core再実行の唯一のfailureは、shared `node_modules`の`tsx` loaderがこのworktreeではなく
sibling worktreeのabsolute pathから読まれ、既存offline loader-path境界が拒否したものだった。
portable poisoning fileはPASSし、1回目に見えたstable-WASM startup timeoutも再発していない。
このlocal worktree固有runをauthoritative GitHub CIのgreenとは扱わない。

敵対ケースには、sourceのbyte変更、tree root / standalone fileのdelete-recreate同一byte、destinationのbyte変更、root inode swap同一byte、extra / missing entry、shared-parent sibling追加、fake / clone / replay、cross-kind、wrong / overlap destination、kind欠落 / 重複、production / test cross-token、callback `length` getter、`Array` / `Map` / `Set` / `String` / `WeakMap` / `WeakSet` / `Reflect`の読み込み後poisoning、thenable getter内のdestination変更、同期 / 非同期callback失敗、同時borrow、idle / active revokeを含めた。

symlink、hardlink、mode、single-link、source / destination inode alias、copy descriptor close failureは既存copy regressionでも引き続き検証している。

failure-kindのintrinsic hardeningを含むPR #516の`main` `0dd5469cefd88823b9b50c97c0e3531b4323eace`は、先に通常merge commit `5fa4e179a86a5873c08be4b2863ae4075f6a059b`で統合した。その後、checkpoint runtime-claim順序修正を含むPR #518の最新`main` `3bdf6d1127b86401ef08854737c700629a2d2ea7`を通常merge commit `df7118cd81aefa932f033399a96475ae6069d11b`で統合した。後者もportable implementation / testのpathとbytesを変えていない。READMEは、2回目のverification STOP、dormant portable foundation、checkpoint runtime-claim修正の各sectionをすべて保持している。履歴は書き換えていない。

## 最終reviewとvalidation CI

固定head `ce6f576c`の独立最終再reviewはP0 / P1 / P2 / P3 = 0 / 0 / 0 / 0、
GitHub review threadはresolved 1 / unresolved 0だった。同headのCI validation run
`29686674413`はCore quality job `88192022566`を325秒でPASSし、aggregate job
`88192494226`もPASSした。security run `29686674457`、E2E、全scanner、source-only
contract、Vercel Web previewを含むPR check rollupは15 / 15 PASS、failure 0、pending 0で、
PRはCLEAN / MERGEABLEだった。

この成功runをmachine evidenceの`ci.validation_run`へ固定した。いま加えるのはその事実を記録する
evidence / 日英記事 / READMEだけの最終commitであるため、そのcommit自身のSHAを同じcommitへ
自己参照で埋め込まない。代わりに`ci.final_head_ci`はPR #517のstatus check rollupで確認し、
**final-head CIも全required check成功、未解決thread 0、mergeableになるまでmergeしない**。

## AWS、GCP、Vercelは使ったか

使っていない。この基盤とunit validationはローカルfilesystem / CPUだけで完結した。

| infrastructure                   | 今回の使用                     |
| -------------------------------- | ------------------------------ |
| ローカルMac CPU / filesystem     | unit testとhash / metadata検証 |
| AWS                              | 0、不要                        |
| Firebase Cloud Functions / GCP   | 0                              |
| Vercel                           | 0                              |
| 基盤runtime / unit testのnetwork | 0                              |
| GitHub PR / CI network           | source control / 検証だけ      |
| teacher process                  | 0                              |
| optimizer training               | 0                              |
| live weight activation           | 0                              |

Firebase FunctionsがGCP、VercelがWeb deploymentを担当することとは別系統であり、今回の評価関数学習準備にAWSを導入する理由はない。GitHubへのpushとCIは当然networkを使うが、評価関数の計算、teacher、学習の実行基盤ではない。

リポジトリ共通CIには`AWS witness adapter contract (source only)`という名前のcheckがある。これはAWS serviceを起動するcheckではなく、将来用adapterのsource contractだけを検証する。Vercel checkもPRのWeb preview deploymentであり、将棋teacherや学習を実行しない。今回の基盤からAWS serviceを呼んだ回数は0である。

## まだ強くなった証拠ではない

このPRはdormant foundationであり、import / mergeだけではfilesystem I/Oを開始しない。generic role-lock / role-bundle / result verifier、training consumer、teacher runner、local runnerをimportも変更もしていない。

実データに対する新しい意味検証、teacher label、再学習、候補選抜、holdout、正式A/B、外部校正、ライブ重み変更はすべて0である。したがって棋力向上の証拠ではなく、copy先を将来安全に検証するための前提だけを追加した。

machine-readable evidenceは[`floodgate-v7-portable-copy-witness-foundation-2026-07-19.json`](./data/floodgate-v7-portable-copy-witness-foundation-2026-07-19.json)にある。

## 次に必要なこと

次の別PRでは、source presealとfilesystem sealの間に変更していないgeneric source semantic verifierを置き、その成功結果とcopy witnessを合成する。destination inputはheld directory / file descriptorから読み、そのexact bytesをsource verifierのSHA-256 / record identityへbindする。さらにlocal teacher sessionがexact 3 gateだけを直列borrowし、成功・失敗のどちらでも`finally`からcomposite sealをrevokeする。

その統合PRでもgeneric verifierのinode検査は弱めない。reviewとCIが通った後にだけ残存clean-roomを安全監査し、新しい入口でローカルteacher準備を再開する。意味検証が通るまではteacher、学習、選抜、A/B、ライブ重みへ進まない。
