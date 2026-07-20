# Strength-first候補の下流棋力ゲートを準備

> 2026年7月19日、3-seed学習と候補選抜の後に使う、final holdout・retention・
> known regression・本番browser parityの受領証contractを実装し、38件のfocused testで
> 検証した。**これは評価関数を学習した結果ではなく、弱い候補を「強くなった」と誤認して
> formal A/Bへ進めないための下流判定である。** 実候補選抜受領証と実artifact identityは
> まだ存在しないため、production入口はholdout labelや評価器を開く前にexpected STOPとなる。
> English version:
> [blog-shogi-floodgate-strength-first-downstream-gates.en.md](./blog-shogi-floodgate-strength-first-downstream-gates.en.md)

## 現在地

| 項目 | 状態 |
| --- | --- |
| 5種類の下流受領証contract | 実装済み |
| 保存結果の再構成 | 別認証済みevidence必須のcontractを実装 |
| production registry | identity未登録のclosed状態 |
| argumentless production command | exit 2 / expected STOP |
| 実候補authorization消費 | 0 |
| final holdout label read | 0 |
| 実下流受領証 / formal A/B | 0 / 0 |
| production / live weight変更 | 0 / 0 |
| focused unit test | 38 / 38 PASS（0.076秒） |
| full suite / 独立rereview | 未実施 / PASS（P0 / P1 / P2 = 0 / 0 / 0） |

実行入口は固定registryと、そのregistryが参照する既存protocolのbytesを確認する。現在の
registryにはcandidate selection receipt、candidate / stable checkpoint、candidate / stable
weight、2つのfinal holdout、2つのretention dataset、known-regression fixture、production
worker / WASM、browser時間枠の実identityが一つも入っていない。このため次のcommandは
候補authorization、holdout reader、評価callbackに到達しない。

```sh
python3 ml/strength_first_downstream_gates.py
```

実測はexit 2、`status=STOP`だった。消費したcandidate authorization、final label read、
発行した受領証、formal A/B game、live weight変更はいずれも0である。引数で別registryや
別artifactを差し込む経路もない。

## なぜ棋力のために必要か

学習lossやselection scoreだけでは、サイト上で実際に指すAIが強くなったとは判断できない。
今回固定した5受領証は、候補選抜後に次の異なる失敗を落とす。

| 受領証 | 落とす失敗 | pass条件 |
| --- | --- | --- |
| fresh final holdout | 未使用局面でstableより弱い | int16 pair accuracyとtop-1 accuracyが両方stable以上 |
| legacy final holdout | 過去分布での後退 | 同じ2指標が両方stable以上 |
| general / opening retention | 全般・序盤の壊れ方 | value MAEはstableの1.05倍以下、pair系2指標はstable-0.005以上 |
| known regression | 既知の悪手`P*8f`の再発 | static順位、depth 11/12、800/2000/4000msを各3回の全条件で拒否 |
| production parity | 学習候補とWeb実行物のずれ | exact candidate weight、固定worker / WASM、全時間枠で合法手・時間内、console/runtime error 0 |

freshとlegacyは別々の受領証なので、片方を通っただけでは次へ進めない。retentionもgeneralと
openingの両方が必要である。live coreはまず5 evaluatorの認証済みevidenceをすべて集め、
5つのpathとSHA-256がそれぞれpairwise distinctであることを確認してから受領証判定を始める。
known regressionで一つでも`P*8f`が出れば後続の受領証とformal readinessは作らない。
5つ全部を通過して初めてformal A/B enrollmentを準備できるが、それでもproduction weight
writeとlive変更はfalseのままである。

したがって、この変更自体の直接的な棋力向上は0である。一方で、再学習後に「本当に強い候補」
だけを正式対局へ送るための必要な測定経路を、teacher生成・学習本体とは別laneで先に用意した。

## 架空の候補でゲートを開かない

production registryはdata-onlyで、未完成の実artifactを仮hashで埋めていない。closed状態では
すべてのenrollmentがnull、候補・label read・evaluation・formal A/B・weight writeの全gateが
falseでなければvalidationに失敗する。

将来readyにするには、少なくとも次を一度にexact identityで登録する必要がある。

- candidate-selection laneが発行した実selection receipt
- 選ばれたcandidateと比較対象stableのcheckpoint / weight
- fresh / legacy final、general / opening retention、known-regression fixture
- サイトが実際に使うproduction worker / WASMと固定browser時間枠

各roleはcandidate-selection receipt、strength-first candidate checkpoint、stable checkpoint、
int16 weight、fresh / legacy / retention dataset、fixture、worker、WASMそれぞれのexact schemaを
要求する。全12 identityのpathとSHA-256もpairwise distinctでなければならず、fresh datasetを
legacyやretentionとして再利用したり、workerとWASMを同じidentityで登録したりできない。

候補選抜contractも既存WCSC36のwarm / scratch 6-run受領証を再利用しない。専用schemaは
warm-onlyのseed 42 / 43 / 44、3つの`final.pt`、strength-first plan / training-result /
checkpoint schema、同じfresh selection上でのstable再計測、固定metric順、4つのper-seed gate、
中央seed、2 / 3 family gate、全seedの量子化delta gate、各checkpoint 1評価をexactに固定し、
旧6-run受領証とは非互換である。

さらに、普通のJSON mappingでは下流readerを開けない。candidate-selection laneが成功時だけ
発行する、型付きの一回限りauthorizationをproduction adapterが消費する必要がある。発行時に
全role、browser時間枠、候補選抜contractを含むregistry全体をcanonical bytes / SHA-256へ固定し、
消費時のregistryが完全一致しなければ最初のreader前に拒否する。固定後はcaller側のregistryが
途中で書き換わっても、各callbackへ渡すrole-specific expected inputと全受領証はimmutable
snapshotだけから作る。このadapterはまだ未完成なので、仮にregistryだけをready形へ書き換えても
production入口はSTOPする。
各evaluatorもplain metric mappingを返せず、一回限りのverified observationが必要である。
observationはintegerのselected seed、candidate-selection receipt、candidate / stableの
checkpoint / weight、対象dataset / fixture / worker / WASM / browser時間枠を明示し、registryの
exact identityと一致しなければ受領証を作らない。observation bodyはrole-specific schemaの
content-addressed evidence identityへ結び付く。今回のtest-only issuerはcontract test専用で、
実候補、実holdout評価、実受領証には数えていない。

## 受領証を保存後にも再検証

各受領証はcandidate selection receipt、candidate / stable checkpoint、candidate / stable
weightのdigestに加え、registry全体のcanonical identity、評価evidence identityと
measured-input digestを持つ。保存済みaggregate
resultのmetricや`path_verified=true`を権限として再利用しない。再検証にはcandidate-selection
authorizationも消費し、production evidence IOが元evidenceを別に読み直して発行する
registry-boundの一回限りbundleが必要である。authorizationを別registryでbundle化する操作と、
bundleを別registryで消費する操作はどちらも拒否する。現在はtest-only issuerだけでproduction
issuerは未実装なので、実保存結果を自己申告だけで通す経路はない。

別認証済みbundleから5受領証を再構成し、保存後にretention gate文言、candidate weight digest、
metric、top-level weight authorityのいずれかを変えた場合は完全一致に失敗する。bundle側で
worker path verificationがfalseなら、保存結果のtrueを合成せずparity gateを落とす。evidence
bodyだけを変えてidentityを据え置く改ざんもcontent bindingで拒否する。受領証の将来の保存先は
canonical relative pathだけを許し、absolute path、parent traversal、backslash aliasを拒否する。
現在のmoduleはcanonical bytesとidentityをmemory上で作るだけで、受領証fileを書かない。

## validationと非主張

focused stdlib 38 / 38を0.076秒でPASSし、Python compile checkとregistry JSON checkもPASSした。
対象はclosed registry、role schema / identity再利用、protocol byte drift、plain candidate /
evaluator / stored-evidence mappingによる権限偽装、一回限りtoken、別dataset計測、保存metric改ざん、
偽のbrowser path verification、evidence content改ざん、float seed、空または不正なUSI bestmove、
各gateの境界値、全5受領証、canonical path、argumentless STOPに加え、旧6-run schema衝突、
cross-registry token / bundle、callback中のregistry書換え、live evidence path / hash衝突を含む。
5 evidenceを先に認証するため、gate failureが止めるのは後続readerではなく後続receipt / formal
readinessである。2回目の独立reviewで見つかった3点を修正し、独立最終rereviewは
P0 / P1 / P2 = 0 / 0 / 0だった。resourceを広く使うfull suiteはpendingである。

この変更はlocal testだけで完結し、AWS、GCP / Firebase、Vercel、networkを使っていない。
teacher生成、3-seed学習、candidate selection、holdout評価、formal A/B、外部校正、棋力向上、
高段到達、live weight変更の証拠ではない。

次はcandidate-selection laneのbranded authorizationと、evaluator evidenceを実fileから
再認証するproduction issuerを接続し、実teacher完了後の3-seed学習と選抜で得たidentityだけを
data-only registryへ登録する。その後にこの5 gateを実データで順に通し、保存受領証を
別evidenceから再検証してからformal A/Bへ進む。

機械可読記録:
[floodgate-strength-first-downstream-gates-2026-07-19.json](./data/floodgate-strength-first-downstream-gates-2026-07-19.json)
