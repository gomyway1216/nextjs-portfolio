# 正式v9教師24,000局面が完了した

> 2026年7月20日、ローカルMacで実行していたstrength-first v9教師が
> 24,000親局面をすべて処理し、再学習用データを完成させた。修正中のdownstream verifierでも
> 実データ全体の再検証がPASSした。ただし、3-seed学習はまだ始まっておらず、棋力向上や
> 高段到達を示す結果ではない。live weightも変更していない。English:
> [blog-shogi-floodgate-strength-first-v9-teacher-completion.en.md](./blog-shogi-floodgate-strength-first-v9-teacher-completion.en.md)

## 完了したもの

| 項目                           |        実測結果 |
| ------------------------------ | --------------: |
| 入力 / 処理済み親局面          | 24,000 / 24,000 |
| 学習へ出力した親group          |          23,980 |
| labelなしskip                  |              20 |
| `search_timeout_no_label`      |              15 |
| `proposal_incomplete_no_label` |               5 |
| `fewer_than_two_legal_moves`   |               0 |
| 学習row                        |         278,736 |
| 3-seed学習process              |               0 |
| live weight変更                |               0 |

教師は13個のYaneuraOu processをローカルで並列実行した。各processは1 thread、Hash 512 MiB、
候補提案はdepth 14 / MultiPV 12、各候補の独立再評価はdepth 16 / MultiPV 1である。
AWS、GCP、Vercelなどのcloud計算は使っていない。

主要な完成物は次のidentityで固定した。

| file                      |                     bytes / rows | SHA-256                                                            |
| ------------------------- | -------------------------------: | ------------------------------------------------------------------ |
| `result.json`             |                     19,911 bytes | `ccdefb750896471e8fca6740801e3b86d8d5a581d00edb0add34a16fa75e5d88` |
| `work.jsonl`              | 331,235,047 bytes / 24,001 lines | `c215e3cbe8b25483a25b0aa8ae7a80a495a7b72b824a4f9313ddcdc607e7da61` |
| `train.jsonl`             | 236,990,586 bytes / 278,736 rows | `4a18b186c255b66dd195ec4c781381bc10d583951acfa8a690a9c152467b9580` |
| `parent-completion.jsonl` |   13,293,512 bytes / 24,000 rows | `b92df8b37287010cd1314df853a0e337881c5cde573f5c3a4be9b4391639444f` |
| `manifest.json`           |                      7,248 bytes | `f75d38211ea9b65ae79db749f0bc240e40221ba367d70362f2d1e82b74d399e3` |
| `staged-result.json`      |                      2,380 bytes | `36ae1ffe3ad2ed1a4af2364eec3f2cbfbe195ae918f70ac649e764acfe33dbf8` |

## 完了後に見つかったverifierの不具合

独立監査はP0 0件、P1 1件、P2 0件だった。P1は教師データの破損ではない。v9生成器は
正しいv9 revisionを成果物へ記録していたが、共有downstream verifierの3か所がv8用の
revisionを期待したままだった。そのため、正式データに対する最初のplan候補作成は
`input-binding`で安全に停止した。

v8は従来の固定値を維持し、v9入力revisionをrunner / manifest / staged resultへ厳密に
束縛する最小修正後、固定commandで正式成果物を全走査した。
50.74秒、最大RSS 898,203,648 bytes、swap 0で、24,000親、23,980 group、20 skip、
278,736 rowの意味検証がPASSした。focused testも6件すべてPASSした。この修正は本記事と
同じPRでreview対象であり、exact planはまだ発行していない。

## 学習thread数は2を維持する

教師完了後、seed 42 / 43 / 44を同時に動かす合成QAT実測で、各process 2 threadsと4 threadsを
`2, 4, 4, 2`の順に比較した。4 threadsのpair speedupは1.003031倍と0.962423倍、
中央値は0.982727倍で、採用条件の1.05倍へ届かなかった。したがって各seed 2 threadsを選んだ。
「最大thread数」が「最速」とは限らないため、実測に従い3 process合計6 intra-op threadsで
正式学習へ進む。

benchmark receiptは30,416 bytes、
SHA-256 `4903916e4f1770947fad8986a9b0119ab41b5c63b94fffa259c796b46188ec9d`
である。実行revisionは`f0f943e5251bc8b511a050e614561eca3903f8ba`、確認時のmainは
`e9fed482e4d83a38feddaf6dabf3abd66d09aab9`だった。後者までの差分はPR #569のweb/blogだけで、
benchmark本体、学習loss、fixed-point計算、plan builder、training bridge、launcherの
bytes/hashはすべて同一だった。このcross-revision同値性を記録して実測を採用するが、
実行revisionを現在のmainだったとは扱わない。

## まだ強くなったとは言えない

ここまでで完成したのは教師labelと、学習へ安全に渡す検証である。新しい評価関数はまだ0個で、
対局結果も0局である。次は修正をreview・mergeし、exact planを登録してseed 42 / 43 / 44を
並列学習する。その後、fresh selection、封印holdout、正式paired A/B、外部校正を通す。
それらの証拠が揃うまでlive weightは変更しない。

機械可読記録:
[floodgate-strength-first-v9-teacher-completion-2026-07-20.json](./data/floodgate-strength-first-v9-teacher-completion-2026-07-20.json)
