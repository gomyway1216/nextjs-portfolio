# Floodgate v7 教師生成を共有HOMEから切り離すクリーンルーム準備

> 強い棋譜から学び直す前に、教師生成の入力・検証器・実エンジンを、既存の本番状態やlive weightへ触れない場所で再現できる必要があります。このPRはその第1段階として、固定入力を値コピーし、採用済み検証器を独立cloneし、real stable WASMとreal YaneuraOuのtest-core factoryへ結ぶ準備境界を追加します。実private copy、検証器実行、教師process、label生成、再学習、A/B、live activationはすべて0回です。English version: [blog-shogi-floodgate-v7-clean-room-teacher-runner.en.md](./blog-shogi-floodgate-v7-clean-room-teacher-runner.en.md)

## 1. なぜこの段階が必要か

現在のlabel-free role bundleには固定24,000 parentがあります。しかし共有HOME内の古いworktree、raw lock、role lock、assetをその場で組み合わせると、次の区別が曖昧になります。

- どのrevisionの検証器を使ったか
- 入力を検査中に別processが変更していないか
- コピー先がsymlink、hard link、inode aliasで元入力を共有していないか
- test-only実行が本番lease、registry、control、weightへ接続していないか
- 同じ認証済みstreamを進める100件、500件、24,000件の権限gateが混ざっていないか

教師を速く回しても、この境界が曖昧なら、その出力を再学習やlive weightの判断材料にはできません。このPRは速度改善そのものではなく、安全に速度を使える土台です。

## 2. このPRが固定するもの

| 項目                     | 固定内容                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| 実行計画                 | caller path/revisionを受け取らない固定plan                                                          |
| clean-room               | current-EUID HOME外、owner-only `0700`                                                              |
| verifier                 | 採用済みrevision `e8a9197608cb48b1160b6707d97b0c4f78f90a1d`                                         |
| verifier materialization | `--no-local` independent clone、alternatesなし、tracked 1,431 filesのsource/destination inode非共有 |
| 入力                     | raw lock、role lock、role bundle、teacher assetsの4 treeとlegacy exclusion 1 file                   |
| stable runtime           | real stable-WASM test-core factory                                                                  |
| teacher runtime          | real YaneuraOu USI test-core factory、12 engines、1 thread/engine、depth 16                         |
| capability authority     | synthetic preparationと固定runnerを別WeakMap/WeakSet registryへ分離                                 |
| gate順                   | durable prefix 100 → durable prefix 500 → sealed final 24,000                                       |
| package command          | 追加0                                                                                               |
| このPRでのgate実行       | 0                                                                                                   |

公開されるargumentless inspectionはplanの固定条件だけを確認します。private sourceを開かず、clean-roomも作りません。値コピーを行う準備functionはpackage scriptやCLIへ接続していないため、mergeだけでcopyや教師生成は始まりません。

## 3. 値コピーの境界

コピー前に全entryを列挙し、directory identity、file identity、mode、size、SHA-256を保持します。sourceはowner一致、directory `0700`、file `0400/0500/0600/0700`、single linkを要求します。名前の制御文字、symlink、hard link、unsupported node、1 GiB以上の単一file、深すぎるtree、entry/total-byte上限超過をfail closedにします。

コピーには汎用`copyFile`やfilesystem cloneを使いません。`O_NOFOLLOW | O_EXCL`で新規inodeを作り、read/write loopで内容を移し、destinationを`0600/0700`へ正規化します。完了後にsourceとdestinationをもう一度全走査し、source不変、byte identity、single link、source/destination inode非共有を確認します。receiptにpathやdigestは出しません。

raw lockは小さいfileが多いため、tree内のfile copyを固定8 workerへ変更しました。4 treeは並行materializeするため、copy coreの合成上限は32 file workerです。同時実行するverifierのGit clone内部I/Oはこのcounterへ含まれず、32という値で全filesystem writeをboundする主張ではありません。あるtreeで最初の失敗を観測した後は、そのtreeだけが新しいfileをscheduleせず、すでに始まったworkerをdrainします。他の3 treeやGit cloneをglobal cancelする主張はなく、5本すべてがsettleしてから全体失敗を返します。途中namespaceは自動削除せず、手動reconciliationが必要な証拠として保持します。

72,717 filesに対して1 MiB bufferをfileごとに確保し直さないよう、各逐次inventory walkは1本のhash buffer、各copy workerは同時workerと共有しない1本のcopy buffer、standalone file処理はinventory・copy・再検証を通じて1本のbufferを所有します。各bufferはownerの`finally`で1回zeroizeされ、worker間でprivate byteを共有しません。

per-file `fsync`は使いません。このcopy receiptはpower loss後のcrash durabilityをclaimせず、既存namespaceを成功として再利用しません。processが成功を返す前の内容同一性は再hashで確認しますが、machine crash後の再開は別のrecovery contractが必要です。

namespace作成失敗では、rootの`mkdir`が成功した直後から`clean_room_may_exist=true`として扱います。`mkdir`自体が失敗した場合もrootを確認し、`ENOENT`で不在を確認できた場合だけfresh retryを許し、権限・I/O errorなど不明な状態は手動reconciliationへ倒します。

file copyのsource descriptorとdestination descriptorは、片方のcloseが失敗しても両方を`allSettled`で回収します。並列materializationと2本のverifierも、後続dependencyが同期throwしても全operationを先にdeferしてからdrainします。runtime factoryの非同期rejectionは固定errorへ畳み、失敗したcapabilityは再利用できません。

## 4. read-only preflight

private bytesは公開せず、metadataだけを集計しました。

| 検査                                      |                                  結果 |
| ----------------------------------------- | ------------------------------------: |
| 4 input trees                             | 72,717 files / 519 nested directories |
| 4 tree logical bytes                      |                         1,227,490,748 |
| standalone legacy exclusion               |                         624,816 bytes |
| copy-by-value input bytes                 |                         1,228,115,564 |
| raw lock                                  |      72,698 files / 592,412,617 bytes |
| unsafe names / modes / links / node types |                         0 / 0 / 0 / 0 |
| maximum source file                       |                             1 GiB未満 |
| accepted verifier                         | exact `e8a9197`, clean, tracked 1,431 |
| independent clone smoke                   | PASS、3,852.636 ms、一時clone削除済み |
| capacity preflight                        |                                  PASS |
| PR2で固定するminimum free space           |                                20 GiB |

正確な空き容量、使用率、HOME、volume名はtracked evidenceへ出しません。PR2の実行時gateも、外へ返すのは20 GiB以上かどうかだけで、実容量値は返しません。

## 5. 1,000 small-file synthetic benchmark

同じ1-byte file 1,000件を使い、copy前後の全hash/metadata検査を含めて、concurrency 1と8を交互に3回ずつ測りました。

| limit | elapsed ms                  | 3回中央値 |
| ----: | --------------------------- | --------: |
|     1 | 489.610 / 453.631 / 456.123 |   456.123 |
|     8 | 376.715 / 354.841 / 361.010 |   361.010 |

中央値比は1.263xです。これはlocal synthetic small-file fixtureの結果であり、72,717 filesの実copy時間、SSD一般性能、教師生成時間を予測しません。重要なのは、固定上限、owner単位buffer、failure drainを保ったまま、逐次file loopとper-file allocation churnを律速として残さなかったことです。

## 6. gateを一度に開けない

このPRは3つのgate名と順序だけを固定し、どれも実行しません。

1. 100件: runtime wiring、output schema、停止・回収、安全receiptを確認
2. 500件: throughput、長尾、checkpoint resume、resource上限を確認
3. 24,000件: 同じ認証済みV3 streamの500件prefixを厳密resumeし、24,000件でseal

V3 protocolは100件、500件、24,000件を別work fileにしません。単一の認証済みstage/work streamで100件と500件をdurable milestoneとして保持し、次のgateがそのexact prefixを検証して続きだけを追加します。一方、各gateのcapabilityとleaseは別のsingle-use authorityで、前gateのcleanupが完了するまで次を開始しません。100件・500件prefixは公開もfinalizeもせず、sealed finalだけをlabel finalizerへ渡します。24,000件を完了しても、それだけで再学習候補やlive weightにはなりません。label projection、training、候補選抜、formal A/B、外部校正はそれぞれ別gateです。

## 7. なぜ2 PRに分けるか

| 境界                                    | このPR                  | 次PR                                                                    |
| --------------------------------------- | ----------------------- | ----------------------------------------------------------------------- |
| copy-by-value / verifier clone          | 実装・synthetic検証     | fixed runnerから実行                                                    |
| real stable / YaneuraOu factory binding | 実装・synthetic handoff | native launcherで所有                                                   |
| 20 GiB capacity gate                    | requirement固定         | argumentless preflight実装                                              |
| key / stage / checkpoint connector      | 接続なし                | 同じ認証済みstreamを、3つのone-shot権限で100 → 500 → 24,000へ順次resume |
| signal / recovery / finalizer           | 接続なし                | 実装・故障注入検証                                                      |
| private copy / teacher labels           | 0                       | merge・CI・review後だけ                                                 |

第1 PRへoperator commandを混ぜないことで、copyとruntime binding自体を先にreviewできます。第2 PRはこの準備capabilityをsingle-useでclaimし、既存の本番lease/registry/controlへ接続しないclean-room専用ownerを作る必要があります。

test-injected preparationのcapabilityは固定runner registryに存在しないため拒否され、wrong-registry lookupは正しいtest claimを消費しません。逆方向も別registryで対称に拒否します。同じshapeのreceiptやspread copyは権限になりません。

## 8. 時間の見通し

採用済みfull role-bundle verifierは実測1,045.52秒、確認runは1,089.52秒でした。過去のWCSC36測定は3,112 parentsを5,354.31秒で処理しており、単純比例の24,000 parentsは約11.47時間です。ただしFloodgateの局面分布、stable長尾、checkpoint overheadが異なるため、これは予約時間の初期値であり完了予測ではありません。100件と500件で実測し直します。

## 9. 現在の結論

このPRで評価関数はまだ強くなっていません。得られたのは、24,000件の教師生成を本番状態とlive weightから分離して開始するための、review可能なcopy・verifier・runtime bindingです。

- private copy: 0
- verifier execution on copied private data: 0
- teacher process / label: 0 / 0
- training / candidate selection: 0 / 0
- formal A/B / external calibration: 0 / 0
- live weight change / activation: false / 0

次はこのPRのCIと独立reviewを閉じ、別PRで20 GiB gate、native launcher、同一stream上の100/500/24,000 ordered one-shot checkpoint authority、signal/recovery/finalizerを完成させます。証拠が揃うまでlive weightsは変更しません。

Machine-readable evidence: [floodgate-v7-clean-room-teacher-runner-2026-07-17.json](./data/floodgate-v7-clean-room-teacher-runner-2026-07-17.json)
