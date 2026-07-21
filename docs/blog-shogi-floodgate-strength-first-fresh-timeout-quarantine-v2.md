# fresh教師の「timeout 0件」前提を実測で修正

> 2026年7月20日、4,800親のfresh-selection教師を12並列で実行した旧v1は、同じ非公開親局面で
> 2回停止した。その実測を基にtimeoutを最大5件だけラベルなしで隔離するv2方針を事前固定し、
> 13並列のクリーンなv2 runは約57分30秒で完走した。4,800親すべてをaccountし、timeout 2件、
> 部分label 0件のまま4,798 parent group / 28,518 recordを完成させた。その後、4モデルの実選抜評価まで
> 完了し、全候補がstableのint16 pair / top1を上回ったが、固定済みfamily gateはFAILした。候補選抜、
> 高段到達、live weight変更を示す結果ではない。
> English version:
> [blog-shogi-floodgate-strength-first-fresh-timeout-quarantine-v2.en.md](./blog-shogi-floodgate-strength-first-fresh-timeout-quarantine-v2.en.md)

## 何が起きたか

| 実行           |  wall time |    完了済み親 | emitted group / record | 完了dataset / result |
| -------------- | ---------: | ------------: | ---------------------: | -------------------: |
| v1初回         | 1,194.49秒 | 1,678 / 4,800 |          1,678 / 9,993 |                0 / 0 |
| 同一条件resume |   784.54秒 | 2,669 / 4,800 |         2,669 / 15,884 |                0 / 0 |
| クリーンv2     |  約3,450秒 | 4,800 / 4,800 |         4,798 / 28,518 |                1 / 1 |

どちらも12個のYaneuraOu、各1 thread、Hash 512 MiB、proposal depth 14 /
MultiPV 6、独立rescore depth 16、1 searchあたり600,000 msを使った。
初回もresumeも同じ非公開親でtimeoutした。親ID、SFEN、指し手、教師scoreは公開しない。

`work.jsonl`はheader 1行とparent 2,669件、重複0、skip 0、完成済みlabel record
15,884件を保持している。directoryは`0700`、fileは`0600`で、`selection.jsonl`、
`manifest.json`、`authority.json`、`result.json`は作られていない。したがって部分datasetを
候補評価へ流した事実も、live weightを変更した事実もない。

その後のクリーンv2 runは13 engineで4,800親を完了した。timeoutした2親は上限5件の範囲で
`search-timeout-no-label`として隔離し、途中のrank、score、recordをdatasetへ1件も残していない。
`4,798 emitted parent groups + 2 timeout skips = 4,800 completed parents`であり、timeout以外のskipは
0件である。4,798親から28,518 recordを生成し、完了datasetとresultを保存した。AWS、GCP /
Firebase、Vercelのtraining computeは0で、live weight writeも0である。

| v2完了artifact    |      bytes |
| ----------------- | ---------: |
| selection dataset | 23,800,461 |
| canonical work    | 35,630,716 |

dataset、work、completion、generation、runの完全なidentityは末尾の機械可読記録へ保存した。
privateな親ID、SFEN、指し手、教師score、absolute pathは公開しない。

## なぜ同じ実行を繰り返さないか

24,000親の正式training教師ではtimeoutが15件、率にして0.0625%だった。この率を単純な
Poisson近似へ置くと、4,800親で期待されるtimeoutは3件である。

| 事象            | 概算確率 |
| --------------- | -------: |
| timeout 0件     |    4.98% |
| timeout 5件以下 |   91.61% |

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
selection evaluator registry候補と追跡対象registryがbyte-exactで一致し、そのREADY登録は
PR #579でreview後に通常mergeした。

## 最初の実選抜呼び出しは評価前に安全停止した

READY登録のmerge後、固定local evaluatorを初めて実行したところ、候補checkpoint 3本のstrict loadは
完了したが、約4秒でselection dataset読込・selection metric推論より前にfail-closeした。
生のpreflight receiptにある`training_plan`は確立済み契約どおり
`path` / `bytes` / `sha256`の3 fieldだったが、evaluator側だけが追加の`schema`を含む4 fieldを
要求していたためである。selection metric評価は0件、selection outputは0件、
fresh-final holdout readは0件、live weight writeは0件だった。したがって、これは候補の勝敗でも
棋力測定でもない。

この限定修正はPR #581でreview後に通常mergeした。preflight receiptの既存3-field形をそのまま受理し、
schemaはREADY registryへenroll済みのtraining plan identityから取得する。教師artifactのidentityと
checkpoint preflightのbindingは変更していない。

## 2回目の実選抜呼び出しも評価前に安全停止した

PR #581のmerge後に固定local evaluatorを再実行した。約13.2秒で候補checkpoint 3本をstrict loadし、
fresh-selectionの28,518 recordをすべて読み、上限付きでstrict scanした。その全recordには設計どおり
per-recordの`split`がなかった。一方、再利用したlegacy loaderは`train`または`val`を必須とするため、
全recordを対象外として拒否した。教師dataが壊れていたのではなく、固定roleのfresh-selection形式を
legacy loaderへ渡すadapterの橋渡しが欠けていた。

checkpoint 3本の事前strict loadと、selection metric用modelのloadは別段階である。後者はstable・
candidateとも0件で、metric評価0件、selection output 0件、fresh-final holdout read 0件、live weight
write 0件のまま停止した。このため2回目も候補の勝敗や棋力測定ではない。

adapter限定修正は、`split`が欠けたrecordだけを`val`へ投影したprivate `0600`一時fileを作り、既存
`split`が1件でもあれば拒否する。元recordのidentity、順序、feature、CP、rankは維持し、一時fileは
成功時も例外時も削除する。元の教師artifactは変更しない。この修正はPR #583でreview後に通常mergeした。

## 3回目は4モデルを完走したが、固定family gateで停止した

PR #583のmerge後、同じ固定datasetでstableとseed 42 / 43 / 44を評価した。正式CLIは4モデルの計算後、
固定family gateのFAILを返してexit code 2で停止した。CLIの正確なwall timeは永続記録していないため、
概算時間を証拠値にはしない。STOP payloadの`candidate_evaluations: 0`は全STOP理由で固定される
fail-closed fieldで、内部work counterではない。gate判定前にはstable 1本＋candidate 3本のmetric評価4件が
実際に完了した。その後、outputを発行しない読取専用aggregate診断で同じ計算を再現した。
この再現診断は49,692 eligible pairを72.525秒で処理し、最大RSSは452.2 MiBだった。下表のaccuracyは
fraction、MAEはcentipawnで、機械可読記録と同じ再現実測値である。

| model   |         float pair |         int16 pair |         float top1 |         int16 top1 |          float MAE |          int16 MAE |
| ------- | -----------------: | -----------------: | -----------------: | -----------------: | -----------------: | -----------------: |
| stable  | 0.5927513483055623 | 0.5915841584158416 | 0.3040850354314298 | 0.3034597749062109 |  525.0306201407702 |  526.6006381934217 |
| seed 42 |   0.60363841262175 | 0.6013040328423086 | 0.3186744476865361 | 0.3153397248853689 |  405.6228289329656 |  405.9221193632092 |
| seed 43 |  0.602511470659261 | 0.6019882476052484 | 0.3186744476865361 | 0.3161734055856607 |   405.502088185782 |  402.7880987446525 |
| seed 44 | 0.6018071319327055 | 0.6000563470981245 | 0.3238849520633597 | 0.3186744476865361 | 405.48167040083933 | 405.71302335367136 |

gate marginは正なら通過余裕、負なら閾値超過である。stableは比較基準なので4 gateの対象外である。

| seed |          int16 pair > stable |         int16 top1 >= stable |        abs float/int16 pair delta |         abs float/int16 top1 delta | 全4 gate |
| ---- | ---------------------------: | ---------------------------: | --------------------------------: | ---------------------------------: | -------: |
| 42   | PASS `+0.009719874426467046` | PASS `+0.011879949979157978` | **FAIL `-0.0003343797794413978`** |      PASS `+0.0016652771988327998` |     FAIL |
| 43   | PASS `+0.010404089189406829` | PASS `+0.012713630679449806` |     PASS `+0.0014767769459873552` |      PASS `+0.0024989578991246276` | **PASS** |
| 44   | PASS `+0.008472188682282944` | PASS `+0.015214672780325178` |     PASS `+0.0002492151654189794` | **FAIL `-0.00021050437682363244`** |     FAIL |

固定順位は`43 -> 42 -> 44`で、中央値representativeはseed 42だった。しかしseed 42はpairの量子化差gateを
外し、seed 44はtop1の量子化差gateを外した。全4 gate通過はseed 43だけの1 / 3で、最低2 seedという
条件、representative全4通過、全seedの両量子化差gate通過をいずれも満たさず、family gateはFAILした。

全候補のint16 pair / top1とMAEがこのfresh-selection dataset上でstableより良いことは有望な静的結果だが、
family gateを通過した候補selectionではなく、対局棋力や高段を証明しない。evaluation report、receipt、
publication resultの出力はすべて0、fresh-final holdout read、正式A/B、外部校正、live weight writeも0である。
次は固定gateを緩めず、seed 42 / 44で外れたfloat-to-int16差を直接減らすquantization-alignment fine-tuneを
行い、別candidateとして同じ手順で再評価する。

機械可読記録:
[floodgate-strength-first-fresh-timeout-quarantine-v2-2026-07-20.json](./data/floodgate-strength-first-fresh-timeout-quarantine-v2-2026-07-20.json)
