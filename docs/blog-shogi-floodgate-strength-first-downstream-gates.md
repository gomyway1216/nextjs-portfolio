# Strength-first候補の下流棋力ゲートを準備

> 2026年7月19日、3-seed学習と候補選抜の後に使う、final holdout・retention・
> known regression・本番browser parityの受領証contractを実装し、18件のfocused testで
> 検証した。**これは評価関数を学習した結果ではなく、弱い候補を「強くなった」と誤認して
> formal A/Bへ進めないための下流判定である。** 実候補選抜受領証と実artifact identityは
> まだ存在しないため、production入口はholdout labelや評価器を開く前にexpected STOPとなる。
> English version:
> [blog-shogi-floodgate-strength-first-downstream-gates.en.md](./blog-shogi-floodgate-strength-first-downstream-gates.en.md)

## 現在地

| 項目 | 状態 |
| --- | --- |
| 5種類の下流受領証contract | 実装済み |
| 保存結果の再構成・改ざん検知 | 実装済み |
| production registry | identity未登録のclosed状態 |
| argumentless production command | exit 2 / expected STOP |
| 実候補authorization消費 | 0 |
| final holdout label read | 0 |
| 実下流受領証 / formal A/B | 0 / 0 |
| production / live weight変更 | 0 / 0 |
| focused unit test | 18 / 18 PASS（0.006秒） |
| full suite / 独立review | 未実施 / pending |

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
openingの両方が必要である。known regressionで一つでも`P*8f`が出れば、その時点でbrowser
parity readerまで進まない。5つ全部を通過して初めてformal A/B enrollmentを準備できるが、
それでもproduction weight writeとlive変更はfalseのままである。

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

さらに、普通のJSON mappingでは下流readerを開けない。candidate-selection laneが成功時だけ
発行する、型付きの一回限りauthorizationをproduction adapterが消費する必要がある。この
adapterはまだ未完成なので、仮にregistryだけをready形へ書き換えてもproduction入口はSTOPする。
今回のtest-only coreが使うsynthetic identityとcallbackはcontract test専用であり、実候補、
実holdout評価、実受領証には数えていない。

## 受領証を保存後にも再検証

各受領証はcandidate selection receipt、candidate / stable checkpoint、candidate / stable
weightのdigestを共通に持つ。保存済みのaggregate resultを読むときは、その文字列を信頼せず、
registryのexact enrollmentと保存metricから5受領証をすべて再構成し、field・型・gate文言・
dataset identity・metric・weight authorityを完全一致で照合する。

保存後にretention gate文言、candidate weight digest、metric、top-level weight authorityの
いずれかを変えたtestはすべて拒否された。受領証の将来の保存先もcanonical relative pathだけを
許し、absolute path、parent traversal、backslash aliasを拒否する。現在のmoduleはcanonical
bytesとidentityをmemory上で作るだけで、受領証fileを書かない。

## validationと非主張

focused stdlib 18 / 18を0.006秒でPASSし、Python compile checkとdiff checkもPASSした。
対象はclosed registry、protocol byte drift、plain mappingによる権限偽装、一回限りtoken、
各gateの境界値、早期停止、全5受領証、保存結果改ざん、canonical path、argumentless STOPを
含む。今回のlaneではresourceを広く使うfull suiteは実行しておらず、独立reviewもpendingである。

この変更はlocal testだけで完結し、AWS、GCP / Firebase、Vercel、networkを使っていない。
teacher生成、3-seed学習、candidate selection、holdout評価、formal A/B、外部校正、棋力向上、
高段到達、live weight変更の証拠ではない。

次はcandidate-selection laneのbranded authorization interfaceを接続し、実teacher完了後の
3-seed学習と選抜で得たidentityだけをdata-only registryへ登録する。その後にこの5 gateを
実データで順に通し、保存受領証を再検証してからformal A/Bへ進む。

機械可読記録:
[floodgate-strength-first-downstream-gates-2026-07-19.json](./data/floodgate-strength-first-downstream-gates-2026-07-19.json)
