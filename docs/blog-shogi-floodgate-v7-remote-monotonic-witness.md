# Floodgate v7：再起動後の巻き戻しを検出する「遠隔・単調証人」のプロトコル境界

日付：2026-07-18

状態：**UNAVAILABLE / STOP（ソースとテストだけ）**

英語版：[blog-shogi-floodgate-v7-remote-monotonic-witness.en.md](./blog-shogi-floodgate-v7-remote-monotonic-witness.en.md)

## 1. 今回の結論

同じ Mac のディスクとプロセス内 high-water だけでは、再起動後やディスク全体のオフライン巻き戻しを検出できない。そこで、現在の権限状態を別の障害領域へ単調に記録し、ローカル状態と毎回照合するための、provider-neutral な遠隔証人プロトコルを実装した。

ただし今回できたのは、固定バイナリ記録、署名付き応答、compare-and-swap（CAS）、競合時に一方だけを採用する参照状態機械、ローカル照合ゲート、独立ゴールデン検証までである。ネットワーク、クラウド資源、永続データベース、KMS 鍵、認可、writer、provisioner、inspector はまだ存在しない。したがって本番は引き続き **UNAVAILABLE / STOP**、固定実行ファイルは exit 78 のまま、ライブ評価関数も不変である。

実装境界はコミット `b6bc5146f7512db9653a7e04aacaf363f65e3735`、ツリー `d448abfc901cbf0570d43adfb50768c52e244282` に固定した。

前段の main push で見つかった証拠テスト不具合は #503 で修正し、全 CI とレビュー後に通常 merge commit `bb08e6019b1a42f631be06e400df01b1baf336f4` としてマージ済みである。このブランチには merge commit `92f3f5850c2896fb4194a1d4b885ec9e378a75b6` で取り込んだ。

## 2. なぜ同一ディスクの防御だけでは足りないのか

前段では、固定 root 配下の厳密な所有権・mode・ACL・`O_NOFOLLOW`・link count・連番 journal・`flock` と、プロセス存続中の high-water を導入した。これは同じ起動中の後退、同一 sequence の置換、協調 writer との競合を止める。しかし、攻撃者が Mac を停止して state ディレクトリ全体を古いスナップショットへ戻した場合、再起動した reader には「古いが内部整合した状態」に見える。

遠隔証人は、ローカル journal とは別の障害領域に最後に受理した checkpoint を保持する。ローカルが古い、遠隔が古い、sequence が同じで digest が違う、鍵・journal・期待 head のいずれかが違う場合は、すべて継続せず STOP にする。遠隔側だけが先に進んでいる場合も自動修復はせず、人間が原因を確認するまで止める。

この層が必要なのは棋力を直接上げるためではない。教師生成、再学習、候補選抜、正式 A/B の入力と実行境界が、古い権限状態へ静かに戻されないようにするためである。

## 3. 212 / 418 / 530 バイトの固定記録

wire format は big-endian、schema version 1、reserved 0、audience と purpose を固定し、可変長 JSON を信頼境界に置かなかった。

- `AuthorityRollbackCheckpointV1`：212 bytes、magic `FGV7ARC1`
  - journal ID、sequence、authority public-key record SHA-256、journal header SHA-256、最後の journal entry SHA-256、期待 activation head SHA-256、直前に証人が受理した checkpoint SHA-256 を固定する。
  - sequence 1 だけ predecessor は全ゼロ、sequence 2 以降は非ゼロでなければならない。
- `RemoteMonotonicWitnessRequestV1`：418 bytes、magic `FGV7RWR1`
  - query は後半 276 bytes が全ゼロでなければならない。
  - advance は期待する現 checkpoint digest、候補 checkpoint digest、候補 212 bytes を固定する。
- `RemoteMonotonicWitnessReceiptV1`：530 bytes、magic `FGV7RCP1`
  - witness ID、endpoint ID、signer key ID、client nonce、operation ID、request digest、checkpoint digest、checkpoint 本体、発行・失効時刻、Ed25519 signature を固定する。
  - 有効期間は 1...30 秒、query の rejected receipt は不許可である。

必須の ID・digest はゼロを拒否する。さらに、checkpoint 内の意味 role 群、request の identity role 群、receipt の identity / digest role 群は、それぞれの群内で同じ 32 bytes を共有できない。異なる群をまたぐ全 role の一意性までは要求していない。Swift と独立した Node parser が同じ transcript を再構築し、checkpoint `98920198…a22fda`、query `91fb95e4…db39d6`、advance `7e9f3aea…0b2a8a`、固定 signature receipt `3386755f…b0b0727` を一致させた。

## 4. CAS、競合、操作履歴をどう扱うか

advance は、遠隔の現 checkpoint SHA-256 が request の expected digest と完全一致する場合だけ受理する。次の sequence は必ず `current + 1`、journal ID、authority key record digest、journal header digest は不変、candidate の predecessor は current checkpoint digest でなければならない。

同じ predecessor から二つの候補を同時送信するテストでは、`NSLock` 下の参照状態機械がちょうど一方だけを accepted、もう一方を rejected にした。accepted operation ID と request digest は最大 4,096 件の台帳へ残す。参照実装には別に journal sequence の上限 4,096 があり、sequence 1 から開始した場合に新しい successor checkpoint を確定できるのは最大 4,095 回で、4,097 への advance は台帳に空きがあっても STOP する。これは本番向けの無期限サービスではなく、有限の参照契約である。

途中に別の advance が入った後でも、完全に同じ古い request の再送は当時の candidate を返して accepted のままになる。すでに accepted 台帳へ入った operation ID を別 request に再利用した場合は STOP する。rejected だった operation ID は台帳に記録しないため、この参照実装はその ID の後日の再利用までは拒否しない。

独立レビューで、初版は checkpoint を先に更新してから receipt を構築・署名していたため、時刻不正、role alias、signer failure のときに「応答なしで状態だけ進む」問題が見つかった。修正版は、遷移を評価し、payload・signature・receipt をすべて正常に構築してから、例外を出さない最後の区間でメモリ状態と操作台帳を確定する。これら三つの失敗経路で状態と台帳がゼロ変更であることをテストした。

これはメモリ内参照モデルの原子性であり、クラッシュ耐性の証拠ではない。本番 provider は checkpoint、4,096 件の操作台帳、返却する署名済み receipt を一つの永続トランザクションまたは同等の transactional outbox で確定し、確定前の署名を外へ公開してはならない。

## 5. ローカル照合と「古い時計」の拒否

内部の `RemoteMonotonicWitnessGateV1` は、request 開始時計を読み、ローカル state を fresh read してから、nonce と operation ID に束縛した query を作り、署名済み receipt を検証する。その checkpoint とローカル token の journal ID、sequence、authority key record、journal header、最後の entry、期待 activation head の六項目が完全一致しなければ STOP する。最後にローカル state をもう一度読み、通信中に変化していないことも要求する。

witness ID、endpoint ID、期待する公開鍵、nonce、operation ID、clock、fetch は internal test harness から渡す。receipt が暗号学的に束縛されるのは witness / endpoint ID、期待する公開鍵に対応する signer key ID、nonce、operation ID、request、checkpoint である。clock と fetch callback はテスト実行を制御する入力であり、その識別子自体が receipt に入るわけではない。この gate は nonce の予測不能性や本番公開鍵の固定そのものも証明しない。それらは今後の production wiring の必須条件である。

レビューではもう一つ、通信前に渡された `nowUnixSeconds` を受信後にも使うと、30 秒を超えて遅延した receipt を新鮮と誤認できる問題が見つかった。修正版は内部の trusted clock を request 開始、receipt 受信、ローカル再確認完了の三回読む。時計の巻き戻り、受信時の期限切れ、完了境界での期限切れをすべて拒否し、receipt は受信時と完了時の二回検証する。

この gate と clock、fetch、state machine は internal/test-only である。public API の厳密 symbol graph は、caller が witness ID、endpoint、key、URL、provider、store、gate を差し替える入口、protected witness type の alias・property・追加 callable を拒否する。現在の production executable に接続する公開入口はない。

## 6. 実測した検証結果

ローカル実測は次のとおり。

- Swift：104 / 104 tests PASS
- Swift release build：PASS
- Node 22.13.0：golden 5 tests と既存互換 evidence 4 tests、合計 9 / 9 PASS
- signed receipt：530 の全 byte 位置について 1 bit 変更を行い、Ed25519 検証がすべて失敗
- exact public symbol graph（Xcode 15.3 / Swift 5.10）：575 symbols、635 relationships、`57ff6311d811d0f4ae3459cdc65d0a87c2595f78a45d91565ba714f5c39f2461`、semantic gate PASS
- PR #504 の external trust-root CI 実測（Xcode 26.5 / Swift 6.3.2）：575 symbols、678 relationships、`1c7cfd318999e04a46513d96895f6b345801b948937fdc01a7064fe42d16266a`、semantic gate PASS

Swift 6.3.2 の値は当初の derived projection と完全一致した。PR #504 の head `ead8bf5a3965f48878c798aa14e33f01694828b5` を main `bb08e6019b1a42f631be06e400df01b1baf336f4` へ試験 merge した revision `7b4d2a058457e938eb2eeff440445e43fc05936d` について、workflow run `29656667943` / job `88112184102` / artifact ID `8433092951` から取得した **measured PR CI artifact** である。external trust-root job の証拠には数えるが、PR 全体の CI は引き続き完了待ちである。

implementation exact-state の独立レビューは、途中で見つかった原子性・時計・履歴・semantic guard の問題を修正した後、P0 / P1 / P2 = 0 / 0 / 0 になった。

## 7. 今回できていないこと

次の値はすべてゼロであり、できたとは主張しない。

- real remote endpoint、durable database、KMS/private key、TLS pinning、advance authorization
- root-owned local writer、provisioner、release installer、production inspector
- 本番 Mac での root state 作成・読み取り・書き込み
- supervisor / verifier / launcher への遠隔 gate 組み込み
- teacher 100 / 500 / 24k の生成、再学習、候補選抜、正式 A/B、外部校正
- ライブ評価関数の変更、棋力向上、高段安定

単一 witness signer が悪意を持つ場合の split view、provider 管理者と signer の共謀、クラウド control-plane rollback も除外していない。最終 threat model では、独立 provider の 2-of-2 または 2-of-3、あるいは append-only public log / gossip のどちらかを必須条件とする。今回の一つの署名は、その条件を満たさない。

## 8. 次の provider 実装候補

最初の本番 spike は、固定 API Gateway host、Lambda、DynamoDB の strongly consistent read と conditional write、非 export KMS Ed25519 key を組み合わせる案が最小である。DynamoDB は強整合 read と条件付き更新を提供するが、PITR restore や管理者操作を単独で排除するものではないため、復元後の identity 固定と第二の独立証人が必要になる。

比較対象は Cloudflare Durable Objects と Cloud Spanner である。Durable Objects は単一 object の直列化が簡潔だが PITR/control-plane の扱いを単独の信頼根にできない。Spanner の external consistency は強いが、この段階には運用規模が大きい。これは調査結果であって、provider 選定・契約・deployment 完了の証拠ではない。

参照した一次資料：

- [DynamoDB read consistency](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html)
- [DynamoDB condition expressions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.ConditionExpressions.html)
- [DynamoDB point-in-time recovery restores](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/pointintimerecovery_restores.html)
- [API Gateway Regional custom domain setup](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-regional-api-custom-domain-create.html)
- [AWS KMS asymmetric key specs](https://docs.aws.amazon.com/kms/latest/developerguide/symm-asymm-choose-key-spec.html)
- [What are Cloudflare Durable Objects?](https://developers.cloudflare.com/durable-objects/concepts/what-are-durable-objects/)
- [Cloudflare Durable Objects SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- [Cloud Spanner TrueTime and external consistency](https://docs.cloud.google.com/spanner/docs/true-time-external-consistency)

## 9. 棋力目標への位置づけと次の順序

この PR は「高段になった」PR ではない。高段を測る実験が、再起動やオフライン巻き戻しで別の権限状態へすり替わらないための前提を一段進めた。

#503 は通常マージまで完了した。ここからの順序は、(1) この source/test-only protocol PR を CI・レビュー後に通常マージ、(2) 固定 provider と KMS を使う永続 CAS service、(3) root writer / provisioner / inspector と全 handoff の fail-closed 組み込み、(4) target Mac の安全な production probe、(5) teacher 100 → 500 → 24k、(6) 再学習と候補選抜、(7) 正式 A/B と外部校正である。

ライブ重みは、候補が既存 champion に対して統計的・運用的に勝ち、安全 gate がすべて PASS するまで変更しない。
