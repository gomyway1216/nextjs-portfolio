# 将棋child-board root-policy student/runtime v1：実装・実行記録

> 6.17M parameterのchild-board teacherをproduction leaf評価へ入れず、seed 42のfit-only出力だけを877,633 parameterのroot-ordering studentへ蒸留する。seed 314159はreplication専用で学習targetにしない。student、live NNUE、worker/WASMを別々にhash固定し、tune、sealed、runtime、正式対局を一方向に進める。phase 1のteacher 2本とhash binding、student実装は完了した。最初のprepareはV9 candidate subsetの解釈誤りを教師推論前に検出して停止し、全production手へ展開するv2修正を検証中である。student optimizer、tune、sealed、対局、ライブ変更はまだ未開始である。[English](./blog-shogi-child-board-root-policy-student-runtime-v1-plan.en.md)

## なぜ別studentが必要か

large teacherはchild boardとmove set全体を読むoffline policy modelであり、通常の局面value NNUEではない。そのままproduction searchのleafやTTへ入れると、速度だけでなく「何を改善したのか」という比較条件も変わる。

このprotocolは役割を分ける。

| artifact                        | 固定した役割                                       |
| ------------------------------- | -------------------------------------------------- |
| seed 42 teacher                 | fit-only distillation target                       |
| seed 314159 teacher             | replication evidenceのみ                           |
| student                         | rootの合法手を並べるpriorのみ                      |
| `public/shogi-nnue-weights.bin` | child/leaf static evaluationの唯一の値             |
| search                          | 最終着手を選び、student scoreをleaf/TTへ保存しない |

studentを無効にすると、従来のroot順序と非root search stateへbyte-exactに戻らなければならない。

## 親protocolと固定済みteacher binding

親は42,427 bytes、SHA-256 `b9b8256433cec77da8d32a6d05018b9a5e405e5b57fdabe299490a5f9f90cfe2` の [strength-candidate protocol](../ml/protocols/child-board-strength-candidate-v1-plan.json) である。

当初の実装前coreで未解決だったのは次の2文字列だけだった。

- seed 42 final checkpoint SHA-256
- seed 314159 final checkpoint SHA-256

phase 1 terminal resultは親schema/status、親SHA、`tune_opened=false`、`sealed_opened=false`、`live_weights_changed=false` を満たした。binding commitは `training.final_checkpoints` からseed 42の `b90baaabbe5a9f7905d7a161ecf5da5abcfebda40f9403af56094847d199d13a` とseed 314159の `9b6bbae900d753da18052f880ab090652f4678aa58110d43f08f17e7d858f293` を機械的に代入し、binding receiptとclosed postphase registryを公開済みである。後のproduction source pin更新と今回のmove-universe入力契約修正は、その歴史的binding receiptを書き換えず、現在protocol identityとregistry receiptだけを更新する。

seed 42は結果を見る前からdistillation teacherであり、seed 314159との平均、ensemble、選抜、target化は禁止する。

## fit-only data

student targetはseed 42をeval modeにして、親protocolのfit partitionだけに対して生成する。

| domain  | fit parents | tune parents |
| ------- | ----------: | -----------: |
| Browser |         875 |          196 |
| V9      |      19,264 |        4,411 |
| 合計    |      20,139 |        4,607 |

各parentのrules-complete legal listを、現在のproduction searchが実際に生成する集合へ先に射影する。具体的には、成れる角・飛車について既存productionが省く不成だけを除き、他の手は保持する。seed-42 teacherは集合全体を読むため、rules-complete集合で計算したlogitを後からfilterしてはいけない。射影後のchild setでbatchを組み直し、その集合全体をteacherへ再forwardする。teacherの再学習は不要である。

### 2026-07-28実装検査で止めた不完全なV9入力

最初の実データprepareは、教師推論やoptimizerより前に停止した。V9の1局面で、入力JSONLにあった12手を「rules-complete」と誤認していた一方、実production JSと実WASMは同じ27手を返したためである。例のparentは `sha256:0011a06add27c5201bcebcd9b569f197d7fd440ce662e09594128f55bf0103f3`、SFENは `ln1gk1snl/6gb1/p1spppppp/1rp6/7P1/P5P2/1PPPPP2P/1BGK2SR1/LNS2G1NL b p 19` だった。元12手は27手のsubsetで、extraは0、欠けていた手は15、JSとWASMの差は0、この局面の角・飛車不成除外も0だった。

つまりengineが27手を誤生成したのではなく、V9 train rowが「実戦着手＋教師candidate」のsubsetであることをloaderが取り違えた。12手へproductionを縮める、欠けた15手へ古いteacher labelを補間する、live NNUE値をteacher targetとして代用する、という修正はすべて禁止した。

修正版は各fit parentについて、pinned production JS列、そこへ既知の角・飛車不成を復元するpinned `rulesCompleteLegalMoves` 列、別実装のpinned production WASM列を実行する。これは第三の独立した将棋合法手oracleではなく、現在のproduction membershipを二つのproduction実装でexact照合し、射影前後を明示する契約である。復元列をprotocol規則で射影した結果がJS/WASM双方とexact一致した場合だけ、全production手のchild SFEN、semantic ID、explicit feature、凍結live-NNUE baselineを生成する。Browser sourceは875親でrules-complete列を独立に認証してexact一致が必要で、V9 sourceはrules-complete内の認証済みcandidate subsetとして別に記録する。展開後のparent＋全child IDがprotected/known-eval、元tune closure、別fit domainと1件でも交差すればseed-42 checkpointを開く前に停止する。追加手のsource teacher値はplaceholderとして学習targetに使わず、seed 42を全production集合へfresh forwardして初めてtargetを作る。

この停止時点でstudent output directoryは0 bytes、distillation shardは0、teacher inferenceは0、training epochは0、tune/sealed/formal/externalは0、live重み変更も0だった。したがって一週間分の計算結果を採用したわけでも、弱い重みに上書きしたわけでもない。今回の失敗から残すのは原因と回帰テストだけで、旧subset意味のreceiptを新しい意味へ書き換えたり再利用したりしない。

修正版の全20,139-parent preflight実測は次の通りだった。Browser 875は元75,532手、rules-complete 75,532手、production 74,611手、追加0、角・飛車不成除外921。V9 19,264は元candidate 223,834手に対し、rules-complete 1,681,740手、production 1,663,442手、追加1,439,608、除外18,298だった。合計productionは1,738,053手である。射影とJS/WASMの不一致、protected/known-eval 900,395 IDsとの交差、元tune 72,710 IDsとの交差、Browser/V9 fit間の交差はいずれも0だった。teacherを開かないpreflight artifactは565,336,695 bytes、SHA-256 `e229b6c7d52f322a1ee33f75dce33152ab13f09b1d935695f8835af89cc98c89` で、約5分半で生成した。これは一時検証artifactであり、public main merge後の正式receiptとしては再利用しない。

20,139 fit parentsについて、parent ID、SFEN、rules-complete source list、射影後production list、除外理由、child ID、凍結live-NNUEのchild手番CP、その符号を反転したparent視点 `base_parent_cp`、射影後集合で再forwardしたseed-42 combined CPを固定順で1つのJSONLへ書く。path、bytes、SHA、parent/move count、teacher checkpoint receiptをterminal resultへ記録する。

tune、sealed、v3 sentinel、seed 314159、直接対局、外部対局の局面・label・scoreは0件でなければ停止する。fit distillation JSONLの再生成も認めない。

生成は固定hash関数で64 shardsへ割り当て、各shardをtemporary file、fsync、atomic rename、receiptの順で公開する。optimizer作成前のtechnical crashだけは、完全なcontent-addressed shardを検証して残し、欠けたshardだけを生成できる。shard番号はresume単位にだけ使い、64 receiptsを `(domain ordinal Browser=0/V9=1, bytewise parent ID)` で決定的64-way mergeする。各parent内はbytewise USI順を保ち、全体が必ずBrowser→V9→parent→USIになるfinal JSONLをatomic公開した後はteacher inferenceを再実行しない。

## 固定student architecture

studentは全parameterをseed `20260728`でscratch初期化する。

| component                                         |  parameters |
| ------------------------------------------------- | ----------: |
| parent/child共有16-channel・2-block board encoder |     181,840 |
| move embeddings                                   |      16,112 |
| 593→256 projection + LayerNorm                    |     152,576 |
| 256→512→256 residual MLP ×2                       |     526,848 |
| 256→1 output                                      |         257 |
| 合計                                              | **877,633** |

共有board encoderをparentに1回、射影後production集合の各childに1回適用し、parent 128、child 128、child-parent 128、move embedding 208、`tanh(base_parent_cp/3000)` 1の合計593 featuresを作る。child手番から見たlive NNUE整数値を `C` とすると、`base_parent_cp=-C`、`residual_cp=600*output`、`combined_parent_cp=base_parent_cp+residual_cp` で、値が高い手を上位にする。

per-move scoreは独立な共有関数で、descending combined CP、同点はbytewise USI ascendingでstable sortする。parent value head、dropout、BatchNormはない。

FP32 tensorは877,633 × 4 = 3,510,532 bytesである。production用payloadはtensor名のbytewise順、little-endian float32、row-major、paddingなしで連結し、別manifestにname、shape、dtype、offset、length、SHAを固定する。

43 planes、C→y→x flatten、from/to/drop、piece/action、delta、king relation、ply bucketのindex mapは既存source 4 filesとtests 2 filesのbytes/SHAへ束縛した。GroupNormは4 groups・population variance・epsilon `1e-5`、LayerNormはlast axis・population variance・epsilon `1e-5`。全GELUは `0.5*x*(1+tanh(sqrt(2/pi)*(x+0.044715*x^3)))` のfloat32 tanh variantである。Conv→norm→GELU、residual add、projection、MLP、600倍、parent base加算、mask、stable sortの順序もJSONで固定した。

## 初期化・loss・schedule

Conv/LinearはKaiming uniform、biasは0、embeddingはnormal標準偏差0.02、normはweight 1/bias 0、最終outputはweight/biasとも0にする。

lossはseed-42のparent視点fit logits `T_i` とstudent combined CP `S_i` に対する固定4項である。

- `softmax(clamp(T_i-max(T),-2000,0)/100)` と `log_softmax(S/100)` のlistwise：1.0
- `T_i-T_j≥50` の全ordered pairに `softplus(-(S_i-S_j)/100)`：1.0
- teacher最大tie集合とhardest non-best間の50cp margin：1.0
- `S_i,T_i`を±3000cp clamp、600でscaleしたSmoothL1 beta 0.25：0.20

MPS、AdamW、learning rate `0.0003`、weight decay `0.0001`、gradient clip `5`、Browser batch `32`、V9 batch `256`を固定する。V9 pretrain 4 epochs、続いてBrowser全fit parentを1回とrotating V9を3倍使うmixed 12 epochsを行い、mixed epoch 12 finalだけを採用する。best epoch、early stop、second seed、second attempt、tune/replication monitoringはない。

outputは `/Users/yudaiyaguchi/.codex/shogi-runs/child-board-root-policy-student-runtime-v1`、final checkpointは `student-final-mixed-epoch12.pt` に固定する。

technical crash時だけ、各完了epoch後にatomic保存したmodel、optimizer、CPU/MPS RNG、seed、phase、epoch、bound protocol、distillation SHA、2 teacher SHAを厳密検証し、次epochから再開できる。別path、scratch restart、古いepochへの巻戻し、完了epoch再実行、checkpoint選択、tune後のresumeは禁止する。

mixed epoch 12 checkpointのatomic公開をtraining完了とする。その直後からはoptimizer作成・load、model forward、training/protected data読込を禁止し、final checkpoint→3,510,532-byte payload→manifest→既に固定したparity fixture検証→`result.json` の順を欠けたものだけatomic公開する `terminalize-only` 復旧へ移る。validなfinal artifactは上書きせず、resultは必ず最後である。

## tune前に固定するartifacts

次の各fileでresolved path、bytes、SHA-256をterminal resultへ固定する。

- fit-only distillation JSONL
- mixed epoch 12 final checkpoint
- 3,510,532-byte FP32 runtime tensor
- runtime manifest
- fit-only parity-1024 fixture
- student terminal result

成功statusは `complete-fit-only-student-frozen-tune-locked`。artifact hashは実行で生まれるreceiptであり、protocol設計の未解決選択肢ではない。全部固定するまでtuneは読めない。

さらに同じpublic-main実装commitと凍結tensor/manifestからproduction buildを1回だけ作り、runtime/search/worker/WASM/TT、package・lockfile・build config、emitted main/worker/WASM/student assets、Node/npm/Next/TypeScript環境を `production-build-receipt.json` へatomic固定する。partial buildやtune後のrebuildは認めない。

## production指し手集合とroot-only・leaf/TT非混入

現在のJS/WASM production generatorは、先後それぞれのpromotion zoneにfromまたはtoが入る未成角・未成飛車について、不成分岐を既に生成しない。学習、parity、tune、sealed、runtimeはこの同じproduction集合を使う。student実験のためにroot/non-root generatorをrules-completeへ変更しない。

student推論は1 search invocationにつき1回だけ行い、USI/move-key付き順位表をWASMへ渡す。WASMはroot fallback、各iterative-deepening depth、aspiration再探索、root internal iterative deepeningでply 0の手を再生成するたび、同じ順位表で初期順序を復元してから既存のstable heuristic sortを行う。host側で最初に1回だけsortしても再生成時に消えるため禁止する。TT、capture、promotion、historyなど既存heuristicの優先度は変えず、student順位は同一heuristic scoreの決定的tie breakになる。

student CPはevaluate、quiescence、alpha/beta、aspiration、pruning、extension/reduction、mate/repetition/terminal score、PV/UI評価へ入れない。TTのscore、bound、depth、move、age、replacementにも書かない。large teacherはproduction dependency graphとbrowser bundleへ含めない。

model、feature、manifest、hash、shape、finite checkが失敗すれば従来root orderへfail closedしtechnical faultを記録する。正式runでは1 faultでも全体がunanalyzableである。

## sealed後のparity 1,024とM4 Pro latency

parity fixtureはfit-onlyからhash順でBrowser 512、V9 512を選び、rules-complete source list、射影後production list、除外内容をtune前に固定する。実行は3 artifactsがtuneとsealedを通った後の1回だけである。

parityは次をすべて要求する。

- parent/legal USI 1,024/1,024一致
- live NNUE child CPが射影後の全production手でexact一致
- finite outputが射影後の全production手
- Top-1 1,024/1,024一致
- reference gap 1cp以上の全pair方向100%一致
- combined CPのmax absolute error 0.5cp以下、mean 0.05cp以下

同じfixtureとartifactをApple M4 Pro、AC電源、Low Power Mode off、foreground production Chromium/WASM、1 workerで100 roots warmup後に1,024 roots測る。

| scope                            | median |   p95 |   p99 |    max |
| -------------------------------- | -----: | ----: | ----: | -----: |
| student追加分                    |  ≤12ms | ≤25ms | ≤40ms |  ≤75ms |
| live NNUE取得を含むroot hook全体 |  ≤20ms | ≤40ms | ≤60ms | ≤100ms |

durationはmain threadとworkerのmonotonic `performance.now()`だけを使う。WASMはsingle-thread同期callで、100 warmup後に5,000ms idleし、明示GCを呼ばない。fixture順の1,024 sampleを1つも捨てず、ascending sortしたnearest-rank `ceil(p*N)`、median rank 512、p95 973、p99 1,014、max 1,024を使う。GCやscheduler pauseもそのまま含め、raw timingを全件保存する。

parity/latencyはrerun、artifact差替え、threshold変更で救済しない。

## one-shot runtime admission

sealed PASSが直接formalを許すことはない。sealedが許すのは、parity、latency、static call graph、determinism、fail-closed、leaf/TT非混入をまとめた固定runtime admission invocationを1回実行することだけである。resultは `runtime-admission-result.json`、schemaは `shogi-child-board-root-policy-runtime-admission-result-v1` に固定する。

fit-only fixtureのroot全1,024、non-root/TT用256、fault注入用32を固定し、各caseを同じinvocation内で3 repeatsする。root score/orderのbyte一致、student-disabled時のinference 0、plies 1/2/4/8でstudent call 0、TT APIへのstudent dataflow 0、root order以外のsearch state一致、missing/bad hash/bad shape/NaN時のstable fallback、large teacher dependency 0をすべて要求する。

student runtime、search、worker、WASM、TT sourceと、production manifest/main chunk/worker chunk/WASM/student assetsのpath・bytes・SHA・Git/build commitをresultへ束縛する。全raw case、counter、fixture hash、source/build receipt、parity/latency receiptを途中表示なしで1つのatomic resultへ公開する。partial/incomplete/missはlane closeで、resumeやrerunはない。

## one-shot tuneとsealed

teacher 2本とstudentの全hashが固定された後、Browser 196とV9 4,411を1 invocationで開く。各parentを同じproduction集合へ射影し、teacher 2本はそれぞれ射影後のmove set全体へ再forwardし、studentも同じ集合で採点する。3 artifacts × 2 domainsの全metricを途中表示せず、1つのatomic resultとして公開する。partial/incompleteならlane closeで、resume、rerun、後から完成はない。

ここでいう集合を、tune未開封の段階で[prospective clarification](../ml/protocols/child-board-root-policy-student-tune-membership-v1.json)へ明文化した。Browserはall-legal source 16,879手を既存production規則で16,564手へ射影する。V9はdepth-14 proposal＋候補別depth-16 labelを持つ認証済み51,306候補手だけであり、射影後も51,306手である。V9へ未labelのrules-complete手を足すと `teacher_cp` をseed 42、seed 314159、student、exact liveのいずれかから捏造することになり、そのartifactの自己評価と既存thresholdの無効化を招く。このためtuneは**candidate-subset診断**として追加0手を固定し、source receiptとparent/move membershipのexact一致をscorerがopened marker前に検査する。full-production coverageはfit distillation、all-legal sealed、parity、実production generatorを使うformal/externalで別に強制する。これはthreshold緩和でも、V9 tuneからfull-production強度を主張する変更でもない。

3 artifactsはそれぞれ独立に、親protocolのBrowser gateとV9 exact-live overlayを全部通る必要がある。seed選抜はない。

全員のtune通過後だけsealed 512をlabelする。YaneuraOuの独立depth-12 labelから同じproduction集合だけを採点対象として保持し、teacherは射影後集合へ再forwardする。candidate score未開封の間は、parent集合、teacher、depth、enumerator、protocolでcontent addressしたlabel shardのexact resumeを許す。検証済みshardは不変で、512親が揃った時に1つのatomic label receiptを出す。

sealed scoringも3 artifactsを途中表示なしで1つのatomic resultへ書く。partial/incompleteはlane close。全員がTop-1 gain 26、pair gain 0.01、NDCG@5 gain 0.01、one-sided McNemar p≤0.05を独立に通る。

## student対応formal adapterと外部provenance

既存formal v2 adapterは単一NNUE weights hashを前提にしているため、このcandidateには使わない。新しい `child-board-root-policy-student-formal-v1-registry.json` とroot-only candidate adapterを、runtime admission後・game 1前に固定する。

新registryは次のexact receiptを束縛する。

- student tensorとmanifest
- 凍結live NNUE
- student対応worker sourceとproduction emitted chunk
- student対応WASM sourceとproduction emitted asset
- production build manifest
- parity/latency result
- runtime admission resultとmaster runtime config
- stable/candidate public-main commit

既存v2から継承するのは384 color-swapped pairs、768 games、fixed search、zero-fault条件、bootstrap seed `20260710`・100,000回だけである。

formalのstableとcandidateは同一worker、WASM、NNUE、build、master configを使い、唯一のparsed差を `/student_enabled=false/true` にする。stable側はstudent tensor readとinferenceが0でなければならない。別buildのstableは使わない。

外部200局にもstudent、NNUE、worker、WASM、build、registry、adapter、formal result、master runtime configの全provenanceを持ち越す。opening bookは `public/shogi-opening-book-v2.bin`、1,785,509 bytes、SHA-256 `ec41836b563be4ca3ed7b79f70614f8183f5e6bf01a32c9cfada10514dcc7530` に固定し、formal modeでは無効、external modeだけ有効にする。1つでもdriftまたは欠落があれば停止し、別candidateで代用しない。

## 段階authority

| phase                | PASSが次に許すこと                                          |
| -------------------- | ----------------------------------------------------------- |
| teacher phase 1      | 2 hashの機械bindとcore mergeだけ                            |
| student phase 1b     | fit-only student/runtime artifacts固定後、one-shot tuneだけ |
| tune                 | sealed label/scoringだけ                                    |
| sealed               | parity/latency/static/no-contamination admissionだけ        |
| runtime admission    | exact adapter/registryによる正式768局だけ                   |
| formal stronger gate | exact provenanceを持つ外部200局だけ                         |

どのphaseもlive writeを許可しない。ライブ導入には別のrollback/staged-live protocolが必要である。

## core receiptと現在地

機械可読の [student/runtime core](../ml/protocols/child-board-root-policy-student-runtime-v1-plan.json) は、teacher hashをbindする前の実装前receiptとして次を持つ。

- bytes：64,020
- SHA-256：`fd05bffa3f1200beb0a0db2ad7345bea4034f1e3d73b3b6cab20a206afd37086`

phase 1完了後はこのcoreの2 placeholderだけを置換し、新しいbytes/SHAをbind commitで記録する。この記事のreceiptは設計時pre-bind coreを指し、後から実測値へ書き換えない。

このpre-bind receipt時点ではphase 1 teacherは2本とも凍結済み、protocol内のteacher hash bindは0/2、student implementation未merge、distillation 0 parents、student epoch 0、artifact 0、tune未開封、sealed未開封、parity/latency/runtime admission未実行、formal 0/768、external 0/200、ライブ変更0である。
