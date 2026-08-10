# 自作将棋AI 2026-08-08以降の実験postmortem

> この文書は、direct-evasion generatorの候補評価を始めた2026-08-08以降を対象に、
> 探索、policy、MCTS、RL、HalfKP transfer、並列化の失敗を横断分析する。
> それ以前の再構築史は[長編記録](./blog-shogi-ai-rebuild.md)、artifact SHAと最終採否の正本は
> [研究台帳](./blog-shogi-ai-research-ledger.md)を参照する。

## 1. 結論

ほとんど採用できなかった主因は、採用gateが厳しすぎたことではない。局所的な速度、teacher MAE、
pair accuracy、top-1、self-play lossを改善しても、固定時間alpha-betaの実戦棋力へ接続できなかった
ことが中心である。

失敗は次の5群へ整理できる。

1. Aoba/Yaneuraの探索式だけを、異なる評価・history・TTへ移植した。
2. 教師再現性を実戦棋力の代理として強く信じすぎた。
3. 小型headまたは小規模・混合domainデータで、本体表現の不足を補おうとした。
4. node数や圧縮率を、固定時間での有益探索量と取り違えた。
5. 小さいscreenの上振れを、独立したformalで初めて排除できた。

一方、direct-evasion generatorは、探索の意味や評価尺度を変えず、王手局面の明確な無駄だけを
除去した。この違いが、唯一の明確な採用につながった。

## 2. 証拠と推論を分ける

以下で「結果」はartifactから確認できる事実、「原因」は結果を横断して得た推論である。
原因を単一candidateについて数学的に証明したわけではない。複数domain、固定時間対局、
runtime計測が同じ方向を示す場合に限り、再発防止へ昇格させる。

## 3. 系統別の結果

### 3.1 成功した構造変更

| 候補 | 結果 | 判断 |
|---|---:|---|
| direct-evasion generator | formal 768局で520勝31分217敗、69.7266%、fault 0 | 採用 |

王手時に全擬似合法手を走査してから落とす経路を、王手回避だけを直接生成する経路へ置き換えた。
評価値、枝刈り境界、手順序の意味を変えず、無駄なworkを減らした点が他候補と異なる。

### 3.2 Selective search移植

| 候補 | 固定screen結果 | 観測した問題 |
|---|---:|---|
| TT-qualified singular extension | 13勝0分27敗、32.5%で数学的早期FAIL | 誤った延長とmulti-cutの損失が大きい |
| improving-aware RFP/LMP | 16勝2分38敗、30.3571% | aggregate workは約36%減ったが必要な枝も落とした |
| history-adjusted LMR | 28勝1分27敗、50.8929% | ほぼ中立で、既存history更新との相乗効果がない |

これらはAoba/Yaneuraの固定条件を係数探索なしで投影したが、元エンジンの評価尺度、TT品質、
move ordering、history寿命、平均到達深さはproductionと一致しない。heuristicは単独部品ではなく、
周囲の探索系と共同調整された制御則である。式だけを移す方法を今後の本線にしない。

### 3.3 表現・storage・速度候補

- side-occupancy bitsetはfixed-work exactだったが、aggregate -0.0863%、median +0.1260%で事前FAIL。
- HalfKP81第1層のint8+sparse escapeは94.66MBから48.09MBへlossless圧縮できたが、
  fixed-workでaggregate +0.77995%、median +0.56882%遅くなった。

byte数や命令数の削減は、WASMの分岐、展開、cache、境界checkを含む実時間の改善を保証しない。
速度候補は、semantic parityの次に同一workのwall timeを測り、速くなければ対局へ進めない。

### 3.4 小型policy・value head

| 候補 | 結果の要点 | 不採用理由 |
|---|---|---|
| current-production 1epoch teacher transfer | MAEは約8.27cp改善 | within-parent pairが69/123,520悪化 |
| compact child-board root policy、51,521 params | browser pair +0.391pp、v9は改善 | browser必須+0.5pp未達 |
| HalfKP accumulator quiet policy、16,767 params | browser/v9 pairは改善 | fresh pair/top-1が完全に不変 |
| linear value residual、338 params | 全top-1は維持 | pairとMAEの必須改善なし |
| nonlinear gated residual、5,427 params | fresh側の一部だけ改善 | browser/v9へ一般化しない |
| king-zone / anchored / local tactical heads | 複数domainで小改善 | 閾値未達またはMAE悪化 |

小型headは安価だが、現HalfKPの表現に存在しない両視点・玉周辺相互作用を後段だけで復元できない。
一部domainへの残差fitはできても、別domainで消えるか逆転した。以後、小型headを本体改良の代替にしない。

### 3.5 Spatial policy-value、PUCT、root接続

114,914 parameterのspatial residual policy-valueは、browser pairを0.73517から0.74208、
v9 pairを0.71087から0.73110へ改善し、value MAE、top-1、約10msのruntime gateも通過した。
しかし実戦接続は次の通りだった。

| 接続 | 結果 |
|---|---:|
| 初回pure PUCT | 15 pair時点0勝0分30敗で早期FAIL |
| depth teacher replay後pure PUCT | 0勝0分56敗 |
| spatial root rank + production alpha-beta | 24勝1分31敗、43.75% |

教師順位を再現できることと、MCTSのvisit policyを学ぶことは別である。32 simulationsではproduction
alpha-betaの探索量に届かず、root推論の時間も探索budgetから失われた。またalpha-betaのroot順序は、
TT、killer、history、反復深化の情報をすでに持ち、外部policyで並べ替えるとその共同最適を壊した。

### 3.6 Self-play RL

- 64局版はpolicy CE改善が0.9668%で、固定1% gateへ届かなかった。
- 512局版は76,555 positions、376 draw、69先手勝、67後手勝だった。
- 512局版はself-play CEを1.778%改善し、top-1とoutcome value MAEも改善した。
- 同時にbrowser pairは0.74208から0.70739、v9 pairは0.73110から0.68386へ悪化した。

弱い候補自身が作る、drawの多い狭い分布へ適応したため、自己指標は改善しても外部教師知識を失った。
RLを再開する場合は、強いinitializer、十分なdecisive比率、過去教師rehearsal、桁違いの対局数が必要である。
1週間fast laneでは本線にしない。

### 3.7 HalfKP transferとpolicy-aware表現

| 候補 | 結果の要点 |
|---|---|
| spatial leaf → HalfKP81 | int16 MAE約9.90cp改善、pairは20/123,520悪化 |
| Aoba depth12 transfer | fresh pair約+2.04pp、browser/v9 pairは悪化 |
| Aoba sibling head-only transfer | pair +0.0719pp、必須+0.5pp未達 |
| balanced tri-domain full transfer | pair -0.0323pp |
| joint HalfKP policy-value | fresh pair -1.29pp、v9 -2.19pp |
| dedicated 6M policy | browser +3.52pp、fresh +1.89ppだがfresh top-1 -2.51pp、v9 pair -0.51pp |

値の絶対誤差を減らしても、同一親局面の候補順位は改善しない例が繰り返された。fresh Aobaへ合わせると
既存browser/v9を忘れ、domainを均衡化してもvalue-only HalfKPはpolicy順位を十分に表現できなかった。
次候補では、ranking lossを無関係な局面間へ掛けず、同じ親・同じ教師の兄弟手内だけへ限定する。

### 3.8 Book、並列探索、TT

| 候補 | 結果 | 教訓 |
|---|---:|---|
| Aoba exact opening book | 33,344 entries、固定opening hit 0/28 | 正確でもcoverage 0なら棋力寄与0 |
| 2-thread Lazy SMP | node平均2.19倍、8勝2分46敗、16.0714% | 重複nodeとTT競合は有益探索ではない |
| deterministic root partition | 54局時28勝1分25敗、最大61/112 | rootを分割すると反復深化の全候補比較を失う |
| 2-way depth-preferred TT | screen 60.71%、independent 57.29%、formal 48.4375% | 小標本の上振れはformalで消える |

formal 768局は時間を使うが、2-way TTの誤採用を防いだ。gateを緩めるのではなく、候補を作る前の
仮説とデータを強くするべきである。

### 3.9 KingPair bootstrap

dual-perspective KingPair interaction NNUEは23,992,849 parameters、1,582,708 training rows、
2 epochでarchitectureと学習経路を完走した。weighted validation MAEはproduction 501.31cpに対して
595.74cpで、94.43cp悪化した。Aoba sibling pair/top-1も悪化した。

これは最終候補の採否ではないが、次の問題を示した。

- 24M parameterをscratch学習するには、独立親局面とfresh教師が不足している。
- depth、teacher、domainの異なるlabelを単純に混ぜると、aggregate lossが矛盾を隠す。
- 無関係な局面を結ぶrandom rank lossは、実際に必要なwithin-parent orderingと一致しない。
- bootstrap checkpointをinitializerへ流用すると、誤った表現を固定する危険がある。

したがってfast laneはscratch再初期化し、group-preserving dataとwithin-parent rankingへ変更する。

## 4. 横断的な根本原因

### 4.1 Aobaとの差は部品1個の差ではない

production 500ms対Aoba 500msの0勝200敗は、singularやTTだけで埋められる差ではない。
評価、探索、時間管理、学習データが連成した差であり、micro heuristicを直列に試す戦略の期待値は低い。

### 4.2 proxyを採用判定へ近づけすぎた

MAE、pair、top-1は破綻検出には使えるが、採用の証明ではない。今後static gateは「悪い候補を早く止める」
役割に限定し、強いという主張は固定時間のpaired engine matchだけで行う。

### 4.3 行数と独立局面数を混同した

同じ親の兄弟手が多数あるため、rowが増えても独立した局面分布は増えない。data manifestではrowsだけでなく、
unique parent、source game、phase、domain、decisive状態を数える。

### 4.4 教師domainと尺度を混ぜた

Aoba depth12 top4、Yaneura depth16 child、旧production lineage、self-play outcomeは同じtargetではない。
rankingは同じparent・同じteacher内だけに限定し、domain別metricでaggregate改善による隠蔽を禁止する。

### 4.5 一発候補を増やしすぎた

同slot retry禁止はpost-hoc tuningを防いだが、失敗原因を分類せず次architectureへ移る回数も増やした。
今後は候補数ではなく、data admission、sentinel、runtime skeleton、domain別static、実戦の順に一つの仮説を潰す。

### 4.6 supporting infrastructureへ寄りすぎた

provenance、atomic publish、復元、gateは必要だった一方、棋力を増やさないschemaやrunnerの拡張へ時間を使いすぎた。
実データ生成・学習・対局を止めるのは、結果を破損させる具体的blockerがある場合だけにする。

## 5. 今後の候補へ適用する再発防止

1. runtime costを未学習weightで先に測り、遅すぎるarchitectureを学習前に止める。
2. train/validationをparent、semantic position、可能ならgame単位で完全分離する。
3. rank lossは同一parent・同一teacherの兄弟手だけに適用する。
4. domainごとのMAE、pair、top-1をすべて開示し、aggregateで回帰を隠さない。
5. static PASSは採用ではなく、screenを実行してよいという意味に限定する。
6. screen、independent、formalは完全分離panelを使い、formalだけが昇格を許可する。
7. 失敗時は「data」「representation」「runtime」「search connection」「sampling noise」に分類してから次へ進む。
8. production assetはformal PASSまで変更しない。

これらを数値化した現在の実行契約は、[KingPair 10M fast lane](./blog-shogi-kingpair-10m-fast-lane.md)
と[machine protocol](../ml/protocols/kingpair-interaction-nnue-10m-fast-v1-plan.json)に置く。
