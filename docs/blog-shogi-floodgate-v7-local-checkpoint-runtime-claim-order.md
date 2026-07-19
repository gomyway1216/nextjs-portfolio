# ローカル教師checkpoint：実行時claimの順序とlease後始末を修正した

2026年7月19日、portable copy対応後の実教師runへ進む前に、既存ローカルrunnerのcheckpoint順序を静的・動的に再監査した。その結果、認証済みtraining rowsの実行時claimが有効なのはconsumer callbackを**同期的に呼び出している間だけ**なのに、従来コードはcallback内でcheckpoint keyの非同期準備を`await`してからcheckpointを呼んでいたことが分かった。

つまりcopy問題を解消して次段へ到達しても、最初の`await`でclaimが失効し、checkpointは認証済みrowsを受理できない。さらにstage claim前にcheckpointが失敗した経路では、callerもcheckpoint側もleaseを閉じない可能性があった。どちらも教師の強さではなく、安全な実行順序と再実行可能性の問題である。

機械可読の根拠は [`data/floodgate-v7-local-checkpoint-runtime-claim-order-2026-07-19.json`](./data/floodgate-v7-local-checkpoint-runtime-claim-order-2026-07-19.json) に固定した。

## 1. 修正した順序

修正後は次の順序を固定する。

1. private stage leaseを取得する。
2. checkpoint key authorizationをconsumerへ入る前に準備する。
3. verified training-row consumerへ入る。
4. callbackの同期（synchronous）区間でcheckpoint関数を直接呼ぶ。
5. checkpointがstage、training rows、keyを同期的にclaimした後で、返されたPromiseを待つ。
6. 成否にかかわらず未使用key authorizationをidempotentにdiscardする。
7. 成否にかかわらずstage leaseの同じclose Promiseへjoinする。

`await checkpoint(...)`という見た目だけでは順序を証明しないため、checkpoint関数呼び出しを先に評価してPromiseを取得し、その後にだけawaitする構造とした。実際のproduction runtime claimを同期callback内で1回だけconsumeし、test-only claimや2回目のclaimを拒否する統合testも追加した。

## 2. leaseとkeyの後始末

stage leaseの`close()`は同じPromiseを返すidempotent契約である。checkpoint側が既にcloseを始めていればcallerはそのPromiseへjoinし、stage claim前に失敗してcheckpoint側がcloseしていなければcallerがcloseを開始する。synthetic testでは2回の`close()`呼び出しに対して物理的なcleanupが1回だけであることを固定した。

consumer検証失敗、同期checkpoint throw、非同期checkpoint reject、key discard失敗、lease close失敗を個別に検査する。operation、discard、closeが同時に失敗しても、nested `AggregateError`で3つすべてを保持し、主原因を上書きしない。

## 3. 検証結果

実装commitは`e86cbb5f0673f87121a9d789da6e990fc97a4170`である。変更対象のlocal runnerとtraining-row consumerは68 / 68 PASSした。teacher checkpoint本体を加えた独立再実行は117 / 117 PASSし、Node v22.13.0でevidence testまで加えた実装時関連実行は121 / 121 PASSした。PR前の実装correctness reviewはP0 / P1 / P2 / P3すべて0だった。

最初のPR CI（run `29685458867`）ではCoreが唯一の根本失敗となり、集約jobの`Test and build`も連鎖してFAILした。Coreの失敗2件はいずれも、今回変更したrunnerとtestを過去記事の機械データが旧byte数・hashで固定していたためで、実装testの失敗は0だった。PR readiness reviewはこのCI blockをP1、証拠の再現性・review記録をP2 2件として検出した。過去の実行事実は変えず、現在sourceのpinと今回の後続revisionだけを更新した。また、system/global Git configとoptional lockを明示的に無効化し、review履歴を「検出→修正→再review」として記録した。修正後のNode v22.13.0 focused runは82 / 82 PASSし、最終再reviewはP0 / P1 / P2 / P3すべて0になった。実教師の再実行で通過させるのではなく、証拠の再現性を直して再CIする。

この検証はorderingとcleanupの証拠であり、教師行、学習候補、棋力の証拠ではない。実教師process、checkpoint work、label finalization、optimizer training、A/B、外部校正、live weight変更はすべて0のままである。

## 4. AWS、GCP、Vercel

この修正と検証はローカルだけで行った。AWSは不要・未使用で、AWS API、credential、compute、storage、network requestは0である。Firebase Cloud Functionsは既存アプリbackendのGCP、VercelはWeb配信だが、このcheckpoint修正ではどちらも呼んでいない。

CIの`AWS witness adapter contract (source only)`は静的な未使用接続契約の検査名であり、AWS上で教師生成や学習を実行する意味ではない。

## 5. 次

この修正だけでは実教師を開始しない。portable copy witness基盤をreview・CI・通常mergeし、次のsemantic bridgeでsource上のverified authorityをcopy先のexact bytesへ結ぶ。その3-gate経路まで揃ってから残存clean-roomを監査し、新しいローカルrunを100 → 500 → 24,000の順に実行する。証拠が揃うまでライブ重みは変更しない。
