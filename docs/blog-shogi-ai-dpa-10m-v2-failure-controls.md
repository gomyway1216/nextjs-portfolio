# DPA 10M fast lane v2 — 過去の失敗を今回に生かす

この文書は、過去の候補一覧をもう一度並べる記事ではない。結果とartifactの正本は
[研究台帳](./blog-shogi-ai-research-ledger.md)、系統別の詳しい分析は
[2026-08-08以降のpostmortem](./blog-shogi-ai-20260808-postmortem.md)、DPA-HalfKP96の構造と
数値gateは[実行計画](./blog-shogi-dpa-halfkp96-10m-fast-lane.md)に置く。ここでは、それらの失敗を
10M fast lane v2の判断へどう反映するかだけを、人間が読み直せる形で固定する。

## 結論

今回やることは、良さそうな小技を次々試すことではない。sealed holdoutを完全に除外した
legacy 2Mと、fresh teacher 8Mを固定し、scratchのDPA本体を一度だけ学習する。静的指標は
悪い候補を早く捨てるために使い、強くなったという判断は分離panelのformal 768局だけで行う。

旧runOp1の589万行は壊れておらず、捨てる必要もない。ただし全部を再学習すると、現productionを
作った評価面を新しい本体へ写し直し、同じ上限へ戻る危険がある。そのためv2では、sealed unionを
先に除外した後の2,000,000行だけを保持用に使い、学習露出を20%に固定する。

## なぜscreenの成功がformalで消えたのか

代表例は同容量2-way depth-preferred TTである。56局screenは60.7143%、独立96局も57.2917%だったが、
別panelのformal 768局は48.4375%だった。93,144手はすべて合法でtechnical faultも0だったため、
formalで急に壊れたという証拠はない。小標本とopening panelで見えた優位が、十分な別標本では
再現しなかった、と読むのが正確である。

56局の得点率は数局で大きく動く。さらに多くの候補からscreen通過者だけを見ると、偶然上振れした候補を
選びやすい。これは候補ごとの手順を守っていても残るwinner's curseである。independent 96局はその危険を
減らすが、効果が小さければまだ確定しない。formalはscreenの成功を取り消したのではなく、安定した優位を
確認できなかった候補をproductionへ入れないために機能した。

したがってv2では、screenを「採用の小型版」と扱わない。screenとindependentは早期棄却の段階であり、
別384 pairのformalで95%下限が50%を超えた場合だけ昇格できる。screenが良かったことを理由にformalの
対局数、panel、閾値を変更しない。

## 小型head、PUCT、微調整、並列化が失敗した理由

### 小型head

小型policy/value headは一部domainの残差を覚えられたが、別domainへ一般化しなかった。現HalfKP表現にない
両視点や玉周辺の相互作用を、数百から数万parameterの後段だけで復元しようとしたことが根本的に弱かった。
静的pairが少し上がってもfresh top-1が不変、またはbrowser/v9で逆転した。v2では補助headを本体表現の
代わりにせず、一つの評価本体をscratchから学習する。

### PUCTとroot policy

teacher順位の再現と、限られたsimulationで強いvisit policyを作ることは別問題だった。pure PUCTは
推論時間を探索budgetから失い、32 simulationsではproduction alpha-betaの仕事量に届かなかった。
alpha-betaのrootへpolicyを足した場合も、TT、killer、history、反復深化が作る既存の手順序を壊した。
v2は探索を固定し、評価関数だけを比較する。PUCTやroot並べ替えを同じcandidateへ混ぜない。

### 微調整

旧評価のlabelへ微調整するとMAEは下がっても、同一親の兄弟手順位が改善しない例が続いた。fresh domainへ
寄せるとbrowser/v9を忘れ、旧domainを増やすと現productionの評価面へ戻った。行数が多くても同じ親の
siblingsなら独立局面の多様性は増えない。v2では旧checkpointをinitializerにせず、fresh 80%とlegacy 20%を
各epochで固定し、ranking lossを同じparent・同じteacherの兄弟手だけに限定する。

### 並列化

2-thread Lazy SMPはnode数が平均2.19倍でもscreen 16.0714%だった。共有TTの競合と重複探索により、増えたnodeが
有益なnodeにならなかった。root partitionも全候補を同じ反復深化で比較する性質を失い、合格しなかった。
v2で並列化してよいのは、独立shardの教師生成や検証などworkflow上の仕事である。候補エンジンの探索を
並列化する実験とは分離し、rows/secが上がらないworker追加も行わない。

## 今回見つかった227件のsealed holdout漏洩

sealed browser validationは57,962 semantic positions、sealed v9 selectionは33,316で、unionは91,160である。
旧legacy 2M artifactをこのunionと照合すると、選抜済みsemantic positionsのうち227件が重なっていた。
旧builderはsource内の重複とlabel conflictを除いていたが、sealed unionをselection前に除外していなかった。

227 / 2,000,000は比率として小さい。しかしholdoutの独立性は割合ではなく境界である。候補がその227件を
学習した後では、該当行だけを評価集計から引いても学習済みweightへの影響は消えない。そのartifactで学習した
候補について、browser/v9をsealed評価と呼ぶことはできない。

この発見が意味しないことも明確にする。

- raw runOp1 source全体が破損したわけではない。
- 現productionの実戦結果や、過去のformal対局結果が227件だけで説明できるわけではない。
- 旧legacy 2Mをその場で編集して再利用してよい、という意味ではない。

旧artifactはhistoricalとして凍結する。v2は同じsourceを最初から走査し、sealed unionをpriority selectionより前に
除外し、その次に順位の高いeligible rowsでexact 2Mを満たす。新manifestが除外ファイルのpath、bytes、SHA-256、
semantic countと`selected_overlap = 0`を記録しない限り、学習入力として認めない。

## 旧589万行を再学習する上限リスク

runOp1の5,892,192行は、現production lineageの教師分布である。これを全量または多数派として新本体へ入れると、
architectureが変わっても最適化の主目的は旧評価面の再現になる。新しい表現を作ったのに、既存モデルが既に
持つ判断を高精度で写して終わる危険がある。これはdata corruptionではなく、teacher ceilingの問題である。

v2ではsource全体をselectionのために走査するが、学習へ公開するのは漏洩除外後のexact 2Mだけである。
残りをfresh不足の穴埋めに使わず、各batch cycleのlegacy/fresh露出も20:80に固定する。fresh 8Mが不足した場合は
10Mという数字を旧dataで満たさず、data admission FAILとして止める。

## DPA 10M fast lane v2で固定すること

| 過去の失敗 | v2の固定策 |
|---|---|
| sealed holdoutとtrainの交差 | browser/v9 semantic unionを全training armのselection前に除外し、最終overlap 0を再計算する |
| 旧lineageの再学習 | legacyはexact 2M、全体・勾配露出とも20%。fresh不足をlegacyで補わない |
| 微調整による旧評価面への回帰 | DPA本体をscratch初期化し、旧checkpointとfailed checkpointを読まない |
| MAE改善と手選択改善の混同 | value metricとsame-parent pair/top-1をdomain別に出し、aggregateで回帰を隠さない |
| 無関係なranking | same-parent、same-teacherの兄弟手だけをranking対象にする |
| 小型headや探索接続の交絡 | evaluatorだけを変更し、policy head、PUCT、root ordering、探索並列化を混ぜない |
| 重い本体を学習後に発見 | zero-output runtime preflightを先に通し、実payloadでも+5%以内を再確認する |
| screen上振れ | screen56、独立96、formal768を別panelにし、formalだけへ昇格権限を与える |
| 実験基盤の拡張で本作業が停止 | 既存shard、SHA、create-only、検証器だけを使い、棋力に不要な新schemaやrunnerを作らない |

data freeze時には、legacy 2M、fresh 8M、両者のunion、すべてのsealed domainについてsemantic overlapを
再計算する。game identityがあるsourceはgame単位でも分離する。overlap、duplicate fill、bound/incomplete teacher、
identity driftのどれかが1件でもあれば、学習を始めない。

## 一週間で止める条件

一週間は「うまくいくまで試す期間」ではなく、同じ仮説へ使える最大時間である。開始時刻とDay 7終了時刻を
先に固定し、次の順序を変えない。

| 期限 | 必要な到達点 | 未達時の判断 |
|---|---|---|
| Day 1 | v2 data contract、sealed union、DPA runtime identityを固定し実生成を開始 | overlapまたはidentity不明なら該当armだけ生成を開始しない |
| Day 4終了 | 実測throughputに基づきleak-free legacy 2M + exact fresh 8Mをcreate-only freeze | legacy補充、duplicate補充、期限延長をせず第一候補をdata FAILにする |
| Day 5終了 | 固定2 epoch、domain別static、実payload runtimeを完了 | extra epoch、seed、LR変更をせず停止する |
| Day 6終了 | screen56、PASS時だけ独立96を完了 | 閾値未達なら対局を追加せず停止する |
| Day 7終了 | qualified candidateのformal768とbrowser gateを完了 | formal PASSがなければ第一候補を不採用で閉じる |

途中でも、train/holdout overlapが1、technical faultが1、runtime slowdownが+5%超、domain別必須指標が回帰、
screen/independentが閾値未達、formalのpaired bootstrap 95%下限が50%以下なら即停止する。完了shardや対局を
上書きせず、同じ条件の技術障害から未完部分だけを再開することはできるが、結果を見てcontractを変えない。

## 第二候補

第二候補は、小型head、PUCT、追加epochのどれでもない。第一候補がDay 5前半までに、data admissionとruntimeを
通過したうえでdomain横断のstaticに落ち、原因がDPA本体の玉関係表現不足と分類できた場合だけ、
**HalfKP64のdual-perspective本体へ16-laneのfactorized relative-king interactionを組み込む一体型評価器**を
一度だけ候補にする。auxiliary headにはせず、視点交換の反対称性を本体全体で保つ。

第二候補も、学習前zero-output runtimeが+5%以内を通った場合だけ、同じleak-free v2 corpus、scratch 2 epoch、
同じstatic/runtime/56/96/768 gateを使う。第一候補がscreen以降で負けた場合、dataが未完成の場合、または
Day 5以降まで使った場合は第二候補を開始しない。原因の違うFAILをarchitecture変更で追いかけず、Day 7で
fast lane全体を閉じる。

この第二候補の意味は「もう一回試せる」ではない。第一候補の表現仮説が早期に反証され、同じデータで
その原因だけを変えられ、formalまで走る残り時間がある場合に限る、事前に限定した一手である。
