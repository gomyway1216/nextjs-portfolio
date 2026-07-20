# 将棋AI: 現行stableをYaneuraOuでローカル外部校正する対局adapter

> 2026-07-19時点で、実YaneuraOuとの校正対局は **0局**、棋力向上・高段・formal A/Bの主張も **0** である。今回追加したのは、現行stableと固定YaneuraOuを同じ局面から先後入替で対局させ、全局完走・cleanup成功後にだけ結果を返すローカルadapterである。live weights、holdout、production data、networkには書き込まない。[English version](./blog-shogi-local-external-calibration-adapter.en.md)

## なぜ必要か

これまでの内部対局scriptはJavaScript版V2〜V20同士を比較するもので、現在配信中のexact Worker / WASM / NNUE weightsを、独立した強いUSI engineへ接続していなかった。このため、内部指標が改善しても「外部の物差しに対してどの程度か」は未測定だった。

このadapterはその測定経路だけを作る。学習、candidate選択、formal A/B、live反映は行わない。小規模pilotが勝ち越しても高段の証明にはならず、負け越しても学習データやlive weightsを自動変更しない。

## 接続する実物

| 側         | 固定runtime                                             | search                                                                              | exact identity                                                                                      |
| ---------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 現行stable | production stable Worker / WASM / NNUE、12 workers      | depth 11、bookなし、各親局面でprivate TT clear、600秒technical timeout              | weights 1,185,988 bytes、SHA-256 `e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc` |
| 外部基準   | pinned YaneuraOu NNUE 9.60git APPLEM1、12 USI processes | depth 16、Threads 1、bookなし、毎手`isready` + `usinewgame`、600秒technical timeout | engine 700,048 bytes、SHA-256 `1e4971493f049f1c7d72a7e12555c3c2a3c2233f65a506eecb8ed7136bcdc5d1`    |

両runtimeは既存の固定asset authorityを使う。adapter自身はpath、engine、weights、depthを引数で差し替えられない。production側の関数は完全なrequestを1個必須とし、argumentless entryやCLIはない。

stable runtimeが要求するtraining-parent形状を満たすため、各局面のcanonical SFEN、game ID、SFEN由来position ID、move number由来plyを再導出する。`played_move`にはその局面の辞書順先頭の合法手を構造bindingとして渡すが、対局に採用する手はruntimeが独立に返した`stable_move`だけである。

## 公平性と完走条件

openingごとにscheduleはadapterが自動で2局作る。

1. stable先手、YaneuraOu後手
2. 同じcanonical openingからstable後手、YaneuraOu先手

callerは片側の色だけを省略したり、別openingへ差し替えたりできない。最大12局を並列実行できるが、receipt中の順番はopening順、stable先手、stable後手に固定される。

各手で次を検査する。

- SFENをbrowser engine表現へparseし、再encodeが完全一致すること
- rules-complete legal move集合を生成し、王をcaptureする異常局面を拒否すること
- engineのUSIがcanonicalで、exact legal集合に1件存在すること
- requestのdepth / timeoutとruntime receiptが一致すること
- stableのTT clearとYaneuraOuのreset-before-searchがbindingに含まれること

終局は合法手なし、4回同一局面、連続王手による千日手負け、事前固定max pliesで判定する。USI `resign` / `win`や不完全fixed-depth transcriptなど、既存runtimeが認証できない出力は勝敗へ推測変換せずtechnical faultとして全runを停止する。

## partial resultを出さない

1局でもillegal move、timeout、engine failure、accounting mismatch、abort failure、通常cleanup failureがあればcomplete receiptを返さない。先に完了した局も破棄し、例外に残すのは破棄局数、`receipt_issued=false`、`partial_result_publishable=false`だけである。勝敗や勝率の部分集計は返さない。

成功時もreceiptを返すのは両runtimeのcleanup後だけである。receiptは次をSHA-256へ束縛する。

- exact request、opening、色、depth、timeout、max plies、並列数
- 両runtime receipt
- 全USI moveと各search receipt
- final SFEN、終局理由、全局W/D/L
- exact required/completed game数、technical faults 0

時刻や絶対pathはdigestへ入れないため、同じfake inputは並列実行でも同じreceiptになる。

## 実測したtest

実装anchorは`70f9a6d0f1098dd37cb4024691ed92e8336582e9`である。独立reviewで、合法手が1手だけの局面を通常のMultiPV proposalへ渡すとtechnical faultになる問題と、到達不能な開始局面を受理する問題が見つかった。修正版は、唯一の合法手を同じ固定depth 16のMultiPV 1 / `searchmoves` rescoreへ渡す。またrequest capture時に、両陣営の王が各1枚、盤上と持駒を合わせた種類別駒数が物理上限内、両王同時王手ではなく非手番側の王が王手されていないこと、二歩がないこと、未成の歩・香・桂が行き所のない段にないことを検査する。完全な棋譜到達可能性の証明は主張しない。reviewで残ったP2も修正し、固定depth / timeoutと異なるrequestはruntime起動前に拒否し、主処理失敗と二次close失敗が同時に起きた場合は両方を診断へ保持する。

| 検証                                                                       |                                                結果 |
| -------------------------------------------------------------------------- | --------------------------------------------------: |
| adapter focused                                                            |                                        14 / 14 PASS |
| SFEN、軽量USI、production stable、production Yaneura runtimeを含む関連test |                                        81 / 81 PASS |
| P2修正前のML unit suite attempt                                            | 148 / 149 files、2,570 PASS、2 timeout FAIL、1 skip |
| timeout対象fileの単独再実行                                                |                                        13 / 13 PASS |
| fake USI subprocess対局                                                    |                   1 opening pair / 2局、各4手、PASS |
| reset trace                                                                |               初期ready 1回 + reference search前4回 |
| illegal move後のpartial discard                                            |                            先行1局を破棄、receipt 0 |
| 10ms synthetic timeout                                                     |                   両player abort + close、receipt 0 |
| 4回同一局面fixture                                                         |                                  両色とも12手でdraw |
| 連続王手千日手fixture                                                      |                        12手、連続王手側の負け、PASS |
| 応手なしfixture                                                            |                       1手、着手側の勝ち、両色、PASS |
| 実YaneuraOu / exact stable対局                                             |                                                 0局 |
| network / AWS / GCP / Firebase / Vercel                                    |                                                   0 |
| live / holdout / production-result write                                   |                                                   0 |

P2修正前の`5ff1bb6d`でML unit suite全体を実行し、148 / 149 files、2,570 PASS、2 timeout FAIL、1 skip、212.26秒だった。失敗は今回のadapter外にある既存`siblingTeacherGenerator.test.ts`の5秒timeout 2件で、直後の同file単独再実行は13 / 13 PASS、18.16秒だった。途中結果を全greenへ書き換えず、P2修正後のfull suiteは未再実行と記録する。型検査では今回の2 fileに新規errorはない。repository全体には今回と無関係な既存TypeScript errorがあるため、全体typecheckをPASSとは記録しない。ESLint、Prettier、Git diff checkはPASSした。

## 事前固定した12局pilot

実対局結果を見る前に、[pilot request](./data/shogi-local-external-calibration-pilot-request-2026-07-19.json)を1,677 bytes、SHA-256 `37cd8ba340566c0b797caf3ead6d95f0094d07d27932f1bc55b9984a2018dbca`で固定した。平手初期局面、矢倉系、振り飛車系、角交換、相掛かり系、中飛車系の公開標準手順から作った6局面を、それぞれstable先手 / 後手で1局ずつ、合計12局・最大12並列で実行する。探索条件はstable depth 11、YaneuraOu depth 16、各600秒technical timeout、最大8手で固定した。

これはadapterと固定assetが12並列で完走できるかを見るtechnical pilotである。8手上限のため全局drawでも不思議ではなく、勝率・Elo・段位・高段を評価する実験ではない。

独立request reviewは、request file identity、6本のsource move列からのSFEN、opening ID、重複なし、12局schedule、validatorを再導出し、P0 / P1 / P2 = 0 / 0 / 0でPASSした。run IDは末尾NULを含む46-byte domain `shogi-local-external-calibration-pilot-run-v1\0`と、`run_id`を除く1,372-byte canonical body（SHA-256 `0d84be515d14f54d7b7174638459ab58808eb35caab973ddbd18b6025381c0c1`）を連結してSHA-256を取った値である。

exact private assetのread-only preflightもPASSした。YaneuraOu、64,217,066-byte eval、stable weights / WASM / workerは固定identityと一致し、exact tree、private directory、stable read後の再検証もすべてtrueだった。adapterにはfilesystem / network / live weight / holdout / production-result writerがなく、pilot wrapperが許可される出力はprivate control directoryのPID、開始metadata、local log、全局完走receiptまたはW/D/Lを含まないfailure recordだけである。これでtechnical pilotの3事前gateはPASSした。

## 次のgate

実YaneuraOu pilotの開始条件は次であり、今回の固定12局technical pilotではすべてPASSした。

1. codeの独立reviewでP0 / P1が0
2. focused / related validationがreview対象commitでgreen
3. pilot openingとrequestを結果を見る前に固定し、同一opening先後入替を維持
4. exact private assetsのread-only preflightがgreen
5. live、holdout、production writerが閉じていることを再確認

最初のpilotはadapterが本当に完走できるかを見る校正であり、高段認定ではない。安定した高段相当を主張するには、より広い事前登録opening、十分な対局数、複数の外部基準、可能なら既知rating poolまたは人間ratingとの別校正が必要である。formal A/Bと外部校正の両方が揃うまでlive weightsは変更しない。

機械可読の値は[local external calibration adapter evidence](./data/shogi-local-external-calibration-adapter-2026-07-19.json)に記録する。
