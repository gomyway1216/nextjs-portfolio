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

## callbackも検証区間の外で動かさない

後続PRは意味を持つ処理を次の単一APIへ渡す。

```text
with...CompositeDestinationRevalidation(seal, operation)
```

APIは最初の`await`より前に`inUse`を立て、destination / parentのpre-revalidation、callback、Promise / thenable assimilation、post-revalidationを直列に行う。同時borrow、callbackの同期throw / async reject、前後検証、file descriptor close、active revokeのどれかが失敗すればsealを永久に失効させる。成功したsealの3 gate上限はこの基盤では自己申告せず、後続のsession compositionが管理する。

独立reviewでは、通常functionのconfigurableな`length` getterがpre-revalidation前に実行できる問題を検出した。修正後は`length`を通常readせず、own property descriptorがdata descriptorかだけをgetter非実行で確認する。fake compositeとvalid compositeの両方でgetter call count 0を回帰テストした。

## ローカル検証

Node v22.13.0で次を確認した。

- portable witness専用test: 16 / 16 PASS
- 既存copy regression: 13 / 13 PASS
- 合計: 29 / 29 PASS、1.21秒
- evidence pin test: 4 / 4 PASS
- 関連3 file合計: 33 / 33 PASS、1.12秒
- scoped ESLint: PASS
- Prettier: PASS
- `git diff --check`: PASS
- repository全体TypeScript: 既存baseline errorのみ、今回変更fileのerrorは0

敵対ケースには、sourceのbyte変更、tree root / standalone fileのdelete-recreate同一byte、destinationのbyte変更、root inode swap同一byte、extra / missing entry、shared-parent sibling追加、fake / clone / replay、cross-kind、wrong / overlap destination、kind欠落 / 重複、production / test cross-token、callback `length` getter、thenable getter内のdestination変更、同期 / 非同期callback失敗、同時borrow、idle / active revokeを含めた。

symlink、hardlink、mode、single-link、source / destination inode alias、copy descriptor close failureは既存copy regressionでも引き続き検証している。

## AWS、GCP、Vercelは使ったか

使っていない。この基盤とunit validationはローカルfilesystem / CPUだけで完結した。

| infrastructure                 | 今回の使用                     |
| ------------------------------ | ------------------------------ |
| ローカルMac CPU / filesystem   | unit testとhash / metadata検証 |
| AWS                            | 0、不要                        |
| Firebase Cloud Functions / GCP | 0                              |
| Vercel                         | 0                              |
| network                        | 0                              |
| teacher process                | 0                              |
| optimizer training             | 0                              |
| live weight activation         | 0                              |

Firebase FunctionsがGCP、VercelがWeb deploymentを担当することとは別系統であり、今回の評価関数学習準備にAWSを導入する理由はない。

## まだ強くなった証拠ではない

このPRはdormant foundationであり、import / mergeだけではfilesystem I/Oを開始しない。generic role-lock / role-bundle / result verifier、training consumer、teacher runner、local runnerをimportも変更もしていない。

実データに対する新しい意味検証、teacher label、再学習、候補選抜、holdout、正式A/B、外部校正、ライブ重み変更はすべて0である。したがって棋力向上の証拠ではなく、copy先を将来安全に検証するための前提だけを追加した。

machine-readable evidenceは[`floodgate-v7-portable-copy-witness-foundation-2026-07-19.json`](./data/floodgate-v7-portable-copy-witness-foundation-2026-07-19.json)にある。

## 次に必要なこと

次の別PRでは、source presealとfilesystem sealの間に変更していないgeneric source semantic verifierを置き、その成功結果とcopy witnessを合成する。さらにlocal teacher sessionがexact 3 gateだけを直列borrowし、成功・失敗のどちらでも`finally`からcomposite sealをrevokeする。

その統合PRでもgeneric verifierのinode検査は弱めない。reviewとCIが通った後にだけ残存clean-roomを安全監査し、新しい入口でローカルteacher準備を再開する。意味検証が通るまではteacher、学習、選抜、A/B、ライブ重みへ進まない。
