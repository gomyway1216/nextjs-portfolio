# 将棋評価関数: formal A/B v2を実dual-WASM対局へ接続した

> 2026-07-20時点で、formal A/B本番結果はまだ **0 / 768局** であり、live weightも変更していない。今回追加したのはSTOP文書ではなく、review済みcandidateが登録された後に、candidateとstableを別々の実browser/WASM engineへ読み込み、同一openingを先後入れ替えて384 pair / 768局実行できるlocal-only経路である。English version: [blog-shogi-formal-paired-ab-v2-real-wasm-match-runtime.en.md](./blog-shogi-formal-paired-ab-v2-real-wasm-match-runtime.en.md)

## 結論

これまでのformal A/B v2には、統計decoder、opening schedule、履歴journal、ready-registry検証はあったが、任意のcandidate int16 weightと現行stable weightを2つの実engineへ同時にロードして対局させる実装がなかった。

今回、その欠けていた経路を追加した。

1. candidateとstableのexact weight fileを認証する。
2. それぞれを独立したNode child processのproduction browser/WASMへロードする。
3. 同じopeningからcandidate先手、candidate後手の2局を行う。
4. 2つのengineを終了・回収し、weight fileを再認証する。
5. そのすべてが成功したpairだけを、既存のformal v2 journalとdecoderへ渡す。

code-pinned ready registryはまだ未登録なので、実candidateは未登録でありformal runは開始していない。この変更だけで棋力が上がったとは主張しない。

## 1 pairで実際に起きること

| 項目         | 固定条件                                                               |
| ------------ | ---------------------------------------------------------------------- |
| engine       | production browser/WASM V20                                            |
| weight       | candidate / stableそれぞれ1,185,988 bytes、別path・別SHA-256           |
| process      | candidateとstableを別processへ隔離                                     |
| NNUE         | `K = 600`                                                              |
| search       | fixed depth 11、quiescence depth 10                                    |
| cache        | 各decision前にprivate TTをclear                                        |
| 禁止         | book、fallback、shared engine state、network、cloud、live-weight write |
| schedule     | candidate先手1局 + candidate後手1局                                    |
| adjudication | 合法手なし、4回同一局面、連続王手、512手上限                           |

親processが読んだweight identityをそのまま信用するのではない。各child processも自分で対象fileを読み直し、byte countとSHA-256を確認してからWASM memoryへコピーする。candidateとstableはmodule global、WASM memory、TT、NNUE bytesを共有しない。

各着手ではbrowser側の完全合法手集合とchild側の合法手集合が一致しなければ停止する。WASMが返した手が合法手集合にない場合、depth 11まで完了していない場合、または絶対値`89,990,000..90,000,000`の許可された早期詰みbandでない場合も、そのpairの結果は発行しない。

## 色替えと結果の向き

各openingは必ず次の順序で2局使う。

1. game 0: candidate先手、stable後手
2. game 1: stable先手、candidate後手

勝敗は常にcandidate視点の`win / draw / loss`へ変換する。同じopeningを先後で使うため、先手有利やopening固有の偏りをpair内で相殺できる。game IDとopening IDは既存v2 domain-separated ruleから再計算し、別のopeningや色順を差し込めない。

## 384 pair / 768局の実行と復旧

上位launcherは既存のreview済みready-registry validator、append-only hash-chain journal、game receipt validator、formal v2 decoderを再利用する。歴史的に公開済みの旧launcher fileは変更していない。

新しいlauncherが許すのはexact 384 pair / 768局、最大2 pair workerである。1 pairはcandidate / stableの2 processを使うので、最大4 engine processが同時に動く。

各pairは次をprivate `0600` artifactとして残す。

- `pair-started`
- 2件の`game-completed`と各transcript SHA-256
- `pair-completed`とcleanup / pair-receipt SHA-256
- 全着手、最終SFEN、裁定、cleanupを含むcanonical pair receipt sidecar

再開時は、完了済みの連続prefixをjournalとsidecarの両方から再認証し、完了pairを再実行しない。開始後にcrashしたpartial pairはtechnical faultとしてterminalになり、都合の悪い対局だけを再試行できない。sidecar、transcript、weight file、registry artifactのどれかが変わっても停止する。

## テストで実際に確認した範囲

テストには2種類ある。

- 実行経路テスト: 別SHA-256の1,185,988-byte fileを2つ作り、2つの独立child processへ本当にロードし、production browser/WASMで着手を探索し、色替えした2局のreceiptとprocess cleanupを確認した。Pythonから使うcanonical-stdin entryも実processで通した。
- 全量会計テスト: 384 pair / 768局のjournal、sidecar、最大2並列、完了prefix resume、crash terminal、artifact driftを高速な注入receiptで全件検査した。

後者は768局の実WASM強度計算ではない。したがって、このテスト結果をformal A/B勝利や高段棋力の証拠には使わない。機械可読な境界と検証結果は[real WASM match runtime evidence](./data/floodgate-formal-paired-ab-v2-real-wasm-match-runtime-2026-07-20.json)に固定した。

## 次に必要なもの

この実行経路を本番で開くには、候補選抜後の別reviewで、candidate weight、stable weight、384 openings、match bindingをready registryとしてexactに登録し、既存launcher側のcode pinを更新する必要がある。登録後は`run_pinned_ready_wasm_pairs`だけがそのcode-pinned registryを実行できる。

その後の順序はformal 384 pair / 768局、retention・regression確認、外部校正、rollback確認である。証拠が揃うまでlive weightは変更しない。
