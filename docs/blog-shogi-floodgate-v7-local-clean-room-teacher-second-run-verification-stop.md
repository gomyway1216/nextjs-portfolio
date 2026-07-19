# ローカル教師生成2回目：コピー成功後に止まった本当の理由

2026年7月19日の2回目のローカル教師生成は、前回のGit制約を越えた。しかし教師エンジンを起動する前の検証で停止した。残存clean-roomを消さず、全byte監査と読み取り専用の単独再検証を行った結果、原因はデータ破損でもAWSでもタイムアウトでもなく、2つの安全契約の不整合だと確定した。

機械可読の根拠は [`data/floodgate-v7-local-clean-room-teacher-second-run-verification-stop-2026-07-19.json`](./data/floodgate-v7-local-clean-room-teacher-second-run-verification-stop-2026-07-19.json) に固定している。

## 1. どこまで進んだか

5つのmaterialization処理は5/5成功した。raw-lock、role-lock、role-bundle、teacher assetsの4ツリーがcopy-by-valueされ、accepted verifierも独立cloneされた。その後にしか作られないlegacy単一ファイルも08:21:13Zに作成済みだった。したがって停止位置はmaterializationではなく、その次のverificationである。

教師プロセス、100-parent checkpoint、教師行、学習、A/B、live weight変更はすべて0のままである。

## 2. コピーしたデータは壊れていない

4ツリーの全件監査結果は次の通りだった。

| 種類           |  files |         bytes | 差分 |
| -------------- | -----: | ------------: | ---: |
| raw-lock       | 72,698 |   592,412,617 |    0 |
| role-lock      |      3 |   273,287,877 |    0 |
| role-bundle    |      9 |   295,620,795 |    0 |
| teacher assets |      7 |    66,169,459 |    0 |
| 合計           | 72,717 | 1,227,490,748 |    0 |

path、type、mode、owner、nlink、全byteに差分はなく、sourceとdestinationのinode aliasも0だった。verifierはexact HEAD、1,431 tracked files、fsck、missing-object検査を通過した。

## 3. どの検証が失敗したか

同じ残存asset rootのauthority検証は読み取り専用で36ms PASSした。残るrole-bundle検証を単独で再実行すると、522.211秒で同じFAILを再現した。元実行のverification区間503–533秒にも一致する。

安全に公開できるsubstageは `role-lock-full-replay-watched-directory-closure-binding`、エラー分類は `full-replay watched directories do not bind the live role-lock closure` だった。

## 4. 根本原因

historical full-replay証拠は、role-lockの内容だけでなく、当時のparent/rootと3ファイルの `device / inode / ctime` まで固定していた。これは同じlive treeが途中で差し替わっていないことを証明する強い安全策である。

一方clean-roomは、sourceとinodeを共有しないcopy-by-valueを必須にしている。コピー先は全byteが同じでも、新しいinodeとctimeを持つ。つまり「元のinodeでなければ拒否」と「元のinodeを共有してはいけない」が同時に要求され、正しいコピーが必ず拒否されていた。

## 5. AWS、GCP、Vercelとの関係

この実行はMacローカルだけで動いた。AWSは不要・未使用で、AWS call、credential、network requestはいずれも0である。Firebase Cloud FunctionsはアプリのGCP backend、VercelはWeb配信だが、この教師生成・診断ではどちらも使っていない。

CIにある `AWS witness adapter contract (source only)` は未使用の接続契約を静的に検査する名前であり、AWS runtimeを起動した記録ではない。

## 6. 今回追加した診断改善

従来のCLIは外側の `phase=preparation` までしか示さなかった。診断commit `2caf94335d679139b977e9bacdacabca212a2624` では、private path、digest、生の例外文を出さず、copy 5系統とverification 2系統を固定enumで区別する `failure_kind` を追加した。

関連する6 test filesは60/60 PASSした。これは診断能力の証拠であり、教師成功や強さの証拠ではない。

その後、Fresh-QAT安全境界のPR #514を含むmain `9dc5755a…`を、この診断branchへ通常merge `74d825c1…`で統合した。failure-kind実装pathは不変で、Fresh-QAT実装pathもmerged mainと一致し、package / evidence pinを保持した。統合中の教師起動、学習、live weight変更は0である。

PRレビュー後のcommit `5c00ea32…`では、`failure_kind`の許可値を1つのruntime凍結配列へ集約し、TypeScriptの型も同じ配列から導出した。commit `c3a47e52…`では証拠テストのGit環境を固定PATH / HOME / locale、system / global config無効、optional lock無効へ揃えた。対象テストはそれぞれ26/26と6/6 PASSし、このレビュー修正でも教師起動、学習、live weight変更は0である。

PR #515の通常merge `5f2569dc…`直後の独立レビューで、凍結配列が可変な `Array.prototype.includes` を動的参照するため、prototype改変でprivate値を `failure_kind` に通せるP2を発見した。commit `52145c9f…`は、文字列型を先に要求し、module初期化時に固定取得した `Array.prototype.includes` と `Reflect.apply` だけで照合する。両error境界でprototypeを改変する回帰を追加し、対象28/28 PASS、private値開示0、教師起動・学習・live weight変更0を確認した。

## 7. 次の安全な修正

historical inode検査を単純に削るのは安全ではない。次のportable transitionを追加する。

1. original fixed role-lock上でhistorical full-replay closureを検証する。
2. そのsemantic/content authorityを、exact copy-by-value receiptへ内部的に結合する。
3. clean-room側では新しいfilesystem closureと全byte一致を再検証する。
4. source差し替え、destination mutation、byte変更、capability偽造・再利用を拒否する。

この修正をレビュー、CI、通常mergeした後にだけ、現在の残存clean-roomを再監査して除去し、同じローカルコマンドを再実行する。live weightは引き続き変更しない。
