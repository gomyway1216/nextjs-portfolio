# fresh教師の「timeout 0件」前提を実測で修正

> 2026年7月20日、4,800親のfresh-selection教師を12並列で実行した旧v1は、同じ非公開親局面で
> 2回停止した。その実測を基にtimeoutを最大5件だけラベルなしで隔離するv2方針を事前固定し、
> 13並列のクリーンなv2 runは約57分30秒で完走した。4,800親すべてをaccountし、timeout 2件、
> 部分label 0件のまま4,798 parent group / 28,518 recordを完成させた。これは候補選抜や棋力向上、
> 高段到達、live weight変更を示す結果ではない。
> English version:
> [blog-shogi-floodgate-strength-first-fresh-timeout-quarantine-v2.en.md](./blog-shogi-floodgate-strength-first-fresh-timeout-quarantine-v2.en.md)

## 何が起きたか

| 実行 | wall time | 完了済み親 | emitted group / record | 完了dataset / result |
| --- | ---: | ---: | ---: | ---: |
| v1初回 | 1,194.49秒 | 1,678 / 4,800 | 1,678 / 9,993 | 0 / 0 |
| 同一条件resume | 784.54秒 | 2,669 / 4,800 | 2,669 / 15,884 | 0 / 0 |
| クリーンv2 | 約3,450秒 | 4,800 / 4,800 | 4,798 / 28,518 | 1 / 1 |

どちらも12個のYaneuraOu、各1 thread、Hash 512 MiB、proposal depth 14 /
MultiPV 6、独立rescore depth 16、1 searchあたり600,000 msを使った。
初回もresumeも同じ非公開親でtimeoutした。親ID、SFEN、指し手、教師scoreは公開しない。

`work.jsonl`はheader 1行とparent 2,669件、重複0、skip 0、完成済みlabel record
15,884件を保持している。directoryは`0700`、fileは`0600`で、`selection.jsonl`、
`manifest.json`、`authority.json`、`result.json`は作られていない。したがって部分datasetを
候補評価へ流した事実も、live weightを変更した事実もない。

その後のクリーンv2 runは13 engineで4,800親を完了した。timeoutした2親は上限5件の範囲で
`search-timeout-no-label`として隔離し、途中のrank、score、recordをdatasetへ1件も残していない。
`4,798 emitted parent group + 2 timeout skip = 4,800 completed parent`であり、timeout以外のskipは
0件である。4,798親から28,518 recordを生成し、完了datasetとresultを保存した。AWS、GCP /
Firebase、Vercelのtraining computeは0で、live weight writeも0である。

| v2完了artifact | bytes |
| --- | ---: |
| selection dataset | 23,800,461 |
| canonical work | 35,630,716 |

dataset、work、completion、generation、runの完全なidentityは末尾の機械可読記録へ保存した。
privateな親ID、SFEN、指し手、教師score、absolute pathは公開しない。

## なぜ同じ実行を繰り返さないか

24,000親の正式training教師ではtimeoutが15件、率にして0.0625%だった。この率を単純な
Poisson近似へ置くと、4,800親で期待されるtimeoutは3件である。

| 事象 | 概算確率 |
| --- | ---: |
| timeout 0件 | 4.98% |
| timeout 5件以下 | 91.61% |

独立同分布は近似にすぎず、同じ親が2回止まった事実は決定論的なhard caseを示す。それでも
「0件でなければ全run失敗」は、実測上ほとんど完走しない契約だった。3回目の同一resumeは
進捗を増やしてもその親を埋められないため停止した。

## v2で変えること

shared v2 policyはfresh-selectionとfresh-finalの両方へ、次を観測前に固定する。

- typedなproposalまたはindependent-rescore timeoutだけを、ラベルなしで隔離する。
- 上限は`ceil(4,800 / 1,000) = 5`件。6件目は即fail-closeする。
- timeoutした親の途中rank、score、recordは1件もdatasetへ残さない。
- engineを終了して新しいengineを起動してから次の親へ進む。
- proposal incompleteは従来どおりfatalとする。
- 全合法手fallback中のtimeoutもfatalとする。
- `fewer_than_two_legal_moves`と`search-timeout-no-label`を別々に数える。
- 全4,800親、emitted親、forced親、理由別forced親のdigestとcanonical `work.jsonl`を
  manifest / authority / resultへ束縛する。

最大欠落率は5 / 4,800 = 0.1042%である。stableとseed 42 / 43 / 44は、全て同じ固定datasetで
比較する。最終的な棋力はこのoffline選抜だけで主張せず、sealed holdoutと正式paired A/Bで
別に判定する。

旧v1の2実行は12 processだった。その後、同じ42局面を`12 → 13 → 13 → 12`で測った
MultiPV 6のABBA比較では13 processが両pairで速く、中央値throughputも約3.94%高かった。
したがってクリーンなv2実行は13 process、各1 thread、Hash 512 MiB
（合計6,656 MiB）を使う。探索条件とtimeout契約は変えていない。

## v1をv2へ混ぜない

旧v1 workはrunner revision、search policy、run fingerprintへ固定されている。headerだけを
書き換えたり、2,669件をv2として再封印したりしていない。診断証拠として非公開保存し、v2は
新しい固定rootから4,800親をクリーン生成した。

約57分30秒の再計算になったが、異なる契約のlabelを混ぜず、再現可能なprovenanceを維持した。

## 実装検証と現在の境界

generator、共通artifact validator、fresh-selection / fresh-final runnerのfocused suiteは
4 files / 64 testsがPASSした。記事証拠を含む統合実行も7 files / 76 testsがPASSした。
実生成fixtureで、timeout隔離後のengine restart、部分label 0、6件目fail-close、
proposal incomplete fatal、fallback timeout fatal、不許可skipを含むresumeのpre-engine停止、
source順序・game数、入れ子のsearch / score / record改変を確認した。

新規生成と既存resultの再利用は同じ共通validatorを必ず通る。`result.json`が存在するのに
manifest、authority、dataset、workのどれかが欠けていれば再開扱いにせずfail-closeする。
独立レビューでこのvalidator / runner境界にblockerなしを確認し、Node v22のTypeScript
compileとdiff checkもPASSした。

さらに、候補評価の直前へ読み取り専用semantic bridgeを追加した。これは引数を受け取らず、
OSの現在ユーザーhomeにある固定source / result / manifest / dataset / workだけを上限付きで読む。
resultからmanifest実体、そのdataset / work identity、completion、run fingerprint、
generation fingerprintを相互照合した後、各parentのsearch / score / child recordを再導出する。
全artifactのbytesとSHA-256を整合するよう書き換えたfixtureでも、入れ子の意味改変は候補評価・
registry候補出力より前に拒否された。tracked policyと実装は読取前後で同じclean HEADであることを
確認し、private artifactは後段Pythonが公開前に再fingerprintする。

このbridgeの実generator fixtureを含むTypeScriptは5 files / 68 tests、Pythonの評価・builder
focused suiteは33 tests、Python全体は416 testsがPASSした。TypeScript compile、ESLint、
Prettier、diff checkもPASSし、独立監査はこのsemantic-only境界をGOと判定した。

実v2 runは4,800親のaccounting、4,798 group / 28,518 record、timeout隔離2件、部分label 0件で
fresh-selection教師生成を完了した。read-only semantic validationもPASSし、実identityから生成した
selection evaluator registry候補と追跡対象registryがbyte-exactで一致した。次はこのREADY登録を
review・mergeし、stableとseed 42 / 43 / 44を同一datasetで選抜評価する。候補選抜、holdout、
正式A/B、外部校正はまだ完了しておらず、強くなった、高段へ到達したという証拠ではない。
live weight変更は0のままである。

機械可読記録:
[floodgate-strength-first-fresh-timeout-quarantine-v2-2026-07-20.json](./data/floodgate-strength-first-fresh-timeout-quarantine-v2-2026-07-20.json)
