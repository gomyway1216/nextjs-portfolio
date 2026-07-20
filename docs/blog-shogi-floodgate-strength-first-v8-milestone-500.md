# 正式v8教師生成が500枠をaccountingし24,000へ継続

> 2026年7月19日23:48:29 PDT、固定revision
> `400d3e33e8414cf071cbe3cc053e345bdc668ade`の正式v8教師生成がmilestone 500へ到達した。
> 正確な内訳は**label済みparent 499件 + search-timeout skip 1件 = 500枠**であり、
> 「500件すべてlabel済み」ではない。v8はtimeoutを完全には消していないが、登録済み上限内の
> 1件をlabelなしのskipとして隔離し、runを止めず同じ入力・fingerprintのまま24,000へ
> 自動継続した。完成dataset、再学習、棋力向上、live weight変更の証拠ではない。
> English version:
> [blog-shogi-floodgate-strength-first-v8-milestone-500.en.md](./blog-shogi-floodgate-strength-first-v8-milestone-500.en.md)

## 現在地

| 項目                           | 2026年7月19日23:48:29 PDT時点の証拠    |
| ------------------------------ | -------------------------------------- |
| 正式v8起動                     | 完了、固定revision `400d3e33…668ade`   |
| 元の訓練入力認証               | 完了、24,000親 / 1,000対局、約20分25秒 |
| milestone 100                  | 完了、100 label / skip 0               |
| milestone 500                  | 完了、499 label / timeout skip 1       |
| 24,000に対するaccounting進捗   | 500 / 24,000 = 約2.08%                 |
| 完成24,000 teacher dataset     | このsnapshotでは未証明、自動継続       |
| optimizer / 候補選抜 / 正式A/B | 0 / 0 / 0                              |
| live weight変更                | 0                                      |

[100-parent milestone](./blog-shogi-floodgate-strength-first-v8-milestone-100.md)以降に
400枠を追加accountingした。その増分はlabel済み399件、timeout skip 1件、child record group
4,605件である。累計はlabel済み499件、child record group 5,749件になった。これは教師生成が
実データ上で継続している証拠だが、評価関数そのものはまだ変更していない。

## v8はtimeoutをゼロにしたのではなく、上限内で継続できた

v7とv8の差を「v8ではtimeoutが起きない」と説明するのは誤りである。v7は500枠までに
timeoutを2件観測した。登録済みskip上限は1件だったため、2件目をlabelやskipとして保存せず、
milestone 500の前でfail closedした。

今回のv8もtimeoutを1件観測した。ただし500枠の上限1件以内だったため、そのparentを
`search-timeout-no-label` skipとして明示的に記録し、残る499 parentだけをlabel済みとして
accountingした。

| 比較                        | v7          | 正式v8             |
| --------------------------- | ----------- | ------------------ |
| 500枠までのtimeout          | 2件         | 1件                |
| 登録済みtimeout skip上限    | 1件         | 1件                |
| milestone 500               | 未完了      | 完了               |
| 500枠の内訳                 | 2件目で停止 | 499 label + 1 skip |
| その後                      | fail closed | 24,000へ自動継続   |
| 将来のtimeout完全排除を証明 | していない  | していない         |

改善点はskip上限を緩めたことではない。Hash 512 MiBのfresh v8 runで、このprefixでは
timeoutが登録済み上限を超えず、500 gateを通過できたことである。24,000までに許可されるskip数や
timeout規則は変更していない。

## 独立再検証した500-target prefix

稼働中の`work.jsonl`全体は500以降も増えるため、mutableなwhole-file SHAは公開しない。
milestoneが固定した**先頭501行だけ**をbyte単位で切り出し、milestone JSONとは別に
bytes・SHA・構成を再計算した。

| 検証対象                 | 独立再計算値                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| milestone checkpoint     | 2,338 bytes / SHA-256 `d8d5aeae084a16820cca13a3934096014456a24ec3901351a20bebd5927cee27`     |
| canonical prefix         | 6,834,309 bytes / SHA-256 `202310d4e858f15fc768f2680426b1b2a2eb05dde3ea788326b6c3a1e57490f1` |
| JSONL構成                | header 1 + labeled parent 499 + skip 1 = 501行                                               |
| unique labeled parent ID | 499件（ID値は非公開）                                                                        |
| child record group       | 5,749件                                                                                      |
| skip reason              | `search-timeout-no-label` 1件                                                                |
| run fingerprint          | `7c6a2fadb362bd40a015f76df2849e71dff24650472999599f91b5f67dac9628`                           |

checkpoint内のtarget / completedは500 / 500だが、これは500枠すべてがlabel済みという意味では
ない。runnerのaccounting contractでは、label済みparent group 499とforced skip 1を合わせて
500である。checkpoint内のbytes・SHA・件数は、独立に抽出したprefixと一致した。生の局面、
parent ID、候補手、秘密鍵、private absolute pathは公開していない。

## 所要時間とローカル資源

| 時点・資源                | 観測値                               |
| ------------------------- | ------------------------------------ |
| runner開始                | 22:59:48 PDT / 05:59:48 UTC          |
| 認証完了・engine開始      | 約23:20:13 PDT / 06:20:13 UTC        |
| milestone 100             | 約23:26:33 PDT / 06:26:33 UTC        |
| milestone 500             | 23:48:29 PDT / 06:48:29 UTC          |
| 起動から500まで           | 48分41秒                             |
| engine開始から500まで     | 約28分16秒                           |
| 100から500まで            | 約21分56秒                           |
| 探索構成                  | 12 engines × 1 thread × Hash 512 MiB |
| aggregate engine RSS peak | 約8.28 GiB                           |
| host CPU busy snapshot    | 99.88%                               |
| memory throttle / 電源    | 0 page / AC Power                    |

正式計算はAWS、Firebase/GCP、Vercelを使わず、このMac内だけで進めている。12 engineでCPUを
使い切りつつ、memory throttleは観測0だった。局面ごとの候補数と探索時間は一定でなく、今回の
400枠の速度だけを24,000完了時刻へ単純外挿しない。

## このmilestoneが証明しないもの

milestone自身は`authentication_receipt=false`かつ`playing_strength_evidence=false`である。
500枠prefixが完成した事実はあるが、完成24,000 datasetでも棋力receiptでもない。
timeoutを1件含むため「500件すべてlabel済み」「v8がtimeoutを完全に解消した」とも主張しない。

このsnapshotで完了していないものは、24,000 teacher dataset、seed 42 / 43 / 44のoptimizer、
候補選抜、sealed holdout、192 pair / 384 gameの正式A/B、外部校正、高段安定、live昇格である。
live weightは変更していない。

## 次の強さゲート

runnerは同じrun identityのまま24,000へ自動継続する。次の重要な実証拠は、全24,000枠を
label済みparentまたは登録範囲内のforced skipへ1対1 accountingしたcomplete teacher
datasetである。その後、固定seed 42 / 43 / 44の再学習、候補選抜、sealed holdout、正式
192 pair / 384 game A/B、外部校正を順に通す。対局で改善を確認し、安全な昇格条件が
揃うまでlive weightは変えない。

機械可読記録:
[floodgate-strength-first-v8-milestone-500-2026-07-19.json](./data/floodgate-strength-first-v8-milestone-500-2026-07-19.json)
