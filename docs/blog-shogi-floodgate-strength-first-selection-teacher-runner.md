# strength-first fresh-selection teacherを実生成へ接続

> 2026年7月20日、固定4,800親 / 200局のfresh selectionへ、3つのcandidate
> checkpointをstrict-loadした後だけYaneuraOu labelを生成するローカルrunnerを実装した。
> 現在のcheckpoint registryはまだ閉じているため、実commandはselection sourceを開く前に
> STOPする。実selection label、候補選抜、live weight変更はすべて0である。English version:
> [blog-shogi-floodgate-strength-first-selection-teacher-runner.en.md](./blog-shogi-floodgate-strength-first-selection-teacher-runner.en.md)

## 現在地

| 項目 | 状態 |
| --- | --- |
| 固定runner / 実generator接続 | 実装・local validation済み |
| checkpoint registry | 閉鎖中、3 checkpoint identityは未登録 |
| 直接preflight | exit 1 / expected STOP |
| fresh-selection source read | 0 |
| 実YaneuraOu selection engine | 0 process |
| 実selection label / candidate selection | 0 / 0 |
| live weight変更 | 0 |
| focused TypeScript / Python | 55 / 55（runtime 51 + evidence 4）、3 / 3 PASS |

これは棋力が上がったという結果ではない。3-seed学習が終わった直後に必要になる、
実selection teacher生成経路を先に閉じた変更である。

## checkpointを確認してから初めてselectionを開く

引数なしcommandは次である。

```sh
npm run shogi:floodgate-fresh-selection-teacher
```

処理順は固定した。

1. exact-cleanなrunner revisionを確認する。
2. seed 42 / 43 / 44の`result.json`と`final.pt`を既存preflightでidentity検証し、
   3 checkpointをすべてstrict-loadする。
3. その後にだけ、固定YaneuraOu asset、tracked search policy、固定4,800-parent sourceを開く。
4. local teacherを完走する。
5. checkpoint、asset、policy、sourceをもう一度検証する。
6. `manifest.json`、`authority.json`をcommitし、完了markerの`result.json`を最後にcommitする。

preflightが失敗した場合、source readerとgeneratorは呼ばれない。現在のtracked registryは
training planと3つのfinal result / checkpoint identityがすべて`null`なので、直接preflightは
stdout 0 byte、exit 1で「registry remains closed」と停止した。STOP確認のためにselection
source、Torch checkpoint、YaneuraOuを開いていない。

## 48 GiB Macで使う実測済みの並列設定

fresh-selection teacherはcloudではなく、このMac上で次の構成を使う。

| 設定 | 固定値 |
| --- | ---: |
| YaneuraOu process | 12 |
| thread / process | 1 |
| Hash / process | 512 MiB |
| Hash合計 | 6,144 MiB |
| proposal | depth 14 / MultiPV 6 |
| exact rescore | depth 16 / MultiPV 1 / `searchmoves` 1手 |
| timeout | 600,000 ms / search |
| network / AWS / GCP / Vercel compute | なし |

Hash 64 MiBへ下げる根拠はなかったため採用しなかった。既存v8診断では同じ
YaneuraOu / 1-thread構成で512 MiBが通常9局面の合計で256 MiBより2.882%速く、
12 process同時負荷も47.557秒で12 / 12成功、peak engine RSSは約8.0 GiB、
memory free 45%、throttled page 0だった。1,024 MiBは既知局面で512 MiBより遅かった。
したがって「最大の数字」ではなく、48 GiB / 14-core機で実測済みの
`12 × 512 MiB`をfreshにも固定した。残る2 coreは永続化、入力供給、OSへ残す。

## 不完全MultiPVを混ぜずに救済する

depth 14のproposalが完全な6 rankを返す通常経路では、その候補と強豪棋譜の実戦手の和集合を
作る。その後、全候補をUTF-8 byte順に並べ、各手を独立したdepth 16 / MultiPV 1 /
exactly-one-`searchmoves`で再評価する。

合法手が6手以下なのにtyped fixed-depth incompleteになった場合だけ、次の救済を行う。

1. 途中まで返ったproposal rankを全部捨てる。
2. 全合法手を1手ずつdepth 14 / MultiPV 1で探索する。
3. その全合法手を候補集合にする。
4. 全候補をもう一度、独立depth 16でexact rescoreする。

partial rankとfallback rankは混ぜない。合法手が7手以上のincomplete、typedでない
incomplete、proposal / fallback / rescoreのtimeoutはすべてfatalで、datasetや完了markerを
publishしない。完了runで許すskip理由は`fewer_than_two_legal_moves`だけである。

focused regressionは2合法手のsynthetic局面で、最初の不完全proposal 1回、全合法手の
depth-14 fallback 2回、同じ全候補のdepth-16 exact rescore 2回を実traceで確認した。
resume時のfallback triggerに未知fieldを足したreceiptも拒否する。

## privateで再開可能、ただしlive昇格権限はない

出力は
`~/.codex/shogi-runs/floodgate-q1-2026-strength-first-selection-v1`
に固定し、directoryは`0700`、fileは`0600`にする。`work.jsonl`はparent単位で再開でき、
完走時だけcanonicalな`selection.jsonl`を作る。authority / manifest / resultは
source、checkpoint preflight、search policy、engine asset、dataset、全4,800 parentの
accountingを同じrun fingerprintへ束縛する。

このrunnerの権限はfresh-selection label生成までである。candidateを選ぶ処理、fresh /
legacy final holdout、正式paired A/B、外部較正、production weight writeは含まない。
実行可能になるのは、24,000 teacher完了、3-seed学習完了、その実identityを登録する
data-only review後である。

## validationと依存関係

Node v22のruntime focused suiteはgenerator、USI MultiPV、fixed runnerの
3 files / 51 tests、publication evidenceは1 file / 4 tests、合計4 files / 55 testsが
PASSした。preflight projectionはPython 3 / 3、ML stdlib全体は287 / 287、
TypeScript compileとdiff checkもPASSした。
実checkpointがないため、heavy selection runは意図的に開始していない。

generator coreはstrength-first v9 proposal rescue commit
`a8ec6975113f7feacbc55bb87ba80f2d9b64dbbe`と同じ変更を先に取り込んでいる。
さらに、そのexact commit自体をdependency mergeの第2 parentとしてbranch historyへ含めた。
このPRが先に通常mergeされれば、後続v9 PRは同じcommitをGit ancestryで共有し、同じpatchを
もう一度mainへ加えない。publication前にv9側との依存順と最終diffを再確認する。

機械可読記録:
[floodgate-strength-first-selection-teacher-runner-2026-07-20.json](./data/floodgate-strength-first-selection-teacher-runner-2026-07-20.json)
