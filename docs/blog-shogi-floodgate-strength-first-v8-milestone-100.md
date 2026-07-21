# 正式v8教師生成が実データ100親局面へ到達

> 2026年7月19日22:59:48 PDT、review・通常merge済みの固定revision
> `400d3e33e8414cf071cbe3cc053e345bdc668ade`から、正式v8教師生成をローカルMacで開始した。
> 元の24,000訓練親局面の認証を約20分25秒で終え、Hash 512 MiB・1 threadのYaneuraOuを
> 12 process起動し、23:26ごろに最初の100親局面を完了した。runnerは停止せず、
> 同じ入力・run fingerprint・`work.jsonl`のまま500、24,000へ自動継続する。
> これは実teacher workの進捗だが、完成dataset、再学習、棋力向上の証拠ではない。
> English version:
> [blog-shogi-floodgate-strength-first-v8-milestone-100.en.md](./blog-shogi-floodgate-strength-first-v8-milestone-100.en.md)

## 現在地

| 項目                        | 2026年7月19日23:26 PDT時点の証拠       |
| --------------------------- | -------------------------------------- |
| 正式v8起動                  | 完了、固定revision `400d3e33…668ade`   |
| 元の訓練入力認証            | 完了、24,000親 / 1,000対局、約20分25秒 |
| 実teacher milestone 100     | 完了、100 / 100親                      |
| milestone 500               | このsnapshotでは未証明、自動継続       |
| 完成24,000 teacher dataset  | 未証明                                 |
| 再学習 / 候補選抜 / 正式A/B | 0 / 0 / 0                              |
| live weight変更             | 0                                      |

以前はrunner実装と停止したv7の診断までしかなく、正式v8の実teacher label生成は始まって
いなかった。今回初めて、固定した正式v8 runnerが認証済み実入力を読み、100件の実parent
groupと1,144件のchild record groupを永続化した。したがって「学習前の教師データ生成が
実際に動き始めた」という前進である。一方、100件は24,000件の0.42%にすぎず、この時点で
評価関数自体は変わっていない。

## 独立再検証した100-parent prefix

稼働中の`work.jsonl`全体は100件以降も増えるため、その都度変わるwhole-file SHAを
公開記録には使わない。代わりにmilestoneが固定した**先頭101行だけ**をbyte単位で切り出し、
milestone JSONとは別に再計算した。

| 検証対象                          | 独立再計算値                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| milestone checkpoint              | 2,338 bytes / SHA-256 `a4442d8c12d459d1769ed86e4f44e3c0247ee1e66983609be151668e0fd556c5`     |
| canonical prefix                  | 1,362,695 bytes / SHA-256 `80b5605869994692b38f50cb56482f77a9e2374a50aebfbe77e7a216509cfb85` |
| JSONL構成                         | header 1行 + parent group 100行 = 101行                                                      |
| parent identity                   | 100件すべてunique（ID値は非公開）                                                            |
| child record group                | 1,144件                                                                                      |
| forced skip / search timeout skip | 0 / 0                                                                                        |
| run fingerprint                   | `7c6a2fadb362bd40a015f76df2849e71dff24650472999599f91b5f67dac9628`                           |

checkpoint内のbytes・SHA・件数と、独立に切り出したprefixの再計算値は一致した。これは
「この100-parent prefixが途中で別bytesへ変わっていない」ことを検査できるbindingである。
生の局面、parent ID、候補手、秘密鍵、private absolute pathは公開していない。

## 認証後は12 engineでCPUを使い切った

| 時点・資源                | 観測値                               |
| ------------------------- | ------------------------------------ |
| runner開始                | 22:59:48 PDT / 05:59:48 UTC          |
| 認証完了・engine開始      | 約23:20:13 PDT / 06:20:13 UTC        |
| milestone 100             | 約23:26:33 PDT / 06:26:33 UTC        |
| 起動から100まで           | 約26分45秒                           |
| engine開始から100まで     | 約6分20秒                            |
| 探索構成                  | 12 engines × 1 thread × Hash 512 MiB |
| aggregate engine RSS peak | 約8.17 GiB                           |
| host CPU busy snapshot    | 99.88%                               |
| memory throttle           | 0 page                               |
| 電源                      | AC Power                             |

約20分25秒の入力認証は順序依存の検査が中心で大半が直列だった。その後の探索は14 core中
12 processを同時に走らせ、観測snapshotではCPUを99.88%使った。今回の正式計算はAWS、
Firebase/GCP、Vercelを使わず、このMac内だけで進めている。RAMやSSDを無理に埋めるのではなく、
探索に必要な12 × 512 MiBのHashを確保しながらmemory throttleを0に保った。

## このmilestoneが証明しないもの

milestone自身が明示する値は`authentication_receipt=false`かつ
`playing_strength_evidence=false`である。入力認証が完了した事実と、100-parentのlocal
prefixが完成した事実はあるが、このcheckpoint単体は認証receiptでも棋力receiptでもない。
100件の途中データを完成24,000 datasetとして扱うこともできない。

このsnapshotで完了を主張しないものは、24,000 teacher dataset、seed 42 / 43 / 44の再学習、
候補選抜、封印holdout、384 pair / 768 gameの正式A/B、外部校正、高段安定、live昇格である。
live weightは変更していない。

## 次の強さゲート

runnerはoperator確認を待たず、同じrunで500、24,000へ進む。次に公開できる実証拠は
verified milestone 500とcomplete 24,000-parent teacher datasetである。その後、固定seed
42 / 43 / 44の再学習、候補選抜、sealed holdout、正式384 pair / 768 game A/B、外部校正を
順に通す。棋力改善が対局で確認され、安全な昇格条件が揃うまでlive weightは変えない。

機械可読記録:
[floodgate-strength-first-v8-milestone-100-2026-07-19.json](./data/floodgate-strength-first-v8-milestone-100-2026-07-19.json)
