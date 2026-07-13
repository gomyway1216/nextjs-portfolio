# v7候補集合をlabel生成から分離する

> 固定production USI runtimeは、depth 16 / MultiPV最大12のproposalと、1手ずつのindependent rescoreを実行できるようになった。しかしproposal上位だけでは、強豪棋譜で実際に指された手やstable評価関数の手を落とし得る。このPRは、1つのtraining parentについて`proposal最大12 + played 1 + stable 1`を最大14手の候補集合へまとめるpure synchronous coreを追加する。これは構造と意味の整合性を検査するtest-only coreであり、入力のproduction由来を一切認証せず、teacher scoreやlabelも作らない。English version: [blog-shogi-floodgate-v7-candidate-union.en.md](./blog-shogi-floodgate-v7-candidate-union.en.md)

---

## 2026-07-13時点の境界

| 項目                             | このPRの状態 | 意味                                                          |
| -------------------------------- | ------------ | ------------------------------------------------------------- |
| candidate union pure core        | 実装対象     | proposal / played / stableを合法手集合上で結合する            |
| rules-complete legal derivation  | core内部     | callerのcount / movesだけを信用せずSFENから再計算する         |
| candidate上限                    | 最大14       | MultiPV 12、played 1、stable 1のunique union                  |
| independent rescore              | 未実行       | 全候補を`required-not-yet-run`として返す                      |
| input authentication             | なし         | production-shaped plain objectはproduction capabilityではない |
| per-parent HMAC checkpoint       | 次のP1       | durableなproposal / rescore / sealはまだ作らない              |
| real data / engine execution     | 未接触       | 実棋譜も実engineもこのcoreから呼ばない                        |
| selection / final holdout / 棋力 | 未接触       | selection、封印holdout、A/B、段位を示さない                   |

## 1. なぜ最大14手なのか

production proposalは合法手数に応じて`MultiPV = min(12, legalMoveCount)`を返す。v7ではそのroot moveに、強豪棋譜のplayed moveとstable policy moveを必ず加える。

```text
candidate_set = unique(
  production_proposal[0..11]
  + strong_game_played_move
  + stable_policy_move
)
maximum_unique_candidates = 12 + 1 + 1 = 14
```

playedまたはstableがproposal内にあれば同じ手を増やさない。playedとstableが同じ手でも1 candidateである。候補数14は探索幅の新しい可変optionではなく、固定proposal contractから導かれる安全上限である。

この段階ではproposal順位を最終teacher順位として使わない。proposalは候補を見つける処理であり、全unique candidateは後続段階でそれぞれMultiPV 1 / `searchmoves` exactly one moveとして再探索される。

## 2. 合法手集合はcoreが再導出する

callerは、後続production coordinatorが観測した合法手projectionを渡す。しかしcoreはその配列をteacher truthとして信用せず、parent SFENをparseして`rulesCompleteLegalMoves`を再実行する。

| 検査対象                | coreの確認                                                    |
| ----------------------- | ------------------------------------------------------------- |
| parent SFEN             | canonical SFEN、move number、ply、position IDを再導出する     |
| caller legal count      | coreが再計算した合法手数とexact一致させる                     |
| caller legal moves      | 集合一致を確認し、core側でUTF-8 bytewise順に正規化する        |
| played / stable move    | どちらも再計算済み合法手集合に含まれることを要求する          |
| proposal root moves     | 全て合法、canonical USI、重複なし、MultiPV rank連続を要求する |
| proposal legal evidence | caller由来countがcore再導出countと一致することを要求する      |

この再導出により、callerが合法手数を12と偽ってMultiPV幅を変えること、optional non-promotionを落とすこと、played / stableの非合法手を候補へ混ぜることをfail closedにする。

## 3. 1手と0手のparentを曖昧にしない

合法手が1手だけならproposal engineを呼ぶ必要がない。coreは`runtime: null`だけを許し、playedとstableが唯一のforced moveと一致することを確認して、labelなしのskip receiptを返す。

```text
legal moves = 1  -> 次P1のauthenticated production runnerはproposalを省略し、forced skip
legal moves = 0  -> invalid training parentとしてfail closed
legal moves >= 2 -> production-shaped proposalを要求し、candidate unionを作る
```

skipは「forced moveを強いteacher labelとして採用した」という意味ではない。sibling ranking lossには2手以上が必要なので、このparentからlabelを出さなかったという監査記録である。

0手は通常のtraining parentとして受理しない。終局局面、壊れたSFEN、誤ったply抽出などを同じskipへ丸めるとsource errorを隠すため、明示的なfailureにする。

## 4. UTF-8 bytewise dedupeとprovenance

候補はlocaleやproposal完了順に依存せず、USI moveのUTF-8 bytes昇順に並べる。Mapへの追加順やengineのMultiPV rankはcandidate execution orderを決めない。

| provenance field      | trueになる条件                                           |
| --------------------- | -------------------------------------------------------- |
| `production_proposal` | 入力のfixed-runtime-shaped proposal rootにその手が現れた |
| `strong_game_played`  | 入力parentのplayed moveである                            |
| `stable_policy`       | 入力stable rowが示すstable moveである                    |

1手が複数sourceを持つ場合は1 recordのboolean provenanceへ合流する。例えばproposal 4位がplayedかつstableならcandidateは1件で、3つのflagが全てtrueになる。

proposal rankは発見経路の証拠として保持するが、scoreや最終rankではない。stableとplayedだけから加わった手は`proposal_rank: null`であり、それでも他候補と同じ独立rescoreを必要とする。

## 5. child positionとdigestを再導出する

parent、stable row、runtime receipt、proposal resultはexact-key plain dataとしてcaptureする。candidateごとにparent SFENへUSI moveを適用し、child SFENとsemantic child position IDをcoreで再導出する。

| digest                  | domain-separated projection                                  |
| ----------------------- | ------------------------------------------------------------ |
| parent payload SHA-256  | canonical parent identityとplayed move                       |
| legal moves SHA-256     | core再導出rules-complete move list                           |
| runtime receipt SHA-256 | fixed engine / eval / option / search contract projection    |
| proposal result SHA-256 | depth、MultiPV、root moves、score metadata、nodes projection |
| stable row SHA-256      | parent binding、stable move、再導出child、stable search      |
| candidate-union SHA-256 | 上記binding、bytewise unique候補、provenance、再導出child    |

JSON projectionは`SHA-256(domain + NUL + canonical JSON)`、合法手とproposal rootのlistは`SHA-256(domain + NUL + LF区切りUSI + 終端LF)`で固定する。全digestを別domainへ分離し、同じ断片を別artifact種別へ移しても同一identityとして扱わない。

digestは認証ではない。秘密鍵を持たないSHA-256は改ざん者も再計算できる。このPRでは内部不整合と取り違えを見つけ、次のHMAC checkpointがproduction originとdurable historyを閉じるためのsemantic projectionを固定する。

## 6. pure coreが意図的にしないこと

公開surfaceは`buildFloodgateV7CandidateUnionCoreForTests`だけである。同期関数にすることでcaller-owned valueをcontrol return前にcaptureし、Proxy、accessor、sparse array、symbol key、余分なfield、non-finite numberを拒否する。

それでもplain objectはforgeできる。production contract名、正しいengine ID、正しいbinary digestを含むobjectを作れても、本当にargumentless runtimeが発行したとは証明できない。receiptにはこの非認証境界を明記する。

coreはengineをspawnせず、rescoreせず、CPを確定せず、teacher rankを作らず、train / val JSONLを出さない。non-forced receiptは全candidateを`required-not-yet-run`、completed rescore 0、teacher label 0として返す。

## 7. source auditから得たcheckpoint設計

v6 generatorの候補意味論は有用だったが、work persistenceはunkeyed checksum、append、最後の全体rewriteであり、production resume authorityには使えない。stable proposal checkpointはHMACとdurabilityが強い一方、完成artifact全体を先に持つため、未知のrescoreを逐次保存するv7へそのまま適用できない。

次のP1 checkpointは単一`work.jsonl`で2つのchainを組み合わせる予定である。

```text
global append chain: header -> every physical record -> final work seal
parent chain: parent-begin -> candidate[0] -> ... -> candidate[n-1] -> parent-seal
```

parent間は12-engine poolを使ってinterleaveできるが、各parentのcandidateはUTF-8 bytewise順にしか受理しない。final work sealはparent sealをcanonical parent順にdigestし、schedule-independentなsemantic identityを作る。

ここでのexact-onceは「checkpointへ認証付きで受理されたentry」に対する保証である。search完了とfile fsyncは1つのatomic transactionにできないため、search後・append前にcrashすれば同じcandidate searchを再実行する。したがってengine executionはat-least-once、accepted checkpoint entryはexact-onceという境界を明記する。

## 8. 次のP1と明示的nonclaim

次のP1は、production training-row capability、完成したstable workのHMAC verification、fixed runtime capabilityを1つのargumentless coordinatorでclaimし、per-parent HMAC checkpointへproposalと全candidate rescoreをdurableに書くことである。

このPRは実Floodgate棋譜、実engine、real training rowを読まない。selection data、fresh final、legacy finalの封印holdoutを開かず、weight、teacher JSONL、A/B result、Elo、段位を作らない。

候補集合の整合性が高段の証拠になることもない。強さを主張できるのは、認証済みreal labeling、3 seed training、fresh selection、sealed final holdout、200-game A/B、81Dojo外部較正まで完了した後だけである。
