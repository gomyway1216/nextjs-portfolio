# 99 / 100で止まったteacherを、安全に再開可能にする

> 2026-07-19時点の記録。これは失敗runの棚卸しと、次のclean runへ適用するprospectiveな回復contractである。teacher dataset、再学習、棋力向上、live反映はまだ完了していない。English version: [blog-shogi-floodgate-strength-first-timeout-recovery.en.md](./blog-shogi-floodgate-strength-first-timeout-recovery.en.md)

## 実際に何が起きたか

最初のstrength-first runでは、24,000 training parentの実認証が1,088.743秒で成功した。その後12個の1-thread YaneuraOu processでdepth 16 teacher生成を始め、99 parentを`work.jsonl`へdata syncした。しかし100件目を処理していた独立MultiPV 1 / 1手`searchmoves`探索の1つが、固定上限600,000 msへ到達した。

旧実装はこのtimeoutを通常のErrorとして上へ返した。parent全体は保存されず、worker failureがrunnerまで伝播した。したがって結果は次の通りである。

| 項目 | 実測結果 |
| --- | ---: |
| input authentication | 成功、1,088.743秒 |
| durable parent entry | 99 |
| 100 milestone | なし |
| final teacher result | なし |
| training / selection / A/B | 未開始 |
| live weight change | 0 |

これは遅かったが、壊れたlabelや不完全resultを公開しないというfail-closed動作自体は正しかった。非公開のparent ID、digest、pathはこの記事へ載せない。

## 不完全な探索結果は使わない

600秒時点のPVやscoreを採用すると、固定depth 16を満たさない別contractのlabelになる。探索を`stop`して途中値を採る、浅いdepthへ落とす、別moveのscoreで穴埋めする、といったfallbackは禁止する。

新contractが認めるのは、型で確認できた`USI search timeout`だけを、次の明示的なno-label work entryとして記録することだけである。

- reasonは`search-timeout-no-label`
- proposalかindependent rescoreかを記録
- requested MultiPV、depth / nodes limit、`searchmoves`、固定timeoutを記録
- parentのlabel record、partial score、rankは0件
- entry全体をpayload SHA-256でbind
- resume時にrun fingerprint、raw parent、合法手、固定search contractと再照合

timeout以外のengine error、壊れたMultiPV、illegal move、不完全depth、checkpoint書込み失敗は従来通りrun全体を停止する。

## 同じprocessを再利用しない

JavaScript側のtimerが切れても、YaneuraOu processはまだ探索中かもしれない。そのprocessへ次の`isready`や`position`を送るのは安全ではない。

新実装は次の順序を固定する。

1. timeoutを型で識別する。
2. timed-out processへ`quit`を送り、短いbounded close後も残ればkillする。
3. processが閉じた後だけ、no-label timeout entryをdata syncする。
4. 次の仕事がある場合は、新しいprivate working directoryで新processを初期化する。
5. 同じpinned engine / eval / option / hermetic environmentだけを使う。

これにより、古い探索のstdout、TT、history、作業directoryを次parentへ持ち越さない。

初回processまたはreplacement processが`usiok` / `readyok` handshakeを完了できない場合も、wrapper自身とworker側の二重のcleanup境界で、quit、bounded force-kill、OS close待ちを完了してからerrorを返す。この初期化failureはsearch timeout skipには変換せず、追加のparent entryやresultを公開しないままrun全体を停止する。

短いhandshake timeoutはfocused test専用であり、production入口は型検査だけに頼らず、そのown propertyをinput capture、engine spawn、output作成より前に拒否する。本番の15秒 / 120秒初期化上限は実行時objectからも変更できない。

## timeoutを無制限にskipしない

1件のhard parentを除外できても、大量timeoutを「完了」と呼ぶことはできない。各canonical target prefixで累積上限を次の式へ固定する。

```text
timeout_skip_limit = ceil(target_parents / 1000)
```

| target | 最大timeout skip |
| ---: | ---: |
| 100 | 1 |
| 500 | 1 |
| 24,000 | 24 |

上限を超えたparentはskipとしても保存せず、runを停止する。non-timeout skipである「合法手2未満」とtimeout skipはprivate work entryで区別される。最終`parent-completion.jsonl`ではどちらも、処理済みだがtraining groupを出さない明示的`forced_parent_skipped=true`としてentry checksumへ結び付く。

したがって既存の完全accountingは変わらない。

```text
forced_parents_skipped + emitted_parent_groups = 24,000
model_training_parents = emitted_parent_groups
```

missing groupからskipを推測すること、別parentへの置換、resamplingは引き続き禁止である。

private `work.jsonl`を開かなくても上限を監査できるよう、各prefix milestone、teacher manifest、staged result、最終public resultは、`fewer_than_two_legal_moves`と`search_timeout_no_label`の正確な件数を持つ。最終3成果物の値は完全一致し、合計は`forced_parents_skipped`、timeout件数は上表の上限以下でなければならない。

`parent-completion.jsonl` v2のrowとbindingは変更しない。そこには従来どおり「groupを出したか」だけを記録し、理由別aggregateはこの回復amendmentでteacher completion文書へ追加必須とした。後続のtraining bridgeもv7 output rootを読み、manifestとpublic resultの理由別件数、一致、合計、24件上限をtraining開始前に再検証する。

## 99件を新revisionへ移植しない

旧`work.jsonl`のheaderと各entryは、旧runnerの完全Git revisionを含むrun fingerprintへbindされている。timeout回復codeを含む新revisionでそのまま開けば、正しくfingerprint mismatchになる。

99件を救うにはcross-revision migrationを新設し、旧entryをすべて再認証・再検証し、旧label policyから新policyへの権限を別途証明する必要がある。節約できるteacher時間は小さい一方、境界は大きく複雑になるため採用しない。

- failed v6 outputはprivateな失敗証拠として変更しない
- recovery runは新しいv7 output generationを使う
- 24,000 inputを再認証し、0件からclean startする

## 検証範囲

固定Node v22.13.0で、USI wrapper、generator、runnerの対象3 test file、51 testを通した。さらにtraining bridgeのstdlib test 8件も通した。focused testは、proposal / independent-rescore両方のtyped timeout、partial label 0件、fresh private directoryでのprocess replacement、初回とreplacementのhandshake timeout後にchildが残らないこと、cleanup failureが元の初期化failureを上書きしないこと、初期化failureが追加skipやresultにならないこと、test専用timeoutがproductionへ入らないこと、forced/emitted accounting、公開理由別件数、timeout metadata改ざん拒否、上限超過時の停止、新しいv7 rootとtraining前の再検証を確認する。

このpassは回復codeの検証であり、実teacher completionや棋力の証拠ではない。次はreview / CI / regular merge後にだけv7 runを開始し、100、500、24,000の各receiptを順に監査する。

機械可読記録は[timeout recovery evidence](./data/floodgate-strength-first-timeout-recovery-2026-07-19.json)、prospective policyは[timeout recovery amendment](../ml/protocols/floodgate-q1-2026-strength-first-timeout-recovery-amendment.json)に置いた。
