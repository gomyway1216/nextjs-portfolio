# 将棋評価関数: 学習後の2つのregistry候補を手作業なしで作る

> 2026年7月20日、3-seed学習完了後のcheckpoint preflight registryと、
> fresh-selection teacher完了後のevaluator registryを、実identityからstdoutへ作る
> 2つのargumentless builderを実装した。現在のrepositoryにはexact training planがまだ
> ないため、両方の本番commandはexit 1 / stdout 0 bytesでexpected `STOP`した。
> 実3-seed学習、実fresh-selection teacher、候補選抜、registry書換え、live weight変更は
> すべて0である。English version:
> [blog-shogi-floodgate-strength-first-post-teacher-registry-candidates.en.md](./blog-shogi-floodgate-strength-first-post-teacher-registry-candidates.en.md)

## 結論

今回取り除いたのは、棋力向上pipelineに残っていた2つの手作業である。

1. 3つの学習結果とcheckpointのbytes / schema / revisionを人手で転記する作業
2. selection teacher、dataset、stable checkpoint、evaluator実装のidentityを人手で
   evaluator registryへ転記する作業

builderは候補JSONをstdoutへ出すだけで、tracked registryを一切書かない。出力を権限に
変えるには、候補だけを別のdata-only PRでreviewし、CIを通し、regular mergeする必要がある。
この変更そのものはteacherを回さず、optimizer stepを実行せず、候補を選ばず、AIをまだ
強くしていない。

## 直線的な実行順

| 順序 | 工程                                                       | この変更が自動化する部分 |
| ---: | ---------------------------------------------------------- | ------------------------ |
|    1 | 24,000-parent teacher完了後、既存plan builderを実行        | 対象外、既存実装         |
|    2 | exact planだけのdata-only PRをreview / CI / regular merge  | 人による独立gate         |
|    3 | seed 42 / 43 / 44を並列学習                                | 対象外、既存launcher     |
|    4 | preflight registry candidate builderを実行                 | 今回のbuilder A          |
|    5 | candidateだけのdata-only PRをreview / CI / regular merge   | 人による独立gate         |
|    6 | 固定4,800親 / 200局のfresh-selection teacherをローカル実行 | 対象外、既存runner       |
|    7 | evaluator registry candidate builderを実行                 | 今回のbuilder B          |
|    8 | candidateだけのdata-only PRをreview / CI / regular merge   | 人による独立gate         |
|    9 | 3候補を同じfresh selectionで評価し、固定gateで代表を選ぶ   | 対象外、既存evaluator    |

その後もsealed final holdout、回帰、browser / production parity、正式paired A/B、外部校正が
残る。live weightは全証拠が揃うまで変更しない。

## builder A: 3 checkpointをpreflight registryへ投影

```sh
python3 ml/build_strength_first_selection_preflight_registry_candidate.py
```

builder Aはcurrent exact HEADにあるtracked planとtracked preflight registryを読み、
seed 42 / 43 / 44それぞれの`result.json`と`final.pt`を読む。3つのresultが同じclean
training revision、runtime、plan、slot、training contractを持つことを確認し、3つの
checkpointを既存model validatorでstrict-loadする。

成功時だけ、既存
`shogi-floodgate-strength-first-qat-selection-preflight-registry-v1`と同じlayoutの
READY候補をpretty JSON 1件＋LFとしてstdoutへ出す。tracked registryがすでにREADYなら、
完全に同じ候補を再計算できる場合だけ成功する。

このbuilderはselection source、selection label、final holdout、live weight pathを読まない。
入力はcanonicalなregular fileかつlink count 1を要求する。`O_NOFOLLOW`で開いたfdのidentityを
最初の1 byteより前にpath snapshotと照合し、読取り後とstdout前にも再確認する。
registry write、candidate selection、production weight writeの権限はない。

## builder B: teacher完了物をevaluator registryへ投影

```sh
python3 ml/build_strength_first_selection_evaluator_registry_candidate.py
```

builder Bは、tracked evaluator registryと、evaluator、adapter、preflight、
real evaluation core、metric gateの5 implementation identityをcurrent exact HEADから
先に固定する。次に既存public preflightを実際に実行し、3 checkpointがstrict-load済みで
selection sourceをまだ開いていないsummaryだけを受け取る。

両方が成功した後にだけ、固定private領域のselection-teacher authority / manifest / result、
selection dataset、stable checkpointを読む。末尾LFを含めないcanonical preflight payloadの
SHA-256、teacher document相互束縛、dataset identity、stable identity、READY gateを既存
validatorで再検証する。stable checkpointは、認証済みtracked planの`warm_initializer`と
exact path / bytes / SHA-256で交差束縛する。large artifactもcanonical regular fileかつ
link count 1を要求し、fd identityを最初の1 byteより前に照合してからstream hashし、
fingerprintをstdout直前に再計算する。

builder Bはfresh-selection raw source、selection receipt、final holdout、live weightを
読まない。出力registryでも`final_holdout_read_authorized`と
`production_weight_write_authorized`は`false`のままである。tracked registryがすでに
READYなら、完全一致する再計算だけを許す。

## 実測した現在のSTOP

更新済みorigin/mainを通常mergeしたclean exact revisionで両commandを本番実行した。

| command                      | exit |  stdout | 停止理由                                      | tracked write / live change |
| ---------------------------- | ---: | ------: | --------------------------------------------- | --------------------------: |
| preflight registry candidate |    1 | 0 bytes | exact training planが未登録                   |                       0 / 0 |
| evaluator registry candidate |    1 | 0 bytes | planと3 final identityが未登録でpreflight閉鎖 |                       0 / 0 |

したがって「builderがある」ことと「実candidateがある」ことは区別される。記録時点では
training plan、3-seed training artifact、fresh-selection teacher artifact、candidate
selection、formal A/B、live promotionの実証はない。

## persistent worktreeが必要な理由

実学習の出力先`ml/runs/`はGitでignoreされ、worktreeごとにlocalである。planをmergeした後、
更新済みmainから学習専用のpersistent worktreeを作り、その同じworktreeで3 seedの完了まで
走らせる。途中で別worktreeへ移ると、codeは同じでもlocal result / checkpointが見えない。

学習中はHEADを変更せず、`git clean -fdx`を使わない。seed directoryが一部だけ存在する場合は、
勝手に削除・上書き・再実行せずSTOPして手動確認する。これは計算時間を増やすためではなく、
完了したseedと別revisionのseedを混ぜないためである。

## validationと限界

builder A / Bだけのfocused suiteは19 / 19（0.131秒）、既存plan、launcher、preflight、
teacher-preflight、evaluatorまで合わせたfocused suiteは68 / 68、ML stdlib全体は
312 / 312（24.754秒）をPASSした。Python compile、
changed-file Ruff、Black、diff checkもPASSした。テストは、3 checkpoint strict-load、
READY idempotence、stdout-only、tracked input再確認、symlink / hard-link拒否、datasetと
teacher authorityの交差束縛、stableとplan initializerの同一長・異SHA差替え拒否、
open時差替え先のread 0 bytes、stable fingerprint drift、private readのexact許可集合、
final-holdout / live access 0を含む。

実行・検証はこのMac内だけで行い、network、AWS、Firebase / GCP、Vercelを使っていない。
AWSはモデル改善にもこのhandoffにも必要ない。Firebase / GCPは別のbackend、Vercelはweb
deploymentであり、このローカル学習・選抜経路の計算資源ではない。

機械可読記録:
[floodgate-strength-first-post-teacher-registry-candidates-2026-07-20.json](./data/floodgate-strength-first-post-teacher-registry-candidates-2026-07-20.json)
