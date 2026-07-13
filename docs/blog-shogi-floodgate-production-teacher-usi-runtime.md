# production teacher専用USI runtimeを通常のwrapperから分離する

> [production asset authority](./blog-shogi-floodgate-production-teacher-asset-authority.md)で、YaneuraOu binary、eval、stable assetの実在bytesをfixed private registryへ固定した。しかしassetが同じでも、callerがpath、environment、option、timeoutを変えられるprocess wrapperでは同じteacher searchにならない。このPRは既存`UsiTeacherEngine`をdevelopment/test surfaceのまま残し、production専用のargumentless factory、shared private snapshot、fixed 12-engine pool、bounded USI state machineを別contractとして追加する。これはengine execution boundaryであり、teacher label、training、selection / holdout、棋力の証拠ではない。English version: [blog-shogi-floodgate-production-teacher-usi-runtime.en.md](./blog-shogi-floodgate-production-teacher-usi-runtime.en.md)

---

## 現在の境界

| 項目                           | 現在の状態       | 意味                                                                |
| ------------------------------ | ---------------- | ------------------------------------------------------------------- |
| fixed asset authority          | 前PRで完成       | binary / receipt / eval / stable identitiesをargumentlessに検査する |
| production USI factory         | 実装・実機確認済 | caller指定path / args / env / optionを受けない                      |
| process pool                   | 実装・実機確認済 | 12 worker、Threads 1、Hash 64 MiBを固定する                         |
| proposal / rescore             | 実装・実機確認済 | depth 16、proposal MultiPV上限12、rescore MultiPV 1 / 1手を固定する |
| synthetic adversarial evidence | 完了             | hostile fake engineでprotocol、race、cleanupを検査した              |
| real engine smoke              | 完了             | fixed初期局面だけを使い、棋譜を読んでいない                         |
| teacher / training / strength  | 未実行・証拠なし | label、weight更新、A/B、Elo、段位を示さない                         |
| selection / holdout            | 未使用・未読     | fresh / legacy final labelsを開かない                               |

## 1. 発見: 既存wrapperは便利だがproduction authorityではない

既存`UsiTeacherEngine`は、testや過去generatorを動かすためには有用である。しかし監査で、production teacherのauthorityとしては次の入口が広すぎると分かった。

| 既存surface                            | productionでの問題                                       |
| -------------------------------------- | -------------------------------------------------------- |
| `engineBin` / `engineArgs` / `evalDir` | callerが別binary・eval・引数を選べる                     |
| `env ?? process.env`                   | shellやdynamic-loaderを含むambient environmentを継承する |
| configurable Hash / timeout / cwd      | 同じcontract名で実行条件を変えられる                     |
| `isready`送信後にwaiter登録            | 高速な`readyok`を取りこぼすraceがある                    |
| timeoutでPromiseだけreject             | childが探索を続け、次処理や終了後に残り得る              |
| stdoutの未改行buffer / line / total    | hostile outputでmemoryを無制限に消費できる               |
| protocol failure後の再利用             | 古いoutputや壊れたstateを次searchへ持ち込める            |
| SFENをそのままcommandへ連結            | newline / control characterがcommand境界を壊し得る       |

したがって既存classをoption追加で徐々に本番化しない。production factoryとtest-injected coreを別moduleへ置き、production receiptとtest receiptも`execution_boundary`で型・runtimeの両方から分離する。

## 2. argumentless production factory

production APIは次のzero-argument factoryだけである。

```text
createFloodgateProductionTeacherUsiRuntime()
```

factory内部でasset preflight、snapshot、12 worker初期化、USI ID / option advertisement、fixed option設定、最初の`readyok`までを完了する。全workerがreadyにならなければruntimeを返さず、起動済みprocess groupのbounded回収を試みる。期限内に回収を確認できなければfactory自体を失敗させる。

production callerは次を渡せない。

- engine / eval path
- engine arguments、shell、cwd、environment
- engine count、Threads、Hash、FV scale、book、network delay
- proposal / rescore depth、MultiPV上限、timeout
- stdout / stderr / line / command上限

test-only coreは小さいsynthetic assetとfake processを注入できるが、成功receiptは`test-only` boundaryでありproduction receiptにならない。具体実装class / constructorはexportせず、callerへ返すのはnull-prototypeでfreezeした`receipt / poisoned / propose / rescore / close`だけのfacadeである。内部engine、snapshot path、lease APIへ抜けるruntime propertyはない。

## 3. 1つのshared private snapshot

12 workerごとに64 MB evalを複製せず、1つのprivate snapshotを共有する。

```text
<private-runtime-snapshot>/
  engine/yaneuraou
  eval/nn.bin
  workers/worker-00/
  ...
  workers/worker-11/
```

snapshot作成は、asset-authority success receiptをpath capabilityとして信用せず、fixed rootを再度開いてsource identityを再検査する。sourceは`O_NOFOLLOW` held read、current EUID、single link、exact size / SHA-256、read前後metadata不変を要求する。destinationはcopy後に再hashし、engineを0500、evalを0400にする。snapshot root / engine / eval / workers directoryは0500、各worker固有root / cwd / HOME / TMPDIRは0700である。

workerは同じread-only engine / eval snapshotを使うが、cwdはworker別である。pool終了時は全process groupのbounded終了後にsnapshot identityを再検査し、自分が作ったrun directoryの削除を試みる。途中失敗でもcleanupを試み、元のfailureをcleanup failureで隠さない。

これはsame-EUID sandboxではない。pinned engine、同一Node process、runtime builtin、current-EUID accountをtrusted boundaryに置く。0500 / 0400は事故や別accountからの書換えを狭め、終了時再hashは変異をfail closedにするが、hostile same-EUID process、root / ACL actor、pre-existing open capability、compromised engineを防ぐ保証ではない。

## 4. fixed spawnとUSI handshake

production childはabsolute snapshot binaryを引数なし、`shell: false`、worker固有cwdでspawnする。ambient environmentは継承せず、worker固有`HOME / TMPDIR`と固定`LANG / LC_ALL / PATH / TZ`の6変数だけを渡す。

handshakeはwaiterを先に登録してから`usi`または`isready`を書き、速い応答も失わない。tracked engine receiptのexact engine IDと、必要なoption advertisementを重複なしで確認する。

fixed option transcriptは次である。

```text
setoption name EvalDir value <private-snapshot-eval>
setoption name FV_SCALE value 20
setoption name USI_Hash value 64
setoption name Threads value 1
setoption name USI_OwnBook value false
setoption name BookFile value no_book
setoption name NetworkDelay value 0
setoption name NetworkDelay2 value 0
```

option欠落、重複、wrong engine ID、unexpected exit、stdin failureのどれでもfactoryは成功しない。

## 5. proposalとindependent rescore

runtimeが公開するsearch operationは2種類だけである。

```text
propose(parentSfen, legalMoveCount)
rescore(parentSfen, exactlyOneCandidateMove)
```

`propose`は`legalMoveCount >= 2`を要求し、`MultiPV = min(12, legalMoveCount)`、depth 16を内部で選ぶ。これにより合法手が12未満の終盤でもexact completed snapshotを要求できる。合法手生成とcountのcross-checkは後続v7 coordinatorの責任であり、このruntime単独はcallerのcountをteacher truthと主張しない。

`rescore`はcandidateを1手だけ受け、MultiPV 1、`go depth 16`、`searchmoves` exactly one moveを内部で組み立てる。原則はdepth 16のexact最終更新を要求し、forced single-move searchがterminal exact mateで終了した場合だけdepth 16未満を許す。SFENとmoveはbyte長、whitespace、control characterを検査し、invalid inputをstdinへ送る前に拒否する。

proposal前と各rescore前に、runtime自身が次を必ず実行する。

1. phase waiterを登録する
2. `isready`を送る
3. exact `readyok`を待つ
4. `usinewgame`を送る
5. fixed MultiPV、position、depth-16 goを送る

callerがresetを省略するAPIはない。

`bestmove`を受けた後にも`isready → readyok → usinewgame` barrierを通し、compliantなpinned engineのquiescenceを確認する。structuredな遅延search outputは拒否し、ready中のbounded `info string`は診断として破棄する。実engine smokeではreset中にYaneuraOuが正当な`info string USI_Hash ...`を出すことを発見したためである。これは`readyok`後にも任意の時刻で出力するcompromised engineをsandboxする時間的保証ではない。

## 6. bounded protocolとpoison

USI processのstdout / stderrを単にdrainするだけでは足りない。runtimeはphase timeout、phaseごとのstdout bytes / 行数、process lifetime全体のstderr bytes、1行bytes、未改行buffer、stdin command bytesをすべてboundする。

次のどれか1つでも起きればworkerだけをretryせず、pool全体をpoisonする。

- handshake / ready / search timeout
- stdout / stderr / line / command上限超過
- invalid UTF-8、malformed option、unexpected idle output
- malformed structured info、非safe integer、invalid engine-output USI move、parser不整合、missing / mismatched bestmove
- child / stdin error、unexpected exit

別workerが同時に正常結果を作っていても、返却直前にglobal poisonを再検査し、pool全体を同じfailureへ収束させる。poison後は新しいworkを受けず、全worker process groupへ直ちにTERM、必要時だけKILLを送り、bounded回収を確認する。通常closeだけは先に`quit`を送り、必要ならTERM / KILLへ進む。queue満杯とclose後の呼出しはworkを拒否するが、それ自体ではpoolをpoisonしない。自動retryはlabelの由来を曖昧にするため行わず、後続coordinatorがdurable checkpointから新poolでresumeする。

## 7. synthetic evidence

fake engineはspawn argv / cwd / envと全stdin transcriptを0600 JSONLへ記録し、次のhostile modeを再現する。

- immediate `readyok`
- wrong ID、option欠落 / 重複
- handshake / ready / search hang
- oversized line、stdout / stderr flood
- init / option / ready / search中exit
- malformed info、missing / mismatched bestmove
- 並列global-poison race、leader終了後に残るprocess-group child
- quit / EOF無視、operation直後のclose race

実機確認前にsynthetic boundaryを閉じ、実機確認後の監査指摘も回帰testへ戻した。最終validation件数は全suite完了時に固定する。

| validation                             | current result               |
| -------------------------------------- | ---------------------------- |
| focused runtime suite                  | 36 tests pass                |
| related USI / asset / stage suites     | 395 tests pass               |
| full Vitest / Python audit             | 1814 / 58 pass               |
| TypeScript / ESLint / Prettier / build | pass / 0E-157W / pass / pass |

## 8. real engine smokeの読み方

synthetic boundaryが閉じた後だけ、fixed private assetから本番12-worker poolを起動した。sealed dataは使わず、公開された平手初期局面だけでID、option、eval load、ready、depth-16 proposalと1手rescoreを確認した。proposalは12行、rescoreは1行で、各2並列実行のdigestはそれぞれ一致した。終了後はfixed runtime parentが0700 / current EUIDのまま、run entryが0件であることも確認した。CP値やPVは記録せず、強さの証拠として扱わない。

```text
executed_at=2026-07-13T03:33:33.625Z
platform=darwin/arm64
position_sfen_sha256=7ff40af0b0fa49d8459d68bf06204d3b4f73bc424a50c58b2e9f4bfc6505f658
proposal=depth:16,lines:12,requested_multipv:12,parallel_digest_equal:true
proposal_sha256=0dd7aa0ca34face91d51ad6c88033d4cd6d92b7ee5a86671137939434b53b008
rescore=depth:16,lines:1,searchmoves:1,parallel_digest_equal:true
rescore_sha256=b60d93c3b9bd048d2a4d0e7853c7f495d45e4c7631034bba55a85a960e11946a
cleanup=remaining_run_entries:0,parent_mode:0700,parent_uid_matches_euid:true
```

このsmokeが成功しても、分かるのは「固定した実engineを固定条件で再現的に起動・探索できる」までである。teacher labelが正しい、modelが強くなった、安定して高段である、という意味ではない。

## 9. explicit nonclaimsと次段階

このPRはreal Floodgate training row、fresh selection、fresh / legacy final holdoutを読まない。teacher JSONL、checkpoint、weight、A/B match、81Dojo ratingを作らない。productionのrunOp1 weightも変更しない。

次はtraining-role parent、strong-game played move、authenticated stable moveをこのfixed runtimeのMultiPV proposalへjoinするv7 unionである。全unique candidateをcanonical順にindependent rescoreし、HMAC-bound work checkpointへ閉じた後でだけ24,000 parentのreal labelingを開始する。

高段目標への進捗は「engineが動いた」では測らない。3 seed、fresh selection、static family gate、sealed final holdout、200-game A/B、81Dojo外部較正まで通ったときだけ棋力を主張する。
